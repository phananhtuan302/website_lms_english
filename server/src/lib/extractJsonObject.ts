/**
 * Extracts the first top-level `{...}` object from a string — tolerates a model wrapping
 * its JSON in ```json fences or a stray sentence despite being asked not to, without
 * needing a full JSON-repair library for what should almost always already be clean
 * output.
 *
 * Pulled out of `server/src/grading/essayGradingPrompt.ts` (where it originated) so every
 * AI-generation module under `server/src/aiTools/` can reuse the exact same tolerant
 * parsing instead of each duplicating it.
 */
export function extractJsonObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('AI response did not contain a JSON object.');
  }
  return text.slice(start, end + 1);
}

/** Same as `extractJsonObject`, for a top-level `[...]` array response instead of a `{...}`
 * object — used by generators whose strict-JSON contract asks for an array (e.g. a list of
 * vocabulary cards) rather than a single object. */
export function extractJsonArray(text: string): string {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('AI response did not contain a JSON array.');
  }
  return text.slice(start, end + 1);
}
