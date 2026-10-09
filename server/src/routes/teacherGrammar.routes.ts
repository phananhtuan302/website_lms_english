/**
 * Teacher Grammar-topic authoring (T-046/T-047): CRUD for a teacher's own
 * `GrammarTopic` (theory content) and its `GrammarExercise`/`GrammarChoice` practice
 * exercises, plus the T-050 Grammar reporting endpoint. Same shape as
 * `teacherFlashcards.routes.ts` — every route here allows `teacher` or `admin`
 * (`requireRole('teacher', 'admin')`, extended 2026-09-15 for T-071) and every route
 * touching a specific topic enforces ownership-or-admin via `requireOwnedGrammarTopic`
 * (404 for another teacher's topic when the caller isn't that teacher or an admin, same
 * "don't reveal existence" reasoning as `requireOwnedFlashcardSet`/`requireOwnedTest`).
 */

import { Router } from 'express';
import type {
  CommitGeneratedGrammarLessonRequest,
  CommitGeneratedGrammarLessonResponse,
  CommitGrammarExerciseRowError,
  ContentClassAssignmentDTO,
  CreateGrammarExerciseRequest,
  CreateGrammarTopicRequest,
  GenerateGrammarLessonRequest,
  GenerateGrammarLessonResponse,
  GrammarChoiceInput,
  GrammarExerciseDTO,
  GrammarReportResponseDTO,
  GrammarTopicDetailDTO,
  GrammarTopicSummaryDTO,
  QuestionType,
  UpdateContentClassesRequest,
  UpdateGrammarExerciseRequest,
  UpdateGrammarTopicRequest,
} from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { requireOwnedGrammarTopic } from '../lib/ownedGrammarTopic';
import { isAdminOrOwner } from '../lib/authz';
import { loadOwnerClassesWithCurrentPeriod, validateClassIdsForOwner } from '../lib/contentClassAssignment';
import {
  computeGrammarReport,
  GRAMMAR_REPORT_GROUP_BY_VALUES,
  type GrammarReportGroupBy,
} from '../lib/reporting';
import { isClassScopeFailure, requireClassPeriod, resolveTeacherClassId } from '../lib/reportClassScope';
import { generateGrammarLesson } from '../aiTools/grammarGenerator';

export const teacherGrammarRouter = Router();

// T-071: `admin` also allowed (PROJECT_PLAN Assumption A12) — see
// `teacherTests.routes.ts`'s identical note; `requireOwnedGrammarTopic` is what lets
// admin manage ANY teacher's Grammar topic through these same routes. (The
// `/grammar-reports` endpoint below stays scoped to the calling teacher's own topics
// either way — Grammar reporting oversight is T-072's scope, not this batch's.)
teacherGrammarRouter.use(requireAuth, requireRole('teacher', 'admin'));

/** Objective-only per T-048's acceptance criteria — `essay` is a valid `QuestionType`
 * value at the DB level (the enum is reused as-is, see schema.prisma's module doc
 * comment) but is never a legal Grammar-exercise type: there's no manual-grading UI for
 * Grammar. */
const GRAMMAR_EXERCISE_TYPES: QuestionType[] = ['multipleChoice', 'trueFalse', 'fillBlank'];

// --- Serialization ---------------------------------------------------------------------

function toExerciseDTO(exercise: {
  id: string;
  type: QuestionType;
  prompt: string;
  order: number;
  acceptedAnswers: string[];
  choices: Array<{ id: string; text: string; isCorrect: boolean; order: number }>;
}): GrammarExerciseDTO {
  return {
    id: exercise.id,
    type: exercise.type,
    prompt: exercise.prompt,
    order: exercise.order,
    acceptedAnswers: exercise.acceptedAnswers,
    choices: exercise.choices.map((c) => ({ id: c.id, text: c.text, isCorrect: c.isCorrect, order: c.order })),
  };
}

