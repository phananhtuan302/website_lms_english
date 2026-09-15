/**
 * "Tự kiểm tra" (self-check) quiz prompt-building (T-089): turns a student's eligible
 * cards (`status: 'known' && verifiedKnown: false` in one set, resolved by the caller —
 * this module does no DB filtering of its own) into answer-free multiple-choice prompts.
 *
 * Reuses `vocabularyCheckGenerator.ts`'s `buildDistractors`/`fetchDistractorPool` exactly
 * as-is (both exported specifically for this, T-089's explicit instruction) rather than
 * reinventing distractor-building — same broad, not-limited-to-the-set pool reasoning as
 * that module documents (a small set wouldn't otherwise yield enough distinct wrong
 * answers). Unlike that module, there is no `fillBlank` fallback here: T-089 only ever
 * asks for a multiple-choice self-check, so a card with too few distinct distractor
 * meanings anywhere in the bank (rare outside a tiny dev/demo dataset) simply gets fewer
 * choices, per `buildDistractors`'s own documented "fewer than `count`" behavior.
 */
import type { SelfCheckPromptDTO } from '@platform/shared';
import { shuffle } from './variantShuffle';
import { buildDistractors, fetchDistractorPool } from './vocabularyCheckGenerator';

/** Same distractor count as the Vocabulary Check generator, for a consistent difficulty
 * feel between the two (unrelated) multiple-choice vocabulary features. */
const DISTRACTORS_PER_QUESTION = 3;

export interface SelfCheckEligibleCard {
  id: string;
  term: string;
  meaning: string;
}

/** Builds one answer-free prompt per eligible card. Empty input -> empty output (no DB
 * calls at all), matching every other exercise-prompt endpoint's "empty is valid, never
 * an error" convention in this codebase. */
export async function buildSelfCheckPrompts(cards: SelfCheckEligibleCard[]): Promise<SelfCheckPromptDTO[]> {
  if (cards.length === 0) return [];

  const distractorPool = await fetchDistractorPool(cards.map((c) => c.id));

  return cards.map((card) => {
    const distractors = buildDistractors(distractorPool, card.id, card.meaning, DISTRACTORS_PER_QUESTION);
    return {
      cardId: card.id,
      term: card.term,
      choices: shuffle([card.meaning, ...distractors]),
    };
  });
}
