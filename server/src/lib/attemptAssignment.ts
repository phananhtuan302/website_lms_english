/**
 * Shared "find-or-create this student's Attempt for this session" logic, extracted from
 * `sessions.routes.ts` (T-011) so `practice.routes.ts` (T-040 self-practice) can reuse
 * the EXACT same round-robin variant-assignment rule instead of re-implementing it —
 * per Guiding Principle 6, self-practice is the same test-taking engine, not a parallel
 * system.
 */

import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { ensureTestVariants } from './testVariants';

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
export async function findOrCreateAttempt(session: { id: string; testId: string }, studentId: string) {
  const existing = await prisma.attempt.findUnique({
    where: { sessionId_studentId: { sessionId: session.id, studentId } },
  });
  if (existing) return existing;

  // Variants are automatic: a test that reached a student without any (assigned long ago, or
  // never given a variant) gets its default pair now, and stale ones are re-synced with the
  // current content. 'no-variants' therefore only remains for a test with no questions at all.
  if ((await ensureTestVariants(session.testId)) === 0) {
    return 'no-variants' as const;
  }
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
