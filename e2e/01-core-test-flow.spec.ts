import { test, expect } from '@playwright/test';
import {
  createTestWithQuestion,
  generateVariants,
  joinSessionAsStudent,
  newStudentContext,
  newTeacherContext,
  startQrSession,
  uniqueTitle,
} from './utils';

/**
 * T-060 core flow: teacher login -> create test -> generate variants -> start session
 * with QR -> student login -> join -> take test -> auto-grade -> both see result.
 *
 * Two independent browser contexts (teacher / student) simulate two real devices, same
 * as the actual product (teacher's laptop projecting a QR code, student's phone scanning
 * it) — reusing the seeded teacher account and a persistent freshly-registered student
 * (see `global-setup.ts`), per the task's "reuse existing seed data/accounts" guidance.
 */
test('teacher creates a test, student joins via QR, auto-grades, both see the result', async ({
  browser,
  baseURL,
}) => {
  const teacherContext = await newTeacherContext(browser, baseURL!);
  const studentContext = await newStudentContext(browser, baseURL!);
  const teacherPage = await teacherContext.newPage();
  const studentPage = await studentContext.newPage();

  try {
    const title = uniqueTitle('E2E Core Flow Test');

    // Teacher: create a test with one multiple-choice question. The default body (see
    // `TeacherTestEditorPage.tsx`'s `defaultQuestionBody`) marks "Option A" correct —
    // relied on below so the student's answer is deterministically gradeable.
    await createTestWithQuestion(teacherPage, {
      title,
      sectionTitle: 'Section 1',
      questionKind: 'multipleChoice',
    });

    // Generate variants (T-009) — required before any student can join/start this test.
    await generateVariants(teacherPage);

    // Start a QR-join session (T-010) and grab the join URL shown in the panel.
    const joinUrl = await startQrSession(teacherPage);
    expect(joinUrl).toContain('/join/');

    // Student: open the join link (as if scanned), auto-join (already logged in), and
    // land on the take-test runtime (T-011).
    await joinSessionAsStudent(studentPage, joinUrl);
    await expect(studentPage.getByText(title)).toBeVisible();

    // Answer the only question with the correct choice and submit (T-012).
    await studentPage.getByLabel('Option A').check();
    await expect(studentPage.getByText('Answered 1 of 1')).toBeVisible();

    studentPage.once('dialog', (dialog) => dialog.accept());
    await studentPage.getByRole('button', { name: 'Submit test' }).click();
    await studentPage.waitForURL(/\/student\/attempts\/.*\/result/, { timeout: 15_000 });

    // Student sees their own result (T-013 auto-grade + T-014 result view) — 100%,
    // since "Option A" is the seeded-correct default choice.
    await expect(studentPage.getByText('100%')).toBeVisible();
    await expect(studentPage.getByText('1 out of 1 correct')).toBeVisible();

    // Teacher sees the same result from the session's attempts list (T-014) — score and
    // status must agree with what the student saw, not a separately-computed number.
    await teacherPage.getByRole('button', { name: 'View attempts' }).click();
    await teacherPage.waitForURL(/\/teacher\/sessions\/.*\/attempts/);
    await expect(teacherPage.getByText('Submitted')).toBeVisible();
    await expect(teacherPage.getByText('100% (1/1)')).toBeVisible();

    // Per-question breakdown (T-020) is reachable from the teacher's side too.
    await teacherPage.getByRole('link', { name: 'View detail →' }).click();
    await expect(teacherPage.getByText('Correct', { exact: true })).toBeVisible();
  } finally {
    await teacherContext.close();
    await studentContext.close();
  }
});
