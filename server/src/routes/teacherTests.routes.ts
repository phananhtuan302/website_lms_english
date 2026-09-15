/**
 * Teacher test authoring (T-008): CRUD for a teacher's own Test/Section/Question/Choice,
 * plus reordering. Also hosts the test-variant ("mã đề") generation endpoints (T-009),
 * since they're naturally nested under the same `/tests/:testId` resource and share the
 * same ownership check.
 *
 * Every route here is teacher-only (`requireRole('teacher')` — a student gets 403) and
 * every route that touches a specific test enforces that the test belongs to the
 * calling teacher (`requireOwnedTest` — a different teacher's test id gets 404, see
 * that helper's doc comment for why 404 rather than 403).
 */

import { Router } from 'express';
import type {
  ChoiceInput,
  ContentClassAssignmentDTO,
  CreateQuestionRequest,
  CreateSectionRequest,
  CreateTestRequest,
  GenerateVariantsRequest,
  QuestionType,
  ReorderQuestionsRequest,
  ReorderSectionsRequest,
  SectionDTO,
  TestDetailDTO,
  TestSummaryDTO,
  TestType,
  TestVariantDTO,
  UpdateContentClassesRequest,
  UpdateQuestionRequest,
  UpdateSectionRequest,
  UpdateTestRequest,
} from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { requireOwnedTest } from '../lib/ownedTest';
import { validateClassIdsForOwner } from '../lib/contentClassAssignment';
import { generateVariantLayout, nextVariantCodes, type VariantLayout } from '../lib/variantShuffle';
import { fetchNestedTest, type NestedTest } from '../lib/testQueries';

export const teacherTestsRouter = Router();

// T-071: `admin` also allowed (PROJECT_PLAN Assumption A12) — every ownership check
// below goes through `requireOwnedTest`, which lets an admin caller manage ANY
// teacher's test, reusing these exact routes rather than a parallel admin-only API.
teacherTestsRouter.use(requireAuth, requireRole('teacher', 'admin'));

const QUESTION_TYPES: QuestionType[] = ['multipleChoice', 'trueFalse', 'fillBlank', 'essay', 'speaking'];

/** T-036/T-038 (Assumption A4) — every value `Test.testType` supports. */
const TEST_TYPES: TestType[] = ['generic', 'unitTest', 'vocabularyCheck', 'listeningTest', 'mockTest'];

/** Default point value for a new `essay` question (T-042) when the teacher doesn't
 * specify one — a simple, documented default rather than forcing every essay question to
 * have a max score configured before it can be saved. */
const DEFAULT_ESSAY_MAX_SCORE = 10;

/** Default response window, in seconds, for a new `speaking` question (T-052) when the
 * teacher doesn't specify one — same "simple, documented default" pattern as
 * `DEFAULT_ESSAY_MAX_SCORE`. */
const DEFAULT_SPEAKING_SECONDS = 60;
const MIN_SPEAKING_SECONDS = 5;
const MAX_SPEAKING_SECONDS = 300;

// --- Shared query/serialization helpers --------------------------------------------

/** Validates an optional time-limit value from a create/update test body. `undefined`
 * (field omitted) leaves the existing/untimed value untouched; `null` explicitly clears
 * it; anything else must be a positive integer. Returns an English error string or
 * `null` if valid — same convention as `validateQuestionBody` below.
 *
 * Exported so `teacherVocabularyCheck.routes.ts` can reuse the EXACT SAME 1-480 bound
 * and error wording for a Vocabulary Check's (T-086) required `timeLimitMinutes`, rather
 * than a second, potentially-drifting copy of the same rule — that route just adds its
 * own "is it present at all" check first, since a Vocabulary Check's time limit is
 * required, not optional/nullable like a regular Test's. */
export function validateTimeLimit(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 480) {
    return 'timeLimitMinutes must be a whole number of minutes between 1 and 480, or null for no limit.';
  }
  return null;
}

