import fs from 'node:fs';
import path from 'node:path';
import { chromium, type FullConfig } from '@playwright/test';

/**
 * Runs once before the whole suite (T-060). Logs in as the seeded teacher
 * (`server/prisma/seed.ts`) and registers ONE fresh student account, saving both
 * sessions' `storageState` (localStorage-persisted JWT, per `AuthContext.tsx`) to disk so
 * every spec file can reuse them via `test.use({ storageState: ... })` instead of
 * re-logging-in per test — this is the "reuse existing seed data/accounts where
 * sensible" instruction from the backlog: one seeded teacher, one freshly-registered
 * student, shared across the whole run rather than re-created per spec.
 *
 * The student is freshly registered (not seeded) because there is no seeded student
 * account in this codebase (T-005's Assumption A1: only teachers are pre-provisioned) —
 * this IS "a freshly-registered student" the task asks for, done once for the whole run
 * rather than once per spec.
 */
const AUTH_DIR = path.join(__dirname, '.auth');
const TEACHER_STORAGE = path.join(AUTH_DIR, 'teacher.json');
const STUDENT_STORAGE = path.join(AUTH_DIR, 'student.json');
const CREDENTIALS_FILE = path.join(AUTH_DIR, 'student-credentials.json');

const TEACHER_EMAIL = process.env.SEED_TEACHER_EMAIL ?? 'teacher@example.com';
const TEACHER_PASSWORD = process.env.SEED_TEACHER_PASSWORD ?? 'teacher-dev-password123';
export const STUDENT_PASSWORD = 'e2e-student-password-123';

export default async function globalSetup(config: FullConfig) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const project = config.projects[0];
  const baseURL = (project?.use?.baseURL as string | undefined) ?? 'http://localhost:5173';

  const browser = await chromium.launch();

  try {
    // --- Teacher session (reuses the seeded account) --------------------------------
    const teacherContext = await browser.newContext({ baseURL });
    const teacherPage = await teacherContext.newPage();
    await teacherPage.goto('/login');
    await teacherPage.getByLabel('Email').fill(TEACHER_EMAIL);
    await teacherPage.getByLabel('Password').fill(TEACHER_PASSWORD);
    await teacherPage.getByRole('button', { name: 'Log in' }).click();
    // T-102/T-106: teachers land on the class-card home (`/teacher/classes`).
    await teacherPage.waitForURL(/\/teacher\/classes/, { timeout: 15_000 });
    await teacherContext.storageState({ path: TEACHER_STORAGE });
    await teacherContext.close();

    // --- Fresh student registration --------------------------------------------------
    const studentEmail = `e2e-student-${Date.now()}@example.com`;
    const studentContext = await browser.newContext({ baseURL });
    const studentPage = await studentContext.newPage();
    await studentPage.goto('/register');
    // `getByLabel('Name')` alone is occasionally ambiguous on this page once the class
    // picker (T-074) has enough accumulated options loaded (this dev DB now has 30+
    // classes across prior runs) — intermittently strict-mode-violates against the class
    // `<select>` too. Scoping to the actual textbox role is a safe, targeted fix; see the
    // identical note in `e2e/08-class-scoped-leaderboards-and-reports.spec.ts` (T-077).
    await studentPage.getByRole('textbox', { name: 'Name', exact: true }).fill('E2E Student');
    await studentPage.getByLabel('Email').fill(studentEmail);
    // Not `exact: true` — the label's accessible name also includes the helper text
    // ("At least 8 characters.") rendered inside the same <label>.
    await studentPage.getByLabel('Password').fill(STUDENT_PASSWORD);
    // T-074 (Phase 12): class selection is now a required field — pick whichever class
    // is listed first (`GET /api/classes`, seeded by `prisma/seed.ts`: "Class 6A").
    // `selectOption({ index: 1 })` skips index 0, the empty-value "-- Select a class --"
    // placeholder option.
    await studentPage.getByLabel('Select your class').selectOption({ index: 1 });
    await studentPage.getByRole('button', { name: 'Create account' }).click();
    await studentPage.waitForURL(/\/student\/dashboard/, { timeout: 15_000 });
    await studentContext.storageState({ path: STUDENT_STORAGE });
    await studentContext.close();

    fs.writeFileSync(
      CREDENTIALS_FILE,
      JSON.stringify({ email: studentEmail, password: STUDENT_PASSWORD }, null, 2),
    );
  } finally {
    await browser.close();
  }
}
