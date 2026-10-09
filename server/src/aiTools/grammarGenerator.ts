/**
 * AI grammar lesson generation (feature 2 of the "AI Content Tools" set) — a pure
 * generator, no DB writes. A teacher gives a grammar topic; this builds the AI request,
 * parses its strict-JSON response into a `GenerateGrammarLessonResponse` draft, and
 * best-effort-normalizes every exercise's `type` to the 3 values Grammar practice actually
 * supports (`multipleChoice`/`trueFalse`/`fillBlank` — see `GRAMMAR_EXERCISE_TYPES` in
 * `teacherGrammar.routes.ts`). This normalization is a UX nicety, NOT the security/
 * correctness boundary — `POST /grammar-topics/generate/commit` (`teacherGrammar.routes.ts`)
 * re-validates every exercise with the exact same `validateExerciseBody` manual authoring
 * uses, so a malformed or adversarial AI response can never reach the DB in a shape manual
 * authoring wouldn't also allow.
 *
 * Falls back to a deterministic mock generator (no AI call, obviously-placeholder content)
 * whenever the admin hasn't turned `grammarGenEnabled` on / finished configuring the AI
 * Content Tools connection — same principle as `vocabGenerator.ts`.
 */

import type { GenerateGrammarLessonRequest, GenerateGrammarLessonResponse, GeneratedGrammarExerciseDTO, QuestionType } from '@platform/shared';
import { prisma } from '../lib/prisma';
import { extractJsonObject } from '../lib/extractJsonObject';
import { callChatCompletion, type AiChatMessage } from './aiChatClient';
import { getAiToolsConnection } from './aiToolsConnection';
import { DEFAULT_GRAMMAR_GENERATION_SYSTEM_PROMPT } from './defaultPrompts';

/** Same allow-list as `teacherGrammar.routes.ts`'s `GRAMMAR_EXERCISE_TYPES` — duplicated
 * here (rather than imported, which would create a route-layer → generator dependency in
 * the wrong direction) since it's a 3-item literal list; the route's own
 * `validateExerciseBody` is still what actually enforces it at commit time. */
const GRAMMAR_EXERCISE_TYPES: QuestionType[] = ['multipleChoice', 'trueFalse', 'fillBlank'];

function buildUserPrompt(request: GenerateGrammarLessonRequest): string {
  return `Chủ điểm ngữ pháp: ${request.topic}`;
}

function normalizeType(value: unknown): QuestionType {
  return typeof value === 'string' && (GRAMMAR_EXERCISE_TYPES as string[]).includes(value)
    ? (value as QuestionType)
    : 'multipleChoice';
}

function parseResponse(text: string): GenerateGrammarLessonResponse {
  const parsed = JSON.parse(extractJsonObject(text)) as Record<string, unknown>;

  const title = typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : 'Untitled grammar lesson';
  const theoryContentMarkdown = typeof parsed.theoryContentMarkdown === 'string' ? parsed.theoryContentMarkdown.trim() : '';

  const rawExercises = Array.isArray(parsed.exercises) ? parsed.exercises : [];
  const exercises: GeneratedGrammarExerciseDTO[] = rawExercises.map((raw) => {
    const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    const type = normalizeType(r.type);
    const rawChoices = Array.isArray(r.choices) ? r.choices : [];
    return {
      type,
      prompt: typeof r.prompt === 'string' ? r.prompt.trim() : '',
      choices: rawChoices.map((c) => {
        const choice = (typeof c === 'object' && c !== null ? c : {}) as Record<string, unknown>;
        return {
          text: typeof choice.text === 'string' ? choice.text.trim() : '',
          isCorrect: choice.isCorrect === true,
        };
      }),
      acceptedAnswers: Array.isArray(r.acceptedAnswers)
        ? r.acceptedAnswers.filter((a): a is string => typeof a === 'string' && a.trim() !== '').map((a) => a.trim())
        : [],
      explanation: typeof r.explanation === 'string' ? r.explanation.trim() : '',
    };
  });

  return { title, theoryContentMarkdown, exercises };
}

/** Deterministic, no-AI fallback — obviously placeholder content, same spirit as
 * `vocabGenerator.ts`'s `generateMock`. */
function generateMock(request: GenerateGrammarLessonRequest): GenerateGrammarLessonResponse {
  return {
    title: `${request.topic} (mock)`,
    theoryContentMarkdown: [
      '## Công thức / Cấu trúc',
      `(mock) Cấu trúc mẫu cho chủ điểm "${request.topic}".`,
      '',
      '## Cách dùng',
      '(mock) Giải thích cách dùng.',
      '',
      '## Lưu ý',
      '(mock) Lưu ý thường gặp.',
    ].join('\n'),
    exercises: [
      {
        type: 'multipleChoice',
        prompt: `(mock) Câu hỏi luyện tập về ${request.topic}.`,
        choices: [
          { text: 'Option A', isCorrect: true },
          { text: 'Option B', isCorrect: false },
        ],
        acceptedAnswers: [],
        explanation: '(mock) Giải thích đáp án.',
      },
    ],
  };
}

export async function generateGrammarLesson(request: GenerateGrammarLessonRequest): Promise<GenerateGrammarLessonResponse> {
  const connection = await getAiToolsConnection('grammarGen');
  if (!connection) {
    return generateMock(request);
  }

  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  const systemPrompt = settings?.grammarGenSystemPrompt || DEFAULT_GRAMMAR_GENERATION_SYSTEM_PROMPT;

  const messages: AiChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: buildUserPrompt(request) },
  ];

  const result = await callChatCompletion(connection, messages, { maxTokens: 3072 });
  if (!result.content) {
    throw new Error('Grammar lesson generation API response contained no content.');
  }
  return parseResponse(result.content);
}
