/**
 * T-019 reporting-engine verification script — REAL REST calls against an
 * already-running dev server + Postgres (same convention as `verify-time-tracking.ts`),
 * PLUS direct Prisma writes to backdate a few attempts' `startedAt`/`submittedAt` into
 * past months/quarters/years/semesters — per the task's explicit allowance ("backdate a
 * couple of `Attempt.submittedAt`/`startedAt` values via a throwaway script if real
 * elapsed time isn't practical"). Only the two timestamp columns are touched directly;
 * every score/time-taken NUMBER used in the assertions below comes from the REAL
 * `POST /submit` response for that attempt, never faked — backdating only moves WHICH
 * bucket an attempt lands in, it never fabricates the stats being aggregated.
 *
 * Scenario (all dates chosen as HCM-local calendar Mondays or otherwise unambiguous, and
 * independently verified as such before writing this script):
 *   Test 1 (tagged to a fresh Unit), two batches:
 *     - Batch A: 2 attempts, BOTH answers correct (100%), backdated to 2026-06-01.
 *     - Batch B: 3 attempts, correct/one-correct/none-correct (100%/50%/0%), backdated
 *       to 2026-06-08 (a different ISO week, SAME month/quarter/semester/year as Batch A
 *       — this is what lets `week` disagree with `month`/`quarter`/`year`/`semester` on
 *       bucket count while still agreeing on the combined totals).
 *   Test 2 (tagged to the SAME fresh Unit), two batches:
 *     - Batch C: 2 attempts, one-correct-one-wrong (50% each), left at "now" (whatever
 *       today is when this script runs).
 *     - Batch D: 1 attempt, one-correct-one-wrong (50%), backdated to 2025-03-05 — a
 *       YEAR outside every seeded `AcademicPeriod` (which only covers the current year,
 *       see `prisma/seed.ts`), so it must land in the engine's "Unassigned" semester
 *       bucket while still being correctly bucketed by week/month/quarter/year.
 *
 * This gives independently hand-verifiable expectations for every one of T-019's 7
 * `groupBy` dimensions (test/unit/week/month/quarter/semester/year), using `testId`/
 * `unitId` query params to scope each check to ONLY this script's own fresh data —
 * deliberately avoiding any dependency on the dev DB's accumulated history from other
 * verify scripts/Playwright runs (there is a lot of it; scoping by testId/unitId sidesteps
 * needing to reason about it at all).
 *
 * Usage: start the dev server first (`npm run dev:server` from the repo root, or the
 * root `npm run dev`), then `npm run verify:reporting -w server`. Requires the seeded
 * teacher account and a working Postgres connection (uses `@prisma/client` directly for
 * the backdating step). Takes roughly 25-30 real seconds (deliberate short waits, same
 * convention as `verify-time-tracking.ts`).
 */

import { PrismaClient } from '@prisma/client';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000';
const SEED_TEACHER_EMAIL = process.env.SEED_TEACHER_EMAIL ?? 'teacher@example.com';
const SEED_TEACHER_PASSWORD = process.env.SEED_TEACHER_PASSWORD ?? 'teacher-dev-password123';

const prisma = new PrismaClient();

let passCount = 0;
let failCount = 0;

function pass(label: string): void {
  passCount += 1;
  console.log(`  [PASS] ${label}`);
}

function fail(label: string, detail?: unknown): void {
  failCount += 1;
  console.error(`  [FAIL] ${label}`, detail ?? '');
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual === expected) {
    pass(`${label} (= ${JSON.stringify(expected)})`);
  } else {
    fail(label, { actual, expected });
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

/** Independent (deliberately NOT copy-pasted from `lib/reporting.ts`) reimplementation
 * of "HCM-local midnight -> UTC instant", used only to compute this script's OWN
 * expectations to compare against the server's response. */
function hcmMidnightUtcIso(year: number, month1to12: number, day: number): string {
  return new Date(Date.UTC(year, month1to12 - 1, day) - 7 * 60 * 60 * 1000).toISOString();
}

/** A timestamp safely inside the given HCM calendar date (noon, to avoid any boundary
 * ambiguity), for backdating `startedAt`. */
function hcmNoon(dateIso: string): Date {
  return new Date(`${dateIso}T12:00:00+07:00`);
}

function expectedAvgScore(scores: number[]): number | null {
  return scores.length > 0
    ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1))
    : null;
}

