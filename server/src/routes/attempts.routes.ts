/**
 * Student-facing attempt endpoints: the take-test runtime (T-012), auto-grading on
 * submit (T-013), and the student's own result view (T-014). Joining (creating the
 * attempt in the first place) is `POST /api/sessions/join/:token`, in
 * `sessions.routes.ts` — everything here operates on an attempt that already exists.
 *
 * Every route is `student`-only and re-checks that the attempt belongs to the calling
 * student (404 if not — same "don't reveal whether the id even exists" reasoning as
 * `requireOwnedTest` for teachers). The submit/answer-save routes additionally
 * re-verify `status === 'inProgress'` SERVER-SIDE on every write, per T-012's
 * acceptance criteria ("no further answer changes accepted after submit, verify
 * server-side too, not just client-side") — a client bug or a replayed request can
 * never mutate a submitted attempt.
 */

import { Router } from 'express';
import type {
  AttemptDetailDTO,
  AttemptResultDTO,
  AttemptSummaryDTO,
  SaveAnswerRequest,
  SubmitAttemptResponse,
} from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { fetchNestedTest } from '../lib/testQueries';
import type { VariantLayout } from '../lib/variantShuffle';
import { buildResultQuestions, buildRuntimeSections, flattenQuestionsInAuthoredOrder } from '../lib/attemptView';
import { gradeAnswer } from '../lib/grading';

export const attemptsRouter = Router();

attemptsRouter.use(requireAuth, requireRole('student'));

/** Loads an attempt owned by the calling student, or writes a 404 and returns `null`. */
async function loadOwnAttempt(attemptId: string, studentId: string) {
  const attempt = await prisma.attempt.findUnique({ where: { id: attemptId } });
  if (!attempt || attempt.studentId !== studentId) {
    return null;
  }
  return attempt;
}

/** `GET /api/attempts` — the current student's own attempts across every test/session,
 * newest first. Not required by any single backlog task's acceptance criteria in so many
 * words, but it's what the student dashboard needs to link back into a past result
 * without the student having to remember a URL, and it's a near-zero-cost addition
 * given `AttemptSummaryDTO` already exists for the teacher's per-session list (T-014). */
attemptsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const attempts = await prisma.attempt.findMany({
      where: { studentId: req.user!.sub },
      include: { test: { select: { id: true, title: true } }, student: true },
      orderBy: { startedAt: 'desc' },
    });

    const summaries: AttemptSummaryDTO[] = attempts.map((a) => ({
      attemptId: a.id,
      sessionId: a.sessionId,
      testId: a.testId,
      testTitle: a.test.title,
      studentId: a.studentId,
      studentName: a.student.name,
      studentEmail: a.student.email,
      status: a.status,
      correctCount: a.correctCount,
      totalCount: a.totalCount,
      scorePercent: a.scorePercent,
      startedAt: a.startedAt.toISOString(),
      submittedAt: a.submittedAt ? a.submittedAt.toISOString() : null,
      timeTakenSeconds: a.timeTakenSeconds,
    }));
    res.status(200).json(summaries);
  }),
);

/** `GET /api/attempts/:attemptId` — the take-test runtime payload (T-012): the
 * student's assigned variant's shuffled sections/questions/choices (answer-key-free),
 * plus whatever answers are already saved (for a mid-test refresh to restore from). */
