import { test, expect } from '@playwright/test';
import {
  assignContentToClass,
  createTestWithQuestion,
  newTeacherContext,
  openClassTab,
  uniqueTitle,
} from './utils';

/**
 * T-075 primary flow (Phase 12), rewritten for the Phase 13 class workspace (T-106/T-101): a
 * teacher gives ONE already-authored test to TWO of their classes without re-authoring it or
 * opening its full editor — the customer's explicit "content is authored once in the Library,
 * then assigned to N classes" requirement. The old "My Content" page and its per-class chips
 * are gone; assigning is now: class workspace → Assignments tab → "Assign new work" dialog →
 * tick the item → confirm (driven by `assignContentToClass` in `utils.ts`).
 *
 * Relies on the seeded teacher account already owning at least 2 classes ("Class 6A",
 * "Class 6B" — `prisma/seed.ts`'s `seedClasses`), each with a current semester. Creates a
 * brand-new test first (via the normal authoring flow) so it starts with ZERO class
 * assignments.
 */
test('teacher assigns an existing test to two classes from the class Assignments tab, then removes it from one', async ({
  browser,
  baseURL,
}) => {
  const teacherContext = await newTeacherContext(browser, baseURL!);
  const teacherPage = await teacherContext.newPage();

  try {
    const title = uniqueTitle('E2E Content Assignment Test');

    // Author a brand-new test the normal way (T-008) — starts with no class assignment.
    await createTestWithQuestion(teacherPage, {
      title,
      sectionTitle: 'Section 1',
      questionKind: 'multipleChoice',
    });

    // Not yet assigned to either class: the "Assign new work" dialog lists it as available,
    // so the class's own Assignments list must NOT contain it.
    for (const className of ['Class 6A', 'Class 6B']) {
      await openClassTab(teacherPage, className, 'Assignments');
      await expect(teacherPage.getByRole('heading', { name: /^Assignments/ })).toBeVisible();
      // The list loads after the heading renders — wait it out so the count check below is real.
      await expect(teacherPage.getByText('Loading...')).toHaveCount(0);
      await expect(teacherPage.getByRole('listitem').filter({ hasText: title })).toHaveCount(0);
    }

    // Assign to BOTH classes through the dialog — no need to reopen the test's editor.
    await assignContentToClass(teacherContext, title, 'Class 6A');
    await assignContentToClass(teacherContext, title, 'Class 6B');

    // Reload each class's Assignments tab to confirm the assignment persisted server-side,
    // not just optimistic local state.
    for (const className of ['Class 6A', 'Class 6B']) {
      await openClassTab(teacherPage, className, 'Assignments');
      await expect(teacherPage.getByRole('listitem').filter({ hasText: title })).toBeVisible();
    }

    // Remove it from Class 6A only ("Remove from class" asks a `window.confirm` first).
    await openClassTab(teacherPage, 'Class 6A', 'Assignments');
    const row6A = teacherPage.getByRole('listitem').filter({ hasText: title });
    await expect(row6A).toBeVisible();
    teacherPage.once('dialog', (dialog) => dialog.accept());
    await row6A.getByRole('button', { name: 'Remove from class' }).click();
    await expect(teacherPage.getByRole('listitem').filter({ hasText: title })).toHaveCount(0);

    // Still assigned to Class 6B.
    await openClassTab(teacherPage, 'Class 6B', 'Assignments');
    await expect(teacherPage.getByRole('listitem').filter({ hasText: title })).toBeVisible();
  } finally {
    await teacherContext.close();
  }
});
