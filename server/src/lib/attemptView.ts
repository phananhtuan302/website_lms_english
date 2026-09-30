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
 *    The student's OWN result endpoint then passes it through
 *    `orderResultQuestionsLikeVariant`, so the child reads the review with the same
 *    numbering and choice order they saw on the take-test screen (T-113).
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
  /** Only meaningful for `essay` (T-042) — see `Question.essayMaxScore`'s doc comment. */
  essayMaxScore: number | null;
  essayMinWords: number | null;
  essayTaskType: 'task1' | 'task2' | null;
  essayUseIeltsCriteria: boolean;
  /** Only meaningful for `fillBlank` — see `Question.fillBlankMaxWords`'s doc comment. */
  fillBlankMaxWords: number | null;
  /** Only meaningful for `speaking` (T-052) — see `Question.allowedResponseSeconds`/
   * `promptAudioUrl`'s doc comments in schema.prisma. */
  allowedResponseSeconds: number | null;
  preparationSeconds: number | null;
  promptAudioUrl: string | null;
  choices: ChoiceRow[];
}

/** Reading (T-039) / Listening (T-040/T-041) content — see `Section`'s doc comment in
 * schema.prisma. */
interface SectionRow {
  id: string;
  title: string;
  order: number;
  passageText: string | null;
  passageImageUrl: string | null;
  audioUrl: string | null;
  maxPlayCount: number | null;
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
      passageText: section.passageText,
      passageImageUrl: section.passageImageUrl,
      audioUrl: section.audioUrl,
      maxPlayCount: section.maxPlayCount,
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
          essayMaxScore: question.essayMaxScore,
          essayMinWords: question.essayMinWords,
          essayTaskType: question.essayTaskType,
          fillBlankMaxWords: question.fillBlankMaxWords,
          allowedResponseSeconds: question.allowedResponseSeconds,
          preparationSeconds: question.preparationSeconds,
          promptAudioUrl: question.promptAudioUrl,
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
 * see `AttemptResultQuestionDTO`'s doc comment in `@platform/shared`). Also carries
 * through the essay manual-grading fields (T-042) — `manualScore`/`manualComment` are
 * `undefined`/`null` for a never-graded (or non-essay) answer. */
export function buildResultQuestions(
  test: NestedTestForAttempt,
  answers: Map<
    string,
    RawAnswer & {
      isCorrect: boolean | null;
      manualScore?: number | null;
      manualComment?: string | null;
      essayIeltsTaskScore?: number | null;
      essayIeltsCoherenceScore?: number | null;
      essayIeltsLexicalScore?: number | null;
      essayIeltsGrammarScore?: number | null;
      essayAiScore?: number | null;
      essayAiFeedback?: string | null;
      essayAiTaskScore?: number | null;
      essayAiCoherenceScore?: number | null;
      essayAiLexicalScore?: number | null;
      essayAiGrammarScore?: number | null;
      speakingAudioData?: string | null;
      speakingTranscript?: string | null;
      speakingAiScore?: number | null;
      speakingAiFeedback?: string | null;
    }
  >,
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
      essayMaxScore: question.essayMaxScore,
      essayMinWords: question.essayMinWords,
      essayTaskType: question.essayTaskType,
      essayUseIeltsCriteria: question.essayUseIeltsCriteria,
      fillBlankMaxWords: question.fillBlankMaxWords,
      manualScore: answer?.manualScore ?? null,
      manualComment: answer?.manualComment ?? null,
      essayIeltsTaskScore: answer?.essayIeltsTaskScore ?? null,
      essayIeltsCoherenceScore: answer?.essayIeltsCoherenceScore ?? null,
      essayIeltsLexicalScore: answer?.essayIeltsLexicalScore ?? null,
      essayIeltsGrammarScore: answer?.essayIeltsGrammarScore ?? null,
      essayAiScore: answer?.essayAiScore ?? null,
      essayAiFeedback: answer?.essayAiFeedback ?? null,
      essayAiTaskScore: answer?.essayAiTaskScore ?? null,
      essayAiCoherenceScore: answer?.essayAiCoherenceScore ?? null,
      essayAiLexicalScore: answer?.essayAiLexicalScore ?? null,
      essayAiGrammarScore: answer?.essayAiGrammarScore ?? null,
      allowedResponseSeconds: question.allowedResponseSeconds,
      preparationSeconds: question.preparationSeconds,
      promptAudioUrl: question.promptAudioUrl,
      speakingAudioData: answer?.speakingAudioData ?? null,
      speakingTranscript: answer?.speakingTranscript ?? null,
      speakingAiScore: answer?.speakingAiScore ?? null,
      speakingAiFeedback: answer?.speakingAiFeedback ?? null,
    };
  });
}

/** Re-orders a result review into the order THIS student saw during the test: their variant's
 * question order (flat across sections, exactly how the take-test screen counts "Câu hỏi 4/5"),
 * renumbering `order` 1..N, and each multiple-choice question's choices in the shuffled order they
 * were shown. Display-only — nothing here touches grading or the answer key. Anything the layout does
 * not mention is kept, after the listed ones in authored order, so a stale layout can never hide a
 * question or a choice. Used by the STUDENT's own result endpoint only; the teacher's attempt view
 * keeps the authored order (see this file's header). */
export function orderResultQuestionsLikeVariant(
  questions: AttemptResultQuestionDTO[],
  layout: VariantLayout,
): AttemptResultQuestionDTO[] {
  const byId = new Map(questions.map((q) => [q.questionId, q]));
  const ordered: AttemptResultQuestionDTO[] = [];
  const placed = new Set<string>();
  for (const section of layout.sections) {
    for (const questionId of section.questionIds) {
      const question = byId.get(questionId);
      if (question && !placed.has(questionId)) {
        placed.add(questionId);
        ordered.push(question);
      }
    }
  }
  for (const question of questions) {
    if (!placed.has(question.questionId)) ordered.push(question);
  }

  return ordered.map((question, index) => {
    const choiceOrder = layout.choiceOrder[question.questionId];
    const choices = choiceOrder
      ? [...question.choices].sort((a, b) => rank(choiceOrder, a.id) - rank(choiceOrder, b.id))
      : question.choices;
    return { ...question, order: index + 1, choices };
  });
}

/** Position of `id` in `list`, or a large number (so unlisted items sort last, stably). */
function rank(list: string[], id: string): number {
  const position = list.indexOf(id);
  return position === -1 ? list.length : position;
}

/** Re-exported for callers that grade using this module's flattened question order
 * (kept here, not duplicated, so grading and result-building always agree on question
 * shape). */
export { gradeAnswer };
