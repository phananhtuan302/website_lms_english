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
 * Phase 13 class-workspace helpers. Every locator below is the English (`en.json`) text of
 * the real component — the same premise as the rest of this suite (see the other helpers'
 * English button names).
 */

/** Creates a class from the class-card home ("+ New class" → name → "Create class") and waits
 * for its card to appear. A brand-new class has no semester yet — see `ensureClassSemester`. */
export async function createClass(page: Page, name: string): Promise<void> {
  await page.goto('/teacher/classes');
  await page.getByRole('button', { name: '+ New class' }).first().click();
  await page.getByLabel('Class name').fill(name);
  await page.getByRole('button', { name: 'Create class' }).click();
  await expect(classCardLink(page, name)).toBeVisible();
}

/** The class-card link whose heading is exactly `className`. */
function classCardLink(page: Page, className: string) {
  return page.getByRole('link').filter({ has: page.getByRole('heading', { name: className, exact: true }) });
}

/** From the class-card home, opens `className` and switches to one of its tabs
 * (`Overview` · `Assignments` · `Students` · `Grades` · `Statistics` · `Settings`). */
export async function openClassTab(page: Page, className: string, tabName: string): Promise<void> {
  await page.goto('/teacher/classes');
  await classCardLink(page, className).click();
  await page.getByRole('navigation', { name: 'Class sections' }).getByRole('link', { name: tabName }).click();
}

/** A class needs a current semester before work can be assigned (T-099). If the workspace
 * still shows the "-- Choose a semester --" placeholder, picks the first real semester and
 * accepts the confirm dialog; a class that already has one is left untouched. */
export async function ensureClassSemester(page: Page): Promise<void> {
  const semesterSelect = page.getByLabel('Semester').first();
  // Disabled while the semester list is still loading.
  await expect(semesterSelect).toBeEnabled();
  if ((await semesterSelect.inputValue()) !== '') return;
  page.once('dialog', (dialog) => dialog.accept());
  await semesterSelect.selectOption({ index: 1 });
  await expect(page.getByText(/This class has no semester yet/)).toHaveCount(0);
}

export type AssignableKind = 'test' | 'flashcardSet' | 'grammarTopic';

const ASSIGN_DIALOG_TAB: Record<AssignableKind, string> = {
  test: 'Tests',
  flashcardSet: 'Flashcard sets',
  grammarTopic: 'Grammar',
};

/**
 * T-076 (Phase 12) made student-facing visibility (self-practice list, QR join, flashcard
 * sets, Grammar topics) depend on the acting student's own `Class`: content with zero class
 * assignments is invisible/unjoinable to every student. `createTestWithQuestion` above
 * deliberately does NOT auto-assign a class (that would break
 * `07-content-class-assignment.spec.ts`'s own "starts unassigned" premise), so every OTHER
 * spec that has the shared e2e student (registered into "Class 6A" per `global-setup.ts`)
 * actually join/practice a freshly-authored item needs this one extra step.
 *
 * T-106 (Phase 13): the old "My Content" page and its per-class chips are gone. The flow is
 * now class workspace → Assignments tab → "Assign new work" dialog → tick the item → confirm
 * — the exact UI flow `07-content-class-assignment.spec.ts` exercises directly, reused here
 * as a fixture-setup helper.
 *
 * Runs on a FRESH page in the teacher's own context (never the caller's already-open
 * `teacherPage`), so it never disturbs a spec's existing navigation state on that page
 * (e.g. a still-open test editor a later step needs to return to, such as
 * `04-listening-live-playback.spec.ts`'s "Live monitor" button).
 *
 * Idempotent: the dialog only lists items NOT yet assigned to the class this semester, so an
 * item that is already assigned (e.g. `02-flashcard-and-exercise.spec.ts`'s reused seed set on
 * a second run) simply isn't offered — the helper closes the dialog and just checks the item
 * is listed on the Assignments tab.
 */
export async function assignContentToClass(
  teacherContext: BrowserContext,
  itemTitle: string,
  className: string,
  kind: AssignableKind = 'test',
): Promise<void> {
  const page = await teacherContext.newPage();
  try {
    await openClassTab(page, className, 'Assignments');
    await ensureClassSemester(page);

    await page.getByRole('button', { name: 'Assign new work' }).click();
    const dialog = page.getByRole('dialog');
    // The Library loads after the dialog opens: wait for the type tabs (something to assign)
    // or for one of the "nothing left to assign" states (which carry a "Go to Library" link).
    await dialog.getByRole('tablist').or(dialog.getByRole('link', { name: 'Go to Library' })).first().waitFor();

    if ((await dialog.getByRole('tablist').count()) > 0) {
      await dialog.getByRole('tab', { name: ASSIGN_DIALOG_TAB[kind] }).click();
      await dialog.getByLabel('Search by name...').fill(itemTitle);
      const checkbox = dialog.getByRole('checkbox', { name: itemTitle });
      await checkbox
        .or(dialog.getByText('No items match your search.'))
        .or(dialog.getByText('Nothing of this type left to assign.'))
        .first()
        .waitFor();
      if ((await checkbox.count()) > 0) {
        await checkbox.check();
        await dialog.getByRole('button', { name: /^Assign [0-9]+ items? to class$/ }).click();
        // A fully successful run closes the dialog by itself.
        await expect(dialog).toBeHidden();
      } else {
        await dialog.getByRole('button', { name: 'Cancel' }).click();
      }
    } else {
      await dialog.getByRole('button', { name: 'Close', exact: true }).first().click();
    }

    await expect(page.getByRole('listitem').filter({ hasText: itemTitle })).toBeVisible();
  } finally {
    await page.close();
  }
}

/**
 * Student side of Phase 13 (T-105/T-106): the old self-practice pickers (`/student/practice`,
 * `/student/unit-tests`) are gone — every assigned test, Unit Test and Vocabulary Check is a
 * row on the "Bài cần làm" home (`/student/dashboard`). Finds the row for `title`, clicks its
 * "Start" button and waits for the take-test runtime.
 */
export async function startTestFromHome(page: Page, title: string): Promise<void> {
  await page.goto('/student/dashboard');
  const row = page.getByRole('listitem').filter({ hasText: title });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Start' }).click();
  await page.waitForURL(/\/student\/attempts\/[a-zA-Z0-9-]+$/, { timeout: 15_000 });
}