function expectedAvgTime(times: number[]): number | null {
  return times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
}

interface ReportBucket {
  key: string;
  label: string;
  attemptCount: number;
  averageScorePercent: number | null;
  averageTimeTakenSeconds: number | null;
  periodStart: string | null;
  periodEnd: string | null;
}
interface ReportResponse {
  groupBy: string;
  testId: string | null;
  unitId: string | null;
  buckets: ReportBucket[];
}

async function registerStudent(label: string): Promise<{ token: string; id: string }> {
  const res = await apiRequest<{ token: string; user: { id: string } }>('/api/auth/register', null, {
    method: 'POST',
    body: {
      email: `reporting-verify-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`,
      password: 'verify-pass-123',
      name: `Reporting Student ${label}`,
    },
  });
  return { token: res.token, id: res.user.id };
}

interface RuntimeQuestion {
  id: string;
  choices: Array<{ id: string; text: string }>;
}
interface AttemptDetail {
  sections: Array<{ questions: RuntimeQuestion[] }>;
}
interface SubmitResult {
  scorePercent: number;
  timeTakenSeconds: number;
}

/** Joins the session, answers Q1 (multipleChoice) and Q2 (trueFalse) according to
 * `correct` flags by matching on the choice TEXT this script authored (`Right1`/`Wrong1`,
 * `True`/`False`) — never on `isCorrect`, which the student-facing runtime view never
 * exposes (T-012's answer-key-free contract) — waits `waitSeconds` real wall-clock
 * seconds, then submits. Returns the attempt id plus the REAL submit response. */
async function runAttempt(
  joinToken: string,
  correct: [boolean, boolean],
  waitSeconds: number,
  label: string,
): Promise<{ attemptId: string } & SubmitResult> {
  const student = await registerStudent(label);
  const join = await apiRequest<{ attemptId: string }>(`/api/sessions/join/${joinToken}`, student.token, {
    method: 'POST',
  });
  const detail = await apiRequest<AttemptDetail>(`/api/attempts/${join.attemptId}`, student.token);
  const questions = detail.sections[0].questions;

  const wantedTexts: [string, string] = [correct[0] ? 'Right1' : 'Wrong1', correct[1] ? 'True' : 'False'];
  for (const [index, question] of questions.entries()) {
    const choice = question.choices.find((c) => c.text === wantedTexts[index]);
    if (!choice) throw new Error(`Could not find choice "${wantedTexts[index]}" on question ${index}`);
    await apiRequest(`/api/attempts/${join.attemptId}/answers/${question.id}`, student.token, {
      method: 'PUT',
      body: { selectedChoiceId: choice.id },
    });
  }

  await sleep(waitSeconds * 1000);
  const submitResult = await apiRequest<SubmitResult>(`/api/attempts/${join.attemptId}/submit`, student.token, {
    method: 'POST',
  });
  return { attemptId: join.attemptId, ...submitResult };
}

