/**
 * Point-value constants for the "Tự kiểm tra" (self-check) quiz's permanent ledger
 * (T-089). Every `FlashcardExerciseAttempt(type: 'selfCheck')` row IS one ledger entry —
 * summed wherever a self-check score is shown (the per-set score on
 * `StudentFlashcardSetSummaryDTO.selfCheckScore`, and the Vocabulary Leaderboard's
 * `score` in `vocabLeaderboard.ts`), never stored as a separate mutable running total.
 * This is what makes a deduction permanent: a wrong attempt's `-20` row is never
 * un-recorded or refunded by a later correct retry on the same card — that retry creates
 * its OWN new `+10` row instead (see `FlashcardExerciseAttempt`'s "append-only" doc
 * comment in `schema.prisma`).
 */
export const SELF_CHECK_CORRECT_POINTS = 10;
export const SELF_CHECK_INCORRECT_POINTS = -20;

/** The point-value one self-check answer contributes to the permanent ledger. */
export function selfCheckPointValue(correct: boolean): number {
  return correct ? SELF_CHECK_CORRECT_POINTS : SELF_CHECK_INCORRECT_POINTS;
}
