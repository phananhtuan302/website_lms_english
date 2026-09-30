/**
 * The ONE place an attempt's total score is worked out (Phase 15, "điểm tự luận vào tổng").
 *
 * Points model (there is no per-question points field in the schema, so this is derived):
 *  - an auto-graded question (multipleChoice / trueFalse / fillBlank / matching) is worth 1 point;
 *  - an `essay` question is worth its `essayMaxScore` points and earns `manualScore ?? essayAiScore`
 *    (2026-09: essays are now AI-graded automatically at submit time, same "teacher override wins,
 *    else the AI grade" rule speaking already used — see `Answer.essayAiScore`'s doc comment);
 *  - a `speaking` question is worth `SPEAKING_QUESTION_POINTS` (1 — the same as one auto-graded
 *    question, so a single recording does not swamp the multiple-choice part) and earns that many
 *    points × `(manualScore ?? speakingAiScore) / SPEAKING_SCORE_SCALE` (the teacher's override
 *    wins, else the AI grade, else 0
 *    for a question the student never recorded — the teacher cannot grade that one either, so
 *    it must not hold the attempt in limbo).
 *
 * `scorePercent = earnedPoints / possiblePoints × 100` over the questions that are SCORED: every
 * auto-graded question, every speaking question, and every essay that has EITHER an AI grade or a
 * teacher grade. An attempt with at least one essay that has NEITHER (in practice: the one-off case
 * an AI grading call itself failed/errored at submit time — a blank essay still gets an AI score of
 * 0, same as speaking's "never recorded = 0") is PROVISIONAL ("tạm tính"): its percent is computed
 * over the scored questions only, and it becomes final by itself once that last essay is graded.
 * `provisional` is never stored: it is derived from the ungraded essay answers wherever it is needed
 * (no schema change).
 *
 * `correctCount` / `totalCount` keep meaning "auto-graded questions right / total" ("Đúng 3/5
 * câu") and are read from the values frozen on the `Attempt` at submit time, so re-scoring after
 * a manual grade can never be shifted by a question the teacher edited or added afterwards.
 *
 * Backward compatibility: with no essay/speaking question the result is `correct / total` with
 * the very same expression `attempts.routes.ts` used to store, i.e. byte-identical numbers.
 */

import { SPEAKING_SCORE_SCALE } from '@platform/shared';
import { prisma } from './prisma';

/** Points a speaking question is worth in the attempt total (see the module doc comment). */
export const SPEAKING_QUESTION_POINTS = 1;

/** One essay/speaking question of an attempt, with whatever grade it has so far. */
export interface ManualScoreItem {
  type: 'essay' | 'speaking';
  /** Points the question is worth (`essayMaxScore` for essay, `SPEAKING_SCORE_SCALE` for speaking). */
  maxPoints: number;
  manualScore: number | null;
  speakingAiScore: number | null;
  /** Only meaningful for `type: 'essay'` — see `Answer.essayAiScore`'s doc comment. */
  essayAiScore: number | null;
}

export interface AttemptScore {
  /** Points earned over the scored questions (auto-graded + graded manual ones). */
  earnedPoints: number;
  /** Points the scored questions are worth. */
  possiblePoints: number;
  /** `earnedPoints / possiblePoints × 100`, rounded to 1 decimal (0 when nothing is scored). */
  scorePercent: number;
  /** Auto-graded questions answered right / total — unchanged meaning ("Đúng 3/5 câu"). */
  correctCount: number;
  totalCount: number;
  /** True while at least one essay is still ungraded — the percent is then "tạm tính". */
  provisional: boolean;
  /** How many essays are still ungraded. */
  ungradedCount: number;
}

export interface AttemptScoreInput {
  correctCount: number;
  totalCount: number;
  manual: ManualScoreItem[];
}

function clamp(value: number, max: number): number {
  return Math.min(Math.max(value, 0), max);
}

/** Pure scoring — see the module doc comment for the model. */
export function computeAttemptScore(input: AttemptScoreInput): AttemptScore {
  let earnedPoints = input.correctCount;
  let possiblePoints = input.totalCount;
  let ungradedCount = 0;

  for (const item of input.manual) {
    if (item.type === 'essay') {
      const effectiveScore = item.manualScore ?? item.essayAiScore;
      if (effectiveScore === null) {
        ungradedCount += 1;
        continue;
      }
      earnedPoints += clamp(effectiveScore, item.maxPoints);
      possiblePoints += item.maxPoints;
    } else {
      // `maxPoints` of a speaking item is the 0–100 scale its score is given on; the question
      // itself is worth `SPEAKING_QUESTION_POINTS`.
      const ratio = clamp(item.manualScore ?? item.speakingAiScore ?? 0, item.maxPoints) / item.maxPoints;
      earnedPoints += ratio * SPEAKING_QUESTION_POINTS;
      possiblePoints += SPEAKING_QUESTION_POINTS;
    }
  }

  const scorePercent = possiblePoints > 0 ? Number(((earnedPoints / possiblePoints) * 100).toFixed(1)) : 0;
  return {
    earnedPoints,
    possiblePoints,
    scorePercent,
    correctCount: input.correctCount,
    totalCount: input.totalCount,
    provisional: ungradedCount > 0,
    ungradedCount,
  };
}

