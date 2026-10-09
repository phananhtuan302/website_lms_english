/**
 * AI vocabulary generation (feature 1 of the "AI Content Tools" set) — a pure generator,
 * no DB writes. A teacher asks for a topic + 1-or-more CEFR levels + a word count; this
 * builds the AI request, parses its strict-JSON response into `GeneratedVocabCardDTO[]`,
 * and validates every row. The caller
 * (`teacherFlashcards.routes.ts`'s `POST /flashcards/generate` route) returns the result as
 * a DRAFT — nothing is persisted here or there. The teacher reviews/edits the draft
 * client-side and saves it through the EXISTING `POST .../cards/bulk` endpoint (now
 * `cefrLevel`-aware), so this feature deliberately has no separate "commit" endpoint of its
 * own — see that route's doc comment for why reusing it is the right call.
 *
 * Falls back to a deterministic mock generator (no AI call, obviously-placeholder content)
 * whenever the admin hasn't turned `vocabGenEnabled` on / finished configuring the AI
 * Content Tools connection — same "the whole flow works end-to-end with zero
 * configuration" principle as `MockEssayGradingProvider`.
 */

import type { CefrLevel, GeneratedVocabCardDTO, GenerateVocabularyRequest } from '@platform/shared';
import { CEFR_LEVELS } from '@platform/shared';
import { prisma } from '../lib/prisma';
import { extractJsonArray } from '../lib/extractJsonObject';
import { callChatCompletion, type AiChatMessage } from './aiChatClient';
import { getAiToolsConnection } from './aiToolsConnection';
import { DEFAULT_VOCAB_GENERATION_SYSTEM_PROMPT } from './defaultPrompts';

export const VOCAB_GENERATION_MIN_COUNT = 1;
export const VOCAB_GENERATION_MAX_COUNT = 40;

function isCefrLevel(value: unknown): value is CefrLevel {
  return typeof value === 'string' && (CEFR_LEVELS as string[]).includes(value);
}

function buildUserPrompt(request: GenerateVocabularyRequest): string {
  return [
    `Chủ đề: ${request.topic}`,
    `Các cấp độ CEFR cần tạo (chỉ dùng đúng các giá trị này cho "cefrLevel"): ${request.levels.join(', ')}`,
    `Tổng số từ cần tạo: ${request.count}`,
  ].join('\n');
}

/** Parses the model's strict-JSON array response, silently dropping any row missing a
 * usable `term`/`meaning` rather than failing the whole batch for one bad row — the
 * teacher reviews the draft before saving anyway, so a short list is a better failure mode
 * than none at all. Any `cefrLevel` the model returns that wasn't actually requested falls
 * back to the first requested level, rather than rejecting the row. */
function parseResponse(text: string, levels: CefrLevel[]): GeneratedVocabCardDTO[] {
  const parsed = JSON.parse(extractJsonArray(text)) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('Vocabulary generation response was not a JSON array.');
  }

  const cards: GeneratedVocabCardDTO[] = [];
  for (const row of parsed) {
    if (typeof row !== 'object' || row === null) continue;
    const r = row as Record<string, unknown>;
    const term = typeof r.term === 'string' ? r.term.trim() : '';
    const meaning = typeof r.meaning === 'string' ? r.meaning.trim() : '';
    if (!term || !meaning) continue;

    const cefrLevel = isCefrLevel(r.cefrLevel) && levels.includes(r.cefrLevel) ? r.cefrLevel : levels[0];
    cards.push({
      term,
      meaning,
      ipa: typeof r.ipa === 'string' ? r.ipa.trim() : '',
      exampleSentence: typeof r.exampleSentence === 'string' ? r.exampleSentence.trim() : '',
      cefrLevel,
    });
  }
  return cards;
}

/** Deterministic, no-AI fallback — rows are obviously placeholders (never passed off as
 * real content), so the generate → review → save UI flow stays fully testable/demoable
 * without an API key, same spirit as `MockEssayGradingProvider`. */
function generateMock(request: GenerateVocabularyRequest): GeneratedVocabCardDTO[] {
  const cards: GeneratedVocabCardDTO[] = [];
  for (let i = 0; i < request.count; i += 1) {
    const level = request.levels[i % request.levels.length];
    cards.push({
      term: `${request.topic} #${i + 1}`,
      meaning: `(mock) nghĩa của từ số ${i + 1} thuộc chủ đề "${request.topic}"`,
      ipa: '',
      exampleSentence: `This is an example sentence using ___ (mock word ${i + 1}).`,
      cefrLevel: level,
    });
  }
  return cards;
}

export async function generateVocabulary(request: GenerateVocabularyRequest): Promise<GeneratedVocabCardDTO[]> {
  const connection = await getAiToolsConnection('vocabGen');
  if (!connection) {
    return generateMock(request);
  }

  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  const systemPrompt = settings?.vocabGenSystemPrompt || DEFAULT_VOCAB_GENERATION_SYSTEM_PROMPT;

  const messages: AiChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: buildUserPrompt(request) },
  ];

  const result = await callChatCompletion(connection, messages);
  if (!result.content) {
    throw new Error('Vocabulary generation API response contained no content.');
  }
  return parseResponse(result.content, request.levels);
}
