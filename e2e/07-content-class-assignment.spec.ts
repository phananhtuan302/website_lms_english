import { test, expect } from '@playwright/test';
import { createTestWithQuestion, newTeacherContext, uniqueTitle } from './utils';

/**
 * T-075 primary flow (Phase 12): a teacher assigns one already-authored test to TWO of
 * their classes from the consolidated "My Content" page, in a few clicks, WITHOUT
 * re-authoring it or opening its full editor — the customer's explicit "content is
 * authored once, then assigned to N classes from one page" requirement.
 *
 * Relies on the seeded teacher account already owning at least 2 classes ("Class 6A",
 * "Class 6B" — `prisma/seed.ts`'s `seedClasses`). Creates a brand-new test first (via the
 * normal authoring flow) so it starts with ZERO class assignments, then assigns it via
 * `/teacher/content` alone.
 */
test('teacher assigns an existing test to two classes from the My Content page, then unassigns one', async ({
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

    // Jump to the consolidated "My Content" page (T-075) — no need to reopen this test's
    // editor at all from here on.
    await teacherPage.goto('/teacher/content');
    await expect(teacherPage.getByRole('heading', { name: 'My Content' })).toBeVisible();

    const row = teacherPage.getByRole('listitem').filter({ hasText: title });
    await expect(row).toBeVisible();

    const class6AChip = row.getByRole('button', { name: 'Class 6A' });
    const class6BChip = row.getByRole('button', { name: 'Class 6B' });

    // Not yet assigned to either class.
    await expect(class6AChip).toHaveAttribute('aria-pressed', 'false');
    await expect(class6BChip).toHaveAttribute('aria-pressed', 'false');

    // Assign to BOTH classes, a click each — no separate "save" step/page reload.
    await class6AChip.click();
    await expect(class6AChip).toHaveAttribute('aria-pressed', 'true');
    await class6BChip.click();
    await expect(class6BChip).toHaveAttribute('aria-pressed', 'true');

    // Reload the page to confirm the assignment actually persisted server-side, not just
    // optimistic local state.
    await teacherPage.reload();
    const rowAfterReload = teacherPage.getByRole('listitem').filter({ hasText: title });
    await expect(rowAfterReload.getByRole('button', { name: 'Class 6A' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(rowAfterReload.getByRole('button', { name: 'Class 6B' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Unassign one of the two — toggling off works the same way, immediately.
    await rowAfterReload.getByRole('button', { name: 'Class 6A' }).click();
    await expect(rowAfterReload.getByRole('button', { name: 'Class 6A' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(rowAfterReload.getByRole('button', { name: 'Class 6B' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  } finally {
    await teacherContext.close();
  }
});