async function fetchDetail(topicId: string): Promise<GrammarTopicDetailDTO> {
  const topic = await prisma.grammarTopic.findUniqueOrThrow({
    where: { id: topicId },
    include: {
      unit: { select: { id: true, name: true } },
      exercises: { orderBy: { order: 'asc' }, include: { choices: { orderBy: { order: 'asc' } } } },
    },
  });
  return {
    id: topic.id,
    title: topic.title,
    teacherId: topic.teacherId,
    unitId: topic.unitId,
    unit: topic.unit ? { id: topic.unit.id, name: topic.unit.name } : null,
    theoryContent: topic.theoryContent,
    exercises: topic.exercises.map(toExerciseDTO),
    createdAt: topic.createdAt.toISOString(),
    updatedAt: topic.updatedAt.toISOString(),
  };
}

/** Same "your call, document it" `unitId` validation already established by
 * `teacherTests.routes.ts`/`teacherFlashcards.routes.ts` — kept as a local copy per that
 * same "three-line DB lookup, not worth cross-module coupling for" convention. */
async function validateUnitId(value: unknown): Promise<string | null> {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return 'unitId must be a string id or null.';
  const unit = await prisma.unit.findUnique({ where: { id: value } });
  if (!unit) return 'unitId does not reference an existing Unit.';
  return null;
}

/** Validates a create/edit exercise body — same convention as
 * `teacherTests.routes.ts`'s `validateQuestionBody`, restricted to the objective types
 * Grammar practice supports (no `essay` branch at all). */
function validateExerciseBody(body: Partial<CreateGrammarExerciseRequest>): string | null {
  if (typeof body.prompt !== 'string' || body.prompt.trim() === '') {
    return 'Exercise prompt is required.';
  }
  if (!body.type || !GRAMMAR_EXERCISE_TYPES.includes(body.type)) {
    return `Exercise type must be one of: ${GRAMMAR_EXERCISE_TYPES.join(', ')}.`;
  }

  if (body.type === 'fillBlank') {
    const answers = body.acceptedAnswers;
    if (
      !Array.isArray(answers) ||
      answers.length === 0 ||
      answers.some((a) => typeof a !== 'string' || a.trim() === '')
    ) {
      return 'fillBlank exercises require at least one non-empty accepted answer.';
    }
    return null;
  }

  // multipleChoice / trueFalse
  const choices = body.choices;
  if (
    !Array.isArray(choices) ||
    choices.some(
      (c) => typeof c?.text !== 'string' || c.text.trim() === '' || typeof c.isCorrect !== 'boolean',
    )
  ) {
    return 'Choices must be a list of { text, isCorrect } with non-empty text.';
  }
  if (body.type === 'trueFalse' && choices.length !== 2) {
    return 'trueFalse exercises require exactly 2 choices.';
  }
  if (body.type === 'multipleChoice' && choices.length < 2) {
    return 'multipleChoice exercises require at least 2 choices.';
  }
  const correctCount = choices.filter((c) => c.isCorrect).length;
  if (correctCount !== 1) {
    return 'Exactly one choice must be marked as correct.';
  }
  return null;
}

// --- Grammar topic CRUD ------------------------------------------------------------------

teacherGrammarRouter.post(
  '/grammar-topics',
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<CreateGrammarTopicRequest>;
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) {
      res.status(400).json({ error: 'Grammar topic title is required.' });
      return;
    }
    const theoryContent = typeof body.theoryContent === 'string' ? body.theoryContent.trim() : '';
    if (!theoryContent) {
      res.status(400).json({ error: 'Theory content is required.' });
      return;
    }
    const unitError = await validateUnitId(body.unitId);
    if (unitError) {
      res.status(400).json({ error: unitError });
      return;
    }

    const topic = await prisma.grammarTopic.create({
      data: { title, theoryContent, teacherId: req.user!.sub, unitId: body.unitId ?? null },
    });
    res.status(201).json(await fetchDetail(topic.id));
  }),
);

teacherGrammarRouter.get(
  '/grammar-topics',
  asyncHandler(async (req, res) => {
    const topics = await prisma.grammarTopic.findMany({
      where: { teacherId: req.user!.sub },
      orderBy: { updatedAt: 'desc' },
      include: { unit: { select: { id: true, name: true } }, _count: { select: { exercises: true } } },
    });
    const summaries: GrammarTopicSummaryDTO[] = topics.map((topic) => ({
      id: topic.id,
      title: topic.title,
      unitId: topic.unitId,
      unitName: topic.unit?.name ?? null,
      exerciseCount: topic._count.exercises,
      createdAt: topic.createdAt.toISOString(),
      updatedAt: topic.updatedAt.toISOString(),
    }));
    res.status(200).json(summaries);
  }),
);

