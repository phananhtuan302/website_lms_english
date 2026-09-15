import { test, expect } from '@playwright/test';
import {
  assignContentToClass,
  createTestWithQuestion,
  generateVariants,
  newStudentContext,
  newTeacherContext,
  uniqueTitle,
} from './utils';

/**
 * T-060: Writing anti-copy-paste enforcement (T-043). Verified via simulated
 * `ClipboardEvent`s dispatched directly on the essay textarea (a real DOM event, so
 * React's delegated `onPaste`/`onCopy` handlers in `TakeTestPage.tsx` actually run) —
 * exactly the acceptance criteria's "verified via a simulated paste/copy event in an
 * automated test, not just manual inspection", not a manual/visual check.
 */
test('pasting into and copying out of an essay answer is blocked with a visible warning', async ({
  browser,
  baseURL,
}) => {
  const teacherContext = await newTeacherContext(browser, baseURL!);
  const studentContext = await newStudentContext(browser, baseURL!);
  const teacherPage = await teacherContext.newPage();
  const studentPage = await studentContext.newPage();

  try {
    const title = uniqueTitle('E2E Writing Test');

    await createTestWithQuestion(teacherPage, {
      title,
      sectionTitle: 'Writing Section',
      questionKind: 'essay',
    });
    await generateVariants(teacherPage);

    // T-076 (Phase 12): self-practice visibility now requires class assignment — assign
    // this freshly-authored test to the e2e student's own class ("Class 6A").
    await assignContentToClass(teacherContext, title, 'Class 6A');

    // Essay questions are taken via self-practice (no session/QR needed for this flow).
    await studentPage.goto('/student/practice');
    const row = studentPage.getByRole('listitem').filter({ hasText: title });
    await row.getByRole('button', { name: 'Practice →' }).click();
    await studentPage.waitForURL(/\/student\/attempts\/[a-zA-Z0-9-]+$/, { timeout: 15_000 });

    const essay = studentPage.getByPlaceholder(/Write your response here/);
    await expect(essay).toBeVisible();

    // --- Paste is blocked: content is never inserted --------------------------------
    await essay.evaluate((el) => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'PASTED-CONTENT-SHOULD-NOT-APPEAR');
      const event = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      el.dispatchEvent(event);
    });
    await expect(studentPage.getByText('Pasting into this answer is not allowed.')).toBeVisible();
    await expect(essay).toHaveValue('');

    // --- Normal typing still works (paste-blocking must not affect it) --------------
    await essay.fill('This is my own typed answer, written by hand.');
    await expect(essay).toHaveValue('This is my own typed answer, written by hand.');

    // --- Copy out of the field is blocked --------------------------------------------
    await essay.evaluate((el) => {
      const dt = new DataTransfer();
      const event = new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true });
      el.dispatchEvent(event);
    });
    await expect(studentPage.getByText('Copying text out of this answer is not allowed.')).toBeVisible();

    // --- Cut out of the field is blocked ----------------------------------------------
    await essay.evaluate((el) => {
      const dt = new DataTransfer();
      const event = new ClipboardEvent('cut', { clipboardData: dt, bubbles: true, cancelable: true });
      el.dispatchEvent(event);
    });
    await expect(studentPage.getByText('Copying text out of this answer is not allowed.')).toBeVisible();
    // The cut event's preventDefault stops content removal — the typed text survives.
    await expect(essay).toHaveValue('This is my own typed answer, written by hand.');
  } finally {
    await teacherContext.close();
    await studentContext.close();
  }
});
