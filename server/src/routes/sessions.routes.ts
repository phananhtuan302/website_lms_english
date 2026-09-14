/**
 * Public (no auth) session-join lookup (T-010's half of the join flow; the rest —
 * requiring login, attaching the student, assigning a variant — is T-011's job and
 * intentionally NOT built here).
 *
 * This exists so a scanned QR code / typed manual code can be validated before the
 * student is asked to log in, and so this task's own acceptance criteria ("starting a
 * second session invalidates the first for joining") is actually observable over HTTP
 * instead of only inspectable in the DB.
 */

import { Router } from 'express';
import type { JoinTokenCheckResponse } from '@platform/shared';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../lib/asyncHandler';

export const sessionsRouter = Router();

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
    const session = await prisma.testSession.findUnique({
      where: { joinToken: req.params.token },
      include: { test: { select: { id: true, title: true } } },
    });

    if (!session) {
      res.status(404).json({ error: 'Invalid join code.' });
      return;
    }

    if (session.status !== 'active') {
      res.status(410).json({ error: 'This session is no longer accepting new joins.' });
      return;
    }

    const response: JoinTokenCheckResponse = {
      valid: true,
      testId: session.test.id,
      testTitle: session.test.title,
      sessionId: session.id,
    };
    res.status(200).json(response);
  }),
);