teacherGrammarRouter.get(
  '/grammar-topics/:topicId',
  asyncHandler(async (req, res) => {
    const topic = await requireOwnedGrammarTopic(req.params.topicId, req.user!, res);
    if (!topic) return;
    res.status(200).json(await fetchDetail(topic.id));
  }),
);

teacherGrammarRouter.patch(
  '/grammar-topics/:topicId',
  asyncHandler(async (req, res) => {
    const topic = await requireOwnedGrammarTopic(req.params.topicId, req.user!, res);
    if (!topic) return;

    const body = req.body as Partial<UpdateGrammarTopicRequest>;
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) {
      res.status(400).json({ error: 'Grammar topic title is required.' });
      return;
    }
    const theoryContent = typeof body.theoryContent === 'string' ? body.theoryContent.trim() : '';
    if (!theoryContent) {
      res.status(400).json({ error: 'Theory content is required.' });
      return;
    }
    const unitError = await validateUnitId(body.unitId);
    if (unitError) {
      res.status(400).json({ error: unitError });
      return;
    }

    await prisma.grammarTopic.update({
      where: { id: topic.id },
      data: {
        title,
        theoryContent,
        ...(body.unitId !== undefined ? { unitId: body.unitId } : {}),
      },
    });
    res.status(200).json(await fetchDetail(topic.id));
  }),
);

teacherGrammarRouter.delete(
  '/grammar-topics/:topicId',
  asyncHandler(async (req, res) => {
    const topic = await requireOwnedGrammarTopic(req.params.topicId, req.user!, res);
    if (!topic) return;
    await prisma.grammarTopic.delete({ where: { id: topic.id } });
    res.status(204).send();
  }),
);

// --- AI grammar lesson generation (2026-10, feature 2 of the "AI Content Tools" set) ---

/** `POST /grammar-topics/generate` — returns a DRAFT only (`generateGrammarLesson` never
 * writes to the DB). The teacher reviews/edits the draft client-side, then saves it via
 * `POST /grammar-topics/generate/commit` below. */
teacherGrammarRouter.post(
  '/grammar-topics/generate',
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<GenerateGrammarLessonRequest>;
    const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
    if (!topic) {
      res.status(400).json({ error: 'topic is required.' });
      return;
    }

    const draft = await generateGrammarLesson({ topic });
    const response: GenerateGrammarLessonResponse = draft;
    res.status(200).json(response);
  }),
);

/**
 * `POST /grammar-topics/generate/commit` — persists the (possibly teacher-edited) draft
 * from `POST /grammar-topics/generate` above. Creates the `GrammarTopic` unconditionally
 * once `title`/`theoryContent`/`unitId` pass the SAME checks the manual create route uses,
 * then attempts each exercise through the EXACT SAME `validateExerciseBody` the manual
 * exercise-create route uses — partial success, same "a bad row is skipped and reported,
 * not a reason to reject the whole batch" convention as the flashcard bulk-import route,
 * since a teacher reviewing an AI draft deserves the same forgiveness a human typo does.
 */