/** Question fields the scoring needs. */
interface ScoredQuestion {
  id: string;
  type: string;
  essayMaxScore: number | null;
}

/** Answer fields the scoring needs. */
interface ScoredAnswer {
  manualScore: number | null;
  speakingAiScore: number | null;
  essayAiScore: number | null;
}

/** Builds the essay/speaking items of a test for one attempt, from the test's questions and the
 * attempt's answers (used at submit time, when every answer is already in memory). */
export function buildManualItems(
  questions: ScoredQuestion[],
  answerByQuestionId: Map<string, ScoredAnswer>,
): ManualScoreItem[] {
  const items: ManualScoreItem[] = [];
  for (const question of questions) {
    if (question.type !== 'essay' && question.type !== 'speaking') continue;
    const answer = answerByQuestionId.get(question.id);
    items.push({
      type: question.type,
      maxPoints: question.type === 'essay' ? (question.essayMaxScore ?? 0) : SPEAKING_SCORE_SCALE,
      manualScore: answer?.manualScore ?? null,
      speakingAiScore: answer?.speakingAiScore ?? null,
      essayAiScore: answer?.essayAiScore ?? null,
    });
  }
  return items;
}

/** The essay/speaking items of each given attempt, read from the database in ONE query. Every
 * attempt id gets an entry (an empty list when its test has no essay/speaking answers), so
 * callers can score a whole page of attempts without a query per attempt. An attempt only holds
 * an `Answer` row per question it was submitted with, so this is naturally frozen at submit. */
export async function loadManualItemsByAttempt(attemptIds: string[]): Promise<Map<string, ManualScoreItem[]>> {
  const result = new Map<string, ManualScoreItem[]>(attemptIds.map((id) => [id, []]));
  if (attemptIds.length === 0) return result;
  const answers = await prisma.answer.findMany({
    where: { attemptId: { in: attemptIds }, question: { type: { in: ['essay', 'speaking'] } } },
    select: {
      attemptId: true,
      manualScore: true,
      speakingAiScore: true,
      essayAiScore: true,
      question: { select: { type: true, essayMaxScore: true } },
    },
  });
  for (const answer of answers) {
    const type = answer.question.type === 'essay' ? 'essay' : 'speaking';
    result.get(answer.attemptId)!.push({
      type,
      maxPoints: type === 'essay' ? (answer.question.essayMaxScore ?? 0) : SPEAKING_SCORE_SCALE,
      manualScore: answer.manualScore,
      speakingAiScore: answer.speakingAiScore,
      essayAiScore: answer.essayAiScore,
    });
  }
  return result;
}

export interface ProvisionalInfo {
  provisional: boolean;
  ungradedCount: number;
}

/** Derives `provisional` / `ungradedCount` for a set of attempts (read time, one query). */
export async function loadProvisionalInfo(attemptIds: string[]): Promise<Map<string, ProvisionalInfo>> {
  const items = await loadManualItemsByAttempt(attemptIds);
  const info = new Map<string, ProvisionalInfo>();
  for (const [attemptId, list] of items) {
    // Same rule as `computeAttemptScore` (and the "cần chấm" queues in `lib/classAttention.ts`).
    const ungradedCount = list.filter(
      (i) => i.type === 'essay' && i.manualScore === null && i.essayAiScore === null,
    ).length;
    info.set(attemptId, { provisional: ungradedCount > 0, ungradedCount });
  }
  return info;
}

/** Re-scores ONE submitted attempt after a manual grade / speaking override and stores the new
 * `scorePercent` on the `Attempt` (so the gradebook, student grades, leaderboards and every other
 * reader of the stored value follow automatically). Returns the fresh score, or `null` when the
 * attempt is not submitted / has no stored auto counts (nothing to re-score). */
export async function recomputeAttemptScore(attemptId: string): Promise<AttemptScore | null> {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    select: { status: true, correctCount: true, totalCount: true, scorePercent: true },
  });
  if (!attempt || attempt.status !== 'submitted' || attempt.correctCount === null || attempt.totalCount === null) {
    return null;
  }
  const manual = (await loadManualItemsByAttempt([attemptId])).get(attemptId) ?? [];
  const score = computeAttemptScore({
    correctCount: attempt.correctCount,
    totalCount: attempt.totalCount,
    manual,
  });
  if (score.scorePercent !== attempt.scorePercent) {
    await prisma.attempt.update({ where: { id: attemptId }, data: { scorePercent: score.scorePercent } });
  }
  return score;
}
