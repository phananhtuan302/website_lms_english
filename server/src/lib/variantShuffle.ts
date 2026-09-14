/**
 * Test-variant ("mã đề") shuffle engine (T-009).
 *
 * Design: a variant stores ONLY presentation order (question order within each
 * section, choice order within each question) — never a copy of the questions/choices
 * themselves and never a re-derived "correct answer". Correctness always lives on
 * `Choice.isCorrect` in the DB, addressed by id. That means shuffling can never corrupt
 * the answer key: whatever order a choice is displayed in, looking it up by id still
 * returns the same `isCorrect` value it always had. See `schema.prisma`'s
 * `TestVariant` doc comment for the full rationale and the exact `layout` JSON shape
 * (mirrored by `VariantLayout` below).
 */

import { randomInt } from 'crypto';

export interface VariantLayout {
  sections: Array<{ sectionId: string; questionIds: string[] }>;
  choiceOrder: Record<string, string[]>;
}

interface QuestionForShuffle {
  id: string;
  choices: Array<{ id: string }>;
}

interface SectionForShuffle {
  id: string;
  questions: QuestionForShuffle[];
}

interface TestForShuffle {
  sections: SectionForShuffle[];
}

/** Fisher-Yates shuffle using `crypto.randomInt` (cryptographically strong, unlike
 * `Math.random`) — not that a test-order shuffle needs to be unguessable, but it's the
 * standard unbiased algorithm and Node ships an unbiased random source for free, so
 * there's no reason to reach for `Math.random`'s well-known modulo bias instead.
 * Exported (T-038) so `server/src/lib/vocabularyCheckGenerator.ts` reuses the exact same
 * shuffle rather than a second copy — picking which studied cards make the pool and
 * which distractor meanings fill out each question's choices are both "shuffle then
 * take N" operations, same as variant generation. */
export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Generates one fresh shuffled layout for a fully-loaded test (sections -> questions
 * -> choices, all already ordered by their authored `order`). Section order itself is
 * intentionally left untouched — see the schema doc comment for why. */
export function generateVariantLayout(test: TestForShuffle): VariantLayout {
  const choiceOrder: Record<string, string[]> = {};

  const sections = test.sections.map((section) => {
    const questionIds = shuffle(section.questions.map((q) => q.id));
    for (const question of section.questions) {
      // fillBlank questions have no choices — no entry in choiceOrder for them, per
      // the documented shape (grading/rendering code should treat a missing key as
      // "not applicable", not as an error).
      if (question.choices.length > 0) {
        choiceOrder[question.id] = shuffle(question.choices.map((c) => c.id));
      }
    }
    return { sectionId: section.id, questionIds };
  });

  return { sections, choiceOrder };
}

/** Generates the next `count` sequential exam-code strings ("mã đề") for a test, e.g.
 * "101", "102", ... continuing from however many variants already exist so codes never
 * collide across repeated generate calls (also enforced at the DB level by the
 * `@@unique([testId, code])` constraint, this is just what keeps codes human-friendly
 * and sequential instead of colliding-and-erroring in the common case). */
export function nextVariantCodes(existingCount: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => String(101 + existingCount + i));
}