teacherGrammarRouter.post(
  '/grammar-topics/generate/commit',
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<CommitGeneratedGrammarLessonRequest>;

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) {
      res.status(400).json({ error: 'Grammar topic title is required.' });
      return;
    }
    const theoryContent = typeof body.theoryContent === 'string' ? body.theoryContent.trim() : '';
    if (!theoryContent) {
      res.status(400).json({ error: 'Theory content is required.' });
      return;
    }
    const unitError = await validateUnitId(body.unitId);
    if (unitError) {
      res.status(400).json({ error: unitError });
      return;
    }
    if (!Array.isArray(body.exercises)) {
      res.status(400).json({ error: 'exercises must be an array.' });
      return;
    }

    const topic = await prisma.grammarTopic.create({
      data: { title, theoryContent, teacherId: req.user!.sub, unitId: body.unitId ?? null },
    });

    const errors: CommitGrammarExerciseRowError[] = [];
    let createdExerciseCount = 0;
    let order = 1;
    for (const [index, raw] of body.exercises.entries()) {
      const exerciseBody = (raw ?? {}) as Partial<CreateGrammarExerciseRequest>;
      const validationError = validateExerciseBody(exerciseBody);
      if (validationError) {
        errors.push({ index, message: validationError });
        continue;
      }

      const choices = (exerciseBody.choices ?? []) as GrammarChoiceInput[];
      await prisma.grammarExercise.create({
        data: {
          topicId: topic.id,
          type: exerciseBody.type as QuestionType,
          prompt: (exerciseBody.prompt as string).trim(),
          order,
          acceptedAnswers:
            exerciseBody.type === 'fillBlank' ? (exerciseBody.acceptedAnswers as string[]).map((a) => a.trim()) : [],
          choices:
            exerciseBody.type === 'fillBlank'
              ? undefined
              : {
                  create: choices.map((c, i) => ({
                    text: c.text.trim(),
                    isCorrect: c.isCorrect,
                    order: i + 1,
                  })),
                },
        },
      });
      order += 1;
      createdExerciseCount += 1;
    }

    const response: CommitGeneratedGrammarLessonResponse = {
      topic: await fetchDetail(topic.id),
      createdExerciseCount,
      errors,
    };
    res.status(201).json(response);
  }),
);

// --- Content-to-class assignment (T-075) ---------------------------------------------
// Same shape/reasoning as `teacherTests.routes.ts`'s identical block — see
// `lib/contentClassAssignment.ts`'s doc comment for why validation is against
// `topic.teacherId` (the topic's own owner), not `req.user!.sub`.

teacherGrammarRouter.get(
  '/grammar-topics/:topicId/classes',
  asyncHandler(async (req, res) => {
    const topic = await requireOwnedGrammarTopic(req.params.topicId, req.user!, res);
    if (!topic) return;

    const ownerClassPeriods = await loadOwnerClassesWithCurrentPeriod(topic.teacherId);
    const assigned =
      ownerClassPeriods.length === 0
        ? []
        : await prisma.grammarTopicClassPeriodAssignment.findMany({
            where: { grammarTopicId: topic.id, OR: ownerClassPeriods },
            select: { classId: true },
          });
    const body: ContentClassAssignmentDTO = { classIds: assigned.map((a) => a.classId) };
    res.status(200).json(body);
  }),
);

teacherGrammarRouter.put(
  '/grammar-topics/:topicId/classes',
  asyncHandler(async (req, res) => {
    const topic = await requireOwnedGrammarTopic(req.params.topicId, req.user!, res);
    if (!topic) return;

    const body = req.body as Partial<UpdateContentClassesRequest>;
    const result = await validateClassIdsForOwner(body.classIds, topic.teacherId);
    if ('error' in result) {
      res.status(400).json({ error: result.error });
      return;
    }

    // T-099: replace-not-merge, scoped to exactly this topic's (class, CLASS'S CURRENT
    // PERIOD) slice — see `teacherTests.routes.ts`'s identical `PUT .../classes` for the
    // full reasoning.
    const requested = new Set(result.classIds);
    const ownerClassPeriods = await loadOwnerClassesWithCurrentPeriod(topic.teacherId);
    await prisma.$transaction(
      ownerClassPeriods.map(({ classId, periodId }) =>
        requested.has(classId)
          ? prisma.grammarTopicClassPeriodAssignment.upsert({
              where: {
                grammarTopicId_classId_periodId: { grammarTopicId: topic.id, classId, periodId },
              },
              create: { grammarTopicId: topic.id, classId, periodId },
              update: {},
            })
          : prisma.grammarTopicClassPeriodAssignment.deleteMany({
              where: { grammarTopicId: topic.id, classId, periodId },
            }),
      ),
    );

    const assigned =
      ownerClassPeriods.length === 0
        ? []
        : await prisma.grammarTopicClassPeriodAssignment.findMany({
            where: { grammarTopicId: topic.id, OR: ownerClassPeriods },
            select: { classId: true },
          });
    const response: ContentClassAssignmentDTO = { classIds: assigned.map((a) => a.classId) };
    res.status(200).json(response);
  }),
);

