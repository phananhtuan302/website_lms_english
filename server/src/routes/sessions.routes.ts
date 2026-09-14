/**
 * Session-join endpoints. The public (no-auth) token check was built in T-010, for a
 * scanned QR code / typed manual code to be validated before the student is asked to
 * log in. T-011 adds the actual join: requiring a logged-in `student`, attaching them
 * to the session as an `Attempt`, and auto-assigning one of the test's `TestVariant`s.
 */

import { Router } from 'express';
import type { JoinSessionResponse, JoinTokenCheckResponse } from '@platform/shared';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../lib/asyncHandler';
import { requireAuth, requireRole } from '../middleware/auth';
import { findOrCreateAttempt } from '../lib/attemptAssignment';

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
