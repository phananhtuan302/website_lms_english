/**
 * AI exam-image import (feature 3 of the "AI Content Tools" set) — a pure generator, no DB
 * writes. A teacher uploads 1+ photos/scans of an exam (in reading order); this builds a
 * single multimodal AI request (system prompt + one `image_url` content part per page, same
 * convention as `OpenAiCompatibleSpeakingGradingProvider`'s `input_audio` block, just for
 * images instead of audio) and parses the strict-JSON response into an
 * `ImportTestFromImagesResponse` draft.
 *
 * `type` is best-effort-validated against the full `QuestionType` set (unlike
 * `grammarGenerator.ts`'s 3-value allow-list — a real exam legitimately CAN contain essay/
 * speaking/matching content, not just objective questions) and anything unrecognized falls
 * back to `multipleChoice` with `needsManualReview` forced on. This is still only a UX
 * nicety: `POST /tests/import-from-images/commit` (`teacherTests.routes.ts`) re-validates
 * every question with the EXACT SAME `validateQuestionBody` manual authoring uses, so a
 * malformed or adversarial AI response can never reach the DB in a shape manual authoring
 * wouldn't also allow.
 *
 * Falls back to a deterministic mock generator (no AI call, obviously-placeholder content,
 * flagged for manual review) whenever the admin hasn't turned `examImportEnabled` on /
 * finished configuring the AI Content Tools connection — same principle as
 * `vocabGenerator.ts`/`grammarGenerator.ts`.
 */

import type {
  GeneratedImportQuestionDTO,
  GeneratedImportSectionDTO,
  ImportTestFromImagesRequest,
  ImportTestFromImagesResponse,
  QuestionType,
} from '@platform/shared';
import { prisma } from '../lib/prisma';
import { extractJsonObject } from '../lib/extractJsonObject';
import { callChatCompletion, type AiChatContentPart, type AiChatMessage } from './aiChatClient';
import { getAiToolsConnection } from './aiToolsConnection';
import { DEFAULT_EXAM_IMPORT_SYSTEM_PROMPT } from './defaultPrompts';

/** Every value `Question.type` supports (mirrors `teacherTests.routes.ts`'s local
 * `QUESTION_TYPES` — duplicated here rather than imported, same "route layer and generator
 * layer don't import from each other" reasoning as `grammarGenerator.ts`'s
 * `GRAMMAR_EXERCISE_TYPES`). */
const QUESTION_TYPES: QuestionType[] = ['multipleChoice', 'trueFalse', 'fillBlank', 'essay', 'speaking', 'matching'];

function parseResponse(text: string): ImportTestFromImagesResponse {
  const parsed = JSON.parse(extractJsonObject(text)) as Record<string, unknown>;

  const title = typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : 'Đề nhập từ ảnh';
  const rawSections = Array.isArray(parsed.sections) ? parsed.sections : [];

  const sections: GeneratedImportSectionDTO[] = rawSections.map((rawSection, sectionIndex) => {
    const s = (typeof rawSection === 'object' && rawSection !== null ? rawSection : {}) as Record<string, unknown>;
    const passageText = typeof s.passageText === 'string' ? s.passageText.trim() : '';
    const instructions = typeof s.instructions === 'string' ? s.instructions.trim() : '';
    const mergedPassageText = [instructions, passageText].filter(Boolean).join('\n\n');

    const rawQuestions = Array.isArray(s.questions) ? s.questions : [];
    const questions: GeneratedImportQuestionDTO[] = rawQuestions.map((rawQuestion) => {
      const q = (typeof rawQuestion === 'object' && rawQuestion !== null ? rawQuestion : {}) as Record<string, unknown>;

      let needsManualReview = q.needsManualReview === true;
      let type: QuestionType;
      if (typeof q.type === 'string' && (QUESTION_TYPES as string[]).includes(q.type)) {
        type = q.type as QuestionType;
      } else {
        type = 'multipleChoice';
        needsManualReview = true;
      }

      const rawChoices = Array.isArray(q.choices) ? q.choices : [];
      return {
        type,
        prompt: typeof q.prompt === 'string' ? q.prompt.trim() : '',
        choices: rawChoices.map((c) => {
          const choice = (typeof c === 'object' && c !== null ? c : {}) as Record<string, unknown>;
          return {
            text: typeof choice.text === 'string' ? choice.text.trim() : '',
            isCorrect: choice.isCorrect === true,
          };
        }),
        acceptedAnswers: Array.isArray(q.acceptedAnswers)
          ? q.acceptedAnswers.filter((a): a is string => typeof a === 'string' && a.trim() !== '').map((a) => a.trim())
          : [],
        needsManualReview,
        reviewNote: typeof q.reviewNote === 'string' ? q.reviewNote.trim() : '',
      };
    });

    return {
      title: `Phần ${sectionIndex + 1}`,
      passageText: mergedPassageText,
      questions,
    };
  });

  return { title, sections };
}

/** Deterministic, no-AI fallback — a single obviously-placeholder question, flagged for
 * manual review since nothing was actually read, same spirit as the other 2 generators'
 * mock modes. */
function generateMock(request: ImportTestFromImagesRequest): ImportTestFromImagesResponse {
  return {
    title: 'Đề nhập từ ảnh (mock)',
    sections: [
      {
        title: 'Phần 1',
        passageText: `(mock) Chưa cấu hình AI Content Tools — không đọc được nội dung của ${request.images.length} ảnh đã tải lên.`,
        questions: [
          {
            type: 'multipleChoice',
            prompt: '(mock) Câu hỏi mẫu — hãy cấu hình AI Content Tools để nhập đề thật.',
            choices: [
              { text: 'Option A', isCorrect: true },
              { text: 'Option B', isCorrect: false },
            ],
            acceptedAnswers: [],
            needsManualReview: true,
            reviewNote: 'Chế độ mock — chưa có kết nối AI thật, cần kiểm tra lại toàn bộ.',
          },
        ],
      },
    ],
  };
}

function buildUserContent(request: ImportTestFromImagesRequest): AiChatContentPart[] {
  return [
    {
      type: 'text',
      text: `Số trang ảnh: ${request.images.length}. Hãy đọc đúng theo thứ tự các ảnh được gửi bên dưới, từ trang đầu tới trang cuối.`,
    },
    ...request.images.map((url): AiChatContentPart => ({ type: 'image_url', image_url: { url } })),
  ];
}

export async function generateTestFromImages(request: ImportTestFromImagesRequest): Promise<ImportTestFromImagesResponse> {
  const connection = await getAiToolsConnection('examImport');
  if (!connection) {
    return generateMock(request);
  }

  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  const systemPrompt = settings?.examImportSystemPrompt || DEFAULT_EXAM_IMPORT_SYSTEM_PROMPT;

  const messages: AiChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: buildUserContent(request) },
  ];

  const result = await callChatCompletion(connection, messages, { maxTokens: 4096 });
  if (!result.content) {
    throw new Error('Exam image import API response contained no content.');
  }
  return parseResponse(result.content);
}
