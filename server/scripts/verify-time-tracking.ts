/**
 * T-017 time-tracking-and-averages verification script — REAL REST calls against an
 * already-running dev server + Postgres (same convention as `verify-realtime.ts` /
 * `verify-live-dashboard.ts`). Exercises the actual submit endpoint with real elapsed
 * wall-clock time (deliberately short waits — a few seconds each — rather than faking
 * timestamps directly in the DB, per the task's "prefer actually waiting/simulating real
 * submit timing where feasible") for 3 attempts with 3 DIFFERENT durations, plus a 4th
 * attempt that joins and is deliberately never submitted (abandoned).
 *
 * Verifies:
 *   1. Each submitted attempt's `timeTakenSeconds` (from `GET /api/teacher/sessions/
 *      :sessionId/attempts`) is a small positive number consistent with how long this
 *      script actually waited before submitting it (with generous slack for scheduling
 *      jitter — this is real wall-clock time, not mocked).
 *   2. `GET /api/teacher/tests` reports `averageTimeTakenSeconds` equal to the MANUAL
 *      average of the 3 submitted attempts' `timeTakenSeconds` — and NOT influenced by
 *      the 4th (abandoned, never-submitted) attempt in any way.
 *   3. `completedAttemptCount` is exactly 3 (not 4) — the abandoned attempt is excluded,
 *      not counted as a zero.
 *   4. The abandoned attempt's own `timeTakenSeconds` is `null` (never computed, since
 *      it was never submitted).
 *
 * Usage: start the dev server first (`npm run dev:server`), then
 * `npm run verify:time-tracking -w server`. Requires the seeded teacher account.
 * Takes roughly 20-25 real seconds to run (the deliberate waits).
 */

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000';
const SEED_TEACHER_EMAIL = process.env.SEED_TEACHER_EMAIL ?? 'teacher@example.com';
const SEED_TEACHER_PASSWORD = process.env.SEED_TEACHER_PASSWORD ?? 'teacher-dev-password123';

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
  if (condition) {
    pass(label);
  } else {
    fail(label, detail);
  }
}

