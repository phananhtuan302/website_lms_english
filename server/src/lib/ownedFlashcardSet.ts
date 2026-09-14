/**
 * Ownership check for teacher flashcard-set routes (T-022) — same pattern as
 * `ownedTest.ts`: a teacher may only read/write their OWN flashcard sets. A different
 * teacher's set id (or one that doesn't exist at all) gets an identical 404, so probing
 * another teacher's set id learns nothing beyond "not found".
 */

import type { Response } from 'express';
import { prisma } from './prisma';

export async function requireOwnedFlashcardSet(setId: string, teacherId: string, res: Response) {
  const set = await prisma.flashcardSet.findUnique({ where: { id: setId } });
  if (!set || set.teacherId !== teacherId) {
    res.status(404).json({ error: 'Flashcard set not found.' });
    return null;
  }
  return set;
}
