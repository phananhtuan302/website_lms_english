/**
 * Student-facing Grammar endpoints: browsing topics + reading theory content (T-047),
 * practice exercises with immediate feedback (T-048), and the Grammar game (T-049).
 *
 * Class-scoped as of T-076, Phase 12: every route here is `student`-only
 * (`requireRole('student')`) AND now additionally scoped to topics ASSIGNED to the
 * calling student's own `Class` (`GrammarTopic.classes`, T-075) — this SUPERSEDES the
 * earlier "no enrollment concept, any logged-in student can read/practice any topic"
 * assumption this doc comment used to describe. `loadTopic` below is the single
 * chokepoint every per-topic route (detail, progress, exercises, game) goes through, so
 * the class check is enforced identically everywhere with one implementation rather than
 * per-route.
 */

import { Router } from 'express';
import type {
  CheckGrammarExerciseRequest,
  CheckGrammarExerciseResponse,
  CompleteGrammarActivityRequest,
  CompleteGrammarActivityResponse,
  GrammarExercisePromptDTO,
  GrammarGameQuestionDTO,
  GrammarGameType,
  GrammarTopicProgressDTO,
  StudentGrammarTopicDetailDTO,
  StudentGrammarTopicSummaryDTO,
} from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { gradeAnswer, type GradableQuestion, type RawAnswer } from '../lib/grading';
import { getStudentClassAndPeriod } from '../lib/classScoping';

export const studentGrammarRouter = Router();

studentGrammarRouter.use(requireAuth, requireRole('student'));

// --- Browse + read theory content (T-047) ---------------------------------------------

/** GET / — every `GrammarTopic` ASSIGNED TO THE CALLING STUDENT'S OWN CLASS (T-076). A
 * classless student (shouldn't happen post-T-074/T-075, see `getStudentClassId`'s doc
 * comment) sees an empty list rather than every topic or a crash. */
studentGrammarRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const scp = await getStudentClassAndPeriod(req.user!.sub);
    if (!scp || scp.periodId == null) {
      res.status(200).json([] satisfies StudentGrammarTopicSummaryDTO[]);
      return;
    }

    const topics = await prisma.grammarTopic.findMany({
      where: { classAssignments: { some: { classId: scp.classId, periodId: scp.periodId } } },
      orderBy: { updatedAt: 'desc' },
      include: { unit: { select: { name: true } }, _count: { select: { exercises: true } } },
    });
    const summaries: StudentGrammarTopicSummaryDTO[] = topics.map((topic) => ({
      id: topic.id,
      title: topic.title,
      unitId: topic.unitId,
      unitName: topic.unit?.name ?? null,
      exerciseCount: topic._count.exercises,
    }));
    res.status(200).json(summaries);
  }),
);

/** Loads a topic, or writes a 404 and returns `null`. Shared by every per-topic route
 * below.
 *
 * T-076 (extended T-099): also verifies this topic is assigned to `studentId`'s own
 * class FOR THAT CLASS'S CURRENT SEMESTER, writing the IDENTICAL 404 "Grammar topic not
 * found." for "doesn't exist", "exists, but not assigned to your class", and "assigned
 * to your class, but under a different semester" — same anti-leak reasoning as every
 * ownership-check helper in this codebase (`ownedTest.ts` et al.) and
 * `studentFlashcards.routes.ts`'s `loadSetWithCards`: a student probing another class's
 * (or another semester's) topic id learns nothing beyond "not found". */
async function loadTopic(topicId: string, studentId: string, res: import('express').Response) {
  const topic = await prisma.grammarTopic.findUnique({
    where: { id: topicId },
    include: { unit: { select: { name: true } } },
  });
  if (!topic) {
    res.status(404).json({ error: 'Grammar topic not found.' });
    return null;
  }

  const scp = await getStudentClassAndPeriod(studentId);
  if (!scp || scp.periodId == null) {
    res.status(404).json({ error: 'Grammar topic not found.' });
    return null;
  }
  const assignment = await prisma.grammarTopicClassPeriodAssignment.findUnique({
    where: {
      grammarTopicId_classId_periodId: {
        grammarTopicId: topic.id,
        classId: scp.classId,
        periodId: scp.periodId,
      },
    },
  });
  if (!assignment) {
    res.status(404).json({ error: 'Grammar topic not found.' });
    return null;
  }

  return topic;
}

