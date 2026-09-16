/**
 * Teacher-side QR-join session management (T-010): start a session for one of the
 * teacher's own tests (generating a join token + QR code + manual fallback code), list
 * a test's sessions, and view/close a specific session.
 *
 * Join URL: `${CLIENT_ORIGIN}/join/<token>`. Documented choice — there is no deployed
 * host/domain yet (that's T-058, still a placeholder per TECH_STACK.md's deployment
 * note), so this reuses the same `CLIENT_ORIGIN` env var the server already trusts for
 * CORS as the "where the app lives" answer. It defaults to the Vite dev server
 * (`http://localhost:5173`) so the QR code is actually scannable/testable in local dev
 * (an absolute URL, not a bare relative path, since a phone camera has no "current
 * origin" to resolve a relative path against). Swap `CLIENT_ORIGIN` for the real
 * production origin once one exists — no code change needed here.
 */

import { Router } from 'express';
import QRCode from 'qrcode';
import type {
  AttemptResultDTO,
  AttemptSummaryDTO,
  CreateSessionResponse,
  GradeEssayAnswerRequest,
  TestSessionDTO,
} from '@platform/shared';
import { SPEAKING_SCORE_SCALE } from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { requireOwnedTest } from '../lib/ownedTest';
import { isAdminOrOwner } from '../lib/authz';
import { generateJoinToken, generateManualCode } from '../lib/sessionCodes';
import { loadEnv } from '../config/env';
import { fetchNestedTest } from '../lib/testQueries';
import { buildResultQuestions } from '../lib/attemptView';
import { markSessionClosed } from '../realtime/sessionRealtime';

export const teacherSessionsRouter = Router();

// T-071: `admin` also allowed — this router hosts session/attempt views reachable from
// the same test editor page a teacher uses (`TeacherTestEditorPage.tsx`), which admin
// now reuses as-is (Assumption A12) to manage ANY teacher's test. Every ownership check
// below already goes through `requireOwnedTest`/`isAdminOrOwner`, so admin transparently
// sees/manages sessions and attempts for a test it doesn't itself own.
teacherSessionsRouter.use(requireAuth, requireRole('teacher', 'admin'));

function buildJoinUrl(token: string): string {
  const { CLIENT_ORIGIN } = loadEnv();
  return `${CLIENT_ORIGIN.replace(/\/$/, '')}/join/${token}`;
}

function toSessionDTO(session: {
  id: string;
  testId: string;
  manualCode: string;
  status: string;
  mode: string;
  createdAt: Date;
  closedAt: Date | null;
  joinToken: string;
}): TestSessionDTO {
  return {
    id: session.id,
    testId: session.testId,
    manualCode: session.manualCode,
    status: session.status as TestSessionDTO['status'],
    mode: session.mode as TestSessionDTO['mode'],
    createdAt: session.createdAt.toISOString(),
    closedAt: session.closedAt ? session.closedAt.toISOString() : null,
    joinUrl: buildJoinUrl(session.joinToken),
  };
}

/**
 * POST /api/teacher/tests/:testId/sessions
 *
 * Starts a new session. Documented choice (T-010 "your call, document it"): starting a
 * new session for a test automatically closes any other still-`active` session(s) for
 * that SAME test in the same transaction that creates the new one — so the old
 * session's token stops working for new joins the instant the new one exists, without
 * the teacher having to remember to close it manually. A session can also be closed
 * explicitly via `POST /api/teacher/sessions/:sessionId/close`.
 *
 * Either path also calls `markSessionClosed` (T-016) for every session that transitions
 * to `closed` here, so that session's live-monitor room immediately stops relaying
 * `student:progress` updates — see `realtime/sessionRealtime.ts`'s doc comment on that
 * function for why closing a session must also be a realtime-layer event, not just a DB
 * status flip.
 */
teacherSessionsRouter.post(
  '/tests/:testId/sessions',
  asyncHandler(async (req, res) => {
    const test = await requireOwnedTest(req.params.testId, req.user!, res);
    if (!test) return;

    const joinToken = generateJoinToken();
    const manualCode = generateManualCode();

    // Captured BEFORE the transaction closes them, since `updateMany` only returns a
    // count, not the affected rows — needed after commit to notify the realtime layer
    // which session ids just became closed.
    const previouslyActive = await prisma.testSession.findMany({
      where: { testId: test.id, status: 'active' },
      select: { id: true },
    });

    const session = await prisma.$transaction(async (tx) => {
      await tx.testSession.updateMany({
        where: { testId: test.id, status: 'active' },
        data: { status: 'closed', closedAt: new Date() },
      });
      return tx.testSession.create({
        data: { testId: test.id, joinToken, manualCode, status: 'active' },
      });
    });

    for (const closed of previouslyActive) {
      markSessionClosed(closed.id);
    }

    const joinUrl = buildJoinUrl(session.joinToken);
    const qrCodeDataUrl = await QRCode.toDataURL(joinUrl);

    const response: CreateSessionResponse = {
      ...toSessionDTO(session),
      joinToken: session.joinToken,
      qrCodeDataUrl,
    };
    res.status(201).json(response);
  }),
);

