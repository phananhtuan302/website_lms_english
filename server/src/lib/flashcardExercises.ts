/**
 * Pure logic shared by the four vocabulary exercise types (T-024 fill-blank, T-025
 * unscramble, T-026 listen-and-type, T-027 IPA-to-word) plus the T-028 matching
 * exercise: which cards are eligible for a given type/mode, how to build the
 * answer-free prompt (or matching pair) sent to the client, and what counts as a
 * correct submission. No DB access here — `studentFlashcards.routes.ts` is the only
 * caller and owns all persistence, same "pure function" split as `lib/grading.ts`.
 */

import type { MatchingMode, VocabExercisePromptDTO, VocabExerciseType } from '@platform/shared';

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

/** Exported (T-089) so the self-check quiz's meaning-comparison check
 * (`studentFlashcards.routes.ts`'s `POST /:setId/self-check/:cardId/answer`) uses the
 * exact same case-insensitive/trimmed normalization as every other exact-match check in
 * this codebase, rather than a second ad-hoc implementation. */
export function normalize(value: string): string {
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

// --- Matching exercise (T-028) --------------------------------------------------------
// Extends the eligibility-filtering pattern above to the four matching modes. Unlike
// T-024–T-027 (one "correct" word to type), a matching round doesn't need a
// correctness check here at all — the server just hands the client both sides of every
// eligible pair (see `MatchingPairDTO`'s doc comment in `@platform/shared` for why
// that's not an answer leak), and the client is the one that knows whether the
// student's chosen pairing matches. Completion/progress-recording goes through the
// shared `applyBatchProgress` helper in `flashcardProgress.ts` instead.

export const MATCHING_MODES: MatchingMode[] = ['meaning', 'image', 'synonym', 'antonym'];

/** Minimal shape this module needs from a `FlashcardCard` row for matching — a superset
 * of `ExercisableCard` (adds the two fields no T-024–T-027 type needs: `meaning` and
 * `imageUrl`). */
export interface MatchableCard extends ExercisableCard {
  meaning: string;
  imageUrl: string | null;
  antonyms: string[];
}

/**
 * Eligibility per matching mode (T-028's "a mode with no eligible data ... must simply
 * be unavailable for that set, not error"):
 * - `meaning`: every card has a `meaning` (required field), so every card is eligible.
 * - `image`: needs a non-empty `imageUrl`.
 * - `synonym`: needs at least one configured synonym.
 * - `antonym`: needs at least one configured antonym.
 *
 * A mode being "unavailable" is a client-side concern (see
 * `StudentVocabMatchingPage.tsx`): the route always returns whatever pairs pass this
 * filter, even if that's fewer than 2 (too few to meaningfully play) or 0 — same
 * "empty list, never a 4xx" convention as `isEligible` above.
 */
export function isMatchingEligible(mode: MatchingMode, card: MatchableCard): boolean {
  switch (mode) {
    case 'meaning':
      return true;
    case 'image':
      return !!card.imageUrl;
    case 'synonym':
      return card.synonyms.length > 0;
    case 'antonym':
      return card.antonyms.length > 0;
  }
}

/** The "target" (right-hand column) value for one card in one mode. Caller must have
 * already checked `isMatchingEligible`. For `synonym`/`antonym`, a card may have
 * several configured alternates — the first one is used as this round's target so each
 * card contributes exactly one pair (matches T-028's "a set of pairs to match", not a
 * variable-sized one). */
export function buildMatchingTarget(mode: MatchingMode, card: MatchableCard): string {
  switch (mode) {
    case 'meaning':
      return card.meaning;
    case 'image':
      return card.imageUrl!;
    case 'synonym':
      return card.synonyms[0];
    case 'antonym':
      return card.antonyms[0];
  }
}