async function createTaggedTest(teacherToken: string, title: string, unitId: string): Promise<string> {
  const test = await apiRequest<{ id: string; sections: { id: string }[] }>(
    '/api/teacher/tests',
    teacherToken,
    { method: 'POST', body: { title, unitId } },
  );
  const withSection = await apiRequest<{ sections: { id: string }[] }>(
    `/api/teacher/tests/${test.id}/sections`,
    teacherToken,
    { method: 'POST', body: { title: 'Section 1' } },
  );
  const sectionId = withSection.sections[0].id;
  await apiRequest(`/api/teacher/tests/${test.id}/sections/${sectionId}/questions`, teacherToken, {
    method: 'POST',
    body: {
      type: 'multipleChoice',
      prompt: 'Q1 (worth 50% of the score)',
      choices: [
        { text: 'Right1', isCorrect: true },
        { text: 'Wrong1', isCorrect: false },
      ],
    },
  });
  await apiRequest(`/api/teacher/tests/${test.id}/sections/${sectionId}/questions`, teacherToken, {
    method: 'POST',
    body: {
      type: 'trueFalse',
      prompt: 'Q2 (worth 50% of the score)',
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
  return test.id;
}

async function backdate(attemptIds: string[], dateInstant: Date): Promise<void> {
  for (const id of attemptIds) {
    const attempt = await prisma.attempt.findUniqueOrThrow({ where: { id } });
    await prisma.attempt.update({
      where: { id },
      data: {
        startedAt: dateInstant,
        submittedAt: new Date(dateInstant.getTime() + (attempt.timeTakenSeconds ?? 0) * 1000),
      },
    });
  }
}

function findBucket(report: ReportResponse, predicate: (b: ReportBucket) => boolean): ReportBucket | undefined {
  return report.buckets.find(predicate);
}

async function main() {
  console.log(`[verify-reporting] Target: ${API_BASE_URL}\n`);

  const teacherLogin = await apiRequest<{ token: string }>('/api/auth/login', null, {
    method: 'POST',
    body: { email: SEED_TEACHER_EMAIL, password: SEED_TEACHER_PASSWORD },
  });
  const teacherToken = teacherLogin.token;
  pass('Logged in as seeded teacher');

  const unit = await apiRequest<{ id: string }>('/api/teacher/units', teacherToken, {
    method: 'POST',
    body: { name: `T-019 Verify Unit ${Date.now()}`, order: 999 },
  });
  const test1Id = await createTaggedTest(teacherToken, `T-019 Verify Test1 ${Date.now()}`, unit.id);
  const test2Id = await createTaggedTest(teacherToken, `T-019 Verify Test2 ${Date.now()}`, unit.id);
  pass('Created 1 fresh Unit and 2 tests tagged to it, each with a 2-question (50/50) test');

  const session1 = await apiRequest<{ joinToken: string }>(`/api/teacher/tests/${test1Id}/sessions`, teacherToken, {
    method: 'POST',
  });
  const session2 = await apiRequest<{ joinToken: string }>(`/api/teacher/tests/${test2Id}/sessions`, teacherToken, {
    method: 'POST',
  });

  // --- Batch A: Test1, 2026-06-01 (Monday), both attempts 100% -----------------------
  console.log('\n  Running batch A (Test1, will backdate to 2026-06-01)...');
  const batchA = [
    await runAttempt(session1.joinToken, [true, true], 2, 'A1'),
    await runAttempt(session1.joinToken, [true, true], 2, 'A2'),
  ];
  await backdate(batchA.map((a) => a.attemptId), hcmNoon('2026-06-01'));

  // --- Batch B: Test1, 2026-06-08 (Monday), 100%/50%/0% -------------------------------
  console.log('  Running batch B (Test1, will backdate to 2026-06-08)...');
  const batchB = [
    await runAttempt(session1.joinToken, [true, true], 2, 'B1'),
    await runAttempt(session1.joinToken, [true, false], 4, 'B2'),
    await runAttempt(session1.joinToken, [false, false], 6, 'B3'),
  ];
  await backdate(batchB.map((a) => a.attemptId), hcmNoon('2026-06-08'));

  // --- Batch C: Test2, "now" (today), 50%/50% -----------------------------------------
  console.log('  Running batch C (Test2, left at "now")...');
  const batchC = [
    await runAttempt(session2.joinToken, [true, false], 3, 'C1'),
    await runAttempt(session2.joinToken, [true, false], 3, 'C2'),
  ];

  // --- Batch D: Test2, 2025-03-05, 50% (outside every seeded AcademicPeriod) ----------
  console.log('  Running batch D (Test2, will backdate to 2025-03-05)...');
  const batchD = [await runAttempt(session2.joinToken, [true, false], 3, 'D1')];
  await backdate(batchD.map((a) => a.attemptId), hcmNoon('2025-03-05'));

  console.log('\n  All attempts submitted and backdated. Fetching reports...\n');

  const allTest1 = [...batchA, ...batchB];
  const allTest2 = [...batchC, ...batchD];
  const scoresOf = (rows: SubmitResult[]) => rows.map((r) => r.scorePercent);
  const timesOf = (rows: SubmitResult[]) => rows.map((r) => r.timeTakenSeconds);

  // === Dimension 1: test =============================================================
  const reportTest = await apiRequest<ReportResponse>(
    `/api/teacher/reports?groupBy=test&unitId=${unit.id}`,
    teacherToken,
  );
  assertEqual(reportTest.buckets.length, 2, 'groupBy=test&unitId scoped to our unit shows exactly 2 tests');
  const t1Bucket = findBucket(reportTest, (b) => b.key === test1Id);
  const t2Bucket = findBucket(reportTest, (b) => b.key === test2Id);
  assertEqual(t1Bucket?.attemptCount, 5, 'Test1 bucket (groupBy=test) attemptCount');
  assertEqual(t1Bucket?.averageScorePercent, expectedAvgScore(scoresOf(allTest1)), 'Test1 bucket averageScorePercent');
  assertEqual(t1Bucket?.averageTimeTakenSeconds, expectedAvgTime(timesOf(allTest1)), 'Test1 bucket averageTimeTakenSeconds');
  assertEqual(t2Bucket?.attemptCount, 3, 'Test2 bucket (groupBy=test) attemptCount');
  assertEqual(t2Bucket?.averageScorePercent, expectedAvgScore(scoresOf(allTest2)), 'Test2 bucket averageScorePercent');
  assertEqual(t2Bucket?.averageTimeTakenSeconds, expectedAvgTime(timesOf(allTest2)), 'Test2 bucket averageTimeTakenSeconds');

  // === Dimension 2: unit ==============================================================
  const reportUnit = await apiRequest<ReportResponse>(
    `/api/teacher/reports?groupBy=unit&unitId=${unit.id}`,
    teacherToken,
  );
  const unitBucket = findBucket(reportUnit, (b) => b.key === unit.id);
  const allOurs = [...allTest1, ...allTest2];
  assertEqual(unitBucket?.attemptCount, 8, 'Unit bucket (groupBy=unit) attemptCount (both tests combined)');
  assertEqual(unitBucket?.averageScorePercent, expectedAvgScore(scoresOf(allOurs)), 'Unit bucket averageScorePercent (combined)');
  assertEqual(unitBucket?.averageTimeTakenSeconds, expectedAvgTime(timesOf(allOurs)), 'Unit bucket averageTimeTakenSeconds (combined)');

  // === Dimension 3: week (Test1: 2 distinct ISO weeks, same month) ===================
  const reportWeek1 = await apiRequest<ReportResponse>(
    `/api/teacher/reports?groupBy=week&testId=${test1Id}`,
    teacherToken,
  );
  assertEqual(reportWeek1.buckets.length, 2, 'Test1 groupBy=week shows exactly 2 distinct ISO weeks');
  const weekA = findBucket(reportWeek1, (b) => b.periodStart === hcmMidnightUtcIso(2026, 6, 1));
  const weekB = findBucket(reportWeek1, (b) => b.periodStart === hcmMidnightUtcIso(2026, 6, 8));
  assertEqual(weekA?.attemptCount, 2, 'Week-of-2026-06-01 bucket attemptCount');
  assertEqual(weekA?.averageScorePercent, expectedAvgScore(scoresOf(batchA)), 'Week-of-2026-06-01 averageScorePercent');
  assertEqual(weekA?.averageTimeTakenSeconds, expectedAvgTime(timesOf(batchA)), 'Week-of-2026-06-01 averageTimeTakenSeconds');
  assertEqual(weekB?.attemptCount, 3, 'Week-of-2026-06-08 bucket attemptCount');
  assertEqual(weekB?.averageScorePercent, expectedAvgScore(scoresOf(batchB)), 'Week-of-2026-06-08 averageScorePercent');
  assertEqual(weekB?.averageTimeTakenSeconds, expectedAvgTime(timesOf(batchB)), 'Week-of-2026-06-08 averageTimeTakenSeconds');

  // === Dimension 4: month (Test1: both weeks collapse into ONE month bucket) =========
  const reportMonth1 = await apiRequest<ReportResponse>(
    `/api/teacher/reports?groupBy=month&testId=${test1Id}`,
    teacherToken,
  );
  assertEqual(reportMonth1.buckets.length, 1, 'Test1 groupBy=month collapses both weeks into 1 month bucket');
  const june2026 = reportMonth1.buckets[0];
  assertEqual(june2026?.key, '2026-06', 'Test1 month bucket key is 2026-06');
  assertEqual(june2026?.attemptCount, 5, 'Test1 month bucket attemptCount (5 = batch A + batch B)');
  assertEqual(june2026?.averageScorePercent, expectedAvgScore(scoresOf(allTest1)), 'Test1 month bucket averageScorePercent');
  assertEqual(june2026?.averageTimeTakenSeconds, expectedAvgTime(timesOf(allTest1)), 'Test1 month bucket averageTimeTakenSeconds');
  assertEqual(june2026?.periodStart, hcmMidnightUtcIso(2026, 6, 1), 'Test1 month bucket periodStart');
  assertEqual(june2026?.periodEnd, hcmMidnightUtcIso(2026, 7, 1), 'Test1 month bucket periodEnd (exclusive)');

  // Test2 spans two DIFFERENT months (and years) -> 2 buckets.
  const reportMonth2 = await apiRequest<ReportResponse>(
    `/api/teacher/reports?groupBy=month&testId=${test2Id}`,
    teacherToken,
  );
  assertEqual(reportMonth2.buckets.length, 2, 'Test2 groupBy=month shows 2 distinct months (2026-09 and 2025-03)');
  const sept2026 = findBucket(reportMonth2, (b) => b.key === '2026-09');
  const march2025 = findBucket(reportMonth2, (b) => b.key === '2025-03');
  assertEqual(sept2026?.attemptCount, 2, '2026-09 bucket attemptCount');
  assertEqual(sept2026?.averageScorePercent, expectedAvgScore(scoresOf(batchC)), '2026-09 bucket averageScorePercent');
  assertEqual(sept2026?.averageTimeTakenSeconds, expectedAvgTime(timesOf(batchC)), '2026-09 bucket averageTimeTakenSeconds');
  assertEqual(march2025?.attemptCount, 1, '2025-03 bucket attemptCount');
  assertEqual(march2025?.averageScorePercent, expectedAvgScore(scoresOf(batchD)), '2025-03 bucket averageScorePercent');
  assertEqual(march2025?.averageTimeTakenSeconds, expectedAvgTime(timesOf(batchD)), '2025-03 bucket averageTimeTakenSeconds');

  // === Dimension 5: quarter ===========================================================
  const reportQuarter1 = await apiRequest<ReportResponse>(
    `/api/teacher/reports?groupBy=quarter&testId=${test1Id}`,
    teacherToken,
  );
  assertEqual(reportQuarter1.buckets.length, 1, 'Test1 groupBy=quarter collapses into 1 quarter bucket');
  assertEqual(reportQuarter1.buckets[0]?.key, '2026-Q2', 'Test1 quarter bucket key is 2026-Q2');
  assertEqual(reportQuarter1.buckets[0]?.attemptCount, 5, 'Test1 quarter bucket attemptCount');
  assertEqual(
    reportQuarter1.buckets[0]?.averageScorePercent,
    expectedAvgScore(scoresOf(allTest1)),
    'Test1 quarter bucket averageScorePercent',
  );

  const reportQuarter2 = await apiRequest<ReportResponse>(
    `/api/teacher/reports?groupBy=quarter&testId=${test2Id}`,
    teacherToken,
  );
  const q3_2026 = findBucket(reportQuarter2, (b) => b.key === '2026-Q3');
  const q1_2025 = findBucket(reportQuarter2, (b) => b.key === '2025-Q1');
  assertEqual(reportQuarter2.buckets.length, 2, 'Test2 groupBy=quarter shows 2 distinct quarters');
  assertEqual(q3_2026?.attemptCount, 2, '2026-Q3 bucket attemptCount');
  assertEqual(q1_2025?.attemptCount, 1, '2025-Q1 bucket attemptCount');

  // === Dimension 6: year ==============================================================
  const reportYear2 = await apiRequest<ReportResponse>(
    `/api/teacher/reports?groupBy=year&testId=${test2Id}`,
    teacherToken,
  );
  assertEqual(reportYear2.buckets.length, 2, 'Test2 groupBy=year shows 2 distinct years (2026 and 2025)');
  const y2026 = findBucket(reportYear2, (b) => b.key === '2026');
  const y2025 = findBucket(reportYear2, (b) => b.key === '2025');
  assertEqual(y2026?.attemptCount, 2, 'Year 2026 bucket attemptCount (Test2)');
  assertEqual(y2026?.averageScorePercent, expectedAvgScore(scoresOf(batchC)), 'Year 2026 bucket averageScorePercent (Test2)');
  assertEqual(y2025?.attemptCount, 1, 'Year 2025 bucket attemptCount (Test2)');
  assertEqual(y2025?.averageScorePercent, expectedAvgScore(scoresOf(batchD)), 'Year 2025 bucket averageScorePercent (Test2)');

  // === Dimension 7: semester (Academic Period) ========================================
  const reportSemester2 = await apiRequest<ReportResponse>(
    `/api/teacher/reports?groupBy=semester&testId=${test2Id}`,
    teacherToken,
  );
  const semester2Bucket = findBucket(reportSemester2, (b) => b.label === 'Semester 2 2026');
  const semester1Bucket = findBucket(reportSemester2, (b) => b.label === 'Semester 1 2026');
  const unassignedBucket = findBucket(reportSemester2, (b) => b.key === 'unassigned');
  assertEqual(semester2Bucket?.attemptCount, 2, '"Semester 2 2026" bucket attemptCount (Test2\'s Sept batch)');
  assertEqual(
    semester2Bucket?.averageScorePercent,
    expectedAvgScore(scoresOf(batchC)),
    '"Semester 2 2026" bucket averageScorePercent',
  );
  assertEqual(semester1Bucket?.attemptCount, 0, '"Semester 1 2026" bucket attemptCount is 0 for Test2 (no data there)');
  assertEqual(
    unassignedBucket?.attemptCount,
    1,
    '"Unassigned" bucket attemptCount is 1 (Test2\'s 2025-03-05 batch, outside every seeded period)',
  );
  assertEqual(
    unassignedBucket?.averageScorePercent,
    expectedAvgScore(scoresOf(batchD)),
    '"Unassigned" bucket averageScorePercent',
  );

  const reportSemester1 = await apiRequest<ReportResponse>(
    `/api/teacher/reports?groupBy=semester&testId=${test1Id}`,
    teacherToken,
  );
  const test1Semester1Bucket = findBucket(reportSemester1, (b) => b.label === 'Semester 1 2026');
  assertEqual(
    test1Semester1Bucket?.attemptCount,
    5,
    '"Semester 1 2026" bucket attemptCount is 5 for Test1 (batch A + batch B, both June)',
  );
  assertEqual(
    test1Semester1Bucket?.averageScorePercent,
    expectedAvgScore(scoresOf(allTest1)),
    '"Semester 1 2026" bucket averageScorePercent for Test1',
  );

  console.log(`\n${passCount} check(s) passed, ${failCount} failed.`);
  if (failCount > 0) {
    process.exitCode = 1;
  } else {
    console.log('T-019 reporting-engine verification: ALL CHECKS PASSED.');
  }
}

main()
  .catch((err) => {
    console.error('\n[verify-reporting] FAILED:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
