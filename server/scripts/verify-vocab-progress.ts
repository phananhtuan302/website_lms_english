/**
 * T-030/T-031/T-032/T-033 verification script — REAL REST calls against an
 * already-running dev server + Postgres (same convention as `verify-vocab-batch.ts`),
 * plus direct Prisma reads/backdating writes to confirm exact DB state and to place
 * activity into specific past periods (same "backdate via Prisma after a real API call"
 * convention as `verify-reporting.ts`). Per PROJECT_PLAN Section 8's velocity mode, this
 * is the API/DB verification pass for this batch; no browser automation here (all four
 * tasks are data/reporting, not UI interaction).
 *
 * Scenario (three fresh students, isolated by unique emails, all activity on the same
 * seeded 5-card demo flashcard set — apple/happy/run/book/quick):
 *
 *   Student A ("high accuracy, high volume"): answers the `unscramble` exercise
 *   CORRECTLY twice for all 5 cards -> every card reaches `known`
 *   (new -> learning -> known). 10 attempts, 10 correct.
 *     accuracy = 100%, knownCardCount = 5 -> score = 100 + 5*10 = 150.
 *
 *   Student B ("high accuracy, low volume"): answers correctly twice for only 2 cards
 *   (apple, happy) -> those 2 reach `known`. 4 attempts, 4 correct.
 *     accuracy = 100%, knownCardCount = 2 -> score = 100 + 2*10 = 120.
 *
 *   Student C ("low accuracy, zero known"): answers 1 card correctly once (stays
 *   `learning`, never reaches `known`) and 3 different cards incorrectly once each
 *   (stay `new`, per `advanceStatus`'s "never regress below new" rule). 4 attempts, 1
 *   correct.
 *     accuracy = 25%, knownCardCount = 0 -> score = 25 + 0 = 25.
 *
 *   Expected all-time leaderboard order (T-031): A (150) > B (120) > C (25).
 *
 * For T-032/T-033, two MORE fresh students (X, Y) each get two batches of `unscramble`
 * attempts:
 *   - Batch 1, backdated to 2025-03-05 (a year fully in the past): X gets 5/5 correct
 *     (score 150), Y gets 1/1 correct (score 110).
 *   - Batch 2, left at "now" (today's real month/year when this script runs): X gets
 *     1/2 correct (score 60), Y gets 6/6 correct (score 160).
 *   Expected: year=2025 ranking has X > Y; year=<current year> ranking has Y > X —
 *   different years, different (and independently hand-verifiable) rankings, per T-033.
 *   month=2025-03 reproduces the batch-1 numbers exactly; month=2025-04 (no activity)
 *   returns neither X nor Y, proving the report is period-scoped, not all-time, per
 *   T-032.
 *
 * Usage: start the dev server first (`npm run dev:server` from the repo root, or the
 * root `npm run dev`), then `npm run verify:vocab-progress -w server`. Requires the
 * seeded teacher account and its demo flashcard set (`prisma/seed.ts`).
 */

import { PrismaClient } from '@prisma/client';

const API = 'http://localhost:4000';
const prisma = new PrismaClient();

let failures = 0;
function check(label: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    console.log(`  [pass] ${label}`);
  } else {
    failures += 1;
    console.error(`  [FAIL] ${label}`, detail ?? '');
  }
}

async function api<T>(
  method: string,
  path: string,
  token: string | null,
  body?: unknown,
): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const parsed = text ? JSON.parse(text) : undefined;
  return { status: res.status, body: parsed as T };
}

