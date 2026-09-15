/**
 * Ownership check for teacher flashcard-set routes (T-022) — same pattern as
 * `ownedTest.ts`: a teacher may only read/write their OWN flashcard sets. A different
 * teacher's set id (or one that doesn't exist at all) gets an identical 404, so probing
 * another teacher's set id learns nothing beyond "not found".
 *
 * Extended 2026-09-15 (T-071, Assumption A12): an `admin` caller bypasses the ownership
 * check (see `lib/authz.ts`'s `isAdminOrOwner`), so admin can manage ANY teacher's
 * flashcard set through this exact same helper/routes.
 */

import type { Response } from 'express';
import { prisma } from './prisma';
import { isAdminOrOwner, type AuthzUser } from './authz';

export async function requireOwnedFlashcardSet(setId: string, user: AuthzUser, res: Response) {
  const set = await prisma.flashcardSet.findUnique({ where: { id: setId } });
  if (!set || !isAdminOrOwner(user, set.teacherId)) {
    res.status(404).json({ error: 'Flashcard set not found.' });
    return null;
  }
  return set;
}
