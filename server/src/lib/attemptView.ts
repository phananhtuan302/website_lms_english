/**
 * Builds the two different "views" of a test that the attempt endpoints need (T-011–T-014):
 *
 * 1. `buildRuntimeSections` — the take-test runtime view (T-012): questions/choices in
 *    the student's assigned variant's shuffled order, with the answer key stripped out
 *    entirely (no `isCorrect`, no `acceptedAnswers`) so the payload sent to a student
 *    mid-test can never leak the answer key.
 * 2. `buildResultQuestions` — the post-submission review view (T-013/T-014): the full
 *    answer key alongside the student's own stored answer, in the test's ORIGINAL
 *    authored order (not the shuffled variant order) so two different students' results
 *    line up the same way for a teacher comparing attempts, and so this component is
 *    reusable for both the student's own result page and the teacher's per-attempt
 *    detail page (same shape, see `AttemptResultDTO` in `@platform/shared`).
 *
 * Both take the same nested-test shape (sections -> questions -> choices, already
 * ordered by their authored `order`) that `teacherTests.routes.ts`'s `fetchNestedTest`
 * already produces, so a test is only ever queried one way across the whole codebase.
 */

import type { AttemptResultQuestionDTO, AttemptSectionDTO, QuestionType } from '@platform/shared';
import type { VariantLayout } from './variantShuffle';
import type { RawAnswer } from './grading';
import { gradeAnswer } from './grading';

interface ChoiceRow {
  id: string;
  text: string;
  isCorrect: boolean;
  order: number;
}

interface QuestionRow {
  id: string;
  type: QuestionType;
  prompt: string;
  order: number;
  acceptedAnswers: string[];
  choices: ChoiceRow[];
}

interface SectionRow {
  id: string;
  title: string;
  order: number;
  questions: QuestionRow[];
}

export interface NestedTestForAttempt {
  sections: SectionRow[];
}

/** Builds the shuffled, answer-key-free runtime view for the take-test UI. */
export function buildRuntimeSections(
  test: NestedTestForAttempt,
  layout: VariantLayout,
): AttemptSectionDTO[] {
  const sectionById = new Map(test.sections.map((s) => [s.id, s]));
  const questionById = new Map(
    test.sections.flatMap((s) => s.questions.map((q) => [q.id, q] as const)),
  );

  return layout.sections.map((sec, sectionIndex) => {
    const section = sectionById.get(sec.sectionId);
    if (!section) {
      throw new Error(`Variant layout references unknown section ${sec.sectionId}.`);
    }

    return {
      id: section.id,
      title: section.title,
      order: sectionIndex + 1,
      questions: sec.questionIds.map((questionId, questionIndex) => {
        const question = questionById.get(questionId);
        if (!question) {
          throw new Error(`Variant layout references unknown question ${questionId}.`);
        }
        const choiceOrder = layout.choiceOrder[questionId];
        const choiceById = new Map(question.choices.map((c) => [c.id, c]));
        const choices = (choiceOrder ?? []).map((choiceId) => {
          const choice = choiceById.get(choiceId);
          if (!choice) {
            throw new Error(`Variant layout references unknown choice ${choiceId}.`);
          }
          return { id: choice.id, text: choice.text };
        });

        return {
          id: question.id,
          type: question.type,
          prompt: question.prompt,
          order: questionIndex + 1,
          choices,
        };
      }),
    };
  });
}

/** Flattens every question in the test (in authored order) — used both to grade a
 * submission (T-013) and to build the result-review breakdown (T-014). */
export function flattenQuestionsInAuthoredOrder(test: NestedTestForAttempt): QuestionRow[] {
  return [...test.sections]
    .sort((a, b) => a.order - b.order)
    .flatMap((section) => [...section.questions].sort((a, b) => a.order - b.order));
}

/** Builds the full per-question result-review rows: the answer key plus whatever the
 * student had stored for that question (or nulls/`isCorrect: null` if never graded —
 * see `AttemptResultQuestionDTO`'s doc comment in `@platform/shared`). */
export function buildResultQuestions(
  test: NestedTestForAttempt,
  answers: Map<string, RawAnswer & { isCorrect: boolean | null }>,
): AttemptResultQuestionDTO[] {
  return flattenQuestionsInAuthoredOrder(test).map((question, index) => {
    const answer = answers.get(question.id);
    return {
      questionId: question.id,
      type: question.type,
      prompt: question.prompt,
      order: index + 1,
      choices: question.choices.map((c) => ({ id: c.id, text: c.text, isCorrect: c.isCorrect })),
      acceptedAnswers: question.acceptedAnswers,
      selectedChoiceId: answer?.selectedChoiceId ?? null,
      textAnswer: answer?.textAnswer ?? null,
      isCorrect: answer?.isCorrect ?? null,
    };
  });
}

/** Re-exported for callers that grade using this module's flattened question order
 * (kept here, not duplicated, so grading and result-building always agree on question
 * shape). */
export { gradeAnswer };