/** Validates an optional `unitId` from a create/update test body (T-018). `undefined`
 * leaves the existing tag untouched; `null` explicitly clears it; any other value must
 * reference an existing `Unit` row (global — see `Unit`'s doc comment in schema.prisma).
 * Async (unlike `validateTimeLimit`) since it needs a DB lookup — same
 * "return an English error string, or null if valid" convention either way. */
async function validateUnitId(value: unknown): Promise<string | null> {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    return 'unitId must be a string id or null.';
  }
  const unit = await prisma.unit.findUnique({ where: { id: value } });
  if (!unit) {
    return 'unitId does not reference an existing Unit.';
  }
  return null;
}

/** Validates an optional `testType` from a create/update test body (T-036/T-038).
 * `undefined` leaves the existing value untouched (defaults to `generic` at creation
 * time, at the call site below) — same convention as `validateTimeLimit`/`validateUnitId`. */
function validateTestType(value: unknown): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'string' || !TEST_TYPES.includes(value as TestType)) {
    return `testType must be one of: ${TEST_TYPES.join(', ')}.`;
  }
  return null;
}

/** Validates an optional `published` flag (T-036). `undefined` leaves it untouched. */
function validatePublished(value: unknown): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'boolean') {
    return 'published must be a boolean.';
  }
  return null;
}

function toTestDetailDTO(test: NonNullable<NestedTest>): TestDetailDTO {
  const sections: SectionDTO[] = test.sections.map((section) => ({
    id: section.id,
    title: section.title,
    order: section.order,
    passageText: section.passageText,
    passageImageUrl: section.passageImageUrl,
    audioUrl: section.audioUrl,
    maxPlayCount: section.maxPlayCount,
    questions: section.questions.map((question) => ({
      id: question.id,
      type: question.type,
      prompt: question.prompt,
      order: question.order,
      acceptedAnswers: question.acceptedAnswers,
      essayMaxScore: question.essayMaxScore,
      allowedResponseSeconds: question.allowedResponseSeconds,
      promptAudioUrl: question.promptAudioUrl,
      choices: question.choices.map((choice) => ({
        id: choice.id,
        text: choice.text,
        isCorrect: choice.isCorrect,
        order: choice.order,
      })),
    })),
  }));

  return {
    id: test.id,
    title: test.title,
    teacherId: test.teacherId,
    timeLimitMinutes: test.timeLimitMinutes,
    unitId: test.unitId,
    unit: test.unit ? { id: test.unit.id, name: test.unit.name } : null,
    testType: test.testType,
    published: test.published,
    sections,
    createdAt: test.createdAt.toISOString(),
    updatedAt: test.updatedAt.toISOString(),
  };
}

function toVariantDTO(variant: {
  id: string;
  testId: string;
  code: string;
  createdAt: Date;
  layout: unknown;
}): TestVariantDTO {
  return {
    id: variant.id,
    testId: variant.testId,
    code: variant.code,
    createdAt: variant.createdAt.toISOString(),
    layout: variant.layout as VariantLayout,
  };
}

/** Validates the optional Reading/Listening fields on a create/update section body
 * (T-039/T-040). All four are independent and optional; the only real constraint is
 * `maxPlayCount` (when provided) being a positive whole number — same
 * "return an English error string, or null if valid" convention as `validateTimeLimit`. */
function validateSectionContentFields(body: {
  passageText?: string | null;
  passageImageUrl?: string | null;
  audioUrl?: string | null;
  maxPlayCount?: number | null;
}): string | null {
  for (const field of ['passageText', 'passageImageUrl', 'audioUrl'] as const) {
    const value = body[field];
    if (value !== undefined && value !== null && typeof value !== 'string') {
      return `${field} must be a string or null.`;
    }
  }
  if (
    body.maxPlayCount !== undefined &&
    body.maxPlayCount !== null &&
    (typeof body.maxPlayCount !== 'number' || !Number.isInteger(body.maxPlayCount) || body.maxPlayCount < 1)
  ) {
    return 'maxPlayCount must be a positive whole number, or null for unlimited plays.';
  }
  return null;
}

