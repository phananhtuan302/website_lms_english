/**
 * Vocabulary Check question-pool generation (T-038, Assumption A8).
 *
 * Pure-ish helpers (DB reads only, no writes) that pick a target student/group's
 * question pool from vocabulary they've ALREADY studied — `FlashcardProgress.status` in
 * (`learning`, `known`) only, never `new`/unseen words — and turn each selected
 * `FlashcardCard` into a `multipleChoice` (preferred, when enough distractor meanings
 * exist) or `fillBlank` (fallback) question spec. The caller (`teacherVocabularyCheck.routes.ts`)
 * is responsible for actually writing the `Test`/`Section`/`Question`/`Choice` rows and
 * the `TestAssignment` grants — this module only decides WHAT the pool/questions are.
 */

import { prisma } from './prisma';
import { shuffle } from './variantShuffle';

/** Fixed 15-minute time limit (T-038's explicit customer requirement, Assumption A8). */
export const VOCAB_CHECK_TIME_LIMIT_MINUTES = 15;

/** Upper bound on how many questions one generated Vocabulary Check contains — keeps it
 * realistically completable within the fixed 15-minute window even if the target
 * student(s) have studied a very large number of cards. Chosen as a simple, documented
 * cap (roughly one question per minute) rather than a configurable option, matching this
 * batch's "keep it simple" level of effort for a fixed-length test type. */
export const VOCAB_CHECK_MAX_QUESTIONS = 15;

/** How many multiple-choice distractor options to try to attach per question (on top of
 * the one correct answer) — capped down automatically per-question if fewer distinct
 * distractor meanings are available (see `buildDistractors`). */
const DISTRACTORS_PER_QUESTION = 3;

/** How large a pool of "other" cards to pull distractor meanings from — large enough in
 * practice to almost always find enough distinct meanings, small enough to stay a cheap
 * single query. */
const DISTRACTOR_POOL_SIZE = 200;

export class VocabCheckGenerationError extends Error {}

interface StudiedCard {
  id: string;
  term: string;
  meaning: string;
  synonyms: string[];
}

/**
 * Every card at least one of `studentIds` has studied (`learning` or `known` — NEVER
 * `new`/unseen, per Assumption A8), deduplicated across students so a "group" generation
 * draws from the UNION of everyone's studied vocabulary rather than one row per student
 * per card.
 */
async function selectStudiedCards(studentIds: string[]): Promise<StudiedCard[]> {
  const progressRows = await prisma.flashcardProgress.findMany({
    where: { studentId: { in: studentIds }, status: { in: ['learning', 'known'] } },
    select: { card: { select: { id: true, term: true, meaning: true, synonyms: true } } },
  });

  const byCardId = new Map<string, StudiedCard>();
  for (const row of progressRows) {
    if (!byCardId.has(row.card.id)) byCardId.set(row.card.id, row.card);
  }
  return [...byCardId.values()];
}

/** A broad pool of OTHER cards' meanings to source multiple-choice distractors from —
 * deliberately not limited to the target student(s)' own studied set, since a small
 * studied pool (e.g. 4-5 cards) wouldn't otherwise yield enough distinct wrong answers. */
async function fetchDistractorPool(excludeCardIds: string[]): Promise<Array<{ id: string; meaning: string }>> {
  return prisma.flashcardCard.findMany({
    where: { id: { notIn: excludeCardIds } },
    select: { id: true, meaning: true },
    take: DISTRACTOR_POOL_SIZE,
  });
}

/** Picks up to `count` distinct (case-insensitive), non-matching distractor meanings for
 * one card from the broader pool — fewer than `count` if the pool doesn't have enough
 * distinct meanings (the caller falls back to a `fillBlank` question when this returns
 * zero). */
function buildDistractors(
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
  /** The distinct studied cards the pool was drawn from (before the
   * `VOCAB_CHECK_MAX_QUESTIONS` cap) — returned mainly so callers/tests can report how
   * large the underlying studied-vocabulary pool was. */
  studiedCardCount: number;
  questions: GeneratedVocabCheckQuestion[];
}

/**
 * Builds the full question-pool spec for a Vocabulary Check targeting `studentIds`
 * (one id = a single target student; several = a "group" — see
 * `GenerateVocabularyCheckRequest`'s doc comment in `@platform/shared`).
 *
 * Throws `VocabCheckGenerationError` (caller maps this to a 400) when NONE of the
 * target students have any `learning`/`known` vocabulary yet — there is nothing to draw
 * a pool from, and generating an empty test would silently violate Assumption A8 rather
 * than surfacing the real problem ("this student hasn't studied anything yet").
 */
export async function buildVocabularyCheckPool(studentIds: string[]): Promise<GeneratedVocabCheckPool> {
  const studied = await selectStudiedCards(studentIds);
  if (studied.length === 0) {
    throw new VocabCheckGenerationError(
      'None of the selected student(s) have any "learning" or "known" vocabulary yet. Ask them to study some flashcards first — a Vocabulary Check can only be generated from words already studied.',
    );
  }

  const picks = shuffle(studied).slice(0, VOCAB_CHECK_MAX_QUESTIONS);
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

  return { studiedCardCount: studied.length, questions };
}
