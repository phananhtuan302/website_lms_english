/**
 * Vocabulary leaderboard scoring engine — the all-time leaderboard (T-031) and the
 * period-scoped (monthly T-032 / yearly T-033) ranking reports all go through the ONE
 * scoring function appropriate to their scope, defined here, rather than three separate
 * ad-hoc implementations.
 *
 * Score formula (T-089, 2026-09-15 — THIRD revision of this formula today; see
 * `docs/PROGRESS_LOG.md`'s two prior entries for the additive-then-multiplicative
 * history this replaces):
 *
 *   score = SUM of the student's `selfCheck`-type `FlashcardExerciseAttempt`
 *           point-values (+10 per `correct: true` row, -20 per `correct: false` row)
 *
 * This is a deliberate, complete replacement, not a tweak: the leaderboard is no longer
 * derived from exercise accuracy times a volume measure at all. It is now a direct
 * reflection of the customer-requested "Tự kiểm tra" self-check quiz's own permanent
 * point ledger (`server/src/lib/selfCheckScoring.ts`) — the SAME ledger driving each
 * flashcard set's own per-set score (`StudentFlashcardSetSummaryDTO.selfCheckScore`), just
 * summed across every set instead of one ("xếp hạng thì cứ lấy hết all điểm của học sinh
 * đó của các bộ thẻ là được" — the customer's explicit all-sets instruction). A wrong
 * self-check answer's `-20` is permanent: summing never overwrites or forgives an earlier
 * row, even after a later correct retry on the same card adds its own new `+10` row
 * (`FlashcardExerciseAttempt` is append-only by design, see its `schema.prisma` doc
 * comment) — so the leaderboard score can legitimately go negative for a student with
 * more wrong self-check answers than right ones.
 *
 * For full internal consistency with this new formula, the other fields on
 * `VocabLeaderboardEntryDTO` were redefined alongside `score` (not left describing the
 * old formula):
 * - `knownCardCount` is now the count of `FlashcardProgress` rows with `verifiedKnown:
 *   true` — TRUE verified mastery via the self-check quiz, not merely self-claimed
 *   `status: 'known'` (which a student can set for themselves with no verification at
 *   all, see `FlashcardProgress.verifiedKnown`'s doc comment).
 * - `totalAttempts`/`correctAttempts`/`accuracyPercent` are now scoped to `selfCheck`-type
 *   attempts ONLY, not every exercise/activity type as before — so the accuracy shown is
 *   coherent with what is actually driving `score` now, rather than mixing in unrelated
 *   fill-blank/matching/game accuracy that no longer affects ranking at all.
 *
 * Class scoping (T-077, Phase 12): both functions below still take a required `classId`
 * and rank ONLY students in that one class — untouched by this rewrite. Every caller
 * (`vocabLeaderboard.routes.ts` for the all-time leaderboard, `teacherVocabProgress.
 * routes.ts` for the monthly/yearly ranking) resolves a concrete `classId` first via
 * `reportClassScope.ts` before calling in here — this module trusts that input the same
 * way it already trusts `range` for the period variant, never re-deriving or
 * double-checking class ownership itself.
 *
 * The two variants still differ in scope, for the same genuine data-shape reason as
 * before T-089:
 *
 * - ALL-TIME (T-031): sums `selfCheck` point-values and counts `verifiedKnown` cards with
 *   NO date filtering at all — every self-check attempt/verification the student has ever
 *   made, life-to-date.
 * - PERIOD-SCOPED (T-032/T-033): sums only `selfCheck` attempts whose `createdAt` falls
 *   in `[range.start, range.end)`. `knownCardCount` stays `0` here (same as before
 *   T-089) — `FlashcardProgress.verifiedKnown` has no "when it became true" timestamp of
 *   its own, so it still isn't period-attributable with the data this schema tracks.
 */

import type { VocabActivityType } from '@prisma/client';
import type { VocabLeaderboardEntryDTO } from '@platform/shared';
import { prisma } from './prisma';
import { SELF_CHECK_CORRECT_POINTS, SELF_CHECK_INCORRECT_POINTS } from './selfCheckScoring';

interface RawStudent {
  id: string;
  name: string;
}

/** Rounds to 1 decimal place, same precision convention as `reporting.ts`'s
 * `averageScorePercent`. */
function round1(n: number): number {
  return Number(n.toFixed(1));
}

function accuracyOf(correct: number, total: number): number | null {
  return total > 0 ? round1((correct / total) * 100) : null;
}

/** Assigns 1-based "competition ranking" (equal scores share a rank; the next distinct
 * score resumes at its position in the list, e.g. 1, 1, 3, 4) to an already
 * score-descending-sorted list, then breaks display ties alphabetically by name (purely
 * cosmetic — `rank` itself does not change for a display tie). */
function assignRanks(
  entries: Array<Omit<VocabLeaderboardEntryDTO, 'rank'>>,
): VocabLeaderboardEntryDTO[] {
  const sorted = [...entries].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.studentName.localeCompare(b.studentName);
  });
  const ranks: number[] = [];
  for (let index = 0; index < sorted.length; index += 1) {
    ranks.push(index > 0 && sorted[index - 1].score === sorted[index].score ? ranks[index - 1] : index + 1);
  }
  return sorted.map((entry, index) => ({ ...entry, rank: ranks[index] }));
}

async function listStudents(classId: string): Promise<RawStudent[]> {
  return prisma.user.findMany({ where: { role: 'student', classId }, select: { id: true, name: true } });
}

