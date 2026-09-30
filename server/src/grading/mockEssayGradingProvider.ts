/**
 * MockEssayGradingProvider (2026-09) — the only registered `EssayGradingProvider`
 * implementation until a customer-supplied real AI provider (e.g. an Anthropic API key)
 * is configured; see `docs/INTEGRATIONS_TODO.md`. Needs no API key/account of any kind,
 * so the full essay-AI-grading flow works end-to-end in dev — same "mock/stub first,
 * customer credential later" rule TECH_STACK.md already established for Speaking's own
 * `MockAIGradingProvider`, which this file deliberately mirrors in spirit (simple,
 * transparent, self-disclosing heuristics — NOT a real language model, and nothing
 * downstream should treat its score as anything more than a placeholder).
 *
 * Every heuristic below is a crude proxy, on purpose:
 * - Task Achievement/Response: length adequacy against a target word count
 *   (`essayMinWords`, or a task-type default of 150/250 words when unset) + how many of
 *   the prompt's own "content words" (>= 4 letters, a crude article/preposition filter)
 *   the essay actually uses — same content-word-overlap idea as Speaking's mock,
 *   adapted from a transcript to an essay body.
 * - Coherence & Cohesion: paragraph count (multi-paragraph structure is rewarded, up to
 *   a cap) + how many distinct linking/cohesive-device words (`however`, `therefore`,
 *   `in addition`, ...) appear — NOT a real discourse-coherence analysis.
 * - Lexical Resource: vocabulary diversity (the type-token ratio — unique words / total
 *   words) plus a small bonus for longer average word length — NOT a real vocabulary
 *   sophistication assessment.
 * - Grammatical Range & Accuracy: THE crudest of the four — average sentence length
 *   compared against a "plausible" range, since detecting real grammatical errors needs
 *   an actual language model this heuristic deliberately is not. A flat mid-range
 *   baseline when there's too little text to measure sentences at all.
 *
 * Each of the 4 sub-scores is an internal 0-100 percentage, converted to an IELTS-style
 * 0-9 band (`toBand`) for `useIeltsCriteria` questions, or blended into one 0-`essayMaxScore`
 * score otherwise.
 */

import type { EssayGradingCriteria, EssayGradingInput, EssayGradingProvider, EssayGradingResult } from './essayGradingProvider';

const MIN_KEYWORD_LENGTH = 4;
const IELTS_BAND_MAX = 9;
const DEFAULT_TARGET_WORDS_TASK1 = 150;
const DEFAULT_TARGET_WORDS_TASK2 = 250;
const DEFAULT_TARGET_WORDS_GENERIC = 150;

const LINKING_WORDS = [
  'however',
  'therefore',
  'moreover',
  'furthermore',
  'in addition',
  'additionally',
  'first',
  'firstly',
  'second',
  'secondly',
  'finally',
  'in conclusion',
  'for example',
  'for instance',
  'although',
  'because',
  'since',
  'as a result',
  'on the other hand',
  'in contrast',
  'similarly',
  'consequently',
  'in fact',
  'overall',
];

function countWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

