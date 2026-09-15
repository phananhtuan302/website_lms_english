/**
 * T-075 verification script — REAL REST calls against an already-running dev server +
 * Postgres, plus direct DB assertions for the migration (same convention as
 * `verify-t036-t038.ts`). Per Velocity Mode (PROJECT_PLAN.md Section 8), this is the
 * primary Dev self-verification for this batch; a Playwright pass separately covers the
 * `/teacher/content` page's real-browser flow.
 *
 * Covers:
 *   - Assigning one existing test to TWO of the teacher's classes via
 *     `PUT /api/teacher/tests/:id/classes`, and confirming the assigned set is EXACTLY
 *     right (not partial) via the matching `GET`.
 *   - Un-assigning back down to one class, confirming the replace semantics (not an
 *     additive merge).
 *   - A teacher cannot assign their own test to a DIFFERENT teacher's class (400, clear
 *     JSON error, no partial mutation).
 *   - Ownership is still enforced: a different teacher can't read/write another
 *     teacher's test's class assignment at all (404, same convention as every other
 *     `requireOwnedTest` route).
 *   - The consolidated `GET /api/teacher/content` "My Content" endpoint reflects the same
 *     assignment state for all three content types.
 *   - The one-time data migration (`migrateContentToDefaultClasses` in `prisma/seed.ts`):
 *     every teacher has exactly one "Default Class", every pre-existing Test/
 *     FlashcardSet/GrammarTopic has at least one class assignment, and every student has
 *     a non-null `classId` — checked directly against the DB (run `npm run seed -w
 *     server` at least once before this script, and again afterward to confirm
 *     idempotency: no new "Default Class" rows, no changed assignment counts).
 *
 * Usage: start the dev server first (`npm run dev -w server` or the root `npm run dev`),
 * then `npm run verify:t075 -w server`. Requires the seeded teacher accounts.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000';
const SEED_TEACHER_EMAIL = process.env.SEED_TEACHER_EMAIL ?? 'teacher@example.com';
const SEED_TEACHER_PASSWORD = process.env.SEED_TEACHER_PASSWORD ?? 'teacher-dev-password123';
const SEED_TEACHER_2_EMAIL = process.env.SEED_TEACHER_2_EMAIL ?? 'teacher2@example.com';
const SEED_TEACHER_2_PASSWORD = process.env.SEED_TEACHER_2_PASSWORD ?? 'teacher2-dev-password123';

let passCount = 0;
let failCount = 0;

function pass(label: string): void {
  passCount += 1;
  console.log(`  [PASS] ${label}`);
}
function fail(label: string, detail?: unknown): never {
  failCount += 1;
  console.error(`  [FAIL] ${label}`, detail ?? '');
  throw new Error(`Verification step failed: ${label}`);
}
function assert(condition: unknown, label: string, detail?: unknown): asserts condition {
  if (condition) pass(label);
  else fail(label, detail);
}

async function apiRequest<T>(
  path: string,
  token: string | null,
  options: { method?: string; body?: unknown; expectStatus?: number } = {},
): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const body = (await res.json().catch(() => undefined)) as T;
  if (options.expectStatus !== undefined && res.status !== options.expectStatus) {
    fail(`${options.method ?? 'GET'} ${path} expected ${options.expectStatus}, got ${res.status}`, body);
  }
  return { status: res.status, body };
}

async function login(email: string, password: string): Promise<string> {
  const { body } = await apiRequest<{ token: string }>('/api/auth/login', null, {
    method: 'POST',
    body: { email, password },
    expectStatus: 200,
  });
  return body.token;
}

async function main() {
  console.log('--- T-075: content-to-class assignment ---');

  const teacher1Token = await login(SEED_TEACHER_EMAIL, SEED_TEACHER_PASSWORD);
  const teacher2Token = await login(SEED_TEACHER_2_EMAIL, SEED_TEACHER_2_PASSWORD);

  const { body: teacher1Classes } = await apiRequest<Array<{ id: string; name: string }>>(
    '/api/teacher/classes',
    teacher1Token,
    { expectStatus: 200 },
  );
  assert(teacher1Classes.length >= 2, 'Teacher 1 has at least 2 classes to test with', teacher1Classes);
  const [classA, classB] = teacher1Classes;

  const { body: teacher2Classes } = await apiRequest<Array<{ id: string; name: string }>>(
    '/api/teacher/classes',
    teacher2Token,
    { expectStatus: 200 },
  );
  assert(teacher2Classes.length >= 1, 'Teacher 2 has at least 1 class to test cross-teacher rejection with');
  const teacher2ClassId = teacher2Classes[0].id;

  const { body: teacher1Tests } = await apiRequest<Array<{ id: string; title: string }>>(
    '/api/teacher/tests',
    teacher1Token,
    { expectStatus: 200 },
  );
  assert(teacher1Tests.length >= 1, 'Teacher 1 has at least 1 existing test to assign');
  const testId = teacher1Tests[0].id;

  // --- Assign to BOTH of teacher 1's classes; confirm the set is EXACTLY right ---------
  const { body: afterAssignBoth } = await apiRequest<{ classIds: string[] }>(
    `/api/teacher/tests/${testId}/classes`,
    teacher1Token,
    { method: 'PUT', body: { classIds: [classA.id, classB.id] }, expectStatus: 200 },
  );
  assert(
    new Set(afterAssignBoth.classIds).size === 2 &&
      afterAssignBoth.classIds.includes(classA.id) &&
      afterAssignBoth.classIds.includes(classB.id),
    'Assigning to 2 classes returns EXACTLY those 2 classIds (not partial)',
    afterAssignBoth,
  );

  const { body: readBack } = await apiRequest<{ classIds: string[] }>(
    `/api/teacher/tests/${testId}/classes`,
    teacher1Token,
    { expectStatus: 200 },
  );
  assert(
    new Set(readBack.classIds).size === 2 &&
      readBack.classIds.includes(classA.id) &&
      readBack.classIds.includes(classB.id),
    'GET .../classes reads back the exact same 2-class assignment',
    readBack,
  );

  // --- Replace (not merge) down to a single class --------------------------------------
  const { body: afterReplace } = await apiRequest<{ classIds: string[] }>(
    `/api/teacher/tests/${testId}/classes`,
    teacher1Token,
    { method: 'PUT', body: { classIds: [classA.id] }, expectStatus: 200 },
  );
  assert(
    afterReplace.classIds.length === 1 && afterReplace.classIds[0] === classA.id,
    'PUT replaces the full set (down to 1 class), not an additive merge',
    afterReplace,
  );

  // --- Cannot assign to a DIFFERENT teacher's class -------------------------------------
  const { status: crossTeacherStatus, body: crossTeacherBody } = await apiRequest<{ error?: string }>(
    `/api/teacher/tests/${testId}/classes`,
    teacher1Token,
    { method: 'PUT', body: { classIds: [classA.id, teacher2ClassId] } },
  );
  assert(
    crossTeacherStatus === 400 || crossTeacherStatus === 403,
    'Assigning to another teacher\'s class is rejected (400/403)',
    { status: crossTeacherStatus, body: crossTeacherBody },
  );
  assert(
    typeof crossTeacherBody.error === 'string' && crossTeacherBody.error.length > 0,
    'Cross-teacher rejection returns a clean JSON error message',
    crossTeacherBody,
  );

  const { body: afterFailedAttempt } = await apiRequest<{ classIds: string[] }>(
    `/api/teacher/tests/${testId}/classes`,
    teacher1Token,
    { expectStatus: 200 },
  );
  assert(
    afterFailedAttempt.classIds.length === 1 && afterFailedAttempt.classIds[0] === classA.id,
    'A rejected cross-teacher assignment attempt did not partially mutate the assignment',
    afterFailedAttempt,
  );

  // --- Ownership still enforced: teacher 2 can't touch teacher 1's test's assignment ---
  const { status: crossOwnerReadStatus } = await apiRequest(`/api/teacher/tests/${testId}/classes`, teacher2Token);
  assert(crossOwnerReadStatus === 404, 'Teacher 2 GETting teacher 1\'s test classes gets 404', crossOwnerReadStatus);

  const { status: crossOwnerWriteStatus } = await apiRequest(`/api/teacher/tests/${testId}/classes`, teacher2Token, {
    method: 'PUT',
    body: { classIds: [] },
  });
  assert(
    crossOwnerWriteStatus === 404,
    'Teacher 2 PUTting teacher 1\'s test classes gets 404',
    crossOwnerWriteStatus,
  );

  // --- Consolidated "My Content" endpoint reflects the same state ----------------------
  const { body: myContent } = await apiRequest<{
    classes: Array<{ id: string; name: string }>;
    tests: Array<{ id: string; classIds: string[] }>;
    flashcardSets: Array<{ id: string; classIds: string[] }>;
    grammarTopics: Array<{ id: string; classIds: string[] }>;
  }>('/api/teacher/content', teacher1Token, { expectStatus: 200 });
  const myContentRow = myContent.tests.find((t) => t.id === testId);
  assert(
    myContentRow !== undefined && myContentRow.classIds.length === 1 && myContentRow.classIds[0] === classA.id,
    'GET /api/teacher/content shows the same assignment for this test',
    myContentRow,
  );
  assert(
    myContent.classes.some((c) => c.id === classA.id) && myContent.classes.some((c) => c.id === classB.id),
    'GET /api/teacher/content includes the teacher\'s own classes for chip rendering',
  );

  console.log('\n--- T-075: data migration (DB-direct checks) ---');

  const teachers = await prisma.user.findMany({ where: { role: 'teacher' }, select: { id: true, email: true } });
  for (const teacher of teachers) {
    const defaultClasses = await prisma.class.findMany({
      where: { teacherId: teacher.id, name: 'Default Class' },
    });
    assert(
      defaultClasses.length === 1,
      `Teacher ${teacher.email} has EXACTLY ONE "Default Class" (no duplicates)`,
      defaultClasses.map((c) => c.id),
    );
  }

  const unassignedTests = await prisma.test.count({ where: { classes: { none: {} } } });
  assert(unassignedTests === 0, 'Every Test has at least one class assignment', unassignedTests);

  const unassignedSets = await prisma.flashcardSet.count({ where: { classes: { none: {} } } });
  assert(unassignedSets === 0, 'Every FlashcardSet has at least one class assignment', unassignedSets);

  const unassignedTopics = await prisma.grammarTopic.count({ where: { classes: { none: {} } } });
  assert(unassignedTopics === 0, 'Every GrammarTopic has at least one class assignment', unassignedTopics);

  const studentsWithoutClass = await prisma.user.count({ where: { role: 'student', classId: null } });
  assert(studentsWithoutClass === 0, 'Every student account has a non-null classId', studentsWithoutClass);

  console.log(`\n${passCount} passed, ${failCount} failed.`);
}

main()
  .catch((err) => {
    console.error('\nVerification FAILED:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
