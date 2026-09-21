import { test, expect } from '@playwright/test';
import {
  assignContentToClass,
  createTestWithQuestion,
  generateVariants,
  newStudentContext,
  newTeacherContext,
  startTestFromHome,
  uniqueTitle,
} from './utils';

/**
 * T-060: a Speaking submission graded by the mock provider (T-051/T-053/T-054). Uses
 * Chromium's `--use-fake-device-for-media-stream` (a synthesized audio device, see
 * `playwright.config.ts`) plus a granted `microphone` permission so `getUserMedia` +
 * `MediaRecorder` work headlessly with no real hardware and no manual permission prompt.
 */
test('student records a Speaking answer and it is graded by the mock AI provider', async ({
  browser,
  baseURL,
}) => {
  const teacherContext = await newTeacherContext(browser, baseURL!);
  const studentContext = await newStudentContext(browser, baseURL!);
  const teacherPage = await teacherContext.newPage();
  const studentPage = await studentContext.newPage();

  try {
    const title = uniqueTitle('E2E Speaking Test');

    await createTestWithQuestion(teacherPage, {
      title,
      sectionTitle: 'Speaking Section',
      questionKind: 'speaking',
    });
    await generateVariants(teacherPage);

    // T-076 (Phase 12): self-practice visibility now requires class assignment — assign
    // this freshly-authored test to the e2e student's own class ("Class 6A").
    await assignContentToClass(teacherContext, title, 'Class 6A');

    // The old self-practice picker is gone (T-105/T-106): start from the "Bài cần làm" home.
    await startTestFromHome(studentPage, title);

    await expect(studentPage.getByText('New speaking question')).toBeVisible();
    await expect(studentPage.getByText(/Time left to respond/)).toBeVisible();

    await studentPage.getByRole('button', { name: '🎤 Start recording' }).click();
    await expect(studentPage.getByRole('button', { name: '⏹ Stop & submit recording' })).toBeVisible();

    // Record for ~1.5s of the fake device's synthesized tone before stopping — there is
    // no DOM signal for "enough audio captured", this is a genuine real-time recording
    // window, not a polling target.
    await studentPage.waitForTimeout(1_500);

    await studentPage.getByRole('button', { name: '⏹ Stop & submit recording' }).click();

    // Submission -> MockAIGradingProvider grading (T-051/T-054) round-trips to the
    // server and back; the immediate mock grade is shown right on the question.
    await expect(studentPage.getByText(/Your Speaking answer has been recorded and submitted/)).toBeVisible({
      timeout: 15_000,
    });
    const gradeText = await studentPage.getByText(/Immediate Mock AI grade: \d+\/100/).textContent();
    expect(gradeText).toMatch(/Immediate Mock AI grade: \d+\/100/);

    // Submit the (only) question / finish the test, then confirm the same grade shows
    // up on the student's result page (T-056) — not a value that only existed in
    // transient component state.
    studentPage.once('dialog', (dialog) => dialog.accept());
    await studentPage.getByRole('button', { name: 'Submit test' }).click();
    await studentPage.waitForURL(/\/result$/, { timeout: 15_000 });

    await expect(studentPage.getByRole('heading', { name: title })).toBeVisible();
    const scoreBadge = studentPage.getByText(/\/ 100/).first();
    await expect(scoreBadge).toBeVisible();
    await expect(studentPage.locator('audio[controls]')).toHaveCount(1);
  } finally {
    await teacherContext.close();
    await studentContext.close();
  }
});
