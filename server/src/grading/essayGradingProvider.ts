/**
 * EssayGradingProvider interface (2026-09, customer request — supersedes PROJECT_PLAN
 * Assumption A3's original "Writing never gets AI grading; Speaking is the ONLY
 * AI-graded content type"). Same "one abstraction, swap the implementation later"
 * pattern as `AIGradingProvider` (Speaking, T-051) — the only caller (the whole-attempt
 * submit route in `attempts.routes.ts`) depends only on this interface, never on a
 * concrete class, so activating a real provider later (see
 * `docs/INTEGRATIONS_TODO.md`) never touches business logic — only `./index.ts`'s
 * factory and a new file implementing this same interface.
 *
 * Deliberately a SEPARATE interface from `AIGradingProvider` rather than reusing it —
 * the inputs (essay text + task metadata, not an audio reference) and the possible
 * output shape (a single score, OR 4 separate IELTS band criteria) are different enough
 * that forcing one shared interface would mean one side or the other carries fields it
 * never uses.
 */

/** What a provider needs to grade one essay answer. */
export interface EssayGradingInput {
  /** The student's submitted answer text (never empty when this is called — an
   * unanswered essay is never sent to a provider at all, see the submit route). */
  essayText: string;
  /** The essay question's own prompt, so a provider can judge relevance/coverage of
   * the actual task, not just "did they write something." */
  prompt: string;
  /** The point value this essay is graded out of — 9 whenever `useIeltsCriteria` is
   * true (the fixed IELTS band scale; see `Question.essayUseIeltsCriteria`'s doc
   * comment in schema.prisma), otherwise the question's own configured `essayMaxScore`. */
  essayMaxScore: number;
  /** The question's configured minimum-word hint, if any — `null` when not set. */
  essayMinWords: number | null;
  /** Which IELTS Writing task this is, if any — changes what "Task Achievement/
   * Response" means (Task 1 = describing data/a chart/a letter; Task 2 = an argumentative
   * essay) — `null` for a non-IELTS essay question. */
  essayTaskType: 'task1' | 'task2' | null;
  /** When `true`, the provider MUST return `criteria` (non-null) in its result — the
   * question is graded on the 4 separate IELTS band criteria, not one free-form score. */
  useIeltsCriteria: boolean;
}

/** The 4 IELTS Writing band criteria a provider suggests, each 0-9 in 0.5 steps — same
 * shape as `IeltsCriteriaScores` in `@platform/shared` (kept as a separate, server-local
 * type here rather than importing that one, so this interface has zero dependency on
 * the grading ENDPOINT's own request/response shape — only a plain data shape). */
export interface EssayGradingCriteria {
  taskScore: number;
  coherenceScore: number;
  lexicalScore: number;
  grammarScore: number;
}

export interface EssayGradingResult {
  /** 0-`essayMaxScore` (from the input) overall score. When `criteria` is present,
   * this MUST equal their average, rounded to the nearest 0.5 (real IELTS convention —
   * `attempts.routes.ts` re-derives and overwrites this from `criteria` itself rather
   * than trusting a provider's own arithmetic, exactly like the teacher-grading route
   * already does for a human-entered `ieltsCriteria` — see that route's doc comment). */
  score: number;
  /** Human-readable written feedback shown to the student, and to the teacher before
   * they optionally override it — mirrors `AIGradingResult.feedback` (Speaking). */
  feedback: string;
  /** Non-null exactly when `EssayGradingInput.useIeltsCriteria` was `true`; `null`
   * otherwise. */
  criteria: EssayGradingCriteria | null;
}

export interface EssayGradingProvider {
  grade(input: EssayGradingInput): Promise<EssayGradingResult>;
}
