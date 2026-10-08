/**
 * Session-join endpoints. The public (no-auth) token check was built in T-010, for a
 * scanned QR code / typed manual code to be validated before the student is asked to
 * log in. T-011 adds the actual join: requiring a logged-in `student`, attaching them
 * to the session as an `Attempt`, and auto-assigning one of the test's `TestVariant`s.
 *
 * 2026-10 additions (`TestSession.startAt`/`allowGuests`):
 * - A session can now have a scheduled start — joining before it is accepted (so a
 *   student can land on a waiting screen ahead of time) but does NOT create an
 *   `Attempt` yet, so `Attempt.startedAt` (which drives both the countdown deadline and
 *   `timeTakenSeconds`) can never predate the real start. `JoinSessionResponse` is a
 *   discriminated union (`joined: true | false`) for exactly this reason.
 * - A session can allow GUEST joins — no account, just a display name. A guest join
 *   creates a throwaway `User` (`role: student`, `isGuest: true`, `classId: null`) and
 *   issues it a real JWT, so every existing student-only attempt/take-test endpoint
 *   keeps working completely unchanged. Every class-scoped gradebook/leaderboard/report
 *   query already filters by `classId`, which a guest never has, so a guest's result
 *   naturally never pollutes class-wide stats — it only ever shows up in THIS session's
 *   own per-session attempts list (`teacherSessions.routes.ts`'s
 *   `GET /sessions/:sessionId/attempts`, filtered by `sessionId` only).
 * - A manual code (the human-typeable fallback already shown next to the QR image) can
 *   now actually be redeemed — `GET/POST /join-by-code` mirror the token endpoints.
 */

import { randomBytes } from 'crypto';
import { Router, type Response } from 'express';
import type {
  JoinAsGuestRequest,
  JoinAsGuestResponse,
  JoinByCodeRequest,
  JoinSessionResponse,
  JoinTokenCheckResponse,
} from '@platform/shared';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../lib/asyncHandler';
import { requireAuth, requireRole } from '../middleware/auth';
import { findOrCreateAttempt } from '../lib/attemptAssignment';
import { getStudentClassAndPeriod } from '../lib/classScoping';
import { checkAttemptWindow, findTestClassSchedule } from '../lib/testClassSchedule';
import { autoCloseExpiredSessionsForTest } from '../lib/sessionExpiry';
import { hashPassword } from '../lib/password';
import { signToken } from '../lib/jwt';
import { toAuthUser } from './auth.routes';

export const sessionsRouter = Router();

type LoadedSession = NonNullable<Awaited<ReturnType<typeof fetchSessionByToken>>>;

async function fetchSessionByToken(token: string) {
  const session = await prisma.testSession.findUnique({
    where: { joinToken: token },
    include: { test: { select: { id: true, title: true, testType: true } } },
  });
  // 2026-10: lazily flip to `closed` if `endAt` has passed, THEN re-read — every caller
  // (the public check, the real join, both token and code variants) funnels through this
  // one function, so `rejectIfNotJoinable`'s existing `status !== 'active'` check is all
  // that's needed to reject an expired session; no separate `endAt` branch there.
  if (!session) return session;
  await autoCloseExpiredSessionsForTest(session.testId);
  return prisma.testSession.findUnique({
    where: { joinToken: token },
    include: { test: { select: { id: true, title: true, testType: true } } },
  });
}

async function fetchSessionByCode(code: string) {
  // No DB-level uniqueness on `manualCode` (see `lib/sessionCodes.ts`'s doc comment — 6
  // chars from a 32-char alphabet is ample entropy for "no two ACTIVE sessions collide
  // in practice", not a hard guarantee) — prefer the most recently created ACTIVE match,
  // which is what the typing student almost certainly means.
  const candidate = await prisma.testSession.findFirst({
    where: { manualCode: code.trim().toUpperCase(), status: 'active' },
    orderBy: { createdAt: 'desc' },
    select: { testId: true },
  });
  if (candidate) await autoCloseExpiredSessionsForTest(candidate.testId);
  return prisma.testSession.findFirst({
    where: { manualCode: code.trim().toUpperCase(), status: 'active' },
    orderBy: { createdAt: 'desc' },
    include: { test: { select: { id: true, title: true, testType: true } } },
  });
}

/** Writes the appropriate 404/410 error response itself and returns `null` on failure —
 * shared by every lookup path (token, code) and both the public check and the real join,
 * so "invalid" vs. "no longer active" are reported identically everywhere. */
function rejectIfNotJoinable(session: LoadedSession | null, res: Response): session is LoadedSession {
  if (!session) {
    res.status(404).json({ error: 'Invalid join code.' });
    return false;
  }
  if (session.status !== 'active') {
    res.status(410).json({ error: 'This session is no longer accepting new joins.' });
    return false;
  }
  return true;
}

function toTokenCheckResponse(session: LoadedSession): JoinTokenCheckResponse {
  return {
    valid: true,
    testId: session.test.id,
    testTitle: session.test.title,
    sessionId: session.id,
    startAt: session.startAt ? session.startAt.toISOString() : null,
    allowGuests: session.allowGuests,
  };
}