attemptsRouter.get(
  '/:attemptId',
  asyncHandler(async (req, res) => {
    const attempt = await loadOwnAttempt(req.params.attemptId, req.user!.sub);
    if (!attempt) {
      res.status(404).json({ error: 'Attempt not found.' });
      return;
    }

    const [test, variant, answers] = await Promise.all([
      fetchNestedTest(attempt.testId),
      prisma.testVariant.findUniqueOrThrow({ where: { id: attempt.variantId } }),
      prisma.answer.findMany({ where: { attemptId: attempt.id } }),
    ]);

    const sections = buildRuntimeSections(test, variant.layout as unknown as VariantLayout);

    const response: AttemptDetailDTO = {
      id: attempt.id,
      sessionId: attempt.sessionId,
      testId: test.id,
      testTitle: test.title,
      timeLimitMinutes: test.timeLimitMinutes,
      status: attempt.status,
      startedAt: attempt.startedAt.toISOString(),
      submittedAt: attempt.submittedAt ? attempt.submittedAt.toISOString() : null,
      sections,
      answers: answers.map((a) => ({
        questionId: a.questionId,
        selectedChoiceId: a.selectedChoiceId,
        textAnswer: a.textAnswer,
      })),
    };
    res.status(200).json(response);
  }),
);

/** `PUT /api/attempts/:attemptId/answers/:questionId` — autosave (T-012). Upserts one
 * question's answer; `isCorrect` is intentionally left `null` here (grading only
 * happens once, at submit — T-013), so autosaving repeatedly can never itself change a
 * score. */
attemptsRouter.put(
  '/:attemptId/answers/:questionId',
  asyncHandler(async (req, res) => {
    const attempt = await loadOwnAttempt(req.params.attemptId, req.user!.sub);
    if (!attempt) {
      res.status(404).json({ error: 'Attempt not found.' });
      return;
    }
    if (attempt.status !== 'inProgress') {
      res.status(409).json({ error: 'This attempt has already been submitted; answers can no longer be changed.' });
      return;
    }

    const question = await prisma.question.findUnique({
      where: { id: req.params.questionId },
      include: { choices: true, section: true },
    });
    if (!question || question.section.testId !== attempt.testId) {
      res.status(404).json({ error: 'Question not found on this attempt.' });
      return;
    }

    const body = req.body as Partial<SaveAnswerRequest>;

    let selectedChoiceId: string | null = null;
    let textAnswer: string | null = null;

    if (question.type === 'fillBlank') {
      if (body.textAnswer !== undefined && body.textAnswer !== null) {
        if (typeof body.textAnswer !== 'string') {
          res.status(400).json({ error: 'textAnswer must be a string.' });
          return;
        }
        textAnswer = body.textAnswer;
      }
    } else {
      if (body.selectedChoiceId !== undefined && body.selectedChoiceId !== null) {
        const validChoice = question.choices.some((c) => c.id === body.selectedChoiceId);
        if (!validChoice) {
          res.status(400).json({ error: 'selectedChoiceId must be one of this question’s choices.' });
          return;
        }
        selectedChoiceId = body.selectedChoiceId;
      }
    }

    await prisma.answer.upsert({
      where: { attemptId_questionId: { attemptId: attempt.id, questionId: question.id } },
      create: {
        attemptId: attempt.id,
        questionId: question.id,
        selectedChoiceId,
        textAnswer,
      },
      update: { selectedChoiceId, textAnswer },
    });

    res.status(200).json({ questionId: question.id, selectedChoiceId, textAnswer });
  }),
);

/** `POST /api/attempts/:attemptId/submit` — grades every question exactly once (T-013)
 * and marks the attempt terminal. A second submit call (double-click, retry, a second
 * browser tab) is rejected with 409 rather than silently re-scoring or overwriting —
 * the result is still readable via `GET /:attemptId/result` afterward either way. */
