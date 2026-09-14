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
 * T-060: a Listening session with teacher-controlled playback (T-041). During a LIVE
 * (QR-joined) session, a student must never see their own Play button for a Listening
 * section — audio only plays for them when the teacher presses Play from the session's
 * live monitor, broadcast over the realtime channel built in T-015.
 */
test('teacher controls synchronized Listening playback during a live session', async ({
  browser,
  baseURL,
}) => {
  const teacherContext = await newTeacherContext(browser, baseURL!);
  const studentContext = await newStudentContext(browser, baseURL!);
  const teacherPage = await teacherContext.newPage();
  const studentPage = await studentContext.newPage();

  try {
    const title = uniqueTitle('E2E Listening Test');

    await createTestWithQuestion(teacherPage, {
      title,
      sectionTitle: 'Listening Section',
      questionKind: 'multipleChoice',
    });

    // Attach a placeholder audio URL to the section (T-040/T-041's documented
    // "URL-shaped string, never validated to resolve" convention — same as the seed
    // script's flashcard audio fields).
    await teacherPage.getByText('Reading passage / Listening audio (optional)').click();
    await teacherPage
      .getByLabel(/Audio URL \(T-040\/T-041/)
      .fill('https://example.com/placeholder-assets/audio/e2e-listening.mp3');
    await teacherPage.getByLabel(/Audio URL \(T-040\/T-041/).blur();
    await expect(teacherPage.getByText('Listening audio')).toBeVisible();

    await generateVariants(teacherPage);
    const joinUrl = await startQrSession(teacherPage);

    await joinSessionAsStudent(studentPage, joinUrl);

    // T-041: no student-facing Play button during a live session — only the
    // teacher-controlled message, and no native <audio> controls exposed either.
    await expect(
      studentPage.getByText('Your teacher controls audio playback for this section during a live session.'),
    ).toBeVisible();
    await expect(studentPage.getByRole('button', { name: '▶ Play audio' })).toHaveCount(0);

    // Teacher: open the live monitor and press Play for this Listening section — this
    // broadcasts `audio:play` over the socket room to every joined student.
    await teacherPage.getByRole('button', { name: 'Live monitor' }).click();
    await teacherPage.waitForURL(/\/teacher\/sessions\/.*\/live/);
    await expect(teacherPage.getByText('Listening playback control')).toBeVisible();

    // Best-effort real evidence that the broadcast actually reached the student's page
    // and triggered a playback attempt: the student's <audio> element has
    // `preload="none"`, so calling `.play()` only issues a network request for the
    // clip at the moment playback is actually attempted — captured in parallel with the
    // teacher's click since the event round-trip is near-instant. Soft assertion (does
    // not fail the test) since this outbound request may be blocked/DNS-fail in a
        // sandboxed CI network — the ack-based assertion below is the primary proof.
    const audioRequestPromise = studentPage
      .waitForRequest((req) => req.url().includes('e2e-listening.mp3'), { timeout: 5_000 })
      .catch(() => null);

    await teacherPage.getByRole('button', { name: '▶ Play for students' }).click();
    await expect(teacherPage.getByText('Played for all connected students.')).toBeVisible();

    const audioRequest = await audioRequestPromise;
    test.info().annotations.push({
      type: 'listening-playback-network-evidence',
      description: audioRequest
        ? `Student browser issued a request for the broadcast audio clip: ${audioRequest.url()}`
        : 'No outbound network request observed for the audio clip within 5s (soft check only — placeholder URL may not resolve in this environment).',
    });
  } finally {
    await teacherContext.close();
    await studentContext.close();
  }
});