/** Validates a create/update question body shared shape. Returns an English error
 * string if invalid, or `null` if the body is well-formed. */
function validateQuestionBody(body: Partial<CreateQuestionRequest>): string | null {
  if (typeof body.prompt !== 'string' || body.prompt.trim() === '') {
    return 'Question prompt is required.';
  }
  if (!body.type || !QUESTION_TYPES.includes(body.type)) {
    return `Question type must be one of: ${QUESTION_TYPES.join(', ')}.`;
  }

  if (body.type === 'fillBlank') {
    const answers = body.acceptedAnswers;
    if (
      !Array.isArray(answers) ||
      answers.length === 0 ||
      answers.some((a) => typeof a !== 'string' || a.trim() === '')
    ) {
      return 'fillBlank questions require at least one non-empty accepted answer.';
    }
    return null;
  }

  if (body.type === 'essay') {
    // No choices/acceptedAnswers apply (T-042) — only `essayMaxScore` needs validating,
    // and it's optional (defaults to `DEFAULT_ESSAY_MAX_SCORE` at the call site).
    if (
      body.essayMaxScore !== undefined &&
      body.essayMaxScore !== null &&
      (typeof body.essayMaxScore !== 'number' ||
        !Number.isInteger(body.essayMaxScore) ||
        body.essayMaxScore < 1 ||
        body.essayMaxScore > 1000)
    ) {
      return 'essayMaxScore must be a whole number between 1 and 1000, or omitted for the default.';
    }
    return null;
  }

  if (body.type === 'speaking') {
    // No choices/acceptedAnswers apply (T-052) — `allowedResponseSeconds` is optional
    // (defaults to `DEFAULT_SPEAKING_SECONDS`) and `promptAudioUrl` is always optional
    // (a Speaking question may be text-prompt-only).
    if (
      body.allowedResponseSeconds !== undefined &&
      body.allowedResponseSeconds !== null &&
      (typeof body.allowedResponseSeconds !== 'number' ||
        !Number.isInteger(body.allowedResponseSeconds) ||
        body.allowedResponseSeconds < MIN_SPEAKING_SECONDS ||
        body.allowedResponseSeconds > MAX_SPEAKING_SECONDS)
    ) {
      return `allowedResponseSeconds must be a whole number of seconds between ${MIN_SPEAKING_SECONDS} and ${MAX_SPEAKING_SECONDS}, or omitted for the default.`;
    }
    if (
      body.promptAudioUrl !== undefined &&
      body.promptAudioUrl !== null &&
      typeof body.promptAudioUrl !== 'string'
    ) {
      return 'promptAudioUrl must be a string or null.';
    }
    return null;
  }

  // multipleChoice / trueFalse
  const choices = body.choices;
  if (
    !Array.isArray(choices) ||
    choices.some(
      (c) =>
        typeof c?.text !== 'string' || c.text.trim() === '' || typeof c.isCorrect !== 'boolean',
    )
  ) {
    return 'Choices must be a list of { text, isCorrect } with non-empty text.';
  }
  if (body.type === 'trueFalse' && choices.length !== 2) {
    return 'trueFalse questions require exactly 2 choices.';
  }
  if (body.type === 'multipleChoice' && choices.length < 2) {
    return 'multipleChoice questions require at least 2 choices.';
  }
  const correctCount = choices.filter((c) => c.isCorrect).length;
  if (correctCount !== 1) {
    return 'Exactly one choice must be marked as correct.';
  }
  return null;
}

// --- Test CRUD ----------------------------------------------------------------------

