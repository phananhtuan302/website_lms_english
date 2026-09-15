import fs from 'node:fs';
import path from 'node:path';
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

export const AUTH_DIR = path.join(__dirname, '.auth');
export const TEACHER_STORAGE = path.join(AUTH_DIR, 'teacher.json');
export const STUDENT_STORAGE = path.join(AUTH_DIR, 'student.json');

export interface StudentCredentials {
  email: string;
  password: string;
}

export function studentCredentials(): StudentCredentials {
  return JSON.parse(fs.readFileSync(path.join(AUTH_DIR, 'student-credentials.json'), 'utf-8'));
}

/** Unique-enough title per spec run so re-running the suite never collides with a
 * previous run's leftover Test rows (each spec creates its own fresh Test rather than
 * reusing one across runs — see `playwright.config.ts`'s doc comment on why the account
 * is shared but content isn't). */
export function uniqueTitle(prefix: string): string {
  return `${prefix} ${Date.now()}-${Math.floor(Math.random() * 100_000)}`;
}

export async function newTeacherContext(browser: Browser, baseURL: string): Promise<BrowserContext> {
  return browser.newContext({ storageState: TEACHER_STORAGE, baseURL });
}

export async function newStudentContext(browser: Browser, baseURL: string): Promise<BrowserContext> {
  return browser.newContext({ storageState: STUDENT_STORAGE, baseURL });
}

/**
 * Teacher-side authoring helper: creates a brand-new test, adds one section, adds one
 * question via the default-body "+ <type>" buttons (T-008's authoring UI), and generates
 * variants (T-009) — every test-taking flow (QR session AND self-practice) requires at
 * least one variant to exist before a student can start it (`findOrCreateAttempt`
 * returns `'no-variants'` otherwise), so this is always the last step.
 *
 * Returns the test id (parsed from the URL after creation) so callers can navigate back
 * to the editor later (e.g. to tag `testType`/`unitId` or start a QR session).
 */
export async function createTestWithQuestion(
  page: Page,
  opts: { title: string; sectionTitle: string; questionKind: 'multipleChoice' | 'essay' | 'speaking' },
): Promise<string> {
  await page.goto('/teacher/tests');
  await page.getByLabel('New test title').fill(opts.title);
  await page.getByRole('button', { name: 'Create test' }).click();
  await page.waitForURL(/\/teacher\/tests\/[a-zA-Z0-9-]+$/);
  const testId = page.url().split('/teacher/tests/')[1];

  await page.getByLabel('New section title').fill(opts.sectionTitle);
  await page.getByRole('button', { name: 'Add section' }).click();
  // The section list renders the new section's title into an editable <input> (not a
  // heading/button) — wait for it by its current value before adding a question to it.
  await page.locator(`input[value="${opts.sectionTitle}"]`).waitFor();

  const buttonLabel =
    opts.questionKind === 'multipleChoice'
      ? '+ Multiple choice'
      : opts.questionKind === 'essay'
        ? '+ Essay (Writing)'
        : '+ Speaking';
  await page.getByRole('button', { name: buttonLabel }).click();

  // Confirm the question actually saved+rendered before the caller moves on (e.g. to
  // generate variants) — each default body has a distinctive, known starting value.
  if (opts.questionKind === 'multipleChoice') {
    await page.locator('input[value="Option A"]').first().waitFor();
  } else if (opts.questionKind === 'essay') {
    await page.getByText('New essay question').waitFor();
  } else {
    await page.getByText('New speaking question').waitFor();
  }

  return testId;
}

export async function generateVariants(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Generate 2 more variants' }).click();
  await page.getByText(/Mã đề/).first().waitFor();
}

/** Starts a new QR-join session for whichever test's editor page is currently open and
 * returns the join URL shown in the panel (T-010). */
export async function startQrSession(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Start new session' }).click();
  // Text-based (not CSS-class-based) locator per the join-link paragraph's actual
  // rendered content (a full `http://.../join/<token>` URL) — resilient to concurrent
  // CSS-class-only styling changes elsewhere in the app.
  const joinUrlLocator = page.getByText(/^https?:\/\/.*\/join\//);
  await joinUrlLocator.waitFor();
  const joinUrl = (await joinUrlLocator.textContent())?.trim();
  if (!joinUrl) throw new Error('Join URL not found after starting session.');
  return joinUrl;
}

/** Joins a QR/link session as a student and lands on the take-test runtime (or the
 * result page, if already submitted) — mirrors `JoinPage.tsx`'s auto-join behavior. */
export async function joinSessionAsStudent(page: Page, joinUrl: string): Promise<void> {
  await page.goto(joinUrl);
  await page.waitForURL(/\/student\/attempts\/[a-zA-Z0-9-]+(\/result)?$/, { timeout: 15_000 });
}

/**
 * T-076 (Phase 12): student-facing visibility (self-practice list, QR join, flashcard
 * sets, Grammar topics) is now scoped to the acting student's own `Class` — content with
 * zero class assignments is invisible/unjoinable to every student. `createTestWithQuestion`
 * above deliberately does NOT auto-assign a class (that would break
 * `07-content-class-assignment.spec.ts`'s own explicit "starts unassigned" premise), so
 * every OTHER spec that has the shared e2e student (registered into "Class 6A" per
 * `global-setup.ts`) actually join/self-practice a freshly-authored test needs this one
 * extra step: assign that content to "Class 6A" via the consolidated "My Content" page
 * (T-075) — the exact same UI flow `07-content-class-assignment.spec.ts` already
 * exercises directly, reused here as a fixture-setup helper instead of a duplicated
 * implementation.
 *
 * Runs on a FRESH page in the teacher's own context (never the caller's already-open
 * `teacherPage`), so it never disturbs a spec's existing navigation state on that page
 * (e.g. a still-open test editor a later step needs to return to, such as
 * `04-listening-live-playback.spec.ts`'s "Live monitor" button).
 *
 * Idempotent (checks `aria-pressed` before clicking) so re-running the suite against a
 * DB where a SEED item (e.g. `02-flashcard-and-exercise.spec.ts`'s reused flashcard set)
 * was already assigned in a previous run never accidentally toggles it back off.
 */
export async function assignContentToClass(
  teacherContext: BrowserContext,
  itemTitle: string,
  className: string,
): Promise<void> {
  const page = await teacherContext.newPage();
  try {
    await page.goto('/teacher/content');
    const row = page.getByRole('listitem').filter({ hasText: itemTitle });
    await expect(row).toBeVisible();

    const chip = row.getByRole('button', { name: className });
    const alreadyAssigned = (await chip.getAttribute('aria-pressed')) === 'true';
    if (!alreadyAssigned) {
      await chip.click();
      await expect(chip).toHaveAttribute('aria-pressed', 'true');
    }
  } finally {
    await page.close();
  }
}