async function registerStudent(label: string): Promise<{ token: string; id: string; name: string }> {
  const name = `Vocab Progress Verify ${label}`;
  // Lowercased up front: the server normalizes email to lowercase at register/login
  // time (`auth.routes.ts`), so a mixed-case local part here (e.g. label "A") would
  // otherwise mismatch a case-sensitive Prisma lookup below.
  const email =
    `vocab-progress-verify-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`.toLowerCase();
  const register = await api('POST', '/api/auth/register', null, {
    email,
    password: 'student-dev-password123',
    name,
  });
  check(`student ${label} registration succeeds`, register.status === 201, register);
  const login = await api<{ token: string }>('POST', '/api/auth/login', null, {
    email,
    password: 'student-dev-password123',
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { token: login.body.token, id: user.id, name };
}

/** Submits an `unscramble` check for one card, correct or incorrect on purpose (an
 * incorrect submission is a deliberately wrong string, never the real term). */
async function submitUnscramble(
  setId: string,
  studentToken: string,
  cardId: string,
  term: string,
  correct: boolean,
): Promise<void> {
  const answer = correct ? term : `not-${term}-xyz`;
  const res = await api(
    'POST',
    `/api/flashcard-sets/${setId}/exercises/unscramble/${cardId}/check`,
    studentToken,
    { answer },
  );
  check(
    `submit unscramble for "${term}" (${correct ? 'correct' : 'incorrect'}) -> 200`,
    res.status === 200,
    res,
  );
}

async function backdateAttempts(studentId: string, after: Date, target: Date): Promise<number> {
  const rows = await prisma.flashcardExerciseAttempt.findMany({
    where: { studentId, createdAt: { gte: after } },
    select: { id: true },
  });
  for (const row of rows) {
    await prisma.flashcardExerciseAttempt.update({ where: { id: row.id }, data: { createdAt: target } });
  }
  return rows.length;
}

interface LeaderboardEntry {
  rank: number;
  studentId: string;
  studentName: string;
  knownCardCount: number;
  totalAttempts: number;
  correctAttempts: number;
  accuracyPercent: number | null;
  score: number;
}

function hcmNoon(dateIso: string): Date {
  return new Date(`${dateIso}T12:00:00+07:00`);
}

async function main() {
  console.log('=== Login as seeded teacher, find demo flashcard set ===');
  const teacherLogin = await api<{ token: string }>('POST', '/api/auth/login', null, {
    email: process.env.SEED_TEACHER_EMAIL ?? 'teacher@example.com',
    password: process.env.SEED_TEACHER_PASSWORD ?? 'teacher-dev-password123',
  });
  check('teacher login succeeds', teacherLogin.status === 200, teacherLogin);
  const teacherToken = teacherLogin.body.token;

  const setsRes = await api<Array<{ id: string; name: string }>>(
    'GET',
    '/api/teacher/flashcard-sets',
    teacherToken,
  );
  const demoSet = setsRes.body.find((s) => s.name.startsWith('Seed Demo Vocabulary Set'));
  check('demo flashcard set found', !!demoSet, setsRes.body);
  const setId = demoSet!.id;

  const setDetail = await api<{ cards: Array<{ id: string; term: string }> }>(
    'GET',
    `/api/teacher/flashcard-sets/${setId}`,
    teacherToken,
  );
  const cardsByTerm = Object.fromEntries(setDetail.body.cards.map((c) => [c.term, c]));
  const allTerms = ['apple', 'happy', 'run', 'book', 'quick'];
  check('demo set has all 5 expected seed cards', allTerms.every((t) => cardsByTerm[t]), setDetail.body.cards);

  // === T-030 + T-031 scenario: students A, B, C ======================================
  console.log('\n=== Building T-030/T-031 scenario (students A, B, C) ===');
  const studentA = await registerStudent('A');
  const studentB = await registerStudent('B');
  const studentC = await registerStudent('C');

  // Student A: 2 correct rounds on all 5 cards -> all 5 known.
  for (let round = 0; round < 2; round += 1) {
    for (const term of allTerms) {
      await submitUnscramble(setId, studentA.token, cardsByTerm[term].id, term, true);
    }
  }
  // Student B: 2 correct rounds on apple + happy only -> those 2 known.
  for (let round = 0; round < 2; round += 1) {
    for (const term of ['apple', 'happy']) {
      await submitUnscramble(setId, studentB.token, cardsByTerm[term].id, term, true);
    }
  }
  // Student C: 1 correct (run), 3 incorrect (apple, happy, book).
  await submitUnscramble(setId, studentC.token, cardsByTerm.run.id, 'run', true);
  for (const term of ['apple', 'happy', 'book']) {
    await submitUnscramble(setId, studentC.token, cardsByTerm[term].id, term, false);
  }

  // --- T-030: student's own progress view ---------------------------------------------
  console.log('\n=== T-030: student progress view ===');
  const progressA = await api<{
    sets: Array<{ setId: string; knownCount: number; learningCount: number; newCount: number; cardCount: number }>;
    activityStats: Array<{ type: string; attempted: number; correct: number; accuracyPercent: number | null }>;
  }>('GET', '/api/flashcard-sets/progress', studentA.token);
  check('student A progress: 200 OK', progressA.status === 200, progressA);
  const aSetRow = progressA.body.sets.find((s) => s.setId === setId);
  check('student A: demo set shows knownCount=5, learningCount=0, newCount=0', !!aSetRow && aSetRow.knownCount === 5 && aSetRow.learningCount === 0 && aSetRow.newCount === 0, aSetRow);
  const aUnscramble = progressA.body.activityStats.find((s) => s.type === 'unscramble');
  check('student A: unscramble stats attempted=10, correct=10, accuracy=100', !!aUnscramble && aUnscramble.attempted === 10 && aUnscramble.correct === 10 && aUnscramble.accuracyPercent === 100, aUnscramble);

  const progressC = await api<{ sets: Array<{ setId: string; knownCount: number; learningCount: number; newCount: number }> }>(
    'GET',
    '/api/flashcard-sets/progress',
    studentC.token,
  );
  const cSetRow = progressC.body.sets.find((s) => s.setId === setId);
  check('student C: demo set shows knownCount=0, learningCount=1 (run), newCount=4', !!cSetRow && cSetRow.knownCount === 0 && cSetRow.learningCount === 1 && cSetRow.newCount === 4, cSetRow);

  // A teacher must be blocked (403) from the student-only progress endpoint.
  const teacherOnStudentProgress = await api('GET', '/api/flashcard-sets/progress', teacherToken);
  check('teacher blocked (403) from student progress endpoint', teacherOnStudentProgress.status === 403, teacherOnStudentProgress);

  // --- T-030: teacher per-student + per-class progress view ---------------------------
  console.log('\n=== T-030: teacher per-set progress view ===');
  const teacherProgress = await api<{
    setId: string;
    cardCount: number;
    classSummary: { studentCount: number; knownCount: number; learningCount: number; newCount: number };
    students: Array<{
      studentId: string;
      studentName: string;
      knownCount: number;
      learningCount: number;
      newCount: number;
      activityStats: Array<{ type: string; attempted: number; correct: number }>;
    }>;
  }>('GET', `/api/teacher/flashcard-sets/${setId}/progress`, teacherToken);
  check('teacher progress view: 200 OK', teacherProgress.status === 200, teacherProgress);
  check('teacher progress view: cardCount = 5', teacherProgress.body.cardCount === 5, teacherProgress.body.cardCount);

  const rowA = teacherProgress.body.students.find((s) => s.studentId === studentA.id);
  const rowB = teacherProgress.body.students.find((s) => s.studentId === studentB.id);
  const rowC = teacherProgress.body.students.find((s) => s.studentId === studentC.id);
  check('teacher view row for A: known=5, learning=0, new=0', !!rowA && rowA.knownCount === 5 && rowA.learningCount === 0 && rowA.newCount === 0, rowA);
  check('teacher view row for B: known=2, learning=0, new=3', !!rowB && rowB.knownCount === 2 && rowB.learningCount === 0 && rowB.newCount === 3, rowB);
  check('teacher view row for C: known=0, learning=1, new=4', !!rowC && rowC.knownCount === 0 && rowC.learningCount === 1 && rowC.newCount === 4, rowC);

  // A never-active student must still appear, all-zero, so a teacher can spot who
  // hasn't practiced.
  const freshStudent = await registerStudent('NeverPracticed');
  const teacherProgress2 = await api<{ students: Array<{ studentId: string; knownCount: number; learningCount: number; newCount: number; activityStats: Array<{ attempted: number }> }> }>(
    'GET',
    `/api/teacher/flashcard-sets/${setId}/progress`,
    teacherToken,
  );
  const freshRow = teacherProgress2.body.students.find((s) => s.studentId === freshStudent.id);
  check(
    'a never-practiced student appears with all-zero stats (identifiable as "hasn\'t practiced")',
    !!freshRow && freshRow.knownCount === 0 && freshRow.learningCount === 0 && freshRow.activityStats.every((a) => a.attempted === 0),
    freshRow,
  );

  // The dev DB is shared across many prior verification runs, so other (pre-existing)
  // students may also have progress on this set — classSummary.knownCount can only be
  // >= our 4 fresh students' contribution, not exactly equal to it, unless run against a
  // pristine DB. `>=` is still a real assertion (it fails if the rollup silently drops or
  // undercounts any of our known rows) without being flaky against shared dev-DB state.
  const classSummaryMinKnown = rowA!.knownCount + rowB!.knownCount + rowC!.knownCount + freshRow!.knownCount;
  check(
    "classSummary.knownCount includes at least the sum of A+B+C+fresh's knownCount",
    teacherProgress2.body.students.length >= 4 &&
      teacherProgress2.body.classSummary.knownCount >= classSummaryMinKnown,
    { actual: teacherProgress2.body.classSummary.knownCount, minExpected: classSummaryMinKnown },
  );

  // Cross-teacher ownership: teacher2 must get 404, not the data.
  const teacher2Login = await api<{ token: string }>('POST', '/api/auth/login', null, {
    email: process.env.SEED_TEACHER_2_EMAIL ?? 'teacher2@example.com',
    password: process.env.SEED_TEACHER_2_PASSWORD ?? 'teacher2-dev-password123',
  });
  const crossTeacher = await api('GET', `/api/teacher/flashcard-sets/${setId}/progress`, teacher2Login.body.token);
  check('a non-owning teacher is blocked (404) from another teacher\'s set progress', crossTeacher.status === 404, crossTeacher);

  // --- Direct DB check: raw attempt counts match what the API reported ---------------
  const rawAttemptsA = await prisma.flashcardExerciseAttempt.count({ where: { studentId: studentA.id, type: 'unscramble' } });
  const rawCorrectA = await prisma.flashcardExerciseAttempt.count({ where: { studentId: studentA.id, type: 'unscramble', correct: true } });
  check('DB: student A has exactly 10 unscramble attempts, all correct', rawAttemptsA === 10 && rawCorrectA === 10, { rawAttemptsA, rawCorrectA });
  const rawKnownA = await prisma.flashcardProgress.count({ where: { studentId: studentA.id, status: 'known' } });
  check('DB: student A has exactly 5 known cards', rawKnownA === 5, rawKnownA);

  // --- T-031: all-time leaderboard, manual score verification -------------------------
  console.log('\n=== T-031: all-time leaderboard ===');
  const leaderboard = await api<{ entries: LeaderboardEntry[] }>('GET', '/api/vocab-leaderboard', studentA.token);
  check('leaderboard: 200 OK, visible to a student', leaderboard.status === 200, leaderboard);
  // A student must ALSO be able to reach it, and a teacher too (both-roles check).
  const leaderboardAsTeacher = await api('GET', '/api/vocab-leaderboard', teacherToken);
  check('leaderboard: also visible to a teacher (both-roles requirement)', leaderboardAsTeacher.status === 200, leaderboardAsTeacher);

  const entryA = leaderboard.body.entries.find((e) => e.studentId === studentA.id);
  const entryB = leaderboard.body.entries.find((e) => e.studentId === studentB.id);
  const entryC = leaderboard.body.entries.find((e) => e.studentId === studentC.id);
  check('leaderboard entry A: knownCardCount=5, accuracy=100, score=150', !!entryA && entryA.knownCardCount === 5 && entryA.accuracyPercent === 100 && entryA.score === 150, entryA);
  check('leaderboard entry B: knownCardCount=2, accuracy=100, score=120', !!entryB && entryB.knownCardCount === 2 && entryB.accuracyPercent === 100 && entryB.score === 120, entryB);
  check('leaderboard entry C: knownCardCount=0, accuracy=25, score=25', !!entryC && entryC.knownCardCount === 0 && entryC.accuracyPercent === 25 && entryC.score === 25, entryC);
  check(
    'leaderboard order matches manual calculation: A.rank < B.rank < C.rank (150 > 120 > 25)',
    !!entryA && !!entryB && !!entryC && entryA.rank < entryB.rank && entryB.rank < entryC.rank,
    { entryA, entryB, entryC },
  );

  // === T-032 / T-033 scenario: students X, Y across two periods ======================
  console.log('\n=== Building T-032/T-033 scenario (students X, Y across 2025 and the current year) ===');
  const studentX = await registerStudent('X');
  const studentY = await registerStudent('Y');

  const beforeBatch1 = new Date();
  // Batch 1: X gets 5/5 correct, Y gets 1/1 correct.
  for (const term of allTerms) {
    await submitUnscramble(setId, studentX.token, cardsByTerm[term].id, term, true);
  }
  await submitUnscramble(setId, studentY.token, cardsByTerm.apple.id, 'apple', true);

  const backdatedX1 = await backdateAttempts(studentX.id, beforeBatch1, hcmNoon('2025-03-05'));
  const backdatedY1 = await backdateAttempts(studentY.id, beforeBatch1, hcmNoon('2025-03-05'));
  check('backdated exactly 5 of X\'s attempts to 2025-03-05', backdatedX1 === 5, backdatedX1);
  check('backdated exactly 1 of Y\'s attempts to 2025-03-05', backdatedY1 === 1, backdatedY1);

  // Batch 2: X gets 1/2 correct, Y gets 6/6 correct. Left at "now" (today's real
  // month/year) — no backdating needed for this batch.
  await submitUnscramble(setId, studentX.token, cardsByTerm.apple.id, 'apple', true);
  await submitUnscramble(setId, studentX.token, cardsByTerm.happy.id, 'happy', false);
  for (const term of allTerms) {
    await submitUnscramble(setId, studentY.token, cardsByTerm[term].id, term, true);
  }
  await submitUnscramble(setId, studentY.token, cardsByTerm.apple.id, 'apple', true);

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1; // Real "now" is well inside the month, no HCM-boundary ambiguity risk for this check.

  // --- T-033: yearly ranking, two different years, different (correct) rankings ------
  console.log('\n=== T-033: yearly vocabulary ranking ===');
  const year2025 = await api<{ year: number; entries: LeaderboardEntry[] }>(
    'GET',
    '/api/teacher/vocab-leaderboard/yearly?year=2025',
    teacherToken,
  );
  check('yearly 2025: 200 OK', year2025.status === 200, year2025);
  const x2025 = year2025.body.entries.find((e) => e.studentId === studentX.id);
  const y2025 = year2025.body.entries.find((e) => e.studentId === studentY.id);
  check('2025: X totalAttempts=5, correctAttempts=5, accuracy=100, score=150', !!x2025 && x2025.totalAttempts === 5 && x2025.correctAttempts === 5 && x2025.accuracyPercent === 100 && x2025.score === 150, x2025);
  check('2025: Y totalAttempts=1, correctAttempts=1, accuracy=100, score=110', !!y2025 && y2025.totalAttempts === 1 && y2025.correctAttempts === 1 && y2025.accuracyPercent === 100 && y2025.score === 110, y2025);
  check('2025 ranking: X ranks above Y (150 > 110)', !!x2025 && !!y2025 && x2025.rank < y2025.rank, { x2025, y2025 });

  const currentYearReport = await api<{ year: number; entries: LeaderboardEntry[] }>(
    'GET',
    `/api/teacher/vocab-leaderboard/yearly?year=${currentYear}`,
    teacherToken,
  );
  const xCurrent = currentYearReport.body.entries.find((e) => e.studentId === studentX.id);
  const yCurrent = currentYearReport.body.entries.find((e) => e.studentId === studentY.id);
  check(`${currentYear}: X totalAttempts=2, correctAttempts=1, accuracy=50, score=60`, !!xCurrent && xCurrent.totalAttempts === 2 && xCurrent.correctAttempts === 1 && xCurrent.accuracyPercent === 50 && xCurrent.score === 60, xCurrent);
  check(`${currentYear}: Y totalAttempts=6, correctAttempts=6, accuracy=100, score=160`, !!yCurrent && yCurrent.totalAttempts === 6 && yCurrent.correctAttempts === 6 && yCurrent.accuracyPercent === 100 && yCurrent.score === 160, yCurrent);
  check(
    `${currentYear} ranking: Y ranks above X (160 > 60) — OPPOSITE of the 2025 ranking, proving different years give different, correct rankings (T-033)`,
    !!xCurrent && !!yCurrent && yCurrent.rank < xCurrent.rank,
    { xCurrent, yCurrent },
  );

  // --- T-032: monthly ranking is period-scoped, not all-time --------------------------
  console.log('\n=== T-032: monthly vocabulary ranking ===');
  const march2025 = await api<{ periodStart: string; periodEnd: string; entries: LeaderboardEntry[] }>(
    'GET',
    '/api/teacher/vocab-leaderboard/monthly?year=2025&month=3',
    teacherToken,
  );
  const xMarch = march2025.body.entries.find((e) => e.studentId === studentX.id);
  const yMarch = march2025.body.entries.find((e) => e.studentId === studentY.id);
  check('March 2025: X score=150 (matches yearly-2025 exactly, since all of X\'s 2025 activity is in March)', !!xMarch && xMarch.score === 150, xMarch);
  check('March 2025: Y score=110 (matches yearly-2025 exactly)', !!yMarch && yMarch.score === 110, yMarch);

  const april2025 = await api<{ entries: LeaderboardEntry[] }>(
    'GET',
    '/api/teacher/vocab-leaderboard/monthly?year=2025&month=4',
    teacherToken,
  );
  check(
    'April 2025 (no activity for X/Y): neither appears — proves monthly report is period-scoped, not all-time',
    !april2025.body.entries.some((e) => e.studentId === studentX.id) && !april2025.body.entries.some((e) => e.studentId === studentY.id),
    april2025.body.entries.filter((e) => e.studentId === studentX.id || e.studentId === studentY.id),
  );

  const currentMonthReport = await api<{ entries: LeaderboardEntry[] }>(
    'GET',
    `/api/teacher/vocab-leaderboard/monthly?year=${currentYear}&month=${currentMonth}`,
    teacherToken,
  );
  const xThisMonth = currentMonthReport.body.entries.find((e) => e.studentId === studentX.id);
  const yThisMonth = currentMonthReport.body.entries.find((e) => e.studentId === studentY.id);
  check(
    `Current month (${currentYear}-${currentMonth}) matches yearly-${currentYear} exactly (all batch-2 activity is this month): X score=60, Y score=160`,
    !!xThisMonth && xThisMonth.score === 60 && !!yThisMonth && yThisMonth.score === 160,
    { xThisMonth, yThisMonth },
  );

  // Bad query params must 400, not crash.
  const badMonth = await api('GET', '/api/teacher/vocab-leaderboard/monthly?year=2025&month=13', teacherToken);
  check('month=13 (invalid) returns 400, not a crash', badMonth.status === 400, badMonth);
  const missingYear = await api('GET', '/api/teacher/vocab-leaderboard/yearly', teacherToken);
  check('missing year param returns 400, not a crash', missingYear.status === 400, missingYear);

  // Role check: a student must be blocked from the teacher-only ranking endpoints.
  const studentOnMonthly = await api('GET', '/api/teacher/vocab-leaderboard/monthly?year=2025&month=3', studentA.token);
  check('student blocked (403) from teacher-only monthly ranking', studentOnMonthly.status === 403, studentOnMonthly);

  console.log(`\n=== Result: ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} ===`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error('[verify-vocab-progress] Failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