teacherTestsRouter.post(
  '/tests',
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<CreateTestRequest>;
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) {
      res.status(400).json({ error: 'Test title is required.' });
      return;
    }
    const timeLimitError = validateTimeLimit(body.timeLimitMinutes);
    if (timeLimitError) {
      res.status(400).json({ error: timeLimitError });
      return;
    }
    const unitError = await validateUnitId(body.unitId);
    if (unitError) {
      res.status(400).json({ error: unitError });
      return;
    }
    const testTypeError = validateTestType(body.testType);
    if (testTypeError) {
      res.status(400).json({ error: testTypeError });
      return;
    }
    const publishedError = validatePublished(body.published);
    if (publishedError) {
      res.status(400).json({ error: publishedError });
      return;
    }

    const test = await prisma.test.create({
      data: {
        title,
        teacherId: req.user!.sub,
        timeLimitMinutes: body.timeLimitMinutes ?? null,
        unitId: body.unitId ?? null,
        testType: body.testType ?? 'generic',
        published: body.published ?? false,
      },
    });
    const nested = await fetchNestedTest(test.id);
    res.status(201).json(toTestDetailDTO(nested));
  }),
);

teacherTestsRouter.get(
  '/tests',
  asyncHandler(async (req, res) => {
    const tests = await prisma.test.findMany({
      where: { teacherId: req.user!.sub },
      orderBy: { updatedAt: 'desc' },
      include: {
        sections: { include: { _count: { select: { questions: true } } } },
        unit: { select: { id: true, name: true } },
      },
    });

    // T-017: average time-taken per test, across COMPLETED attempts only. One extra
    // aggregate query for the whole list (grouped by testId) rather than N+1 — `status:
    // 'submitted'` is what excludes an abandoned (never-submitted) attempt from the
    // average; `timeTakenSeconds: { not: null }` additionally guards against any
    // pre-T-017 submitted attempt that predates this column (should be none in a fresh
    // dev DB, but costs nothing to be defensive about a `null` sneaking into the avg).
    const timeStats = await prisma.attempt.groupBy({
      by: ['testId'],
      where: {
        testId: { in: tests.map((t) => t.id) },
        status: 'submitted',
        timeTakenSeconds: { not: null },
      },
      _avg: { timeTakenSeconds: true },
      _count: { _all: true },
    });
    const timeStatsByTestId = new Map(timeStats.map((s) => [s.testId, s]));

    const summaries: TestSummaryDTO[] = tests.map((test) => {
      const stats = timeStatsByTestId.get(test.id);
      const averageTimeTakenSeconds =
        stats && stats._avg.timeTakenSeconds != null ? Math.round(stats._avg.timeTakenSeconds) : null;
      return {
        id: test.id,
        title: test.title,
        sectionCount: test.sections.length,
        questionCount: test.sections.reduce((sum, s) => sum + s._count.questions, 0),
        unitId: test.unitId,
        unitName: test.unit?.name ?? null,
        testType: test.testType,
        published: test.published,
        createdAt: test.createdAt.toISOString(),
        updatedAt: test.updatedAt.toISOString(),
        averageTimeTakenSeconds,
        completedAttemptCount: stats?._count._all ?? 0,
      };
    });

    res.status(200).json(summaries);
  }),
);

teacherTestsRouter.get(
  '/tests/:testId',
  asyncHandler(async (req, res) => {
    const test = await requireOwnedTest(req.params.testId, req.user!, res);
    if (!test) return;

    const nested = await fetchNestedTest(test.id);
    res.status(200).json(toTestDetailDTO(nested));
  }),
);

