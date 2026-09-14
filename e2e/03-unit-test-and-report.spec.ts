import { test, expect } from '@playwright/test';
import {
  createTestWithQuestion,
  generateVariants,
  newStudentContext,
  newTeacherContext,
  uniqueTitle,
} from './utils';

/**
 * T-060: a Unit Test (T-036) + its report/leaderboard (T-037).
 *
 * Unlike the core QR-session flow, a Unit Test is taken via the student's own
 * self-practice picker (`/student/unit-tests`), never a QR session — but it still needs
 * at least one generated variant first (`findOrCreateAttempt` rejects an attempt start
 * otherwise, same rule as the QR flow).
 */
test('teacher creates a published Unit Test, student takes it, both see the unit leaderboard', async ({
  browser,
  baseURL,
}) => {
  const teacherContext = await newTeacherContext(browser, baseURL!);
  const studentContext = await newStudentContext(browser, baseURL!);
  const teacherPage = await teacherContext.newPage();
  const studentPage = await studentContext.newPage();

  try {
    const title = uniqueTitle('E2E Unit Test');

    const testId = await createTestWithQuestion(teacherPage, {
      title,
      sectionTitle: 'Unit Test Section',
      questionKind: 'multipleChoice',
    });

    // Tag as a Unit Test (T-036): pick the seeded "Unit 1 — Getting Started" curriculum
    // unit, set the test type, and publish it (otherwise students can't see/start it).
    // Each of these three fields saves via its own independent `PATCH .../tests/:id`
    // call (`TeacherTestEditorPage.tsx`'s `handleSaveUnit`/`handleSaveTestType`/
    // `handleSavePublished`) — each awaited serially below so a later response can never
    // overwrite an earlier field with stale data (a real race if fired without waiting).
    const patchUrl = (r: import('@playwright/test').Response) =>
      r.url().includes(`/api/teacher/tests/${testId}`) && r.request().method() === 'PATCH';

    await Promise.all([
      teacherPage.waitForResponse(patchUrl),
      teacherPage.getByLabel('Unit (optional, T-018)').selectOption({ label: 'Unit 1 — Getting Started' }),
    ]);
    await Promise.all([
      teacherPage.waitForResponse(patchUrl),
      teacherPage.getByLabel('Test type (T-036)').selectOption('unitTest'),
    ]);
    // `.click()`, not `.check()` — the checkbox is a fully-controlled React input whose
    // DOM `checked` briefly reverts between the click and this field's own PATCH
    // resolving (`handleSavePublished` is async), which trips `.check()`'s own stricter
    // built-in "did the click actually take" verification. The `expect(...).toBeChecked()`
    // poll below is the real assertion and tolerates that transient flicker.
    await Promise.all([
      teacherPage.waitForResponse(patchUrl),
      teacherPage.getByLabel(/Published/).click(),
    ]);
    await expect(teacherPage.getByLabel(/Published/)).toBeChecked();

    await generateVariants(teacherPage);

    const leaderboardLink = teacherPage.getByRole('link', { name: "View this unit's leaderboard →" });
    await expect(leaderboardLink).toBeVisible();
    const unitHref = await leaderboardLink.getAttribute('href');
    expect(unitHref).toMatch(/\/units\/.+\/leaderboard/);

    // Student: find the published Unit Test grouped under its unit and take it.
    await studentPage.goto('/student/unit-tests');
    await expect(studentPage.getByText('Unit 1 — Getting Started')).toBeVisible();
    const testRow = studentPage.getByRole('listitem').filter({ hasText: title });
    await testRow.getByRole('button', { name: 'Take test →' }).click();
    await studentPage.waitForURL(/\/student\/attempts\/[a-zA-Z0-9-]+$/, { timeout: 15_000 });

    await studentPage.getByLabel('Option A').check();
    studentPage.once('dialog', (dialog) => dialog.accept());
    await studentPage.getByRole('button', { name: 'Submit test' }).click();
    await studentPage.waitForURL(/\/result$/, { timeout: 15_000 });
    await expect(studentPage.getByText('100%')).toBeVisible();

    // Student's own Unit Tests list now shows the score directly, without re-opening it.
    await studentPage.goto('/student/unit-tests');
    await expect(studentPage.getByText('Score: 100%')).toBeVisible();

    // Unit leaderboard/report (T-037), built on the shared T-019 reporting engine —
    // checked from BOTH roles per its "visible to both teacher and students" criteria.
    await studentPage.goto(unitHref!);
    await expect(studentPage.getByText('Class average score:')).toBeVisible();
    await expect(studentPage.getByText('100%').first()).toBeVisible();
    await expect(studentPage.getByText('(you)')).toBeVisible();

    // Scoped to a specific row (`getByRole('row', ...)`), not a bare name/text lookup —
    // this dev DB accumulates other "E2E Student" fixture rows (0 attempts) from
    // previous suite runs and unrelated units, so a plain `getByText('E2E Student')` is
    // ambiguous by design of a real, growing leaderboard.
    await teacherPage.goto(unitHref!);
    await expect(teacherPage.getByText('Class average score:')).toBeVisible();
    await expect(teacherPage.getByRole('row', { name: /#1 E2E Student 1 100%/ })).toBeVisible();
  } finally {
    await teacherContext.close();
    await studentContext.close();
  }
});
