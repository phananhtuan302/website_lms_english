/**
 * Shared `FlashcardProgress` read/write helpers, used by both the direct study-mode
 * marking endpoint (T-023) and every vocabulary exercise's answer-check endpoint
 * (T-024–T-027) — see `schema.prisma`'s `FlashcardProgress` doc comment for why both
 * paths write the exact same row.
 */

import type { FlashcardProgressStatus } from '@prisma/client';
import { prisma } from './prisma';

/**
 * Status-transition rule applied by every EXERCISE check (T-024–T-027) — NOT used by
 * T-023's direct study-mode marking, which sets the status the student explicitly
 * chose instead of deriving it.
 *
 * Documented choice: a correct answer advances one step toward `known` (`new` ->
 * `learning` -> `known`, capped there); an incorrect answer demotes `known` back to
 * `learning` (a lapse means it's not truly mastered yet) but never regresses `new` or
 * `learning` further backward — getting a still-unfamiliar word wrong isn't a
 * regression, it's the expected state. This keeps the status monotonically meaningful
 * without needing a numeric score just for this batch of exercise types.
 */
export function advanceStatus(
  current: FlashcardProgressStatus,
  correct: boolean,
): FlashcardProgressStatus {
  if (correct) {
    if (current === 'new') return 'learning';
    return 'known';
  }
  return current === 'known' ? 'learning' : current;
}

/** Loads the current status for a student+card, defaulting to `new` when no row exists
 * yet (see `FlashcardProgress`'s doc comment — "never reviewed" reads as `new`). */
export async function getCurrentStatus(
  cardId: string,
  studentId: string,
): Promise<FlashcardProgressStatus> {
  const existing = await prisma.flashcardProgress.findUnique({
    where: { cardId_studentId: { cardId, studentId } },
  });
  return existing?.status ?? 'new';
}

/** Upserts a student's progress row for one card to an explicit status, stamping
 * `lastReviewedAt`. Used by T-023 (direct marking) and, after computing the next status
 * via `advanceStatus`, by every T-024–T-027 exercise-check endpoint. */
export async function setFlashcardProgress(
  cardId: string,
  studentId: string,
  status: FlashcardProgressStatus,
) {
  return prisma.flashcardProgress.upsert({
    where: { cardId_studentId: { cardId, studentId } },
    update: { status, lastReviewedAt: new Date() },
    create: { cardId, studentId, status, lastReviewedAt: new Date() },
  });
}
