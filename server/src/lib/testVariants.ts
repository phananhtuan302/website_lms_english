/**
 * Automatic test-variant management. Teachers never have to think about variants: they are
 * produced by the machine, from the SAME generator the editor's "regenerate" button uses
 * (`generateVariantLayout` / `nextVariantCodes` in `variantShuffle.ts`), and kept in step with
 * the test's content.
 *
 * Three jobs, all idempotent and all serialized per test with a Postgres advisory lock (two
 * near-simultaneous callers — e.g. an assign click and the first student start — can never both
 * decide "zero variants, create some" and end up with four):
 *
 * - `ensureTestVariants` — when a test is assigned / published / started and has no variant yet,
 *   create `DEFAULT_VARIANT_COUNT` of them. Never touches existing variants, except that it first
 *   reconciles them with the current content (below).
 * - `reconcileVariants` — a variant's `layout` lists question and choice ids. Editing the test
 *   afterwards (adding a question, deleting a choice, ...) makes that list stale, and a stale
 *   layout used to hide the new question from students (they were still graded on it) or crash
 *   the take-test screen on a deleted id. Called after every structural edit and before every
 *   assign/start: a variant nobody has started is simply regenerated (fresh shuffle); one that
 *   already has attempts keeps its order and is patched minimally — vanished ids dropped, new
 *   ones appended at the end (the same "never hide anything" rule the result page applies).
 * - `regenerateVariants` — the editor's secondary "Tạo lại các phiên bản" button: fresh shuffle
 *   for every variant with no attempts, untouched for the rest (deleting a variant would cascade
 *   to its attempts, so nothing is ever deleted).
 */

import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { NESTED_TEST_INCLUDE, type NestedTest } from './testQueries';
import { generateVariantLayout, nextVariantCodes, type VariantLayout } from './variantShuffle';

/** How many variants an assigned / started test gets when it has none. */
export const DEFAULT_VARIANT_COUNT = 2;

type TestContent = NestedTest;
type Tx = Prisma.TransactionClient;