teacherTestsRouter.patch(
  '/tests/:testId',
  asyncHandler(async (req, res) => {
    const test = await requireOwnedTest(req.params.testId, req.user!, res);
    if (!test) return;

    const body = req.body as Partial<UpdateTestRequest>;
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) {
      res.status(400).json({ error: 'Test title is required.' });
      return;
    }
    const timeLimitError = validateTimeLimit(body.timeLimitMinutes);
    if (timeLimitError) {
      res.status(400).json({ error: timeLimitError });
      return;
    }
    const unitError = await validateUnitId(body.unitId);
    if (unitError) {
      res.status(400).json({ error: unitError });
      return;
    }
    const testTypeError = validateTestType(body.testType);
    if (testTypeError) {
      res.status(400).json({ error: testTypeError });
      return;
    }
    const publishedError = validatePublished(body.published);
    if (publishedError) {
      res.status(400).json({ error: publishedError });
      return;
    }

    await prisma.test.update({
      where: { id: test.id },
      data: {
        title,
        // `undefined` (field omitted entirely) leaves the column untouched; `null`
        // explicitly clears it back to untimed / untagged.
        ...(body.timeLimitMinutes !== undefined ? { timeLimitMinutes: body.timeLimitMinutes } : {}),
        ...(body.unitId !== undefined ? { unitId: body.unitId } : {}),
        // T-036: `testType`/`published` follow the same "omitted = untouched" convention.
        ...(body.testType !== undefined ? { testType: body.testType } : {}),
        ...(body.published !== undefined ? { published: body.published } : {}),
      },
    });
    const nested = await fetchNestedTest(test.id);
    res.status(200).json(toTestDetailDTO(nested));
  }),
);

teacherTestsRouter.delete(
  '/tests/:testId',
  asyncHandler(async (req, res) => {
    const test = await requireOwnedTest(req.params.testId, req.user!, res);
    if (!test) return;

    await prisma.test.delete({ where: { id: test.id } });
    res.status(204).send();
  }),
);

// --- Section CRUD + reorder ----------------------------------------------------------

teacherTestsRouter.post(
  '/tests/:testId/sections',
  asyncHandler(async (req, res) => {
    const test = await requireOwnedTest(req.params.testId, req.user!, res);
    if (!test) return;

    const body = req.body as Partial<CreateSectionRequest>;
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) {
      res.status(400).json({ error: 'Section title is required.' });
      return;
    }
    const contentError = validateSectionContentFields(body);
    if (contentError) {
      res.status(400).json({ error: contentError });
      return;
    }

    const maxOrder = await prisma.section.aggregate({
      where: { testId: test.id },
      _max: { order: true },
    });
    await prisma.section.create({
      data: {
        testId: test.id,
        title,
        order: (maxOrder._max.order ?? 0) + 1,
        passageText: body.passageText ?? null,
        passageImageUrl: body.passageImageUrl ?? null,
        audioUrl: body.audioUrl ?? null,
        maxPlayCount: body.maxPlayCount ?? null,
      },
    });

    const nested = await fetchNestedTest(test.id);
    res.status(201).json(toTestDetailDTO(nested));
  }),
);

teacherTestsRouter.patch(
  '/tests/:testId/sections/:sectionId',
  asyncHandler(async (req, res) => {
    const test = await requireOwnedTest(req.params.testId, req.user!, res);
    if (!test) return;

    const section = await prisma.section.findUnique({ where: { id: req.params.sectionId } });
    if (!section || section.testId !== test.id) {
      res.status(404).json({ error: 'Section not found.' });
      return;
    }

    const body = req.body as Partial<UpdateSectionRequest>;
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) {
      res.status(400).json({ error: 'Section title is required.' });
      return;
    }
    const contentError = validateSectionContentFields(body);
    if (contentError) {
      res.status(400).json({ error: contentError });
      return;
    }

    await prisma.section.update({
      where: { id: section.id },
      data: {
        title,
        // `undefined` (field omitted) leaves the column untouched; `null` explicitly
        // clears it — same convention as `PATCH /tests/:testId`'s timeLimit/unitId.
        ...(body.passageText !== undefined ? { passageText: body.passageText } : {}),
        ...(body.passageImageUrl !== undefined ? { passageImageUrl: body.passageImageUrl } : {}),
        ...(body.audioUrl !== undefined ? { audioUrl: body.audioUrl } : {}),
        ...(body.maxPlayCount !== undefined ? { maxPlayCount: body.maxPlayCount } : {}),
      },
    });
    const nested = await fetchNestedTest(test.id);
    res.status(200).json(toTestDetailDTO(nested));
  }),
);

