/**
 * Session-join endpoints. The public (no-auth) token check was built in T-010, for a
 * scanned QR code / typed manual code to be validated before the student is asked to
 * log in. T-011 adds the actual join: requiring a logged-in `student`, attaching them
 * to the session as an `Attempt`, and auto-assigning one of the test's `TestVariant`s.
 */

import { Router } from 'express';
import { Prisma } from '@prisma/client';
import type { JoinSessionResponse, JoinTokenCheckResponse } from '@platform/shared';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../lib/asyncHandler';
import { requireAuth, requireRole } from '../middleware/auth';

export const sessionsRouter = Router();

/** Loads an active, joinable session by token, or writes the appropriate error
 * response itself and returns `null` — shared by the public check and the real join
 * below so "invalid" vs. "no longer active" are reported identically by both. */
async function loadJoinableSession(token: string, res: import('express').Response) {
  const session = await prisma.testSession.findUnique({
    where: { joinToken: token },
    include: { test: { select: { id: true, title: true } } },
  });

  if (!session) {
    res.status(404).json({ error: 'Invalid join code.' });
    return null;
  }
  if (session.status !== 'active') {
    res.status(410).json({ error: 'This session is no longer accepting new joins.' });
    return null;
  }
  return session;
}

/**
 * Auto-assigns a `TestVariant` and creates the student's `Attempt` for this session, or
 * returns the student's existing attempt if they've already joined (idempotent — see
 * `Attempt.@@unique([sessionId, studentId])`'s doc comment in schema.prisma).
 *
 * Documented choice (T-011/A7 "your call, document it — round-robin or random"):
 * ROUND-ROBIN by join order. The variant index is `(number of attempts already in this
 * session) % (number of variants)`, so the 1st/2nd/3rd/... students to join cycle
 * through variants 0,1,2,...,0,1,2,... in sequence. Chosen over pure random because it
 * guarantees an even spread across variants regardless of class size (random can by
 * chance cluster many students onto the same variant), which better serves the actual
 * goal ("neighboring students get different question/answer order").
 */
async function findOrCreateAttempt(session: { id: string; testId: string }, studentId: string) {
  const existing = await prisma.attempt.findUnique({
    where: { sessionId_studentId: { sessionId: session.id, studentId } },
  });
  if (existing) return existing;

  const variants = await prisma.testVariant.findMany({
    where: { testId: session.testId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, code: true },
  });
  if (variants.length === 0) {
    return 'no-variants' as const;
  }

  const attemptCount = await prisma.attempt.count({ where: { sessionId: session.id } });
  const variant = variants[attemptCount % variants.length];

  try {
    return await prisma.attempt.create({
      data: {
        sessionId: session.id,
        testId: session.testId,
        studentId,
        variantId: variant.id,
        status: 'inProgress',
      },
    });
  } catch (err) {
    // Two near-simultaneous join requests for the same student (e.g. a duplicate
    // request while navigating) can both pass the `existing` check above and then race
    // on the `@@unique([sessionId, studentId])` constraint — the loser gets a P2002
    // here. Rather than surface that as an error, re-fetch: the winner's row is exactly
    // what this request wanted to end up returning anyway.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const race = await prisma.attempt.findUnique({
        where: { sessionId_studentId: { sessionId: session.id, studentId } },
      });
      if (race) return race;
    }
    throw err;
  }
}

/**
 * GET /api/sessions/join/:token
 *
 * - Unknown token -> 404 (never existed, or belongs to some other join mechanism).
 * - Known but `closed` token -> 410 Gone (it did exist, but no longer accepts joins —
 *   either explicitly closed or superseded by a newer session for the same test).
 * - Known and `active` -> 200 with enough info for a join page to say "you're about to
 *   join <test title>" before the student logs in.
 */
sessionsRouter.get(
  '/join/:token',
  asyncHandler(async (req, res) => {
    const session = await loadJoinableSession(req.params.token, res);
    if (!session) return;

    const response: JoinTokenCheckResponse = {
      valid: true,
      testId: session.test.id,
      testTitle: session.test.title,
      sessionId: session.id,
    };
    res.status(200).json(response);
  }),
);

/**
 * POST /api/sessions/join/:token
 *
 * The actual join (T-011) — requires a logged-in `student`. A `teacher` token hitting
 * this gets a clean 403 from `requireRole('student')` itself (this is a student-only
 * flow, per T-011's acceptance criteria), never a crash or a silently-created attempt.
 *
 * Same 404/410 handling as the public check above for an invalid/expired token. On
 * success, creates (or reuses, if already joined) the student's `Attempt` for this
 * session and auto-assigns a variant — see `findOrCreateAttempt`'s doc comment for the
 * round-robin assignment rule.
 */
sessionsRouter.post(
  '/join/:token',
  requireAuth,
  requireRole('student'),
  asyncHandler(async (req, res) => {
    const session = await loadJoinableSession(req.params.token, res);
    if (!session) return;

    const attempt = await findOrCreateAttempt(session, req.user!.sub);
    if (attempt === 'no-variants') {
      res.status(400).json({
        error:
          'This test has no variants yet. Ask your teacher to generate variants before starting the session.',
      });
      return;
    }

    const variant = await prisma.testVariant.findUniqueOrThrow({
      where: { id: attempt.variantId },
      select: { code: true },
    });

    const response: JoinSessionResponse = {
      attemptId: attempt.id,
      sessionId: session.id,
      testId: session.test.id,
      testTitle: session.test.title,
      variantCode: variant.code,
      status: attempt.status,
    };
    res.status(200).json(response);
  }),
);
