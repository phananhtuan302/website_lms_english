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
 *
 * Speaking answers (T-052–T-056): documented storage choice — recorded audio is stored
 * directly on `Answer.speakingAudioData` as a base64 `data:` URL, not a file on disk or
 * any real object-storage/CDN service. No cloud storage integration exists for this
 * product yet (nor is one required — this is a storage MECHANISM Dev controls, not a
 * third-party credential, so it needs no `INTEGRATIONS_TODO.md` entry, unlike the
 * `AIGradingProvider` itself). This keeps the whole Speaking flow working end-to-end in
 * dev with zero extra infrastructure; a real deployment could swap this for an uploaded
 * file + hosted URL without changing any other business logic, since every consumer
 * just treats it as an opaque string. `express.json()`'s body size limit is raised in
 * `index.ts` specifically to accommodate this (base64 inflates audio ~33%, and
 * `allowedResponseSeconds` is capped at 300s server-side — see `teacherTests.routes.ts`
 * — to keep worst-case payload size bounded).
 */

import { Router } from 'express';
import type {
  AttemptDetailDTO,
  AttemptResultDTO,
  AttemptResultPendingDTO,
  AttemptSummaryDTO,
  RecordTabSwitchResponse,
  SaveAnswerRequest,
  SubmitAttemptResponse,
  SubmitSpeakingAnswerRequest,
  SubmitSpeakingAnswerResponse,
} from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { fetchNestedTest } from '../lib/testQueries';
import type { VariantLayout } from '../lib/variantShuffle';
import { buildResultQuestions, buildRuntimeSections, flattenQuestionsInAuthoredOrder } from '../lib/attemptView';
import { gradeAnswer } from '../lib/grading';
import { getAIGradingProvider } from '../grading';
import { getStudentClassId } from '../lib/classScoping';

/**
 * T-092: after a student submits an attempt, they should NOT see their own score until
 * the teacher explicitly "publishes" it FOR THEIR CLASS (`TestScoreRelease`,
 * `schema.prisma` — per (testId, classId), since a test assigned to multiple classes may
 * be released for one before another). This applies ONLY to the two routes below that
 * reveal a score to the STUDENT who owns the attempt (`GET /:attemptId/result` and
 * `GET /`, `listMyAttempts`) — every teacher-facing view of the exact same underlying
 * data (`teacherSessions.routes.ts`) is completely untouched, always full detail.
 */
async function isScoreReleasedForStudent(testId: string, studentId: string): Promise<boolean> {
  const classId = await getStudentClassId(studentId);
  if (!classId) return false;
  const release = await prisma.testScoreRelease.findUnique({
    where: { testId_classId: { testId, classId } },
  });
  return release !== null;
}

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
 * given `AttemptSummaryDTO` already exists for the teacher's per-session list (T-014).
 *
 * T-092: for each `submitted` row, `scoresPublished` reflects whether a
 * `TestScoreRelease` row exists for (that attempt's testId, the calling student's own
 * classId) — if not, `correctCount`/`totalCount`/`scorePercent` are nulled out here so
 * the dashboard can't show a score the teacher hasn't published yet. Batched as ONE
 * extra query (the student's classId, looked up once, then every released `testId` for
 * it in a single `findMany`) rather than N+1 per attempt row. An `inProgress` attempt has
 * no score to withhold in the first place, so it's always `scoresPublished: true`. */
attemptsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const [attempts, studentClassId] = await Promise.all([
      prisma.attempt.findMany({
        where: { studentId: req.user!.sub },
        include: { test: { select: { id: true, title: true } }, student: true },
        orderBy: { startedAt: 'desc' },
      }),
      getStudentClassId(req.user!.sub),
    ]);

    const submittedTestIds = [...new Set(attempts.filter((a) => a.status === 'submitted').map((a) => a.testId))];
    const releases = studentClassId
      ? await prisma.testScoreRelease.findMany({
          where: { classId: studentClassId, testId: { in: submittedTestIds } },
          select: { testId: true },
        })
      : [];
    const releasedTestIds = new Set(releases.map((r) => r.testId));

    const summaries: AttemptSummaryDTO[] = attempts.map((a) => {
      const scoresPublished = a.status !== 'submitted' || releasedTestIds.has(a.testId);
      return {
        attemptId: a.id,
        sessionId: a.sessionId,
        testId: a.testId,
        testTitle: a.test.title,
        studentId: a.studentId,
        studentName: a.student.name,
        studentEmail: a.student.email,
        status: a.status,
        correctCount: scoresPublished ? a.correctCount : null,
        totalCount: scoresPublished ? a.totalCount : null,
        scorePercent: scoresPublished ? a.scorePercent : null,
        startedAt: a.startedAt.toISOString(),
        submittedAt: a.submittedAt ? a.submittedAt.toISOString() : null,
        timeTakenSeconds: a.timeTakenSeconds,
        tabSwitchCount: a.tabSwitchCount,
        scoresPublished,
      };
    });
    res.status(200).json(summaries);
  }),
);