teacherTestsRouter.delete(
  '/tests/:testId/sections/:sectionId',
  asyncHandler(async (req, res) => {
    const test = await requireOwnedTest(req.params.testId, req.user!, res);
    if (!test) return;

    const section = await prisma.section.findUnique({ where: { id: req.params.sectionId } });
    if (!section || section.testId !== test.id) {
      res.status(404).json({ error: 'Section not found.' });
      return;
    }

    await prisma.section.delete({ where: { id: section.id } });
    const nested = await fetchNestedTest(test.id);
    res.status(200).json(toTestDetailDTO(nested));
  }),
);

teacherTestsRouter.put(
  '/tests/:testId/sections/reorder',
  asyncHandler(async (req, res) => {
    const test = await requireOwnedTest(req.params.testId, req.user!, res);
    if (!test) return;

    const body = req.body as Partial<ReorderSectionsRequest>;
    const orderedIds = body.orderedSectionIds;
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      res.status(400).json({ error: 'orderedSectionIds must be a non-empty array.' });
      return;
    }

    const existing = await prisma.section.findMany({
      where: { testId: test.id },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((s) => s.id));
    const sameSet =
      orderedIds.length === existingIds.size && orderedIds.every((id) => existingIds.has(id));
    if (!sameSet) {
      res
        .status(400)
        .json({ error: 'orderedSectionIds must contain exactly this test’s current section ids.' });
      return;
    }

    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.section.update({ where: { id }, data: { order: index + 1 } }),
      ),
    );

    const nested = await fetchNestedTest(test.id);
    res.status(200).json(toTestDetailDTO(nested));
  }),
);

// --- Question CRUD + reorder ----------------------------------------------------------

async function loadOwnedSection(testId: string, sectionId: string) {
  const section = await prisma.section.findUnique({ where: { id: sectionId } });
  if (!section || section.testId !== testId) {
    return null;
  }
  return section;
}

teacherTestsRouter.post(
  '/tests/:testId/sections/:sectionId/questions',
  asyncHandler(async (req, res) => {
    const test = await requireOwnedTest(req.params.testId, req.user!, res);
    if (!test) return;

    const section = await loadOwnedSection(test.id, req.params.sectionId);
    if (!section) {
      res.status(404).json({ error: 'Section not found.' });
      return;
    }

    const body = req.body as Partial<CreateQuestionRequest>;
    const validationError = validateQuestionBody(body);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const maxOrder = await prisma.question.aggregate({
      where: { sectionId: section.id },
      _max: { order: true },
    });
    const order = (maxOrder._max.order ?? 0) + 1;
    const choices = (body.choices ?? []) as ChoiceInput[];

    await prisma.question.create({
      data: {
        sectionId: section.id,
        type: body.type as QuestionType,
        prompt: (body.prompt as string).trim(),
        order,
        acceptedAnswers:
          body.type === 'fillBlank' ? (body.acceptedAnswers as string[]).map((a) => a.trim()) : [],
        essayMaxScore: body.type === 'essay' ? (body.essayMaxScore ?? DEFAULT_ESSAY_MAX_SCORE) : null,
        allowedResponseSeconds:
          body.type === 'speaking' ? (body.allowedResponseSeconds ?? DEFAULT_SPEAKING_SECONDS) : null,
        promptAudioUrl: body.type === 'speaking' ? (body.promptAudioUrl ?? null) : null,
        choices:
          body.type === 'fillBlank' || body.type === 'essay' || body.type === 'speaking'
            ? undefined
            : {
                create: choices.map((c, index) => ({
                  text: c.text.trim(),
                  isCorrect: c.isCorrect,
                  order: index + 1,
                })),
              },
      },
    });

    const nested = await fetchNestedTest(test.id);
    res.status(201).json(toTestDetailDTO(nested));
  }),
);

