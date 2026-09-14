/**
 * Vocabulary leaderboard scoring engine — the all-time leaderboard (T-031) and the
 * period-scoped (monthly T-032 / yearly T-033) ranking reports all go through the ONE
 * scoring function appropriate to their scope, defined here, rather than three separate
 * ad-hoc implementations.
 *
 * Score formula (documented choice, per T-031's "pick a simple, documented weighting"):
 *
 *   score = accuracyPercent (0-100) + correctCount * POINTS_PER_CORRECT_CARD
 *
 * where `accuracyPercent` is the student's exercise accuracy (correct / total attempts,
 * as a 0-100 number, 0 when there were no attempts) and `correctCount` is a volume
 * measure — "how much vocabulary have they actually gotten right" — weighted by
 * `POINTS_PER_CORRECT_CARD` so that real practice volume clearly outweighs a small
 * accuracy difference (e.g. one extra correct card is worth more than a 1-2% accuracy
 * swing), matching the backlog's "exercise accuracy + volume of cards learned" framing.
 * `POINTS_PER_CORRECT_CARD = 10` is an arbitrary but documented constant — easy to
 * hand-verify (10 points per correct card is simple mental math) and not tied to any
 * particular scale in the rest of the app.
 *
 * Two variants share this formula but differ in what "volume" counts, because of a
 * genuine data-shape constraint:
 *
 * - ALL-TIME (T-031): "volume of cards learned" is read literally as the number of this
 *   student's `FlashcardProgress` rows currently at `status: 'known'` — the count of
 *   distinct cards they've actually mastered, life-to-date. This is meaningful precisely
 *   because `FlashcardProgress` holds current, unbounded-history state.
 * - PERIOD-SCOPED (T-032/T-033): `FlashcardProgress.status` is NOT period-attributable —
 *   it only records a card's CURRENT status, not when it reached that status, so "cards
 *   known" can't be filtered to "became known during March 2026." The only genuinely
 *   period-scoped signal this schema has is the append-only `FlashcardExerciseAttempt`
 *   log (T-030), so for a period leaderboard, "volume" is read as the number of CORRECT
 *   exercise attempts that occurred within that period instead. This is a documented,
 *   reasonable substitution — it still rewards active, accurate practice within the
 *   selected month/year, just measured by attempts-in-period rather than
 *   lifetime-mastery-as-of-now.
 */

import type { VocabActivityType } from '@prisma/client';
import type { VocabLeaderboardEntryDTO } from '@platform/shared';
import { prisma } from './prisma';

const POINTS_PER_CORRECT_CARD = 10;

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

async function listStudents(): Promise<RawStudent[]> {
  return prisma.user.findMany({ where: { role: 'student' }, select: { id: true, name: true } });
}

/**
 * All-time leaderboard (T-031): includes EVERY student account (even one with a zero
 * score, ranked last) — a leaderboard showing the whole cohort's standing, not just
 * active students, per this task's "visible to both teacher and students" framing (there
 * is no notion of "not enrolled" anywhere in this schema — see
 * `StudentFlashcardSetSummaryDTO`'s doc comment).
 */
export async function computeAllTimeLeaderboard(): Promise<VocabLeaderboardEntryDTO[]> {
  const students = await listStudents();

  const [knownCounts, attemptCounts, correctCounts] = await Promise.all([
    prisma.flashcardProgress.groupBy({
      by: ['studentId'],
      where: { status: 'known' },
      _count: { _all: true },
    }),
    prisma.flashcardExerciseAttempt.groupBy({
      by: ['studentId'],
      _count: { _all: true },
    }),
    prisma.flashcardExerciseAttempt.groupBy({
      by: ['studentId'],
      where: { correct: true },
      _count: { _all: true },
    }),
  ]);

  const knownMap = new Map(knownCounts.map((r) => [r.studentId, r._count._all]));
  const attemptMap = new Map(attemptCounts.map((r) => [r.studentId, r._count._all]));
  const correctMap = new Map(correctCounts.map((r) => [r.studentId, r._count._all]));

  const entries = students.map((student) => {
    const knownCardCount = knownMap.get(student.id) ?? 0;
    const totalAttempts = attemptMap.get(student.id) ?? 0;
    const correctAttempts = correctMap.get(student.id) ?? 0;
    const accuracyPercent = accuracyOf(correctAttempts, totalAttempts);
    const score = round1((accuracyPercent ?? 0) + knownCardCount * POINTS_PER_CORRECT_CARD);
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
 * Period-scoped leaderboard (T-032 monthly / T-033 yearly): scores ONLY exercise
 * activity whose `FlashcardExerciseAttempt.createdAt` falls within `[range.start,
 * range.end)` — see this module's doc comment for why "volume" here means correct
 * attempts in the period rather than lifetime known-card count. Only students with at
 * least one attempt in the period are included (a zero-activity student has nothing
 * meaningful to rank for "most active this month" — see
 * `VocabPeriodLeaderboardResponseDTO`'s doc comment in `@platform/shared`).
 */
export async function computePeriodLeaderboard(range: {
  start: Date;
  end: Date;
}): Promise<VocabLeaderboardEntryDTO[]> {
  const students = await listStudents();
  const studentNameById = new Map(students.map((s) => [s.id, s.name]));

  const attempts = await prisma.flashcardExerciseAttempt.findMany({
    where: { createdAt: { gte: range.start, lt: range.end } },
    select: { studentId: true, correct: true },
  });

  const byStudent = new Map<string, { total: number; correct: number }>();
  for (const attempt of attempts) {
    const acc = byStudent.get(attempt.studentId) ?? { total: 0, correct: 0 };
    acc.total += 1;
    if (attempt.correct) acc.correct += 1;
    byStudent.set(attempt.studentId, acc);
  }

  const entries = [...byStudent.entries()]
    // Defensive: a student account could theoretically be deleted after leaving
    // attempts behind — `onDelete: Cascade` on `FlashcardExerciseAttempt.student` means
    // that can't actually happen, but skipping an unresolved name is safer than crashing
    // on a `!`.
    .filter(([studentId]) => studentNameById.has(studentId))
    .map(([studentId, acc]) => {
      const accuracyPercent = accuracyOf(acc.correct, acc.total);
      const score = round1((accuracyPercent ?? 0) + acc.correct * POINTS_PER_CORRECT_CARD);
      return {
        studentId,
        studentName: studentNameById.get(studentId)!,
        knownCardCount: 0,
        totalAttempts: acc.total,
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
