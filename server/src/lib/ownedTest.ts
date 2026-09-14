/**
 * Ownership check shared by every teacher-authoring/variant/session route (T-008,
 * T-009, T-010): a teacher may only read/write their OWN tests. Centralized here so
 * cross-teacher isolation is enforced identically everywhere instead of being
 * re-implemented (and potentially forgotten) per handler.
 */

import type { Response } from 'express';
import { prisma } from './prisma';

/**
 * Loads a `Test` row by id and verifies `teacherId` owns it. On success returns the
 * row. On failure (test doesn't exist OR belongs to a different teacher) it writes a
 * 404 JSON response itself and returns `null` — callers just do
 * `const test = await requireOwnedTest(...); if (!test) return;`.
 *
 * The two failure cases are deliberately given the identical 404 response so a teacher
 * probing another teacher's test id learns nothing beyond "not found" (same reasoning
 * as the login endpoint's identical invalid-credentials message in `auth.routes.ts`).
 */
export async function requireOwnedTest(testId: string, teacherId: string, res: Response) {
  const test = await prisma.test.findUnique({ where: { id: testId } });
  if (!test || test.teacherId !== teacherId) {
    res.status(404).json({ error: 'Test not found.' });
    return null;
  }
  return test;
}