teacherTestsRouter.patch(
  '/tests/:testId/sections/:sectionId/questions/:questionId',
  asyncHandler(async (req, res) => {
    const test = await requireOwnedTest(req.params.testId, req.user!, res);
    if (!test) return;

    const section = await loadOwnedSection(test.id, req.params.sectionId);
    if (!section) {
      res.status(404).json({ error: 'Section not found.' });
      return;
    }

    const question = await prisma.question.findUnique({
      where: { id: req.params.questionId },
      include: { choices: true },
    });
    if (!question || question.sectionId !== section.id) {
      res.status(404).json({ error: 'Question not found.' });
      return;
    }

    const body = req.body as Partial<UpdateQuestionRequest>;
    const validationError = validateQuestionBody(body);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const newType = body.type as QuestionType;

    await prisma.$transaction(async (tx) => {
      await tx.question.update({
        where: { id: question.id },
        data: {
          type: newType,
          prompt: (body.prompt as string).trim(),
          acceptedAnswers:
            newType === 'fillBlank' ? (body.acceptedAnswers as string[]).map((a) => a.trim()) : [],
          essayMaxScore: newType === 'essay' ? (body.essayMaxScore ?? DEFAULT_ESSAY_MAX_SCORE) : null,
          allowedResponseSeconds:
            newType === 'speaking' ? (body.allowedResponseSeconds ?? DEFAULT_SPEAKING_SECONDS) : null,
          promptAudioUrl: newType === 'speaking' ? (body.promptAudioUrl ?? null) : null,
        },
      });

      if (newType === 'fillBlank' || newType === 'essay' || newType === 'speaking') {
        // No choices apply to fillBlank/essay/speaking at all — drop any that existed
        // from a previous type (e.g. the teacher switched this question's type).
        await tx.choice.deleteMany({ where: { questionId: question.id } });
        return;
      }

      const incoming = (body.choices ?? []) as ChoiceInput[];
      const existingIds = new Set(question.choices.map((c) => c.id));
      const incomingIds = new Set(incoming.filter((c) => c.id).map((c) => c.id as string));

      const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
      if (toDelete.length > 0) {
        await tx.choice.deleteMany({ where: { id: { in: toDelete } } });
      }

      for (const [index, choice] of incoming.entries()) {
        if (choice.id && existingIds.has(choice.id)) {
          await tx.choice.update({
            where: { id: choice.id },
            data: { text: choice.text.trim(), isCorrect: choice.isCorrect, order: index + 1 },
          });
        } else {
          await tx.choice.create({
            data: {
              questionId: question.id,
              text: choice.text.trim(),
              isCorrect: choice.isCorrect,
              order: index + 1,
            },
          });
        }
      }
    });

    const nested = await fetchNestedTest(test.id);
    res.status(200).json(toTestDetailDTO(nested));
  }),
);

teacherTestsRouter.delete(
  '/tests/:testId/sections/:sectionId/questions/:questionId',
  asyncHandler(async (req, res) => {
    const test = await requireOwnedTest(req.params.testId, req.user!, res);
    if (!test) return;

    const section = await loadOwnedSection(test.id, req.params.sectionId);
    if (!section) {
      res.status(404).json({ error: 'Section not found.' });
      return;
    }

    const question = await prisma.question.findUnique({ where: { id: req.params.questionId } });
    if (!question || question.sectionId !== section.id) {
      res.status(404).json({ error: 'Question not found.' });
      return;
    }

    await prisma.question.delete({ where: { id: question.id } });
    const nested = await fetchNestedTest(test.id);
    res.status(200).json(toTestDetailDTO(nested));
  }),
);

