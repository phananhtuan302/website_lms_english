/**
 * Read-only aggregation helpers for T-030's vocabulary/exercise progress views (student
 * "my progress" and teacher per-student/per-class views). Kept separate from
 * `flashcardProgress.ts` (the WRITE-side helpers every exercise endpoint calls to update
 * `FlashcardProgress` and log a `FlashcardExerciseAttempt` row) since this file only
 * ever reads already-loaded rows and does pure aggregation — no Prisma calls of its own,
 * so it's reusable against differently-scoped queries (one student vs. every student in
 * a set) without duplicating the aggregation logic per caller.
 */

import type { FlashcardProgressStatus, VocabActivityType } from '@prisma/client';
import type { VocabActivityStatDTO } from '@platform/shared';

/** Every activity type the `FlashcardExerciseAttempt` log can contain — used to seed a
 * zero-row for every type so a student/teacher can see "0 attempted" for an exercise
 * type nobody has tried yet, rather than that type being silently absent from the list.
 * Mirrors the Prisma `VocabActivityType` enum's values exactly (kept as a plain literal
 * array, not imported from `@prisma/client`'s enum object, since this needs to be a
 * TS-iterable array in a fixed display order, not just a type). */
export const ALL_VOCAB_ACTIVITY_TYPES: VocabActivityType[] = [
  'fillBlank',
  'unscramble',
  'listenAndType',
  'ipaToWord',
  'matching',
  'sentence',
  'spaceShooter',
  'runner',
];

/** Builds one `VocabActivityStatDTO` row per activity type (all 8, even ones with zero
 * attempts in `rows`) from a flat list of already-loaded `{ type, correct }` rows. Pure
 * aggregation — the caller decides the scope (one student across every set, or every
 * student within one set) by what it passes in. */
export function summarizeActivityStats(
  rows: Array<{ type: VocabActivityType; correct: boolean }>,
): VocabActivityStatDTO[] {
  const byType = new Map<VocabActivityType, { attempted: number; correct: number }>();
  for (const type of ALL_VOCAB_ACTIVITY_TYPES) {
    byType.set(type, { attempted: 0, correct: 0 });
  }
  for (const row of rows) {
    const acc = byType.get(row.type);
    if (!acc) continue; // Defensive: every DB value is one of ALL_VOCAB_ACTIVITY_TYPES.
    acc.attempted += 1;
    if (row.correct) acc.correct += 1;
  }
  return ALL_VOCAB_ACTIVITY_TYPES.map((type) => {
    const acc = byType.get(type)!;
    return {
      type,
      attempted: acc.attempted,
      correct: acc.correct,
      accuracyPercent:
        acc.attempted > 0 ? Number(((acc.correct / acc.attempted) * 100).toFixed(1)) : null,
    };
  });
}

/**
 * Card-status tally (known/learning/new) for one student across a given list of card
 * ids. `newCount` is DERIVED as `cardIds.length - known - learning`, never queried
 * directly — a card with no `FlashcardProgress` row at all counts as `new`, per that
 * model's doc comment in schema.prisma ("never reviewed" reads as `new`).
 */
export function summarizeCardStatuses(
  cardIds: string[],
  progressRows: Array<{ status: FlashcardProgressStatus }>,
): { knownCount: number; learningCount: number; newCount: number } {
  let knownCount = 0;
  let learningCount = 0;
  for (const row of progressRows) {
    if (row.status === 'known') knownCount += 1;
    else if (row.status === 'learning') learningCount += 1;
  }
  const newCount = Math.max(cardIds.length - knownCount - learningCount, 0);
  return { knownCount, learningCount, newCount };
}