/**
 * All-time leaderboard (T-031, formula replaced by T-089): includes EVERY student
 * account IN THE GIVEN CLASS (even one with a zero score, ranked last) — a leaderboard
 * showing that class's whole cohort standing, not just active students, per this task's
 * "visible to both teacher and students" framing (there is no notion of "not enrolled"
 * beyond class membership anywhere in this schema — see `StudentFlashcardSetSummaryDTO`'s
 * doc comment). Scoring itself (`FlashcardProgress`/`FlashcardExerciseAttempt`) is
 * narrowed to this class's students by filtering the `groupBy` queries on the relation's
 * `student.classId` (T-077) — a card/attempt row has no `classId` of its own, only the
 * student who owns it does.
 */
export async function computeAllTimeLeaderboard(classId: string): Promise<VocabLeaderboardEntryDTO[]> {
  const students = await listStudents(classId);

  const [verifiedKnownCounts, selfCheckByOutcome] = await Promise.all([
    prisma.flashcardProgress.groupBy({
      by: ['studentId'],
      where: { verifiedKnown: true, student: { classId } },
      _count: { _all: true },
    }),
    prisma.flashcardExerciseAttempt.groupBy({
      by: ['studentId', 'correct'],
      where: { type: 'selfCheck', student: { classId } },
      _count: { _all: true },
    }),
  ]);

  const knownMap = new Map(verifiedKnownCounts.map((r) => [r.studentId, r._count._all]));
  const outcomesByStudent = new Map<string, { correct: number; incorrect: number }>();
  for (const row of selfCheckByOutcome) {
    const acc = outcomesByStudent.get(row.studentId) ?? { correct: 0, incorrect: 0 };
    if (row.correct) acc.correct += row._count._all;
    else acc.incorrect += row._count._all;
    outcomesByStudent.set(row.studentId, acc);
  }

  const entries = students.map((student) => {
    const knownCardCount = knownMap.get(student.id) ?? 0;
    const { correct, incorrect } = outcomesByStudent.get(student.id) ?? { correct: 0, incorrect: 0 };
    const totalAttempts = correct + incorrect;
    const correctAttempts = correct;
    const accuracyPercent = accuracyOf(correctAttempts, totalAttempts);
    const score = correct * SELF_CHECK_CORRECT_POINTS + incorrect * SELF_CHECK_INCORRECT_POINTS;
    return {
      studentId: student.id,
      studentName: student.name,
      knownCardCount,
      totalAttempts,
      correctAttempts,
      accuracyPercent,
      score,
    };
  });

  return assignRanks(entries);
}

/**
 * Period-scoped leaderboard (T-032 monthly / T-033 yearly, formula replaced by T-089):
 * scores ONLY `selfCheck`-type `FlashcardExerciseAttempt` rows whose `createdAt` falls
 * within `[range.start, range.end)` — see this module's doc comment for why
 * `knownCardCount` stays `0` here (verified-known status has no period-attributable
 * timestamp). Only students with at least one `selfCheck` attempt in the period are
 * included (a zero-activity student has nothing meaningful to rank for "most active this
 * month" — see `VocabPeriodLeaderboardResponseDTO`'s doc comment in `@platform/shared`).
 * `classId` (T-077): narrows both the candidate student roster and the attempt query to
 * one class, same "student.classId is the only class dimension an attempt row has"
 * reasoning as `computeAllTimeLeaderboard` above.
 */
export async function computePeriodLeaderboard(
  range: { start: Date; end: Date },
  classId: string,
): Promise<VocabLeaderboardEntryDTO[]> {
  const students = await listStudents(classId);
  const studentNameById = new Map(students.map((s) => [s.id, s.name]));

  const attempts = await prisma.flashcardExerciseAttempt.findMany({
    where: { type: 'selfCheck', createdAt: { gte: range.start, lt: range.end }, student: { classId } },
    select: { studentId: true, correct: true },
  });

  const byStudent = new Map<string, { correct: number; incorrect: number }>();
  for (const attempt of attempts) {
    const acc = byStudent.get(attempt.studentId) ?? { correct: 0, incorrect: 0 };
    if (attempt.correct) acc.correct += 1;
    else acc.incorrect += 1;
    byStudent.set(attempt.studentId, acc);
  }

  const entries = [...byStudent.entries()]
    // Defensive: a student account could theoretically be deleted after leaving
    // attempts behind — `onDelete: Cascade` on `FlashcardExerciseAttempt.student` means
    // that can't actually happen, but skipping an unresolved name is safer than crashing
    // on a `!`.
    .filter(([studentId]) => studentNameById.has(studentId))
    .map(([studentId, acc]) => {
      const totalAttempts = acc.correct + acc.incorrect;
      const accuracyPercent = accuracyOf(acc.correct, totalAttempts);
      const score = acc.correct * SELF_CHECK_CORRECT_POINTS + acc.incorrect * SELF_CHECK_INCORRECT_POINTS;
      return {
        studentId,
        studentName: studentNameById.get(studentId)!,
        knownCardCount: 0,
        totalAttempts,
        correctAttempts: acc.correct,
        accuracyPercent,
        score,
      };
    });

  return assignRanks(entries);
}

/** Re-exported only so `vocabProgress`/route modules that need the raw activity-type
 * union don't need a second import path — not used within this file itself beyond the
 * type-only import above. */
export type { VocabActivityType };