async function apiRequest<T>(
  path: string,
  token: string | null,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const contentType = res.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json') ? await res.json() : undefined;
  if (!res.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} -> ${res.status}: ${JSON.stringify(body)}`);
  }
  return body as T;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface AttemptSummary {
  attemptId: string;
  studentId: string;
  status: 'inProgress' | 'submitted';
  timeTakenSeconds: number | null;
}

interface TestSummary {
  id: string;
  averageTimeTakenSeconds: number | null;
  completedAttemptCount: number;
}

async function registerStudent(label: string): Promise<{ token: string; id: string }> {
  const res = await apiRequest<{ token: string; user: { id: string } }>('/api/auth/register', null, {
    method: 'POST',
    body: {
      email: `time-tracking-verify-${label}-${Date.now()}@example.com`,
      password: 'verify-pass-123',
      name: `Time Tracking Student ${label}`,
    },
  });
  return { token: res.token, id: res.user.id };
}

async function main() {
  console.log(`[verify-time-tracking] Target: ${API_BASE_URL}\n`);

  // --- 1. Fixtures: teacher, one test, one session --------------------------------
  const teacherLogin = await apiRequest<{ token: string }>('/api/auth/login', null, {
    method: 'POST',
    body: { email: SEED_TEACHER_EMAIL, password: SEED_TEACHER_PASSWORD },
  });
  const teacherToken = teacherLogin.token;
  pass('Logged in as seeded teacher');

  const test = await apiRequest<{ id: string }>('/api/teacher/tests', teacherToken, {
    method: 'POST',
    body: { title: `T-017 time tracking verify ${Date.now()}` },
  });
  const withSection = await apiRequest<{ sections: { id: string }[] }>(
    `/api/teacher/tests/${test.id}/sections`,
    teacherToken,
    { method: 'POST', body: { title: 'Section 1' } },
  );
  const sectionId = withSection.sections[0].id;
  await apiRequest(`/api/teacher/tests/${test.id}/sections/${sectionId}/questions`, teacherToken, {
    method: 'POST',
    body: {
      type: 'trueFalse',
      prompt: 'Time tracking verification question.',
      choices: [
        { text: 'True', isCorrect: true },
        { text: 'False', isCorrect: false },
      ],
    },
  });
  await apiRequest(`/api/teacher/tests/${test.id}/variants`, teacherToken, {
    method: 'POST',
    body: { count: 1 },
  });
  pass('Created a test with 1 question and generated a variant');

  const session = await apiRequest<{ id: string; joinToken: string }>(
    `/api/teacher/tests/${test.id}/sessions`,
    teacherToken,
    { method: 'POST' },
  );
  pass(`Started session ${session.id}`);

  // --- 2. Three completed attempts, each waiting a DIFFERENT REAL duration before
  //        submitting, so the durations are genuinely distinct wall-clock times, not
  //        faked timestamps. Kept short (2s/4s/6s) to keep the script fast. -----------
  const waitSecondsPlan = [2, 4, 6];
  const submittedTimes: number[] = [];

  for (const [index, waitSeconds] of waitSecondsPlan.entries()) {
    const student = await registerStudent(`completed-${index}`);
    const join = await apiRequest<{ attemptId: string }>(
      `/api/sessions/join/${session.joinToken}`,
      student.token,
      { method: 'POST' },
    );
    console.log(`  Waiting ${waitSeconds}s (real time) before submitting attempt #${index + 1}...`);
    await sleep(waitSeconds * 1000);
    const submitResult = await apiRequest<{ timeTakenSeconds: number }>(
      `/api/attempts/${join.attemptId}/submit`,
      student.token,
      { method: 'POST' },
    );
    submittedTimes.push(submitResult.timeTakenSeconds);
    // Generous slack (server processing + event-loop scheduling) — this is real
    // wall-clock time, not a mock, so allow +/- 2s around the intended wait.
    assert(
      Math.abs(submitResult.timeTakenSeconds - waitSeconds) <= 2,
      `Attempt #${index + 1} (waited ~${waitSeconds}s) reports a consistent timeTakenSeconds (${submitResult.timeTakenSeconds}s)`,
      submitResult,
    );
  }

  // --- 3. A 4th attempt that joins and is DELIBERATELY never submitted (abandoned) ---
  const abandonedStudent = await registerStudent('abandoned');
  const abandonedJoin = await apiRequest<{ attemptId: string }>(
    `/api/sessions/join/${session.joinToken}`,
    abandonedStudent.token,
    { method: 'POST' },
  );
  pass(`4th student joined (attempt ${abandonedJoin.attemptId}) and will NOT submit — abandoned`);

  // --- 4. Verify per-attempt data via the teacher's session-attempts view -----------
  const attempts = await apiRequest<AttemptSummary[]>(
    `/api/teacher/sessions/${session.id}/attempts`,
    teacherToken,
  );
  assert(attempts.length === 4, 'Session attempts list shows all 4 joined students', attempts);

  const abandonedRow = attempts.find((a) => a.studentId === abandonedStudent.id);
  assert(
    abandonedRow?.status === 'inProgress' && abandonedRow.timeTakenSeconds === null,
    'The abandoned attempt is still inProgress with timeTakenSeconds: null',
    abandonedRow,
  );

  const submittedRows = attempts.filter((a) => a.status === 'submitted');
  assert(submittedRows.length === 3, 'Exactly 3 attempts are submitted', submittedRows);

  // --- 5. Verify the average excludes the abandoned attempt -------------------------
  const manualSum = submittedTimes.reduce((sum, t) => sum + t, 0);
  const manualAverage = Math.round(manualSum / submittedTimes.length);

  const testSummaries = await apiRequest<TestSummary[]>('/api/teacher/tests', teacherToken);
  const thisTest = testSummaries.find((t) => t.id === test.id);
  assert(thisTest !== undefined, 'The verification test appears in the teacher\'s test list', testSummaries);

  console.log(
    `  Manual calculation: (${submittedTimes.join(' + ')}) / ${submittedTimes.length} = ${manualAverage}s`,
  );
  console.log(
    `  Server-reported: averageTimeTakenSeconds=${thisTest!.averageTimeTakenSeconds}s over completedAttemptCount=${thisTest!.completedAttemptCount}`,
  );

  assert(
    thisTest!.completedAttemptCount === 3,
    'completedAttemptCount is 3 — the abandoned 4th attempt is excluded, not counted as a 0s attempt',
    thisTest,
  );
  assert(
    thisTest!.averageTimeTakenSeconds === manualAverage,
    'averageTimeTakenSeconds exactly matches the manual average over only the 3 completed attempts',
    { server: thisTest!.averageTimeTakenSeconds, manual: manualAverage },
  );

  // Sanity check: if the abandoned attempt were WRONGLY counted as 0s toward the
  // average, the reported average would be lower AND the denominator would be 4 — assert
  // it's neither, which is the concrete "does not corrupt the average" proof.
  const wrongAverageIfCounted = Math.round(manualSum / 4);
  assert(
    thisTest!.averageTimeTakenSeconds !== wrongAverageIfCounted,
    'The reported average is NOT the (wrong) value you would get by counting the abandoned attempt as 0s',
    { server: thisTest!.averageTimeTakenSeconds, wrongIfCounted: wrongAverageIfCounted },
  );

  console.log(`\n${passCount} check(s) passed, ${failCount} failed.`);
  if (failCount > 0) {
    process.exitCode = 1;
  } else {
    console.log('T-017 time-tracking verification: ALL CHECKS PASSED.');
  }
}

main().catch((err) => {
  console.error('\n[verify-time-tracking] FAILED:', err);
  process.exitCode = 1;
});