/** GET /api/teacher/tests/:testId/sessions — session history for a test, newest first. */
teacherSessionsRouter.get(
  '/tests/:testId/sessions',
  asyncHandler(async (req, res) => {
    const test = await requireOwnedTest(req.params.testId, req.user!, res);
    if (!test) return;

    const sessions = await prisma.testSession.findMany({
      where: { testId: test.id },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json(sessions.map(toSessionDTO));
  }),
);

async function loadOwnedSession(sessionId: string, user: { sub: string; role: string }) {
  const session = await prisma.testSession.findUnique({
    where: { id: sessionId },
    include: { test: true },
  });
  if (!session || !isAdminOrOwner(user, session.test.teacherId)) {
    return null;
  }
  return session;
}

/** GET /api/teacher/sessions/:sessionId — single session detail, regenerating the QR
 * code + including the raw token (e.g. to re-display a still-active session's QR after
 * navigating away and back, without needing to start a new one). */
teacherSessionsRouter.get(
  '/sessions/:sessionId',
  asyncHandler(async (req, res) => {
    const session = await loadOwnedSession(req.params.sessionId, req.user!);
    if (!session) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }

    const joinUrl = buildJoinUrl(session.joinToken);
    const qrCodeDataUrl = await QRCode.toDataURL(joinUrl);

    const response: CreateSessionResponse = {
      ...toSessionDTO(session),
      joinToken: session.joinToken,
      qrCodeDataUrl,
    };
    res.status(200).json(response);
  }),
);

/** POST /api/teacher/sessions/:sessionId/close — explicit close (see module doc comment
 * for the other way a session stops accepting joins). Idempotent: closing an already-closed
 * session just confirms the current state rather than erroring. */
teacherSessionsRouter.post(
  '/sessions/:sessionId/close',
  asyncHandler(async (req, res) => {
    const session = await loadOwnedSession(req.params.sessionId, req.user!);
    if (!session) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }

    const updated =
      session.status === 'active'
        ? await prisma.testSession.update({
            where: { id: session.id },
            data: { status: 'closed', closedAt: new Date() },
          })
        : session;

    if (session.status === 'active') {
      markSessionClosed(session.id);
    }

    res.status(200).json(toSessionDTO(updated));
  }),
);

// --- Attempts (T-014) ----------------------------------------------------------------
// Teacher-facing views of who attempted a session and how they scored. Grading itself
// (T-013) happens in `attempts.routes.ts`'s student-facing submit endpoint — nothing
// here writes to an attempt, it only reads.

/** GET /api/teacher/sessions/:sessionId/attempts — every student who joined this
 * session, with their score (`null` fields for an attempt still `inProgress`, since
 * grading only happens at submit). Ordered by join time (oldest first), matching the
 * order variants were round-robin-assigned in. */
teacherSessionsRouter.get(
  '/sessions/:sessionId/attempts',
  asyncHandler(async (req, res) => {
    const session = await loadOwnedSession(req.params.sessionId, req.user!);
    if (!session) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }

    const attempts = await prisma.attempt.findMany({
      where: { sessionId: session.id },
      include: { student: true, test: { select: { id: true, title: true } } },
      orderBy: { startedAt: 'asc' },
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
      tabSwitchCount: a.tabSwitchCount,
      // T-092: this is a TEACHER-facing view — always full detail, regardless of the
      // per-(test,class) score-release gate. Only the student-facing `listMyAttempts`
      // (`attempts.routes.ts`) ever computes/nulls this out.
      scoresPublished: true,
    }));
    res.status(200).json(summaries);
  }),
);

/** GET /api/teacher/attempts/:attemptId — one attempt's full per-question breakdown,
 * for a teacher to drill in from the session's attempt list. Ownership is checked via
 * the attempt's test, not the session directly, since that's the same authorization
 * boundary every other teacher route uses (`requireOwnedTest`-style: a different
 * teacher's attempt id looks like it doesn't exist, 404, not 403). */
