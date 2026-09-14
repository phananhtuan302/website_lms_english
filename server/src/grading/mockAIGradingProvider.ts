/**
 * MockAIGradingProvider (T-051) — the only registered `AIGradingProvider`
 * implementation until a customer-supplied real AI provider (e.g. an Anthropic API
 * key) is configured; see `docs/INTEGRATIONS_TODO.md`. Needs no API key/account of any
 * kind, so the full Speaking flow (T-052–T-056) works end-to-end in dev.
 *
 * Documented heuristic (deliberately simple/transparent, NOT a real language model):
 * - `lengthScore` rewards a longer spoken response, up to a cap — `LENGTH_POINTS_PER_WORD`
 *   points per word in the draft transcript (T-053, split on whitespace), capped at
 *   `LENGTH_SCORE_CAP` (so a ~15-word response already reaches the cap).
 * - `overlapScore` rewards actually addressing the prompt — extracts every prompt word
 *   of at least `MIN_KEYWORD_LENGTH` characters (a crude but effective "content word"
 *   filter that skips short articles/prepositions like "the"/"a"/"to"), lowercases +
 *   dedupes them, and awards `OVERLAP_POINTS_PER_KEYWORD` points per one of those words
 *   that also appears (case-insensitively, substring match, no stemming) in the
 *   transcript, capped at `OVERLAP_SCORE_CAP`.
 * - `score = lengthScore + overlapScore`, clamped to `[0, SPEAKING_SCORE_SCALE]`.
 * - An empty/whitespace-only transcript (Web Speech API unsupported, or no speech
 *   detected) always scores 0 with feedback explaining why, rather than crashing or
 *   guessing — per T-053's "submitting still works... rather than failing" acceptance
 *   criteria, THIS is the code that has to not-fail on that input, since the submit
 *   endpoint always calls through to whatever provider is registered.
 *
 * This heuristic is intentionally crude and discloses itself as such in the feedback
 * text — it exists purely so the Speaking flow works end-to-end without any
 * customer-supplied credential, per TECH_STACK.md's mock/stub rule. It is NOT meant to
 * resemble real spoken-English assessment quality, and nothing downstream should treat
 * its score as anything more than a placeholder.
 */

import { SPEAKING_SCORE_SCALE } from '@platform/shared';
import type { AIGradingProvider, AIGradingResult } from './aiGradingProvider';

const LENGTH_POINTS_PER_WORD = 4;
const LENGTH_SCORE_CAP = 60;
const OVERLAP_POINTS_PER_KEYWORD = 10;
const OVERLAP_SCORE_CAP = 40;
const MIN_KEYWORD_LENGTH = 4;

/** Extracts deduped, lowercased "content words" (>= `MIN_KEYWORD_LENGTH` chars) from a
 * prompt — the keyword set `overlapScore` checks the transcript against. */
function extractKeywords(prompt: string): string[] {
  const words = prompt
    .toLowerCase()
    .split(/[^a-z0-9']+/i)
    .filter((w) => w.length >= MIN_KEYWORD_LENGTH);
  return [...new Set(words)];
}

export class MockAIGradingProvider implements AIGradingProvider {
  async grade(transcript: string, _audioReference: string | null, prompt: string): Promise<AIGradingResult> {
    const trimmed = transcript.trim();

    if (trimmed === '') {
      return {
        score: 0,
        feedback:
          'Mock AI grading (heuristic, not a real speech/language model): no transcript was available ' +
          "to grade — your browser may not support speech recognition, or no speech was detected. Your " +
          'audio recording has still been saved for your teacher to review and grade manually if needed.',
      };
    }

    const words = trimmed.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const lengthScore = Math.min(LENGTH_SCORE_CAP, wordCount * LENGTH_POINTS_PER_WORD);

    const keywords = extractKeywords(prompt);
    const lowerTranscript = trimmed.toLowerCase();
    const matchedKeywords = keywords.filter((k) => lowerTranscript.includes(k));
    const overlapScore = Math.min(OVERLAP_SCORE_CAP, matchedKeywords.length * OVERLAP_POINTS_PER_KEYWORD);

    const score = Math.min(SPEAKING_SCORE_SCALE, lengthScore + overlapScore);

    const feedback =
      'Mock AI grading (heuristic, not a real speech/language model): your response contained ' +
      `${wordCount} word(s) and referenced ${matchedKeywords.length} of ${keywords.length} key term(s) ` +
      `from the prompt${matchedKeywords.length > 0 ? ` (${matchedKeywords.join(', ')})` : ''}. ` +
      `Estimated score: ${score}/${SPEAKING_SCORE_SCALE}. This is a placeholder score from a simple ` +
      'word-count + keyword-overlap heuristic — a real AI provider will replace it once configured ' +
      '(see docs/INTEGRATIONS_TODO.md).';

    return { score, feedback };
  }
}