/**
 * The actual join (T-011, extended 2026-10 with the `startAt` wait gate): given an
 * already-validated, active `session` and a `studentId` (a real student's or a guest's —
 * both are just `User` rows), performs the T-076/T-099 class-assignment check, the T-093
 * schedule-window check, and the new `startAt` wait gate, then creates (or reuses) the
 * `Attempt`. Writes its own error response and returns `null` on any rejection, exactly
 * like `rejectIfNotJoinable` above — every join entry point (token, code; student, guest)
 * funnels through this one function so the rules can never drift apart between them.
 *
 * `isGuest`: a guest skips the class-assignment/schedule-window checks entirely (they
 * have no class to check against — `allowGuests` on the session IS their authorization),
 * but is STILL subject to the `startAt` wait gate, since that applies to the session
 * itself, not to who's joining it.
 */
async function performJoin(
  session: LoadedSession,
  studentId: string,
  isGuest: boolean,
  res: Response,
): Promise<JoinSessionResponse | null> {
  if (!isGuest) {
    const scp = await getStudentClassAndPeriod(studentId);

    if (session.test.testType !== 'vocabularyCheck') {
      const assignment =
        scp && scp.periodId != null
          ? await prisma.testClassPeriodAssignment.findUnique({
              where: {
                testId_classId_periodId: {
                  testId: session.test.id,
                  classId: scp.classId,
                  periodId: scp.periodId,
                },
              },
            })
          : null;
      if (!assignment) {
        res.status(403).json({
          error: 'This session is only open to students in the class this test is assigned to.',
        });
        return null;
      }
    }

    const alreadyJoined = await prisma.attempt.findUnique({
      where: { sessionId_studentId: { sessionId: session.id, studentId } },
    });
    if (!alreadyJoined && scp && scp.periodId != null) {
      const schedule = await findTestClassSchedule(session.test.id, scp.classId, scp.periodId);
      const windowError = checkAttemptWindow(schedule);
      if (windowError) {
        res.status(403).json({ error: windowError });
        return null;
      }
    }
  }

  // 2026-10: the session's own scheduled start — checked for EVERYONE (guest or not),
  // and only skipped once an `Attempt` already exists (resuming/continuing after the
  // start has passed is never re-gated, same "exempt once already joined" convention as
  // the class-window check above).
  const alreadyStarted = await prisma.attempt.findUnique({
    where: { sessionId_studentId: { sessionId: session.id, studentId } },
  });
  if (!alreadyStarted && session.startAt && session.startAt.getTime() > Date.now()) {
    return { joined: false, startAt: session.startAt.toISOString() };
  }

  const attempt = await findOrCreateAttempt(session, studentId);
  if (attempt === 'no-variants') {
    res.status(400).json({
      error: 'This test has no variants yet. Ask your teacher to generate variants before starting the session.',
    });
    return null;
  }

  const variant = await prisma.testVariant.findUniqueOrThrow({
    where: { id: attempt.variantId },
    select: { code: true },
  });

  return {
    joined: true,
    attemptId: attempt.id,
    sessionId: session.id,
    testId: session.test.id,
    testTitle: session.test.title,
    variantCode: variant.code,
    status: attempt.status,
  };
}

/** Creates a throwaway guest identity (`role: student`, `isGuest: true`, `classId:
 * null`) for a no-account QR-session join and signs it a normal JWT — every existing
 * student-only endpoint (attempts, take-test, grading) then treats it exactly like a
 * real student account, which is the whole point (no parallel "guest attempt" system to
 * maintain). The email/password are both random and never meant to be used again — a
 * guest's ONE way back in is re-scanning the same still-active session, which creates a
 * NEW guest identity (there is no "log back in as the same guest" concept, by design:
 * nothing about a guest is meant to persist beyond one session). */
async function createGuestUser(name: string) {
  const randomSuffix = randomBytes(12).toString('hex');
  const passwordHash = await hashPassword(randomBytes(24).toString('hex'));
  return prisma.user.create({
    data: {
      email: `guest-${randomSuffix}@guest.local`,
      passwordHash,
      role: 'student',
      name: name.trim().slice(0, 100),
      classId: null,
      isGuest: true,
    },
  });
}

/**
 * GET /api/sessions/join/:token — unchanged public pre-login check (T-010), now also
 * reporting `startAt`/`allowGuests` so the join page can show a waiting notice and/or a
 * "join as guest" option before the visitor logs in.
 */
sessionsRouter.get(
  '/join/:token',
  asyncHandler(async (req, res) => {
    const session = await fetchSessionByToken(req.params.token);
    if (!rejectIfNotJoinable(session, res)) return;
    res.status(200).json(toTokenCheckResponse(session));
  }),
);

/** GET /api/sessions/join-by-code/:code — the manual-fallback-code equivalent of the
 * token check above (2026-10 — the code was already generated/shown next to the QR
 * image, but nothing could redeem it until now). */