teacherTestsRouter.put(
  '/tests/:testId/sections/:sectionId/questions/reorder',
  asyncHandler(async (req, res) => {
    const test = await requireOwnedTest(req.params.testId, req.user!, res);
    if (!test) return;

    const section = await loadOwnedSection(test.id, req.params.sectionId);
    if (!section) {
      res.status(404).json({ error: 'Section not found.' });
      return;
    }

    const body = req.body as Partial<ReorderQuestionsRequest>;
    const orderedIds = body.orderedQuestionIds;
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      res.status(400).json({ error: 'orderedQuestionIds must be a non-empty array.' });
      return;
    }

    const existing = await prisma.question.findMany({
      where: { sectionId: section.id },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((q) => q.id));
    const sameSet =
      orderedIds.length === existingIds.size && orderedIds.every((id) => existingIds.has(id));
    if (!sameSet) {
      res.status(400).json({
        error: 'orderedQuestionIds must contain exactly this section’s current question ids.',
      });
      return;
    }

    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.question.update({ where: { id }, data: { order: index + 1 } }),
      ),
    );

    const nested = await fetchNestedTest(test.id);
    res.status(200).json(toTestDetailDTO(nested));
  }),
);

// --- Variants ("mã đề") — T-009 -------------------------------------------------------

teacherTestsRouter.post(
  '/tests/:testId/variants',
  asyncHandler(async (req, res) => {
    const test = await requireOwnedTest(req.params.testId, req.user!, res);
    if (!test) return;

    const body = req.body as Partial<GenerateVariantsRequest>;
    const count = typeof body.count === 'number' && Number.isInteger(body.count) ? body.count : 2;
    if (count < 1 || count > 50) {
      res.status(400).json({ error: 'count must be between 1 and 50.' });
      return;
    }

    const nested = await fetchNestedTest(test.id);
    const hasAnyQuestion = nested.sections.some((s) => s.questions.length > 0);
    if (!hasAnyQuestion) {
      res.status(400).json({ error: 'Cannot generate variants for a test with no questions yet.' });
      return;
    }

    const existingCount = await prisma.testVariant.count({ where: { testId: test.id } });
    const codes = nextVariantCodes(existingCount, count);

    const created = await prisma.$transaction(
      codes.map((code) =>
        prisma.testVariant.create({
          data: { testId: test.id, code, layout: generateVariantLayout(nested) as object },
        }),
      ),
    );

    res.status(201).json(created.map(toVariantDTO));
  }),
);

teacherTestsRouter.get(
  '/tests/:testId/variants',
  asyncHandler(async (req, res) => {
    const test = await requireOwnedTest(req.params.testId, req.user!, res);
    if (!test) return;

    const variants = await prisma.testVariant.findMany({
      where: { testId: test.id },
      orderBy: { createdAt: 'asc' },
    });

    res.status(200).json(variants.map(toVariantDTO));
  }),
);

// --- Content-to-class assignment (T-075) ---------------------------------------------
// See `lib/contentClassAssignment.ts`'s doc comment for why validation is against
// `test.teacherId` (the content's own owner), not `req.user!.sub` — this is what lets an
// admin caller assign a DIFFERENT teacher's test to that SAME teacher's classes.

teacherTestsRouter.get(
  '/tests/:testId/classes',
  asyncHandler(async (req, res) => {
    const test = await requireOwnedTest(req.params.testId, req.user!, res);
    if (!test) return;

    const withClasses = await prisma.test.findUniqueOrThrow({
      where: { id: test.id },
      select: { classes: { select: { id: true } } },
    });
    const body: ContentClassAssignmentDTO = { classIds: withClasses.classes.map((c) => c.id) };
    res.status(200).json(body);
  }),
);

teacherTestsRouter.put(
  '/tests/:testId/classes',
  asyncHandler(async (req, res) => {
    const test = await requireOwnedTest(req.params.testId, req.user!, res);
    if (!test) return;

    const body = req.body as Partial<UpdateContentClassesRequest>;
    const result = await validateClassIdsForOwner(body.classIds, test.teacherId);
    if ('error' in result) {
      res.status(400).json({ error: result.error });
      return;
    }

    await prisma.test.update({
      where: { id: test.id },
      data: { classes: { set: result.classIds.map((id) => ({ id })) } },
    });

    const response: ContentClassAssignmentDTO = { classIds: result.classIds };
    res.status(200).json(response);
  }),
);