/** `GET /api/attempts/:attemptId` — the take-test runtime payload (T-012): the
 * student's assigned variant's shuffled sections/questions/choices (answer-key-free),
 * plus whatever answers are already saved (for a mid-test refresh to restore from).
 * `sessionMode` (T-040/T-041) is looked up alongside so the runtime knows whether a
 * Listening section's Play button should be student-controlled or teacher-broadcast-only. */
attemptsRouter.get(
  '/:attemptId',
  asyncHandler(async (req, res) => {
    const attempt = await loadOwnAttempt(req.params.attemptId, req.user!.sub);
    if (!attempt) {
      res.status(404).json({ error: 'Attempt not found.' });
      return;
    }

    const [test, variant, answers, session] = await Promise.all([
      fetchNestedTest(attempt.testId),
      prisma.testVariant.findUniqueOrThrow({ where: { id: attempt.variantId } }),
      prisma.answer.findMany({ where: { attemptId: attempt.id } }),
      prisma.testSession.findUniqueOrThrow({ where: { id: attempt.sessionId }, select: { mode: true } }),
    ]);

    const sections = buildRuntimeSections(test, variant.layout as unknown as VariantLayout);

    const response: AttemptDetailDTO = {
      id: attempt.id,
      sessionId: attempt.sessionId,
      sessionMode: session.mode,
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
        speakingSubmittedAt: a.speakingSubmittedAt ? a.speakingSubmittedAt.toISOString() : null,
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

    // `essay` (T-042) shares fillBlank's free-text storage path — both are plain
    // `textAnswer`, never `selectedChoiceId`.
    if (question.type === 'fillBlank' || question.type === 'essay') {
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
 * the result is still readable via `GET /:attemptId/result` afterward either way.
 *
 * `essay` (T-042) and `speaking` (T-052–T-056) questions are NEVER auto-graded here (no
 * equivalent grading logic exists, nor should it per T-039's "no new grading logic"
 * spirit) — documented choice: `correctCount`/`totalCount`/`scorePercent` only reflect
 * auto-gradable questions, so a test mixing objective + essay/speaking content isn't
 * penalized/skewed by answers that aren't part of that tally. Every essay/speaking
 * question still gets an `Answer` row here (same "every question gets exactly one row"
 * invariant as every other type), just with `isCorrect: null` forever — essay's later
 * manual grade (`manualScore`/`manualComment`, via `PATCH .../grade` in
 * `teacherSessions.routes.ts`) and Speaking's AI grade (already computed earlier, at
 * per-question submission time — see `POST /:attemptId/questions/:questionId/speaking-answer`
 * below, T-054) are what complete those, shown alongside (not merged into) this
 * auto-graded score on the result view. */
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
    const gradableQuestions = questions.filter((q) => q.type !== 'essay' && q.type !== 'speaking');

    let correctCount = 0;
    const totalCount = gradableQuestions.length;

    const result = await prisma.$transaction(async (tx) => {
      for (const question of questions) {
        const existing = answerByQuestionId.get(question.id);
        const isCorrect =
          question.type === 'essay' || question.type === 'speaking'
            ? null
            : gradeAnswer(question, {
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
 * take-test runtime endpoint above is what serves an in-progress attempt.
 *
 * T-092: before returning the full `AttemptResultDTO`, checks whether this attempt's
 * test is score-released for the calling student's own class. If NOT, returns the
 * narrower `AttemptResultPendingDTO` instead — checked (and returned) BEFORE fetching
 * the nested test/answers at all, so it's structurally impossible for this path to leak
 * `scorePercent`/`correctCount`/`totalCount`/per-question correctness. */
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

    const scoresPublished = await isScoreReleasedForStudent(attempt.testId, req.user!.sub);
    if (!scoresPublished) {
      const test = await prisma.test.findUniqueOrThrow({
        where: { id: attempt.testId },
        select: { id: true, title: true },
      });
      const pending: AttemptResultPendingDTO = {
        attemptId: attempt.id,
        testId: test.id,
        testTitle: test.title,
        status: attempt.status,
        submittedAt: attempt.submittedAt ? attempt.submittedAt.toISOString() : null,
        scoresPublished: false,
      };
      res.status(200).json(pending);
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
        {
          selectedChoiceId: a.selectedChoiceId,
          textAnswer: a.textAnswer,
          isCorrect: a.isCorrect,
          manualScore: a.manualScore,
          manualComment: a.manualComment,
          speakingAudioData: a.speakingAudioData,
          speakingTranscript: a.speakingTranscript,
          speakingAiScore: a.speakingAiScore,
          speakingAiFeedback: a.speakingAiFeedback,
        },
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
      tabSwitchCount: attempt.tabSwitchCount,
      tabSwitchLog: attempt.tabSwitchLog,
      questions: buildResultQuestions(test, answerMap),
      scoresPublished: true,
    };
    res.status(200).json(response);
  }),
);

/** `POST /api/attempts/:attemptId/tab-switch` — global tab-switch / exit detection
 * (T-044), called by the ONE shared take-test runtime (`TakeTestPage.tsx`) whenever it
 * detects a `visibilitychange`/`blur` while the attempt is in progress, so every test
 * type gets this for free (Guiding Principle 5). Rejects (409) once the attempt is
 * submitted — same server-side re-check convention as the answer-save/submit endpoints
 * above, so a stray late event after submission can't mutate a finished attempt.
 * Best-effort from the client's perspective (a failed call never blocks the student),
 * but the server itself always durably records every successful call — `tabSwitchCount`
 * is incremented and the ISO timestamp appended to `tabSwitchLog` atomically via
 * Prisma's `increment`/`push`, so concurrent/rapid calls can't lose an event to a
 * read-modify-write race. */
attemptsRouter.post(
  '/:attemptId/tab-switch',
  asyncHandler(async (req, res) => {
    const attempt = await loadOwnAttempt(req.params.attemptId, req.user!.sub);
    if (!attempt) {
      res.status(404).json({ error: 'Attempt not found.' });
      return;
    }
    if (attempt.status !== 'inProgress') {
      res.status(409).json({ error: 'This attempt is no longer in progress.' });
      return;
    }

    const updated = await prisma.attempt.update({
      where: { id: attempt.id },
      data: {
        tabSwitchCount: { increment: 1 },
        tabSwitchLog: { push: new Date().toISOString() },
      },
      select: { tabSwitchCount: true },
    });

    const response: RecordTabSwitchResponse = { tabSwitchCount: updated.tabSwitchCount };
    res.status(200).json(response);
  }),
);

/** T-064: grace window added on top of `Question.allowedResponseSeconds` before a late
 * submission is rejected, to absorb ordinary network/processing latency between the
 * client's countdown expiring and the request actually arriving — not meant to give a
 * student meaningfully extra recording time. */
const SPEAKING_WINDOW_GRACE_SECONDS = 10;

/** `POST /api/attempts/:attemptId/questions/:questionId/speaking-window/start` — T-064.
 *
 * Server-side anchor for `Question.allowedResponseSeconds` enforcement: the client calls
 * this the moment it first shows a timed Speaking question's countdown (mirroring where
 * `TakeTestPage.tsx` latches its own client-side deadline). Idempotent and first-call-
 * wins (an `UPDATE ... WHERE speakingWindowStartedAt IS NULL`-style guard below) so a
 * student can't "restart" their time budget by re-triggering it, and reconnecting/
 * refreshing mid-question doesn't reset the clock either. Without this signal ever
 * having arrived, `speaking-answer` below refuses to grade a timed question at all —
 * closing the gap where a direct API call could previously submit a grade for an
 * arbitrarily late "recording" with no server-side timing check whatsoever. */
attemptsRouter.post(
  '/:attemptId/questions/:questionId/speaking-window/start',
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
      include: { section: true },
    });
    if (!question || question.section.testId !== attempt.testId) {
      res.status(404).json({ error: 'Question not found on this attempt.' });
      return;
    }
    if (question.type !== 'speaking') {
      res.status(400).json({ error: 'Only speaking questions have a response window to start.' });
      return;
    }

    const existing = await prisma.answer.findUnique({
      where: { attemptId_questionId: { attemptId: attempt.id, questionId: question.id } },
    });
    if (existing?.speakingSubmittedAt) {
      res.status(409).json({ error: 'This speaking answer has already been submitted; its window is closed.' });
      return;
    }

    // First-call-wins: only set the timestamp if it isn't already set, so a repeated
    // start signal (re-render, reconnect) never pushes the deadline forward.
    const startedAt = existing?.speakingWindowStartedAt ?? new Date();
    await prisma.answer.upsert({
      where: { attemptId_questionId: { attemptId: attempt.id, questionId: question.id } },
      create: { attemptId: attempt.id, questionId: question.id, speakingWindowStartedAt: startedAt },
      update: existing?.speakingWindowStartedAt ? {} : { speakingWindowStartedAt: startedAt },
    });

    res.status(200).json({ speakingWindowStartedAt: startedAt.toISOString() });
  }),
);

/** `POST /api/attempts/:attemptId/questions/:questionId/speaking-answer` — T-052–T-054.
 *
 * The student's finished recording (audio + whatever draft transcript the Web Speech
 * API produced, T-053) is submitted for exactly ONE `speaking` question at a time —
 * distinct from the whole-attempt `/submit` above, since a Speaking response is
 * finalized the moment its own timed window ends (auto-stop) or the student explicitly
 * stops recording, independent of when the rest of the test gets submitted (see
 * `TakeTestPage.tsx`'s per-question countdown, T-052).
 *
 * Graded synchronously, right here, via the currently-registered `AIGradingProvider`
 * (Mock, T-051/T-054) — not deferred to the whole-attempt submit handler — so the
 * student can see an immediate confirmation and a teacher can start reviewing/
 * overriding (T-055) before the student even finishes the rest of the test.
 *
 * Locked after the first successful submission (`speakingSubmittedAt` doubles as the
 * lock): re-submitting is rejected with 409 rather than silently overwriting the
 * original AI verdict, per T-054's "no silent overwrite" acceptance criteria — this is
 * the Speaking-specific analogue of the whole-attempt "submitted is terminal" rule
 * already enforced above for `/submit`. */
attemptsRouter.post(
  '/:attemptId/questions/:questionId/speaking-answer',
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
      include: { section: true },
    });
    if (!question || question.section.testId !== attempt.testId) {
      res.status(404).json({ error: 'Question not found on this attempt.' });
      return;
    }
    if (question.type !== 'speaking') {
      res.status(400).json({ error: 'Only speaking questions accept a speaking-answer submission.' });
      return;
    }

    const existing = await prisma.answer.findUnique({
      where: { attemptId_questionId: { attemptId: attempt.id, questionId: question.id } },
    });
    if (existing?.speakingSubmittedAt) {
      res.status(409).json({
        error: 'This speaking answer has already been submitted and graded; it cannot be re-submitted.',
      });
      return;
    }

    // T-064: enforce `allowedResponseSeconds` server-side, not just via the client
    // countdown. A question with no configured limit has nothing to enforce.
    if (question.allowedResponseSeconds != null) {
      if (!existing?.speakingWindowStartedAt) {
        res.status(409).json({
          error:
            'This question’s response window was never started. Call the speaking-window/start endpoint when the question is first shown, before submitting an answer.',
        });
        return;
      }
      const elapsedSeconds = (Date.now() - existing.speakingWindowStartedAt.getTime()) / 1000;
      const allowedWithGrace = question.allowedResponseSeconds + SPEAKING_WINDOW_GRACE_SECONDS;
      if (elapsedSeconds > allowedWithGrace) {
        res.status(409).json({
          error: `The response window for this question (${question.allowedResponseSeconds}s) has expired.`,
        });
        return;
      }
    }

    const body = req.body as Partial<SubmitSpeakingAnswerRequest>;
    if (typeof body.audioData !== 'string' || body.audioData.trim() === '') {
      res.status(400).json({ error: 'audioData is required (the recorded answer, as a base64 data: URL).' });
      return;
    }
    if (typeof body.transcript !== 'string') {
      res.status(400).json({ error: 'transcript must be a string (may be empty).' });
      return;
    }

    const provider = getAIGradingProvider();
    const { score, feedback } = await provider.grade(body.transcript, body.audioData, question.prompt);
    const submittedAt = new Date();

    await prisma.answer.upsert({
      where: { attemptId_questionId: { attemptId: attempt.id, questionId: question.id } },
      create: {
        attemptId: attempt.id,
        questionId: question.id,
        speakingAudioData: body.audioData,
        speakingTranscript: body.transcript,
        speakingAiScore: score,
        speakingAiFeedback: feedback,
        speakingSubmittedAt: submittedAt,
      },
      update: {
        speakingAudioData: body.audioData,
        speakingTranscript: body.transcript,
        speakingAiScore: score,
        speakingAiFeedback: feedback,
        speakingSubmittedAt: submittedAt,
      },
    });

    const response: SubmitSpeakingAnswerResponse = {
      questionId: question.id,
      aiScore: score,
      aiFeedback: feedback,
      submittedAt: submittedAt.toISOString(),
    };
    res.status(200).json(response);
  }),
);