// --- Grammar exercise CRUD ---------------------------------------------------------------

async function loadOwnedExercise(topicId: string, exerciseId: string) {
  const exercise = await prisma.grammarExercise.findUnique({
    where: { id: exerciseId },
    include: { choices: true },
  });
  if (!exercise || exercise.topicId !== topicId) return null;
  return exercise;
}

teacherGrammarRouter.post(
  '/grammar-topics/:topicId/exercises',
  asyncHandler(async (req, res) => {
    const topic = await requireOwnedGrammarTopic(req.params.topicId, req.user!, res);
    if (!topic) return;

    const body = req.body as Partial<CreateGrammarExerciseRequest>;
    const validationError = validateExerciseBody(body);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const maxOrder = await prisma.grammarExercise.aggregate({
      where: { topicId: topic.id },
      _max: { order: true },
    });
    const order = (maxOrder._max.order ?? 0) + 1;
    const choices = (body.choices ?? []) as GrammarChoiceInput[];

    await prisma.grammarExercise.create({
      data: {
        topicId: topic.id,
        type: body.type as QuestionType,
        prompt: (body.prompt as string).trim(),
        order,
        acceptedAnswers:
          body.type === 'fillBlank' ? (body.acceptedAnswers as string[]).map((a) => a.trim()) : [],
        choices:
          body.type === 'fillBlank'
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

    res.status(201).json(await fetchDetail(topic.id));
  }),
);

teacherGrammarRouter.patch(
  '/grammar-topics/:topicId/exercises/:exerciseId',
  asyncHandler(async (req, res) => {
    const topic = await requireOwnedGrammarTopic(req.params.topicId, req.user!, res);
    if (!topic) return;

    const exercise = await loadOwnedExercise(topic.id, req.params.exerciseId);
    if (!exercise) {
      res.status(404).json({ error: 'Exercise not found.' });
      return;
    }

    const body = req.body as Partial<UpdateGrammarExerciseRequest>;
    const validationError = validateExerciseBody(body);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const newType = body.type as QuestionType;

    await prisma.$transaction(async (tx) => {
      await tx.grammarExercise.update({
        where: { id: exercise.id },
        data: {
          type: newType,
          prompt: (body.prompt as string).trim(),
          acceptedAnswers:
            newType === 'fillBlank' ? (body.acceptedAnswers as string[]).map((a) => a.trim()) : [],
        },
      });

      if (newType === 'fillBlank') {
        await tx.grammarChoice.deleteMany({ where: { exerciseId: exercise.id } });
        return;
      }

      const incoming = (body.choices ?? []) as GrammarChoiceInput[];
      const existingIds = new Set(exercise.choices.map((c) => c.id));
      const incomingIds = new Set(incoming.filter((c) => c.id).map((c) => c.id as string));

      const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
      if (toDelete.length > 0) {
        await tx.grammarChoice.deleteMany({ where: { id: { in: toDelete } } });
      }

      for (const [index, choice] of incoming.entries()) {
        if (choice.id && existingIds.has(choice.id)) {
          await tx.grammarChoice.update({
            where: { id: choice.id },
            data: { text: choice.text.trim(), isCorrect: choice.isCorrect, order: index + 1 },
          });
        } else {
          await tx.grammarChoice.create({
            data: {
              exerciseId: exercise.id,
              text: choice.text.trim(),
              isCorrect: choice.isCorrect,
              order: index + 1,
            },
          });
        }
      }
    });

    res.status(200).json(await fetchDetail(topic.id));
  }),
);

teacherGrammarRouter.delete(
  '/grammar-topics/:topicId/exercises/:exerciseId',
  asyncHandler(async (req, res) => {
    const topic = await requireOwnedGrammarTopic(req.params.topicId, req.user!, res);
    if (!topic) return;

    const exercise = await loadOwnedExercise(topic.id, req.params.exerciseId);
    if (!exercise) {
      res.status(404).json({ error: 'Exercise not found.' });
      return;
    }

    await prisma.grammarExercise.delete({ where: { id: exercise.id } });
    res.status(200).json(await fetchDetail(topic.id));
  }),
);

// --- Grammar reports (T-050) ---------------------------------------------------------

function isGrammarReportGroupBy(value: unknown): value is GrammarReportGroupBy {
  return (
    typeof value === 'string' && (GRAMMAR_REPORT_GROUP_BY_VALUES as readonly string[]).includes(value)
  );
}

/** `GET /api/teacher/grammar-reports` — thin HTTP layer over `computeGrammarReport`,
 * same "validation here, math in the engine" split as `teacherReports.routes.ts`.
 * `topicId`, when given, must be a topic owned by the calling teacher (same ownership
 * check as narrowing `GET /api/teacher/reports` by `testId`); `studentId`, when given,
 * must reference an existing student account. Neither filter is required — omitting
 * both returns the full per-class breakdown across every one of the teacher's topics. */
teacherGrammarRouter.get(
  '/grammar-reports',
  asyncHandler(async (req, res) => {
    const groupByRaw = req.query.groupBy;
    if (!isGrammarReportGroupBy(groupByRaw)) {
      res.status(400).json({
        error: `groupBy is required and must be one of: ${GRAMMAR_REPORT_GROUP_BY_VALUES.join(', ')}.`,
      });
      return;
    }

    const topicIdRaw = req.query.topicId;
    let topicId: string | null = null;
    let topicOwnerId: string | null = null;
    if (typeof topicIdRaw === 'string' && topicIdRaw.trim() !== '') {
      const topic = await prisma.grammarTopic.findUnique({ where: { id: topicIdRaw } });
      // T-078 fix: `isAdminOrOwner` (not a raw `!== req.user!.sub` comparison) — a raw
      // comparison 404'd admin for ANY topicId it didn't itself author, inconsistent
      // with `requireOwnedGrammarTopic`'s own admin bypass used everywhere else in this
      // file. See `teacherReports.routes.ts`'s matching fix for why the resolved topic's
      // OWN `teacherId` (not `req.user!.sub`) is also fed into `computeGrammarReport`
      // below — passing admin's own id instead would silently zero out the report even
      // after this check lets admin through, since `fetchScopedGrammarAttempts` filters
      // `topic.teacherId` and `topicId` together, not as alternatives.
      if (!topic || !isAdminOrOwner(req.user!, topic.teacherId)) {
        res.status(404).json({ error: 'Grammar topic not found.' });
        return;
      }
      topicId = topic.id;
      topicOwnerId = topic.teacherId;
    }

    const studentIdRaw = req.query.studentId;
    let studentId: string | null = null;
    if (typeof studentIdRaw === 'string' && studentIdRaw.trim() !== '') {
      const student = await prisma.user.findUnique({ where: { id: studentIdRaw } });
      if (!student || student.role !== 'student') {
        res.status(400).json({ error: 'studentId does not reference an existing student.' });
        return;
      }
      studentId = student.id;
    }

    // T-077: required class dimension, same shared resolver as `/api/teacher/reports`.
    const scope = await resolveTeacherClassId(req.user!, req.query.classId);
    if (isClassScopeFailure(scope)) {
      res.status(scope.status).json({ error: scope.error });
      return;
    }
    // T-099: this report also requires a CONCRETE period — see `computeGrammarReport`'s
    // `periodId` doc comment in `../lib/reporting.ts` for what it additionally narrows.
    const periodScope = requireClassPeriod(scope);
    if (isClassScopeFailure(periodScope)) {
      res.status(periodScope.status).json({ error: periodScope.error });
      return;
    }

    const result = await computeGrammarReport({
      groupBy: groupByRaw,
      // T-078 fix: the narrowed topic's OWN owner when one was given — see the
      // `topicOwnerId` assignment above for why.
      teacherId: topicOwnerId ?? req.user!.sub,
      topicId,
      studentId,
      classId: periodScope.classId,
      periodId: periodScope.periodId,
    });
    const body: GrammarReportResponseDTO = {
      ...result,
      classId: periodScope.classId,
      className: periodScope.className,
      periodId: periodScope.periodId,
      periodName: periodScope.periodName,
    };
    res.status(200).json(body);
  }),
);
