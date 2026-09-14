/**
 * Pure validation heuristic for the "use this word in a sentence" exercise (T-029). No
 * DB access here — `studentFlashcards.routes.ts` is the only caller and owns
 * persistence, same "pure function" split as `lib/grading.ts` / `lib/flashcardExercises.ts`.
 *
 * Documented choice (T-029 "minimum validation ... allow simple inflections if easy,
 * otherwise exact word match is fine — document your choice"): exact word match is
 * always accepted, PLUS a small fixed set of common regular inflection suffixes
 * (`-s`, `-es`, `-ed`, `-ing`, and the `y` -> `-ies` swap for words ending in a
 * consonant + `y`) are also accepted, since those are trivial to check with a plain
 * regex and cover the vast majority of real sentences a student would naturally write
 * (e.g. target word "run" accepts "runs"/"running" but not "ran" — irregular forms are
 * explicitly out of scope, matching the task's own "if easy" qualifier: an irregular
 * lookup table is not simple). Matching is whole-word (word-boundary) and
 * case-insensitive, same convention as every other text-answer check in this codebase.
 */

/** Escapes regex-special characters in a user-supplied word before interpolating it
 * into a pattern. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds the set of word forms accepted as "using" `word`: the exact word, plus regular
 * inflections. Multi-word terms (e.g. "ice cream") are matched as the exact phrase only
 * — inflection suffixes only apply to single-word terms, since "ice creams" is a
 * plausible plural but stemming a multi-word phrase isn't a same-level "simple" case.
 */
function inflectedForms(word: string): string[] {
  const trimmed = word.trim();
  if (!trimmed || /\s/.test(trimmed)) {
    return [trimmed];
  }

  const forms = new Set<string>([trimmed]);
  const lower = trimmed.toLowerCase();

  forms.add(`${trimmed}s`);
  forms.add(`${trimmed}es`);
  forms.add(`${trimmed}ed`);
  forms.add(`${trimmed}ing`);

  // Consonant + "y" -> "ies" (e.g. "study" -> "studies"), a very common regular pattern.
  if (/[^aeiou]y$/i.test(lower)) {
    forms.add(`${trimmed.slice(0, -1)}ies`);
  }

  // Silent-"e" drop before "-ing"/"-ed" (e.g. "smile" -> "smiling"/"smiled").
  if (/e$/i.test(lower)) {
    forms.add(`${trimmed.slice(0, -1)}ing`);
    forms.add(`${trimmed.slice(0, -1)}ed`);
  }

  return [...forms];
}

/**
 * True if `sentence` contains `word` (case-insensitive, whole-word) or one of its
 * accepted simple inflections. Never throws on empty input — an empty sentence simply
 * doesn't contain the word.
 */
export function sentenceContainsWord(sentence: string, word: string): boolean {
  const forms = inflectedForms(word).filter(Boolean);
  if (forms.length === 0) return false;

  const pattern = forms.map((form) => escapeRegExp(form)).join('|');
  const regex = new RegExp(`\\b(?:${pattern})\\b`, 'i');
  return regex.test(sentence);
}
