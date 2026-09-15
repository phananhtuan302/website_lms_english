import { test, expect } from '@playwright/test';
import { assignContentToClass, newStudentContext, newTeacherContext } from './utils';

const SEED_FLASHCARD_SET_TITLE = 'Seed Demo Vocabulary Set (T-021 round-trip check)';

/**
 * T-060: flashcard study (T-023) + one exercise type (T-024 fill-in-the-blank).
 *
 * Reuses the SEEDED demo flashcard set (`server/prisma/seed.ts`'s
 * "Seed Demo Vocabulary Set (T-021 round-trip check)") rather than authoring a new one,
 * per the task's "reuse existing seed data" instruction. That set's first card (seed
 * order 1) is "apple", with an example sentence containing the `___` blank — the only
 * two fillBlank-eligible cards are "apple" and "happy" (both have an `exampleSentence`,
 * see `flashcardExercises.ts`'s `isEligible`), and eligibility filtering preserves the
 * underlying `order` field, so the first fillBlank prompt served is deterministically
 * "apple"'s sentence.
 *
 * T-076 (Phase 12): the seed migration (`prisma/seed.ts`'s `migrateContentToDefaultClasses`)
 * auto-assigns every pre-existing, previously-unassigned piece of content — including
 * this seed flashcard set — to the seed teacher's "Default Class", NOT "Class 6A" (the
 * class `global-setup.ts` registers the e2e student into). So this set must additionally
 * be assigned to "Class 6A" before the student can see/study it; done here (idempotently
 * — see `assignContentToClass`'s doc comment) rather than changing which class the
 * shared e2e student is in, since other specs' freshly-authored content is assigned to
 * "Class 6A" too and changing the student's class would just move the mismatch there.
 */
test('student studies a flashcard set and completes a fill-in-the-blank exercise', async ({
  browser,
  baseURL,
}) => {
  const teacherContext = await newTeacherContext(browser, baseURL!);
  await assignContentToClass(teacherContext, SEED_FLASHCARD_SET_TITLE, 'Class 6A');
  await teacherContext.close();

  const context = await newStudentContext(browser, baseURL!);
  const page = await context.newPage();

  try {
    await page.goto('/student/flashcard-sets');
    await page.getByRole('link', { name: /Seed Demo Vocabulary Set/ }).click();
    await page.waitForURL(/\/student\/flashcard-sets\/[a-zA-Z0-9-]+$/);

    // Study mode (T-023): flip the first card to reveal its meaning, then mark it Known
    // — this writes/updates this student's `FlashcardProgress` for the card.
    await expect(page.getByText('apple', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Flip card' }).click();
    await expect(page.getByText(/round fruit/)).toBeVisible();
    await page.getByRole('button', { name: 'Known' }).click();
    // Advances to card 2 of 5 automatically after marking progress.
    await expect(page.getByText('Card 2 of 5')).toBeVisible();

    // Reload the set and confirm the recorded progress persisted server-side (not just
    // local UI state) — T-023's "reopening the set later reflects the previously
    // recorded status" requirement.
    await page.reload();
    // `.first()`: the status badge renders before the "Known" action button in DOM
    // order, and both happen to share the exact text "Known".
    await expect(page.getByText('Known', { exact: true }).first()).toBeVisible();

    // Fill-in-the-blank exercise (T-024).
    await page.getByRole('link', { name: 'Fill in the blank' }).click();
    await page.waitForURL(/\/exercises\/fillBlank$/);
    await expect(page.getByText('breakfast')).toBeVisible();

    const answerInput = page.getByPlaceholder('Type your answer');
    await answerInput.fill('APPLE'); // case-insensitive match (T-024's acceptance criteria)
    await page.getByRole('button', { name: 'Check' }).click();
    await expect(page.getByText('Correct!')).toBeVisible();

    await page.getByRole('button', { name: 'Next' }).click();
    // Next prompt is "happy" — deliberately answered wrong to prove the incorrect path
    // also gives immediate, visible feedback (not just the happy path).
    await page.getByPlaceholder('Type your answer').fill('definitely-not-the-word');
    await page.getByRole('button', { name: 'Check' }).click();
    await expect(page.getByText('Not quite.')).toBeVisible();
    await expect(page.getByText('The correct answer was:')).toBeVisible();
  } finally {
    await context.close();
  }
});