sessionsRouter.get(
  '/join-by-code/:code',
  asyncHandler(async (req, res) => {
    const session = await fetchSessionByCode(req.params.code);
    if (!rejectIfNotJoinable(session, res)) return;
    res.status(200).json(toTokenCheckResponse(session));
  }),
);

/** A guest's own JWT (`role: 'student'`, same as a real one — see `createGuestUser`'s
 * doc comment) authenticates through these SAME endpoints for every retry after their
 * initial `/guest` call (exactly what the client does — see `JoinPage.tsx`'s
 * `attemptJoin`, which always calls the plain token/code join, whether the caller just
 * logged in for real or just adopted a guest session). `performJoin` needs to know
 * which one it's dealing with (a guest skips the class/schedule checks entirely), so
 * every route below looks this up rather than assuming the caller is a real student. */
async function isGuestCaller(userId: string): Promise<boolean> {
  const caller = await prisma.user.findUnique({ where: { id: userId }, select: { isGuest: true } });
  return caller?.isGuest ?? false;
}

/**
 * POST /api/sessions/join/:token — the actual join (T-011), requires a logged-in
 * `student` (a real one, or a guest identity from `POST .../guest` below — see
 * `isGuestCaller`'s doc comment). See `performJoin`'s doc comment for the full rule set
 * (class assignment, schedule window, 2026-10 `startAt` wait gate).
 */
sessionsRouter.post(
  '/join/:token',
  requireAuth,
  requireRole('student'),
  asyncHandler(async (req, res) => {
    const session = await fetchSessionByToken(req.params.token);
    if (!rejectIfNotJoinable(session, res)) return;
    const result = await performJoin(session, req.user!.sub, await isGuestCaller(req.user!.sub), res);
    if (result === null) return;
    res.status(200).json(result);
  }),
);

/** POST /api/sessions/join-by-code — manual-code equivalent of the token join above
 * (2026-10), same logged-in-`student` requirement. Body: `{ code }`. */
sessionsRouter.post(
  '/join-by-code',
  requireAuth,
  requireRole('student'),
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<JoinByCodeRequest>;
    if (typeof body.code !== 'string' || body.code.trim() === '') {
      res.status(400).json({ error: 'code is required.' });
      return;
    }
    const session = await fetchSessionByCode(body.code);
    if (!rejectIfNotJoinable(session, res)) return;
    const result = await performJoin(session, req.user!.sub, await isGuestCaller(req.user!.sub), res);
    if (result === null) return;
    res.status(200).json(result);
  }),
);

/** POST /api/sessions/join/:token/guest — no-account join (2026-10,
 * `TestSession.allowGuests`). Public (no `requireAuth`) — body: `{ name }`. Creates a
 * throwaway guest identity and signs it a JWT (see `createGuestUser`'s doc comment),
 * then runs the exact same `performJoin` rules as a real student (minus the
 * class/schedule checks, which don't apply to a guest). */
sessionsRouter.post(
  '/join/:token/guest',
  asyncHandler(async (req, res) => {
    const session = await fetchSessionByToken(req.params.token);
    if (!rejectIfNotJoinable(session, res)) return;
    if (!session.allowGuests) {
      res.status(403).json({ error: 'This session does not allow guests — please log in or create an account.' });
      return;
    }
    const body = req.body as Partial<JoinAsGuestRequest>;
    if (typeof body.name !== 'string' || body.name.trim() === '') {
      res.status(400).json({ error: 'name is required.' });
      return;
    }

    const guest = await createGuestUser(body.name);
    const join = await performJoin(session, guest.id, true, res);
    if (join === null) return;

    const response: JoinAsGuestResponse = {
      token: signToken(toAuthUser({ ...guest, class: null })),
      user: toAuthUser({ ...guest, class: null }),
      join,
    };
    res.status(200).json(response);
  }),
);

/** POST /api/sessions/join-by-code/guest — manual-code equivalent of the guest join
 * above (2026-10). Public — body: `{ code, name }`. */
sessionsRouter.post(
  '/join-by-code/guest',
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<JoinByCodeRequest & JoinAsGuestRequest>;
    if (typeof body.code !== 'string' || body.code.trim() === '') {
      res.status(400).json({ error: 'code is required.' });
      return;
    }
    const session = await fetchSessionByCode(body.code);
    if (!rejectIfNotJoinable(session, res)) return;
    if (!session.allowGuests) {
      res.status(403).json({ error: 'This session does not allow guests — please log in or create an account.' });
      return;
    }
    if (typeof body.name !== 'string' || body.name.trim() === '') {
      res.status(400).json({ error: 'name is required.' });
      return;
    }

    const guest = await createGuestUser(body.name);
    const join = await performJoin(session, guest.id, true, res);
    if (join === null) return;

    const response: JoinAsGuestResponse = {
      token: signToken(toAuthUser({ ...guest, class: null })),
      user: toAuthUser({ ...guest, class: null }),
      join,
    };
    res.status(200).json(response);
  }),
);