teacherSessionsRouter.get(
  '/attempts/:attemptId',
  asyncHandler(async (req, res) => {
    const attempt = await prisma.attempt.findUnique({
      where: { id: req.params.attemptId },
      include: { student: true, test: { select: { id: true, title: true, teacherId: true } } },
    });
    if (!attempt || !isAdminOrOwner(req.user!, attempt.test.teacherId)) {
      res.status(404).json({ error: 'Attempt not found.' });
      return;
    }

    const [test, answers] = await Promise.all([
      fetchNestedTest(attempt.testId),
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
      testId: attempt.test.id,
      testTitle: attempt.test.title,
      studentId: attempt.studentId,
      studentName: attempt.student.name,
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
      // T-092: teacher-facing — always full detail, regardless of the per-(test,class)
      // score-release gate (see this file's module doc comment / `attempts.routes.ts`).
      scoresPublished: true,
    };
    res.status(200).json(response);
  }),
);

/** PATCH /api/teacher/attempts/:attemptId/answers/:questionId/grade — manual essay
 * grading (T-042) AND Speaking override (T-055) — both reuse the exact same
 * `manualScore`/`manualComment` columns and the same "teacher value wins once present"
 * display rule (see `AttemptResultQuestionDTO`'s doc comment in `@platform/shared`), so
 * one endpoint serves both question types. Ownership is checked the same way as the
 * attempt-detail GET above (via the attempt's test, 404 if not this teacher's). Only
 * valid for an `essay`/`speaking` question that has actually been submitted (an
 * in-progress attempt has nothing final to grade yet, and an ungraded Speaking answer —
 * one the student never recorded — has no AI verdict to override either); `score` must
 * be within `[0, essayMaxScore]` for essay or `[0, SPEAKING_SCORE_SCALE]` for speaking. */
teacherSessionsRouter.patch(
  '/attempts/:attemptId/answers/:questionId/grade',
  asyncHandler(async (req, res) => {
    const attempt = await prisma.attempt.findUnique({
      where: { id: req.params.attemptId },
      include: { test: { select: { teacherId: true } } },
    });
    if (!attempt || !isAdminOrOwner(req.user!, attempt.test.teacherId)) {
      res.status(404).json({ error: 'Attempt not found.' });
      return;
    }
    if (attempt.status !== 'submitted') {
      res.status(409).json({ error: 'This attempt has not been submitted yet — nothing to grade.' });
      return;
    }

    const question = await prisma.question.findUnique({ where: { id: req.params.questionId } });
    if (!question) {
      res.status(404).json({ error: 'Question not found.' });
      return;
    }
    // Confirm this question actually belongs to the attempt's test (defense in depth —
    // a mismatched id here should never silently grade the wrong question).
    const section = await prisma.section.findUnique({ where: { id: question.sectionId } });
    if (!section || section.testId !== attempt.testId) {
      res.status(404).json({ error: 'Question not found on this attempt.' });
      return;
    }
    if (question.type !== 'essay' && question.type !== 'speaking') {
      res.status(400).json({ error: 'Only essay or speaking questions can be manually graded.' });
      return;
    }

    const existingAnswer = await prisma.answer.findUnique({
      where: { attemptId_questionId: { attemptId: attempt.id, questionId: question.id } },
    });
    if (question.type === 'speaking' && !existingAnswer?.speakingSubmittedAt) {
      res
        .status(409)
        .json({ error: 'This speaking answer has not been submitted by the student yet — nothing to override.' });
      return;
    }

    const body = req.body as Partial<GradeEssayAnswerRequest>;
    const maxScore = question.type === 'essay' ? (question.essayMaxScore ?? 0) : SPEAKING_SCORE_SCALE;
    if (typeof body.score !== 'number' || Number.isNaN(body.score) || body.score < 0 || body.score > maxScore) {
      res.status(400).json({ error: `score must be a number between 0 and ${maxScore}.` });
      return;
    }
    if (body.comment !== undefined && body.comment !== null && typeof body.comment !== 'string') {
      res.status(400).json({ error: 'comment must be a string or null.' });
      return;
    }

    await prisma.answer.upsert({
      where: { attemptId_questionId: { attemptId: attempt.id, questionId: question.id } },
      create: {
        attemptId: attempt.id,
        questionId: question.id,
        manualScore: body.score,
        manualComment: body.comment ?? null,
      },
      update: { manualScore: body.score, manualComment: body.comment ?? null },
    });

    res.status(200).json({ questionId: question.id, manualScore: body.score, manualComment: body.comment ?? null });
  }),
);
