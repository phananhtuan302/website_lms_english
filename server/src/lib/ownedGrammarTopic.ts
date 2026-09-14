/**
 * Ownership check for teacher Grammar-topic routes (T-046/T-047) — same pattern as
 * `ownedFlashcardSet.ts`/`ownedTest.ts`: a teacher may only read/write their OWN Grammar
 * topics. A different teacher's topic id (or one that doesn't exist at all) gets an
 * identical 404, so probing another teacher's topic id learns nothing beyond "not found".
 */

import type { Response } from 'express';
import { prisma } from './prisma';

export async function requireOwnedGrammarTopic(topicId: string, teacherId: string, res: Response) {
  const topic = await prisma.grammarTopic.findUnique({ where: { id: topicId } });
  if (!topic || topic.teacherId !== teacherId) {
    res.status(404).json({ error: 'Grammar topic not found.' });
    return null;
  }
  return topic;
}
