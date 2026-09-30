/**
 * AIGradingProvider interface (T-051) — the one abstraction every Speaking-grading
 * caller depends on (currently just the Speaking-answer submit endpoint in
 * `attempts.routes.ts`, T-054), so swapping the mock implementation for a real AI
 * provider later (see `docs/INTEGRATIONS_TODO.md`) never touches business logic — only
 * `./index.ts`'s factory and a new file implementing this same interface.
 *
 * Per PROJECT_PLAN Assumption A3, this interface is specific to Speaking's shape
 * (transcript + audio reference). Essay/Writing questions are ALSO AI-graded now
 * (2026-09, superseding A3's original "Speaking only" scoping) but through the separate
 * `EssayGradingProvider` interface (`./essayGradingProvider.ts`) — essay input/output
 * shapes (IELTS band criteria, word counts) don't fit this one, so it was kept
 * Speaking-only rather than generalized.
 */

export interface AIGradingResult {
  /** 0-100 — see `SPEAKING_SCORE_SCALE` in `@platform/shared`. */
  score: number;
  /** Human-readable written feedback shown to the student (T-056), and to the teacher
   * before they optionally override it (T-055). */
  feedback: string;
}

export interface AIGradingProvider {
  /**
   * Grades one Speaking answer.
   *
   * @param transcript - the draft transcript generated client-side via the Web Speech
   *   API (T-053) — may be an empty string if the student's browser doesn't support
   *   speech recognition or no speech was detected during recording. A provider must
   *   handle that gracefully (never throw), per T-053's "submitting still works rather
   *   than failing" acceptance criteria.
   * @param audioReference - a reference to the submitted audio. In THIS build that is
   *   literally the base64 `data:` URL itself (see `attempts.routes.ts`'s module doc
   *   comment for why there's no real object-storage layer yet) — a real provider would
   *   more likely receive a URL/blob id to fetch the audio from cloud storage instead.
   *   The interface only promises "a reference to the audio", not a specific kind, so
   *   swapping the storage mechanism later never requires changing this interface.
   * @param prompt - the Speaking question's prompt text, so a provider can judge
   *   relevance/topic coverage, not just "did they say something."
   */
  grade(transcript: string, audioReference: string | null, prompt: string): Promise<AIGradingResult>;
}
