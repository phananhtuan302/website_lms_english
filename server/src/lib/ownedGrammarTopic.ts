/**
 * Ownership check for teacher Grammar-topic routes (T-046/T-047) — same pattern as
 * `ownedFlashcardSet.ts`/`ownedTest.ts`: a teacher may only read/write their OWN Grammar
 * topics. A different teacher's topic id (or one that doesn't exist at all) gets an
 * identical 404, so probing another teacher's topic id learns nothing beyond "not found".
 *
 * Extended 2026-09-15 (T-071, Assumption A12): an `admin` caller bypasses the ownership
 * check (see `lib/authz.ts`'s `isAdminOrOwner`), so admin can manage ANY teacher's
 * Grammar topic through this exact same helper/routes.
 */

import type { Response } from 'express';
import { prisma } from './prisma';
import { isAdminOrOwner, type AuthzUser } from './authz';

export async function requireOwnedGrammarTopic(topicId: string, user: AuthzUser, res: Response) {
  const topic = await prisma.grammarTopic.findUnique({ where: { id: topicId } });
  if (!topic || !isAdminOrOwner(user, topic.teacherId)) {
    res.status(404).json({ error: 'Grammar topic not found.' });
    return null;
  }
  return topic;
}