/** `GET /:topicId` — the theory-reading payload (T-047). Persists across reload since
 * it's read straight from the DB every time, same as every other read-only student
 * endpoint in this codebase. */
studentGrammarRouter.get(
  '/:topicId',
  asyncHandler(async (req, res) => {
    const topic = await loadTopic(req.params.topicId, req.user!.sub, res);
    if (!topic) return;

    const response: StudentGrammarTopicDetailDTO = {
      id: topic.id,
      title: topic.title,
      unitId: topic.unitId,
      unitName: topic.unit?.name ?? null,
      theoryContent: topic.theoryContent,
    };
    res.status(200).json(response);
  }),
);

/** `GET /:topicId/progress` — a student's own running accuracy on this topic, shown on
 * the topic page (nice-to-have parity with `FlashcardProgress`'s visible status). */
studentGrammarRouter.get(
  '/:topicId/progress',
  asyncHandler(async (req, res) => {
    const topic = await loadTopic(req.params.topicId, req.user!.sub, res);
    if (!topic) return;

    const attempts = await prisma.grammarExerciseAttempt.findMany({
      where: { topicId: topic.id, studentId: req.user!.sub },
      select: { isCorrect: true },
    });
    const response: GrammarTopicProgressDTO = {
      attemptedCount: attempts.length,
      correctCount: attempts.filter((a) => a.isCorrect).length,
    };
    res.status(200).json(response);
  }),
);

// --- Practice exercises (T-048) --------------------------------------------------------

/** `GET /:topicId/exercises` — every exercise for this topic, answer-free (T-048). Every
 * exercise is eligible (unlike the vocab exercises, there's no optional-data filter
 * here — a Grammar exercise is always fully authored with everything grading needs). */
studentGrammarRouter.get(
  '/:topicId/exercises',
  asyncHandler(async (req, res) => {
    const topic = await loadTopic(req.params.topicId, req.user!.sub, res);
    if (!topic) return;

    const exercises = await prisma.grammarExercise.findMany({
      where: { topicId: topic.id },
      orderBy: { order: 'asc' },
      include: { choices: { orderBy: { order: 'asc' } } },
    });

    const prompts: GrammarExercisePromptDTO[] = exercises.map((exercise) => ({
      id: exercise.id,
      type: exercise.type,
      prompt: exercise.prompt,
      order: exercise.order,
      choices: exercise.choices.map((c) => ({ id: c.id, text: c.text })),
    }));
    res.status(200).json(prompts);
  }),
);

/** `POST /:topicId/exercises/:exerciseId/check` — grades one submission by reusing
 * `lib/grading.ts#gradeAnswer` VERBATIM (the exact same function T-013 uses for Test
 * answers — see schema.prisma's Grammar module doc comment for why that's possible
 * without sharing a table), records a `GrammarExerciseAttempt` row, and returns the
 * correct answer alongside the verdict so the client can show "the correct answer was
 * ..." on a miss — same "immediate feedback" convention as the vocab exercises. */
studentGrammarRouter.post(
  '/:topicId/exercises/:exerciseId/check',
  asyncHandler(async (req, res) => {
    const topic = await loadTopic(req.params.topicId, req.user!.sub, res);
    if (!topic) return;

    const exercise = await prisma.grammarExercise.findUnique({
      where: { id: req.params.exerciseId },
      include: { choices: true },
    });
    if (!exercise || exercise.topicId !== topic.id) {
      res.status(404).json({ error: 'Exercise not found in this Grammar topic.' });
      return;
    }

    const body = req.body as Partial<CheckGrammarExerciseRequest>;
    const raw: RawAnswer = {
      selectedChoiceId: typeof body.selectedChoiceId === 'string' ? body.selectedChoiceId : null,
      textAnswer: typeof body.textAnswer === 'string' ? body.textAnswer : null,
    };
    if (!raw.selectedChoiceId && !raw.textAnswer) {
      res.status(400).json({ error: 'selectedChoiceId or textAnswer is required.' });
      return;
    }

    const gradable: GradableQuestion = {
      id: exercise.id,
      type: exercise.type,
      choices: exercise.choices.map((c) => ({ id: c.id, isCorrect: c.isCorrect })),
      acceptedAnswers: exercise.acceptedAnswers,
    };
    const correct = gradeAnswer(gradable, raw);

    await prisma.grammarExerciseAttempt.create({
      data: {
        topicId: topic.id,
        exerciseId: exercise.id,
        studentId: req.user!.sub,
        selectedChoiceId: raw.selectedChoiceId,
        textAnswer: raw.textAnswer,
        isCorrect: correct,
      },
    });

    const correctChoice = exercise.choices.find((c) => c.isCorrect);
    const response: CheckGrammarExerciseResponse = {
      correct,
      correctChoiceId: correctChoice?.id ?? null,
      correctAnswers: exercise.acceptedAnswers,
    };
    res.status(200).json(response);
  }),
);

