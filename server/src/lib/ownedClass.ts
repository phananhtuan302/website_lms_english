/**
 * Ownership check for teacher class-management routes (T-074) — same pattern as
 * `ownedTest.ts`/`ownedFlashcardSet.ts`: a teacher may only read/write their OWN classes.
 * A different teacher's class id (or one that doesn't exist at all) gets an identical
 * 404, so probing another teacher's class id learns nothing beyond "not found".
 *
 * An `admin` caller bypasses the ownership check (see `lib/authz.ts`'s `isAdminOrOwner`),
 * same convention already established for every other teacher-owned entity in this
 * codebase (Test, FlashcardSet, GrammarTopic) per PROJECT_PLAN Assumption A12.
 */

import type { Response } from 'express';
import { prisma } from './prisma';
import { isAdminOrOwner, type AuthzUser } from './authz';

export async function requireOwnedClass(classId: string, user: AuthzUser, res: Response) {
  const cls = await prisma.class.findUnique({ where: { id: classId } });
  if (!cls || !isAdminOrOwner(user, cls.teacherId)) {
    res.status(404).json({ error: 'Class not found.' });
    return null;
  }
  return cls;
}
