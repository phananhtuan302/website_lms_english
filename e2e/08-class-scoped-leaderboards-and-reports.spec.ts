import { test, expect } from '@playwright/test';
import {
  createTestWithQuestion,
  generateVariants,
  newTeacherContext,
  uniqueTitle,
} from './utils';

/**
 * T-077 (Phase 12) — the core proof this task actually works: the SAME `Test`, assigned
 * to TWO different classes, taken by one student per class with a DELIBERATELY different
 * score (100% vs 0%), must produce two completely separate Unit Test leaderboards/reports
 * — one per class — never merged, even though both classes share the same teacher and the
 * exact same underlying `Test` row. Also confirms a teacher's class filter switches the
 * displayed numbers correctly, and that each student's own (picker-less) leaderboard view
 * never shows the other class's data.
 *
 * Uses two BRAND-NEW, uniquely-named classes (not the shared seeded "Class 6A"/"Class 6B"
 * — this dev DB has accumulated many students/classes from prior runs) so every assertion
 * below can be an exact number (1 attempt, 100% or 0%) rather than a fuzzy "at least
 * this row is somewhere in a big list" check.
 */
test('same Test assigned to two classes produces separate, correctly class-scoped Unit Test leaderboards and reports', async ({
  browser,
  baseURL,
}) => {
  // This scenario chains a lot more sequential steps than a typical spec (2 classes, one
  // test authored + tagged + variants, class assignment, TWO full student registrations,
  // TWO full test-taking runs, then several report/leaderboard page checks) — the
  // default 60s budget (`playwright.config.ts`) is comfortably enough in isolation but
  // too tight when several agents are hammering the same shared dev server/DB at once.
  test.setTimeout(240_000);

  const teacherContext = await newTeacherContext(browser, baseURL!);
  const teacherPage = await teacherContext.newPage();

  const classAName = uniqueTitle('T077 Class A');
  const classBName = uniqueTitle('T077 Class B');
  const title = uniqueTitle('E2E Class-Scoped Unit Test');

  let studentAContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  let studentBContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;

  try {
    // --- 1. Teacher creates two fresh, empty classes -----------------------------------
    await teacherPage.goto('/teacher/classes');
    for (const name of [classAName, classBName]) {
      await teacherPage.getByLabel('Class name').fill(name);
      await teacherPage.getByRole('button', { name: 'Add class' }).click();
      await teacherPage.locator(`input[value="${name}"]`).waitFor();
    }

    // --- 2. Teacher authors a test, tags it as a published Unit Test -------------------
    const testId = await createTestWithQuestion(teacherPage, {
      title,
      sectionTitle: 'Class Scoping Section',
      questionKind: 'multipleChoice',
    });

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

    // --- 3. Teacher assigns the SAME test to BOTH new classes from My Content ----------
    await teacherPage.goto('/teacher/content');
    const contentRow = teacherPage.getByRole('listitem').filter({ hasText: title });
    await expect(contentRow).toBeVisible();
    await contentRow.getByRole('button', { name: classAName }).click();
    await expect(contentRow.getByRole('button', { name: classAName })).toHaveAttribute('aria-pressed', 'true');
    await contentRow.getByRole('button', { name: classBName }).click();
    await expect(contentRow.getByRole('button', { name: classBName })).toHaveAttribute('aria-pressed', 'true');

    // --- 4. Look up the two new classes' ids (public, unauthenticated endpoint) so the
    // registration page's class picker can be driven reliably by VALUE rather than by its
    // templated "{{className}} — Teacher: {{teacherName}}" option label text.
    const publicClasses = (await (await teacherPage.request.get('/api/classes')).json()) as Array<{
      id: string;
      name: string;
    }>;
    const classAId = publicClasses.find((c) => c.name === classAName)?.id;
    const classBId = publicClasses.find((c) => c.name === classBName)?.id;
    expect(classAId, 'Class A should be in the public class list').toBeTruthy();
    expect(classBId, 'Class B should be in the public class list').toBeTruthy();

    // --- 5. Register one fresh student per class ---------------------------------------
    async function registerStudent(name: string, classId: string) {
      const context = await browser.newContext({ baseURL });
      const page = await context.newPage();
      const email = `e2e-${uniqueTitle('student').replace(/\s+/g, '-').toLowerCase()}@example.com`;
      await page.goto('/register');
      // `getByLabel('Name')` alone is ambiguous on this page (Chromium computes the class
      // `<select>`'s accessible name in a way that also satisfies a loose "Name" match) —
      // scope to the actual textbox role instead, same disambiguation Playwright itself
      // suggested in the strict-mode-violation error.
      await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
      await page.getByLabel('Email').fill(email);
      // Not `exact: true` — the label's accessible name also includes the helper text
      // ("At least 8 characters."), same note as `global-setup.ts`'s identical field.
      await page.getByLabel('Password').fill('e2e-student-password-123');
      await page.getByLabel('Select your class').selectOption({ value: classId! });
      await page.getByRole('button', { name: 'Create account' }).click();
      await page.waitForURL(/\/student\/dashboard/, { timeout: 15_000 });
      return { context, page };
    }

    const studentA = await registerStudent('E2E Class A Student', classAId!);
    studentAContext = studentA.context;
    const studentB = await registerStudent('E2E Class B Student', classBId!);
    studentBContext = studentB.context;

    // --- 6. Each student takes the SAME Unit Test, deliberately scoring differently ----
    async function takeUnitTest(page: import('@playwright/test').Page, correctAnswer: boolean) {
      await page.goto('/student/unit-tests');
      await expect(page.getByText('Unit 1 — Getting Started')).toBeVisible();
      const row = page.getByRole('listitem').filter({ hasText: title });
      await row.getByRole('button', { name: 'Take test →' }).click();
      await page.waitForURL(/\/student\/attempts\/[a-zA-Z0-9-]+$/, { timeout: 15_000 });
      // Selecting a choice fires a FIRE-AND-FORGET autosave PUT
      // (`TakeTestPage.tsx`'s `handleSelectChoice` → `studentApi.saveAnswer`, never
      // awaited by the click handler) — `/submit` grades whatever is already persisted in
      // the DB at that instant, so clicking Submit before this PUT lands is a genuine race
      // that silently grades the question as unanswered. Waiting for its response here
      // (not a fixed sleep) makes this deterministic regardless of server load.
      const saveAnswerUrl = (r: import('@playwright/test').Response) =>
        /\/api\/attempts\/[^/]+\/answers\/[^/]+$/.test(r.url()) && r.request().method() === 'PUT';
      await Promise.all([
        page.waitForResponse(saveAnswerUrl),
        page.getByLabel(correctAnswer ? 'Option A' : 'Option B').check(),
      ]);
      page.once('dialog', (dialog) => dialog.accept());
      await page.getByRole('button', { name: 'Submit test' }).click();
      await page.waitForURL(/\/result$/, { timeout: 15_000 });
    }

    await takeUnitTest(studentA.page, true); // Class A: 100%
    await expect(studentA.page.getByText('100%')).toBeVisible();
    await takeUnitTest(studentB.page, false); // Class B: 0%
    await expect(studentB.page.getByText('0%')).toBeVisible();

    // --- 7. Cross-class isolation, verified via DIRECT API calls (not more UI navigation)
    // — this is the same shared dev server/DB under heavy concurrent load from other
    // agents (visible `ws proxy error: ECONNABORTED` noise throughout this run), so
    // hitting the JSON endpoints directly with each real session's own JWT is both a
    // faster and a MORE PRECISE proof (exact numbers, no text-matching ambiguity) than
    // driving several more full page loads/dropdown selections through the browser. Every
    // token below is the actual `auth_token` each real logged-in session already holds in
    // `localStorage` (`apiClient.ts`), not a fabricated credential.
    async function authToken(page: import('@playwright/test').Page): Promise<string> {
      const token = await page.evaluate(() => window.localStorage.getItem('auth_token'));
      if (!token) throw new Error('auth_token missing from localStorage.');
      return token;
    }

    const unitId = unitHref!.match(/\/units\/([^/]+)\/leaderboard/)![1];
    const teacherToken = await authToken(teacherPage);
    const studentAToken = await authToken(studentA.page);
    const studentBToken = await authToken(studentB.page);

    async function getJson<T>(page: import('@playwright/test').Page, url: string, token: string): Promise<T> {
      const res = await page.request.get(url, { headers: { Authorization: `Bearer ${token}` } });
      expect(res.ok(), `${url} should return 2xx, got ${res.status()}: ${await res.text()}`).toBe(true);
      return (await res.json()) as T;
    }

    interface UnitLeaderboardJson {
      classId: string;
      className: string;
      attemptCount: number;
      averageScorePercent: number | null;
      entries: Array<{ studentId: string; studentName: string; averageScorePercent: number | null }>;
    }

    // Teacher, explicit classId=A: exactly Student A, 100%, average 100% — never Student B.
    const teacherViewA = await getJson<UnitLeaderboardJson>(
      teacherPage,
      `/api/units/${unitId}/leaderboard?classId=${classAId}`,
      teacherToken,
    );
    expect(teacherViewA.classId).toBe(classAId);
    expect(teacherViewA.className).toBe(classAName);
    expect(teacherViewA.attemptCount).toBe(1);
    expect(teacherViewA.averageScorePercent).toBe(100);
    expect(teacherViewA.entries).toHaveLength(1);
    expect(teacherViewA.entries[0].studentName).toBe('E2E Class A Student');
    expect(teacherViewA.entries[0].averageScorePercent).toBe(100);

    // Same teacher, SAME unit, switching to classId=B: exactly Student B, 0% — proves the
    // filter actually changes the numbers rather than caching/ignoring it.
    const teacherViewB = await getJson<UnitLeaderboardJson>(
      teacherPage,
      `/api/units/${unitId}/leaderboard?classId=${classBId}`,
      teacherToken,
    );
    expect(teacherViewB.classId).toBe(classBId);
    expect(teacherViewB.attemptCount).toBe(1);
    expect(teacherViewB.averageScorePercent).toBe(0);
    expect(teacherViewB.entries).toHaveLength(1);
    expect(teacherViewB.entries[0].studentName).toBe('E2E Class B Student');
    expect(teacherViewB.entries[0].averageScorePercent).toBe(0);

    // A teacher passing the OTHER class's id must never see the first class's student, and
    // vice versa — the two responses above already prove this (1 entry each, no overlap),
    // but assert it explicitly for the specific adversarial case T-078 will drill into.
    expect(teacherViewA.entries.map((e) => e.studentName)).not.toContain('E2E Class B Student');
    expect(teacherViewB.entries.map((e) => e.studentName)).not.toContain('E2E Class A Student');

    // Same shared `computeReport` engine, via the generic Test/Unit-Test reporting
    // endpoint (`groupBy=test`), narrowed to this one test — same isolation must hold.
    interface ReportJson {
      classId: string;
      buckets: Array<{ key: string; attemptCount: number; averageScorePercent: number | null }>;
    }
    const reportA = await getJson<ReportJson>(
      teacherPage,
      `/api/teacher/reports?groupBy=test&testId=${testId}&classId=${classAId}`,
      teacherToken,
    );
    expect(reportA.buckets.find((b) => b.key === testId)?.averageScorePercent).toBe(100);
    const reportB = await getJson<ReportJson>(
      teacherPage,
      `/api/teacher/reports?groupBy=test&testId=${testId}&classId=${classBId}`,
      teacherToken,
    );
    expect(reportB.buckets.find((b) => b.key === testId)?.averageScorePercent).toBe(0);

    // Each STUDENT's own view (no `classId` param at all — the server must ignore any
    // attempt to pass one and always resolve their own class) shows only themselves.
    const studentAView = await getJson<UnitLeaderboardJson>(
      studentA.page,
      `/api/units/${unitId}/leaderboard`,
      studentAToken,
    );
    expect(studentAView.classId).toBe(classAId);
    expect(studentAView.entries).toHaveLength(1);
    expect(studentAView.entries[0].studentName).toBe('E2E Class A Student');

    const studentBView = await getJson<UnitLeaderboardJson>(
      studentB.page,
      `/api/units/${unitId}/leaderboard`,
      studentBToken,
    );
    expect(studentBView.classId).toBe(classBId);
    expect(studentBView.entries).toHaveLength(1);
    expect(studentBView.entries[0].studentName).toBe('E2E Class B Student');

    // A student explicitly trying to pass the OTHER class's id must still only ever see
    // their OWN class — `resolveViewerClassId` ignores the query param for a student.
    const studentASpoofAttempt = await getJson<UnitLeaderboardJson>(
      studentA.page,
      `/api/units/${unitId}/leaderboard?classId=${classBId}`,
      studentAToken,
    );
    expect(studentASpoofAttempt.classId).toBe(classAId);
    expect(studentASpoofAttempt.entries.map((e) => e.studentName)).not.toContain('E2E Class B Student');

    // --- 8. One lightweight real-browser check of the primary UI flow: the teacher's
    // leaderboard page renders a class picker and switching it changes the displayed
    // numbers on screen (not just in the JSON) — the actual visual proof for a human.
    await teacherPage.goto(unitHref!);
    await teacherPage.getByLabel('Class').selectOption({ label: classAName });
    await expect(teacherPage.getByText(`Viewing class: ${classAName}`)).toBeVisible();
    await expect(teacherPage.getByRole('row', { name: /E2E Class A Student.*100%/ })).toBeVisible();
    await teacherPage.getByLabel('Class').selectOption({ label: classBName });
    await expect(teacherPage.getByText(`Viewing class: ${classBName}`)).toBeVisible();
    await expect(teacherPage.getByRole('row', { name: /E2E Class B Student.*0%/ })).toBeVisible();

    // And a student's own leaderboard page renders with NO class picker at all.
    await studentA.page.goto(unitHref!);
    await expect(studentA.page.getByText('(you)')).toBeVisible();
    await expect(studentA.page.locator('select')).toHaveCount(0);
  } finally {
    await teacherContext.close();
    if (studentAContext) await studentAContext.close();
    if (studentBContext) await studentBContext.close();
  }
});
