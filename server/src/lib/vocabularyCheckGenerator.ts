/**
 * Vocabulary Check question-pool generation (T-038, redesigned by T-086 to a Unit-based
 * random pool).
 *
 * Pure-ish helpers (DB reads only, no writes) that pick a teacher-chosen `Unit`'s ENTIRE
 * vocabulary — every `FlashcardCard` across every `FlashcardSet` tagged with that
 * `unitId` — as the question pool, shuffle it, and take `questionCount` cards completely
 * at RANDOM. This is a deliberate 2026-09-15 customer-directed reversal of T-038's
 * original design (Assumption A8), which instead drew the pool from the target
 * student(s)' OWN `FlashcardProgress` (`learning`/`known` only) and always used a fixed
 * 15-minute timer — see PROJECT_PLAN.md's Assumption A8 annotation and T-086 in
 * BACKLOG.md for the full history. The new pool selection is intentionally completely
 * independent of any student's study history: a Vocabulary Check can now be generated
 * for a student who has never studied a single word in the unit.
 *
 * Each selected `FlashcardCard` is turned into a `multipleChoice` (preferred, when enough
 * distractor meanings exist) or `fillBlank` (fallback) question spec — that
 * question-building logic is UNCHANGED by T-086, only the pool-selection source changed.
 * The caller (`teacherVocabularyCheck.routes.ts`) is responsible for actually writing the
 * `Test`/`Section`/`Question`/`Choice` rows and the `TestAssignment` grants — this module
 * only decides WHAT the pool/questions are.
 */

import { prisma } from './prisma';
import { shuffle } from './variantShuffle';

/** How many multiple-choice distractor options to try to attach per question (on top of
 * the one correct answer) — capped down automatically per-question if fewer distinct
 * distractor meanings are available (see `buildDistractors`). */
const DISTRACTORS_PER_QUESTION = 3;

/** How large a pool of "other" cards to pull distractor meanings from — large enough in
 * practice to almost always find enough distinct meanings, small enough to stay a cheap
 * single query. */
const DISTRACTOR_POOL_SIZE = 200;

export class VocabCheckGenerationError extends Error {}

interface UnitPoolCard {
  id: string;
  term: string;
  meaning: string;
  synonyms: string[];
}

/**
 * Every `FlashcardCard` belonging to any `FlashcardSet` tagged with `unitId` (T-086) —
 * the unit's ENTIRE vocabulary pool, independent of any student's `FlashcardProgress`.
 */
async function selectUnitPool(unitId: string): Promise<UnitPoolCard[]> {
  return prisma.flashcardCard.findMany({
    where: { set: { unitId } },
    select: { id: true, term: true, meaning: true, synonyms: true },
  });
}

/** A broad pool of OTHER cards' meanings to source multiple-choice distractors from —
 * deliberately not limited to the unit's own pool, since a small unit (e.g. 4-5 cards)
 * wouldn't otherwise yield enough distinct wrong answers. Exported (T-089) so the
 * self-check quiz (`selfCheckQuiz.ts`) can reuse the exact same distractor-sourcing
 * approach instead of reinventing it, per that task's explicit instruction. */
export async function fetchDistractorPool(excludeCardIds: string[]): Promise<Array<{ id: string; meaning: string }>> {
  return prisma.flashcardCard.findMany({
    where: { id: { notIn: excludeCardIds } },
    select: { id: true, meaning: true },
    take: DISTRACTOR_POOL_SIZE,
  });
}

/** Picks up to `count` distinct (case-insensitive), non-matching distractor meanings for
 * one card from the broader pool — fewer than `count` if the pool doesn't have enough
 * distinct meanings (the caller falls back to a `fillBlank` question when this returns
 * zero). Exported (T-089): the self-check quiz reuses this exact function, per that
 * task's explicit "don't reinvent distractor logic" instruction. */