// --- Grammar game (T-049) ---------------------------------------------------------------

const GRAMMAR_GAME_TYPES: GrammarGameType[] = ['spaceShooter'];

function isGrammarGameType(value: string): value is GrammarGameType {
  return (GRAMMAR_GAME_TYPES as string[]).includes(value);
}

/** `GET /:topicId/game-questions` — the eligible question pool for the Grammar game
 * (T-049). Only `multipleChoice`/`trueFalse` exercises are eligible (a round needs
 * choices to build lanes from — `fillBlank` has none, documented choice, same
 * eligibility-filter spirit as `isEligible` in `flashcardExercises.ts`). An empty result
 * (e.g. a topic authored entirely with fillBlank exercises) is a valid, empty list —
 * the client treats that as "this game isn't available for this topic yet", never a
 * 4xx. */
studentGrammarRouter.get(
  '/:topicId/game-questions',
  asyncHandler(async (req, res) => {
    const topic = await loadTopic(req.params.topicId, req.user!.sub, res);
    if (!topic) return;

    const exercises = await prisma.grammarExercise.findMany({
      where: { topicId: topic.id, type: { in: ['multipleChoice', 'trueFalse'] } },
      orderBy: { order: 'asc' },
      include: { choices: { orderBy: { order: 'asc' } } },
    });

    const questions: GrammarGameQuestionDTO[] = exercises
      .filter((exercise) => exercise.choices.length >= 2 && exercise.choices.some((c) => c.isCorrect))
      .map((exercise) => ({
        exerciseId: exercise.id,
        prompt: exercise.prompt,
        correctAnswer: exercise.choices.find((c) => c.isCorrect)!.text,
        wrongAnswers: exercise.choices.filter((c) => !c.isCorrect).map((c) => c.text),
      }));
    res.status(200).json(questions);
  }),
);

/** `POST /:topicId/games/:gameType/complete` — records a finished Grammar-game round
 * (T-049). The client already knows both sides of every question it played (see
 * `GrammarGameQuestionDTO`'s doc comment) — this endpoint only persists the aggregate
 * correct/incorrect verdicts, one `GrammarExerciseAttempt` row per exercise touched
 * (`selectedChoiceId`/`textAnswer` left `null` since only the verdict, not the exact
 * choice, is known at this granularity — same convention as the vocab games'
 * `applyBatchProgress`). */
studentGrammarRouter.post(
  '/:topicId/games/:gameType/complete',
  asyncHandler(async (req, res) => {
    const gameType = req.params.gameType;
    if (!isGrammarGameType(gameType)) {
      res.status(400).json({ error: `Unknown game type. Must be one of: ${GRAMMAR_GAME_TYPES.join(', ')}.` });
      return;
    }

    const topic = await loadTopic(req.params.topicId, req.user!.sub, res);
    if (!topic) return;

    const body = req.body as Partial<CompleteGrammarActivityRequest>;
    if (!Array.isArray(body.results)) {
      res.status(400).json({ error: 'results must be an array of { exerciseId, correct }.' });
      return;
    }

    const exerciseIds = new Set(
      (
        await prisma.grammarExercise.findMany({ where: { topicId: topic.id }, select: { id: true } })
      ).map((e) => e.id),
    );
    const validResults = body.results.filter(
      (r): r is { exerciseId: string; correct: boolean } =>
        !!r && typeof r.exerciseId === 'string' && typeof r.correct === 'boolean' && exerciseIds.has(r.exerciseId),
    );

    for (const result of validResults) {
      await prisma.grammarExerciseAttempt.create({
        data: {
          topicId: topic.id,
          exerciseId: result.exerciseId,
          studentId: req.user!.sub,
          selectedChoiceId: null,
          textAnswer: null,
          isCorrect: result.correct,
        },
      });
    }

    const response: CompleteGrammarActivityResponse = { updated: validResults.length };
    res.status(200).json(response);
  }),
);