attemptsRouter.post(
  '/:attemptId/submit',
  asyncHandler(async (req, res) => {
    const attempt = await loadOwnAttempt(req.params.attemptId, req.user!.sub);
    if (!attempt) {
      res.status(404).json({ error: 'Attempt not found.' });
      return;
    }
    if (attempt.status !== 'inProgress') {
      res.status(409).json({ error: 'This attempt has already been submitted.' });
      return;
    }

    const [test, existingAnswers] = await Promise.all([
      fetchNestedTest(attempt.testId),
      prisma.answer.findMany({ where: { attemptId: attempt.id } }),
    ]);
    const answerByQuestionId = new Map(existingAnswers.map((a) => [a.questionId, a]));
    const questions = flattenQuestionsInAuthoredOrder(test);

    let correctCount = 0;
    const totalCount = questions.length;

    const result = await prisma.$transaction(async (tx) => {
      for (const question of questions) {
        const existing = answerByQuestionId.get(question.id);
        const isCorrect = gradeAnswer(question, {
          selectedChoiceId: existing?.selectedChoiceId ?? null,
          textAnswer: existing?.textAnswer ?? null,
        });
        if (isCorrect) correctCount += 1;

        await tx.answer.upsert({
          where: { attemptId_questionId: { attemptId: attempt.id, questionId: question.id } },
          create: {
            attemptId: attempt.id,
            questionId: question.id,
            selectedChoiceId: existing?.selectedChoiceId ?? null,
            textAnswer: existing?.textAnswer ?? null,
            isCorrect,
          },
          update: { isCorrect },
        });
      }

      const scorePercent = totalCount > 0 ? Number(((correctCount / totalCount) * 100).toFixed(1)) : 0;

      // T-017: total time taken, in whole seconds, computed ONCE here from the same
      // `submittedAt` instant being stored — never recomputed later from a fresh
      // `new Date()`, so re-reading this attempt afterward always reports the exact
      // same duration.
      const submittedAt = new Date();
      const timeTakenSeconds = Math.max(
        0,
        Math.round((submittedAt.getTime() - attempt.startedAt.getTime()) / 1000),
      );

      return tx.attempt.update({
        where: { id: attempt.id },
        data: {
          status: 'submitted',
          submittedAt,
          correctCount,
          totalCount,
          scorePercent,
          timeTakenSeconds,
        },
      });
    });

    const response: SubmitAttemptResponse = {
      attemptId: result.id,
      status: result.status,
      correctCount: result.correctCount!,
      totalCount: result.totalCount!,
      scorePercent: result.scorePercent!,
      timeTakenSeconds: result.timeTakenSeconds!,
    };
    res.status(200).json(response);
  }),
);

/** `GET /api/attempts/:attemptId/result` — the student's own post-submission result
 * (T-014): total score plus a per-question correct/incorrect breakdown against the
 * answer key. 400 (not 404) if the attempt exists but hasn't been submitted yet — the
 * take-test runtime endpoint above is what serves an in-progress attempt. */
attemptsRouter.get(
  '/:attemptId/result',
  asyncHandler(async (req, res) => {
    const attempt = await loadOwnAttempt(req.params.attemptId, req.user!.sub);
    if (!attempt) {
      res.status(404).json({ error: 'Attempt not found.' });
      return;
    }
    if (attempt.status !== 'submitted') {
      res.status(400).json({ error: 'This attempt has not been submitted yet.' });
      return;
    }

    const [test, student, answers] = await Promise.all([
      fetchNestedTest(attempt.testId),
      prisma.user.findUniqueOrThrow({ where: { id: attempt.studentId } }),
      prisma.answer.findMany({ where: { attemptId: attempt.id } }),
    ]);
    const answerMap = new Map(
      answers.map((a) => [
        a.questionId,
        { selectedChoiceId: a.selectedChoiceId, textAnswer: a.textAnswer, isCorrect: a.isCorrect },
      ]),
    );

    const response: AttemptResultDTO = {
      attemptId: attempt.id,
      testId: test.id,
      testTitle: test.title,
      studentId: student.id,
      studentName: student.name,
      status: attempt.status,
      startedAt: attempt.startedAt.toISOString(),
      submittedAt: attempt.submittedAt ? attempt.submittedAt.toISOString() : null,
      correctCount: attempt.correctCount,
      totalCount: attempt.totalCount,
      scorePercent: attempt.scorePercent,
      timeTakenSeconds: attempt.timeTakenSeconds,
      questions: buildResultQuestions(test, answerMap),
    };
    res.status(200).json(response);
  }),
);