function countSentences(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function countParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Same "deduped, lowercased content words" extraction as Speaking's mock provider. */
function extractKeywords(prompt: string): string[] {
  const words = prompt
    .toLowerCase()
    .split(/[^a-z0-9']+/i)
    .filter((w) => w.length >= MIN_KEYWORD_LENGTH);
  return [...new Set(words)];
}

/** Converts an internal 0-100 percentage into an IELTS-style 0-9 band, in 0.5 steps. */
function toBand(pct: number): number {
  const clamped = Math.min(100, Math.max(0, pct));
  return Math.round((clamped / 100) * IELTS_BAND_MAX * 2) / 2;
}

function taskPercent(input: EssayGradingInput, wordCount: number, essayLower: string): number {
  const target =
    input.essayMinWords ??
    (input.essayTaskType === 'task1'
      ? DEFAULT_TARGET_WORDS_TASK1
      : input.essayTaskType === 'task2'
        ? DEFAULT_TARGET_WORDS_TASK2
        : DEFAULT_TARGET_WORDS_GENERIC);
  const lengthRatio = Math.min(1, wordCount / Math.max(1, target));

  const keywords = extractKeywords(input.prompt);
  const overlapRatio =
    keywords.length === 0 ? 1 : keywords.filter((k) => essayLower.includes(k)).length / keywords.length;

  return lengthRatio * 60 + overlapRatio * 40;
}

function coherencePercent(essayText: string, essayLower: string): number {
  const paragraphs = countParagraphs(essayText);
  const paragraphPct = Math.min(40, paragraphs.length * 13);

  const matchedLinkers = LINKING_WORDS.filter((w) => essayLower.includes(w));
  const linkerPct = Math.min(60, (Math.min(6, matchedLinkers.length) / 6) * 60);

  return paragraphPct + linkerPct;
}

function lexicalPercent(words: string[]): number {
  if (words.length === 0) return 0;
  const unique = new Set(words.map((w) => w.toLowerCase().replace(/[^a-z0-9']/g, '')));
  const typeTokenRatio = unique.size / words.length;
  const diversityPct = Math.min(85, (typeTokenRatio / 0.6) * 85);

  const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;
  const lengthBonus = Math.min(15, Math.max(0, (avgWordLength - 4) * 5));

  return diversityPct + lengthBonus;
}

function grammarPercent(wordCount: number, sentenceCount: number): number {
  if (sentenceCount === 0) return 50; // too little text to measure — a neutral baseline, not a penalty.
  const avgSentenceLength = wordCount / sentenceCount;
  // A "plausible" average English sentence length band — well outside it (too choppy or
  // one giant run-on) costs points; this is the crudest heuristic of the four on purpose.
  const idealMin = 10;
  const idealMax = 22;
  if (avgSentenceLength >= idealMin && avgSentenceLength <= idealMax) return 85;
  const deviation = avgSentenceLength < idealMin ? idealMin - avgSentenceLength : avgSentenceLength - idealMax;
  return Math.max(30, 85 - deviation * 4);
}

export class MockEssayGradingProvider implements EssayGradingProvider {
  async grade(input: EssayGradingInput): Promise<EssayGradingResult> {
    const trimmed = input.essayText.trim();
    const disclaimer =
      'Mock AI grading (heuristic — word count, keyword overlap, sentence/paragraph structure — ' +
      'not a real language model). A real AI provider will replace it once configured (see ' +
      'docs/INTEGRATIONS_TODO.md).';

    if (trimmed === '') {
      return {
        score: 0,
        feedback: `${disclaimer} No answer text was submitted, so nothing could be graded.`,
        criteria: input.useIeltsCriteria ? { taskScore: 0, coherenceScore: 0, lexicalScore: 0, grammarScore: 0 } : null,
      };
    }

    const words = countWords(trimmed);
    const sentences = countSentences(trimmed);
    const lower = trimmed.toLowerCase();

    const taskPct = taskPercent(input, words.length, lower);
    const coherencePct = coherencePercent(trimmed, lower);
    const lexicalPct = lexicalPercent(words);
    const grammarPct = grammarPercent(words.length, sentences.length);

    if (input.useIeltsCriteria) {
      const criteria: EssayGradingCriteria = {
        taskScore: toBand(taskPct),
        coherenceScore: toBand(coherencePct),
        lexicalScore: toBand(lexicalPct),
        grammarScore: toBand(grammarPct),
      };
      const average = (criteria.taskScore + criteria.coherenceScore + criteria.lexicalScore + criteria.grammarScore) / 4;
      const score = Math.round(average * 2) / 2;
      const feedback =
        `${disclaimer} ${words.length} word(s), estimated bands — Task: ${criteria.taskScore}, ` +
        `Coherence & Cohesion: ${criteria.coherenceScore}, Lexical Resource: ${criteria.lexicalScore}, ` +
        `Grammatical Range & Accuracy: ${criteria.grammarScore}. Overall estimated band: ${score}/9.`;
      return { score, feedback, criteria };
    }

    const overallPct = taskPct * 0.4 + coherencePct * 0.2 + lexicalPct * 0.2 + grammarPct * 0.2;
    const score = Math.round((Math.min(100, Math.max(0, overallPct)) / 100) * input.essayMaxScore);
    const feedback =
      `${disclaimer} ${words.length} word(s). Estimated score: ${score}/${input.essayMaxScore}, based on length ` +
      'adequacy, topic-keyword coverage, paragraph/sentence structure, and vocabulary variety.';
    return { score, feedback, criteria: null };
  }
}