/** Waits for (and holds until the surrounding transaction ends) this test's variant lock. */
async function lockTestVariants(tx: Tx, testId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'test-variants:' + testId}))`;
}

function hasAnyQuestion(test: TestContent): boolean {
  return test.sections.some((section) => section.questions.length > 0);
}

/** True when `layout` lists exactly the sections / questions / choices the test has now. */
function layoutMatchesTest(layout: VariantLayout | null, test: TestContent): boolean {
  if (!layout || !Array.isArray(layout.sections) || typeof layout.choiceOrder !== 'object') return false;
  if (layout.sections.length !== test.sections.length) return false;
  // Sections are never shuffled: a variant lists them in the authored order (question order and
  // choice order inside them are the shuffled part), so reordering sections makes it stale too.
  if (!layout.sections.every((listed, index) => listed.sectionId === test.sections[index].id)) return false;
  const sectionById = new Map(layout.sections.map((s) => [s.sectionId, s]));
  for (const section of test.sections) {
    const listed = sectionById.get(section.id);
    if (!listed || listed.questionIds.length !== section.questions.length) return false;
    const listedIds = new Set(listed.questionIds);
    for (const question of section.questions) {
      if (!listedIds.has(question.id)) return false;
      const choiceIds = layout.choiceOrder[question.id] ?? [];
      if (choiceIds.length !== question.choices.length) return false;
      const listedChoices = new Set(choiceIds);
      if (!question.choices.every((c) => listedChoices.has(c.id))) return false;
    }
  }
  // No entry may point at a question that no longer exists.
  const questionIds = new Set(test.sections.flatMap((s) => s.questions.map((q) => q.id)));
  return Object.keys(layout.choiceOrder).every((id) => questionIds.has(id));
}

/** Keeps `layout`'s order, drops ids that no longer exist and appends new ones at the end. */
function patchLayout(layout: VariantLayout | null, test: TestContent): VariantLayout {
  const oldSections = new Map((layout?.sections ?? []).map((s) => [s.sectionId, s.questionIds ?? []]));
  const choiceOrder: Record<string, string[]> = {};
  const sections = test.sections.map((section) => {
    const validQuestionIds = new Set(section.questions.map((q) => q.id));
    const kept = (oldSections.get(section.id) ?? []).filter((id) => validQuestionIds.has(id));
    const keptSet = new Set(kept);
    const questionIds = [...kept, ...section.questions.map((q) => q.id).filter((id) => !keptSet.has(id))];
    for (const question of section.questions) {
      if (question.choices.length === 0) continue;
      const validChoiceIds = new Set(question.choices.map((c) => c.id));
      const keptChoices = (layout?.choiceOrder?.[question.id] ?? []).filter((id) => validChoiceIds.has(id));
      const keptChoiceSet = new Set(keptChoices);
      choiceOrder[question.id] = [
        ...keptChoices,
        ...question.choices.map((c) => c.id).filter((id) => !keptChoiceSet.has(id)),
      ];
    }
    return { sectionId: section.id, questionIds };
  });
  return { sections, choiceOrder };
}

/** Reconciles every variant of the test with its content. Caller holds the lock. */
async function reconcileLocked(tx: Tx, testId: string, test: TestContent): Promise<number> {
  const variants = await tx.testVariant.findMany({
    where: { testId },
    select: { id: true, layout: true, _count: { select: { attempts: true } } },
  });
  let changed = 0;
  for (const variant of variants) {
    const layout = variant.layout as unknown as VariantLayout | null;
    if (layoutMatchesTest(layout, test)) continue;
    const next = variant._count.attempts === 0 ? generateVariantLayout(test) : patchLayout(layout, test);
    await tx.testVariant.update({ where: { id: variant.id }, data: { layout: next as object } });
    changed += 1;
  }
  return changed;
}

/** Brings the test's variants in step with its current content. Returns how many changed. */
export async function reconcileVariants(testId: string): Promise<number> {
  const quickCount = await prisma.testVariant.count({ where: { testId } });
  if (quickCount === 0) return 0;
  return prisma.$transaction(async (tx) => {
    await lockTestVariants(tx, testId);
    const test = await fetchNestedTestIn(tx, testId);
    if (!test) return 0;
    return reconcileLocked(tx, testId, test);
  });
}

async function fetchNestedTestIn(tx: Tx, testId: string): Promise<TestContent | null> {
  return tx.test.findUnique({ where: { id: testId }, include: NESTED_TEST_INCLUDE });
}

/**
 * Makes sure the test can actually be taken: reconciles existing variants and, when it has none
 * (and has at least one question), creates `DEFAULT_VARIANT_COUNT`. Returns how many variants the
 * test has afterwards (0 = it has no questions, so nothing could be generated).
 */
export async function ensureTestVariants(testId: string): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await lockTestVariants(tx, testId);
    const test = await fetchNestedTestIn(tx, testId);
    if (!test) return 0;
    const existing = await tx.testVariant.count({ where: { testId } });
    if (existing > 0) {
      await reconcileLocked(tx, testId, test);
      return existing;
    }
    if (!hasAnyQuestion(test)) return 0;
    const codes = nextVariantCodes(0, DEFAULT_VARIANT_COUNT);
    for (const code of codes) {
      await tx.testVariant.create({
        data: { testId, code, layout: generateVariantLayout(test) as object },
      });
    }
    return codes.length;
  });
}

export interface RegenerateVariantsResult {
  /** Variants that got a fresh shuffle (nobody had started them). */
  regenerated: number;
  /** Variants left as they were because students already have attempts on them. */
  kept: number;
  /** Variants created because the test had fewer than `DEFAULT_VARIANT_COUNT`. */
  created: number;
}

/** The editor's "Tạo lại các phiên bản": fresh shuffle where nobody started, keep the rest. */
export async function regenerateVariants(testId: string): Promise<RegenerateVariantsResult> {
  return prisma.$transaction(async (tx) => {
    await lockTestVariants(tx, testId);
    const test = await fetchNestedTestIn(tx, testId);
    const result: RegenerateVariantsResult = { regenerated: 0, kept: 0, created: 0 };
    if (!test || !hasAnyQuestion(test)) return result;

    const variants = await tx.testVariant.findMany({
      where: { testId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, layout: true, _count: { select: { attempts: true } } },
    });
    for (const variant of variants) {
      if (variant._count.attempts === 0) {
        await tx.testVariant.update({
          where: { id: variant.id },
          data: { layout: generateVariantLayout(test) as object },
        });
        result.regenerated += 1;
      } else {
        const layout = variant.layout as unknown as VariantLayout | null;
        if (!layoutMatchesTest(layout, test)) {
          await tx.testVariant.update({
            where: { id: variant.id },
            data: { layout: patchLayout(layout, test) as object },
          });
        }
        result.kept += 1;
      }
    }
    const missing = Math.max(0, DEFAULT_VARIANT_COUNT - variants.length);
    for (const code of nextVariantCodes(variants.length, missing)) {
      await tx.testVariant.create({
        data: { testId, code, layout: generateVariantLayout(test) as object },
      });
      result.created += 1;
    }
    return result;
  });
}
