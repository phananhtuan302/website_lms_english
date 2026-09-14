/**
 * Auto-grading engine for objective question types (T-013).
 *
 * Deliberately a pure function of (question shape, one stored answer) -> boolean, with
 * no DB access and no hidden state. That's what makes grading deterministic per T-013's
 * acceptance criteria: re-deriving the score from the same stored `Answer` rows always
 * yields the same result, because the only inputs are values that never change once an
 * attempt exists (`Choice.isCorrect`, `Question.acceptedAnswers`, and the student's own
 * already-persisted `selectedChoiceId`/`textAnswer`).
 */

import type { QuestionType } from '@platform/shared';

export interface GradableQuestion {
  id: string;
  type: QuestionType;
  /** Only meaningful for multipleChoice/trueFalse. */
  choices: Array<{ id: string; isCorrect: boolean }>;
  /** Only meaningful for fillBlank. */
  acceptedAnswers: string[];
}

export interface RawAnswer {
  selectedChoiceId: string | null;
  textAnswer: string | null;
}

/**
 * Scores one question against one stored (possibly absent) answer:
 * - `multipleChoice` / `trueFalse`: exact match against whichever `Choice` is flagged
 *   `isCorrect` — looked up by id, so shuffled display order (T-009) never matters.
 * - `fillBlank`: case-insensitive match against `acceptedAnswers`, with both the
 *   student's answer and each accepted answer trimmed first (per T-013's acceptance
 *   criteria: "case-insensitive match... trim whitespace too").
 *
 * An unanswered question (no `Answer` row, or one with both fields `null`) is always
 * scored `false` rather than throwing — every question in a test always gets a
 * pass/fail verdict once the attempt is submitted, never a gap.
 */
export function gradeAnswer(question: GradableQuestion, answer: RawAnswer | undefined): boolean {
  if (question.type === 'fillBlank') {
    const submitted = answer?.textAnswer?.trim().toLowerCase();
    if (!submitted) return false;
    return question.acceptedAnswers.some((accepted) => accepted.trim().toLowerCase() === submitted);
  }

  // multipleChoice / trueFalse
  if (!answer?.selectedChoiceId) return false;
  const choice = question.choices.find((c) => c.id === answer.selectedChoiceId);
  return choice?.isCorrect ?? false;
}
