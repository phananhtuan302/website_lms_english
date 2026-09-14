/**
 * Pure logic shared by the four vocabulary exercise types (T-024 fill-blank, T-025
 * unscramble, T-026 listen-and-type, T-027 IPA-to-word): which cards are eligible for a
 * given type, how to build the answer-free prompt sent to the client, and what counts
 * as a correct submission. No DB access here — `studentFlashcards.routes.ts` is the only
 * caller and owns all persistence, same "pure function" split as `lib/grading.ts`.
 */

import type { VocabExercisePromptDTO, VocabExerciseType } from '@platform/shared';

export const VOCAB_EXERCISE_TYPES: VocabExerciseType[] = [
  'fillBlank',
  'unscramble',
  'listenAndType',
  'ipaToWord',
];

/** Minimal shape this module needs from a `FlashcardCard` row. */
export interface ExercisableCard {
  id: string;
  term: string;
  ipa: string | null;
  audioUrl: string | null;
  exampleSentence: string | null;
  synonyms: string[];
}

/**
 * Eligibility per type (documented, matches each task's acceptance criteria):
 * - `fillBlank` (T-024): needs a non-empty `exampleSentence` containing the `___` blank
 *   marker (guaranteed by authoring-time validation, but re-checked here defensively).
 * - `unscramble` (T-025): every card has a `term`, so every card is eligible.
 * - `listenAndType` (T-026): needs a non-empty `audioUrl`.
 * - `ipaToWord` (T-027): needs a non-empty `ipa`.
 */
export function isEligible(type: VocabExerciseType, card: ExercisableCard): boolean {
  switch (type) {
    case 'fillBlank':
      return !!card.exampleSentence && card.exampleSentence.includes('___');
    case 'unscramble':
      return true;
    case 'listenAndType':
      return !!card.audioUrl;
    case 'ipaToWord':
      return !!card.ipa;
  }
}

/**
 * Scrambles a term's letters, word by word (so a multi-word term like "ice cream" keeps
 * its word boundaries — only the letters within each word are shuffled, which reads as
 * a fairer puzzle than scattering spaces randomly). Guarantees the result differs from
 * the original whenever the word has 2+ distinct-position letters to shuffle, by
 * retrying the shuffle a few times — a purely cosmetic guarantee (it doesn't affect
 * grading, which always re-checks against the real `term`), but "already unscrambled"
 * would be a confusing puzzle to show a student.
 */
export function scrambleWord(term: string): string {
  return term
    .split(/(\s+)/)
    .map((chunk) => {
      if (/^\s+$/.test(chunk) || chunk.length < 2) return chunk;
      const original = chunk;
      let attempt = original;
      for (let i = 0; i < 5 && attempt === original; i++) {
        const letters = chunk.split('');
        for (let j = letters.length - 1; j > 0; j--) {
          const k = Math.floor(Math.random() * (j + 1));
          [letters[j], letters[k]] = [letters[k], letters[j]];
        }
        attempt = letters.join('');
      }
      return attempt;
    })
    .join('');
}

/** Builds the answer-free prompt DTO for one eligible card. Caller must have already
 * checked `isEligible`. */
export function buildPrompt(type: VocabExerciseType, card: ExercisableCard): VocabExercisePromptDTO {
  switch (type) {
    case 'fillBlank':
      return { cardId: card.id, type, sentence: card.exampleSentence! };
    case 'unscramble':
      return { cardId: card.id, type, scrambled: scrambleWord(card.term) };
    case 'listenAndType':
      return { cardId: card.id, type, audioUrl: card.audioUrl! };
    case 'ipaToWord':
      return { cardId: card.id, type, ipa: card.ipa! };
  }
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Accepted answers for a correct submission, per type:
 * - `fillBlank` (T-024): the term OR any of its configured synonyms (documented as the
 *   "alternates" the acceptance criteria mentions — see `FlashcardCard.synonyms`'s doc
 *   comment in schema.prisma).
 * - `unscramble` / `listenAndType` / `ipaToWord`: exact term match only (case-insensitive
 *   — see each route's doc comment for why case-insensitive was the documented choice
 *   for T-025 specifically, matching the same convention already used everywhere else
 *   in this codebase, e.g. `lib/grading.ts`'s fillBlank check).
 */
export function acceptedAnswers(type: VocabExerciseType, card: ExercisableCard): string[] {
  if (type === 'fillBlank') {
    return [card.term, ...card.synonyms];
  }
  return [card.term];
}

/** Case-insensitive, whitespace-trimmed match against any accepted answer — same
 * normalization rule used by every text-answer check elsewhere in this codebase. */
export function isCorrectAnswer(
  submitted: string,
  type: VocabExerciseType,
  card: ExercisableCard,
): boolean {
  const normalizedSubmitted = normalize(submitted);
  if (!normalizedSubmitted) return false;
  return acceptedAnswers(type, card).some((candidate) => normalize(candidate) === normalizedSubmitted);
}
