/**
 * Student-facing home self-practice (T-040): lets a student take ANY test standalone,
 * outside a teacher-run QR/live session, so a Listening section behaves per T-040
 * (student's own Play button, optionally capped by `Section.maxPlayCount`) rather than
 * T-041 (teacher-broadcast-only during a live session). See `SessionMode`'s doc comment
 * in `schema.prisma` for the full reasoning.
 *
 * Documented choice: ONE shared `selfPractice` `TestSession` per `Test`, found-or-created
 * lazily on the first practice request for that test (by ANY student) and reused by
 * every subsequent student/request — same "global, not per-teacher/per-student" pattern
 * already used for `Unit`/`AcademicPeriod`/flashcard-set visibility elsewhere in this
 * codebase. It is never closed. Every student who practices the same test still gets
 * their OWN `Attempt` within it (`Attempt.@@unique([sessionId, studentId])`), assigned a
 * variant via the exact same round-robin rule as a live join
 * (`lib/attemptAssignment.ts`'s `findOrCreateAttempt`) — self-practice is the same
 * test-taking engine, not a parallel system (Guiding Principle 6). Per that same
 * uniqueness constraint, a student can only self-practice a given test ONCE per this
 * session row (re-opening `POST /:testId/practice` after already having a self-practice
 * attempt just returns the existing one, same idempotent-join behavior as T-011's live
 * join) — retaking self-practice from scratch is a possible future enhancement, not
 * required by T-040's acceptance criteria.
 */

import { Router } from 'express';
import type { JoinSessionResponse, PracticeTestSummaryDTO } from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { generateJoinToken, generateManualCode } from '../lib/sessionCodes';
import { findOrCreateAttempt } from '../lib/attemptAssignment';

export const practiceRouter = Router();

practiceRouter.use(requireAuth, requireRole('student'));

/** GET /api/tests — every test, for the student self-practice picker (T-040). Same
 * "every X visible to every student, no class/enrollment concept" convention as
 * `studentFlashcards.routes.ts`'s set listing. */
practiceRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const tests = await prisma.test.findMany({
      select: { id: true, title: true },
      orderBy: { title: 'asc' },
    });
    const response: PracticeTestSummaryDTO[] = tests;
    res.status(200).json(response);
  }),
);

/** Finds this test's shared self-practice session, creating it if this is the first
 * ever practice request for it. A `joinToken`/`manualCode` are generated even though
 * self-practice is never reached via QR/manual code — `TestSession.joinToken` is a
 * required unique column, so every row needs a valid value; a self-practice session's
 * token/code are simply never displayed or accepted by the QR-join endpoints. */
async function findOrCreatePracticeSession(testId: string) {
  const existing = await prisma.testSession.findFirst({
    where: { testId, mode: 'selfPractice' },
  });
  if (existing) return existing;

  try {
    return await prisma.testSession.create({
      data: {
        testId,
        joinToken: generateJoinToken(),
        manualCode: generateManualCode(),
        mode: 'selfPractice',
        status: 'active',
      },
    });
  } catch (err) {
    // Race: two students requesting self-practice for a brand-new test at the same
    // instant. `testId+mode` isn't a DB-level unique constraint (see this file's module
    // doc comment — enforced at the application layer, same pattern as elsewhere in this
    // codebase), so the race manifests as two rows rather than a P2002 — re-query and
    // take whichever one now exists (the other becomes simply unused, harmless).
    const race = await prisma.testSession.findFirst({ where: { testId, mode: 'selfPractice' } });
    if (race) return race;
    throw err;
  }
}

/** POST /api/tests/:testId/practice — starts (or resumes) this student's self-practice
 * attempt for a test. Response shape matches the live-join endpoint's
 * `JoinSessionResponse` exactly, so the client reuses the same "navigate into
 * `/student/attempts/:attemptId`" logic as `JoinPage.tsx`. */
practiceRouter.post(
  '/:testId/practice',
  asyncHandler(async (req, res) => {
    const test = await prisma.test.findUnique({ where: { id: req.params.testId } });
    if (!test) {
      res.status(404).json({ error: 'Test not found.' });
      return;
    }

    const session = await findOrCreatePracticeSession(test.id);

    const attempt = await findOrCreateAttempt(session, req.user!.sub);
    if (attempt === 'no-variants') {
      res.status(400).json({
        error: 'This test has no variants yet. Ask your teacher to generate variants first.',
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
      testId: test.id,
      testTitle: test.title,
      variantCode: variant.code,
      status: attempt.status,
    };
    res.status(200).json(response);
  }),
);