export function buildDistractors(
  pool: Array<{ id: string; meaning: string }>,
  correctCardId: string,
  correctMeaning: string,
  count: number,
): string[] {
  const seenMeanings = new Set([correctMeaning.trim().toLowerCase()]);
  const distractors: string[] = [];
  for (const candidate of shuffle(pool)) {
    if (candidate.id === correctCardId) continue;
    const key = candidate.meaning.trim().toLowerCase();
    if (seenMeanings.has(key)) continue;
    seenMeanings.add(key);
    distractors.push(candidate.meaning);
    if (distractors.length >= count) break;
  }
  return distractors;
}

export type GeneratedVocabCheckQuestion =
  | { type: 'multipleChoice'; prompt: string; correctText: string; choiceTexts: string[] }
  | { type: 'fillBlank'; prompt: string; acceptedAnswers: string[] };

export interface GeneratedVocabCheckPool {
  /** How many distinct cards existed in the unit's FULL vocabulary pool, before the
   * `questionCount` random pick — returned mainly so callers/tests can report how large
   * the underlying unit's vocabulary pool was. */
  poolSize: number;
  questions: GeneratedVocabCheckQuestion[];
}

/**
 * Builds the full question-pool spec for a Vocabulary Check drawn from `unitId`'s ENTIRE
 * vocabulary pool (T-086) — every `FlashcardCard` across every `FlashcardSet` tagged with
 * that unit — picking `questionCount` of them completely at random, with zero
 * `FlashcardProgress` filtering of any kind.
 *
 * Throws `VocabCheckGenerationError` (caller maps this to a 400) when:
 * - `unitId` does not reference an existing `Unit`;
 * - the unit's vocabulary pool has 0 or 1 cards (no valid `questionCount` could satisfy
 *   "strictly less than" the pool size in that case);
 * - `questionCount` is not strictly less than the pool size.
 *
 * Every rejection message states the actual pool size, so a teacher immediately knows
 * what to try instead.
 */
export async function buildVocabularyCheckPool(
  unitId: string,
  questionCount: number,
): Promise<GeneratedVocabCheckPool> {
  const unit = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!unit) {
    throw new VocabCheckGenerationError('unitId does not reference an existing Unit.');
  }

  const pool = await selectUnitPool(unitId);
  if (pool.length <= 1) {
    throw new VocabCheckGenerationError(
      `This unit's vocabulary pool only has ${pool.length} card${pool.length === 1 ? '' : 's'} — at least 2 are needed to generate a Vocabulary Check.`,
    );
  }
  if (questionCount >= pool.length) {
    throw new VocabCheckGenerationError(
      `questionCount must be strictly less than the unit's vocabulary pool size (${pool.length} cards available). Choose ${pool.length - 1} or fewer.`,
    );
  }

  const picks = shuffle(pool).slice(0, questionCount);
  const distractorPool = await fetchDistractorPool(picks.map((p) => p.id));

  const questions: GeneratedVocabCheckQuestion[] = picks.map((pick) => {
    const distractors = buildDistractors(distractorPool, pick.id, pick.meaning, DISTRACTORS_PER_QUESTION);
    if (distractors.length >= 1) {
      return {
        type: 'multipleChoice',
        prompt: `What does "${pick.term}" mean?`,
        correctText: pick.meaning,
        choiceTexts: shuffle([pick.meaning, ...distractors]),
      };
    }
    // Fallback (documented, T-038 "fillBlank or multipleChoice"): not enough distinct
    // distractor meanings exist anywhere else in the vocabulary bank (e.g. a very small
    // dev/demo dataset) — ask the reverse direction instead, which needs no distractors
    // at all. The card's own synonyms (if any) are accepted alternates too, same
    // convention as T-024's fill-blank exercise.
    return {
      type: 'fillBlank',
      prompt: `Which word means: "${pick.meaning}"?`,
      acceptedAnswers: [pick.term, ...pick.synonyms],
    };
  });

  return { poolSize: pool.length, questions };
}
