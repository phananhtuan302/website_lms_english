/**
 * Class roster + gradebook (T-104, Phase 13): the two READ endpoints behind the class
 * workspace's "Học sinh" and "Điểm số" tabs.
 *
 * - `GET /api/teacher/classes/:classId/students`  — the roster with per-student headline numbers.
 * - `GET /api/teacher/classes/:classId/gradebook` — the students × assigned-tests grid.
 *
 * Both are derived from ONE shared computation (`loadClassGrades` below), so a student's
 * "điểm trung bình" on the roster is always exactly the same number as the average at the
 * end of their gradebook row — two tabs of the same class can never disagree.
 *
 * Both are teacher/admin-only (`requireRole`) and ownership-checked with `requireOwnedClass`
 * (another teacher's class id gets the same 404 as a missing one; `admin` bypasses per
 * PROJECT_PLAN Assumption A12 — same convention as `teacherClasses.routes.ts`). Neither
 * writes anything.
 *
 * Which attempts count — deliberately identical to what the reports count (see
 * `fetchScopedAttempts` in `lib/reporting.ts`):
 *  - only `submitted` attempts (with a non-null score/time, defensively);
 *  - only attempts made by students CURRENTLY in this class (`Attempt.studentId` in the
 *    class roster — class scoping is on the attempting student, T-077);
 *  - only tests CURRENTLY assigned to (this class, this class's current period)
 *    (`TestClassPeriodAssignment`, T-099). A student's attempt at a test that is not
 *    assigned to the current semester (an older semester's test, another class's test, a
 *    self-practice-only test) never appears, and never affects an average.
 * A class with no current period has nothing "currently assigned", so it degrades to an empty
 * grid / students with no scores — never an error.
 */

import { Router } from 'express';
import type {
  ClassGradebookCellDTO,
  ClassGradebookDTO,
  ClassRosterStudentDTO,
} from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { requireOwnedClass } from '../lib/ownedClass';
import { isScorePublished } from '../lib/testClassSchedule';

export const teacherClassGradebookRouter = Router();

teacherClassGradebookRouter.use(requireAuth, requireRole('teacher', 'admin'));

/** Mean of `values` rounded to 1 decimal (the same rounding `lib/reporting.ts` uses for its
 * averages), or `null` when there is nothing to average. */
function average(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((total, value) => total + value, 0);
  return Number((sum / values.length).toFixed(1));
}

interface ClassGrades {
  students: Array<{ id: string; name: string; email: string }>;
  tests: ClassGradebookDTO['tests'];
  cells: ClassGradebookDTO['cells'];
  studentAverages: ClassGradebookDTO['studentAverages'];
  testAverages: ClassGradebookDTO['testAverages'];
}

/**
 * Builds the whole grid for one class + its current period, in a fixed number of queries
 * (students, assigned tests, schedules, attempts — never per student).
 *
 * "Best attempt" rule (BACKLOG T-104): a (student, test) cell shows the student's BEST
 * submitted attempt — the highest `scorePercent`; on a tie, the LATEST `submittedAt` (the
 * more recent of two equally good tries). A student can hold several submitted attempts at
 * one test (a live session plus self-practice, or repeated sessions), and a gradebook needs
 * one number per cell; "best" is the Canvas/Moodle default ("highest grade") and never
 * punishes a student for practising. The UI footnote says the same.
 *
 * Averages are means over NON-null cells only: a student's average covers the tests they
 * submitted, a test's average covers the students who submitted it (so "hasn't submitted"
 * never drags a number down as if it were a 0). `null` when there is nothing to average.
 */
async function loadClassGrades(classId: string, periodId: string | null): Promise<ClassGrades> {
  const students = await prisma.user.findMany({
    where: { classId, role: 'student' },
    select: { id: true, name: true, email: true },
    orderBy: [{ name: 'asc' }, { email: 'asc' }],
  });

  const empty = (): ClassGrades => ({
    students,
    tests: [],
    cells: Object.fromEntries(students.map((s) => [s.id, {}])),
    studentAverages: Object.fromEntries(students.map((s) => [s.id, null])),
    testAverages: {},
  });
  if (periodId === null) return empty();

  // Columns: the tests assigned to this class for its current semester, in the order they
  // were handed out (then by title so equal timestamps stay stable).
  const assignments = await prisma.testClassPeriodAssignment.findMany({
    where: { classId, periodId },
    orderBy: [{ createdAt: 'asc' }, { test: { title: 'asc' } }],
    select: { test: { select: { id: true, title: true, testType: true } } },
  });
  const testRows = assignments.map((a) => a.test);
  if (testRows.length === 0) return empty();

  const testIds = testRows.map((test) => test.id);
  const studentIds = students.map((student) => student.id);

  const [schedules, attempts] = await Promise.all([
    prisma.testClassSchedule.findMany({ where: { classId, periodId, testId: { in: testIds } } }),
    studentIds.length === 0
      ? Promise.resolve([])
      : prisma.attempt.findMany({
          where: {
            status: 'submitted',
            scorePercent: { not: null },
            timeTakenSeconds: { not: null },
            studentId: { in: studentIds },
            testId: { in: testIds },
          },
          select: {
            id: true,
            testId: true,
            studentId: true,
            scorePercent: true,
            correctCount: true,
            totalCount: true,
            submittedAt: true,
          },
        }),
  ]);

  const scheduleByTest = new Map(schedules.map((schedule) => [schedule.testId, schedule]));
  const tests: ClassGradebookDTO['tests'] = testRows.map((test) => ({
    id: test.id,
    title: test.title,
    testType: test.testType,
    // Same helper the student-facing endpoints use, so the teacher sees exactly what
    // students currently see (published -> their score is visible to them).
    scoresPublished: isScorePublished(scheduleByTest.get(test.id) ?? null),
  }));

  // Pick the best attempt per (student, test) — see the doc comment above.
  const best = new Map<string, (typeof attempts)[number]>();
  for (const attempt of attempts) {
    const key = `${attempt.studentId}:${attempt.testId}`;
    const current = best.get(key);
    if (!current) {
      best.set(key, attempt);
      continue;
    }
    const score = attempt.scorePercent!;
    const currentScore = current.scorePercent!;
    const isLaterSubmission =
      (attempt.submittedAt?.getTime() ?? 0) > (current.submittedAt?.getTime() ?? 0);
    if (score > currentScore || (score === currentScore && isLaterSubmission)) {
      best.set(key, attempt);
    }
  }

  const cells: ClassGradebookDTO['cells'] = {};
  const studentAverages: ClassGradebookDTO['studentAverages'] = {};
  const columnScores = new Map<string, number[]>(testIds.map((id) => [id, []]));

  for (const student of students) {
    const row: Record<string, ClassGradebookCellDTO | null> = {};
    const rowScores: number[] = [];
    for (const test of tests) {
      const attempt = best.get(`${student.id}:${test.id}`);
      if (!attempt) {
        row[test.id] = null;
        continue;
      }
      const scorePercent = attempt.scorePercent!;
      row[test.id] = {
        attemptId: attempt.id,
        scorePercent,
        correctCount: attempt.correctCount ?? 0,
        totalCount: attempt.totalCount ?? 0,
        submittedAt: attempt.submittedAt ? attempt.submittedAt.toISOString() : '',
      };
      rowScores.push(scorePercent);
      columnScores.get(test.id)!.push(scorePercent);
    }
    cells[student.id] = row;
    studentAverages[student.id] = average(rowScores);
  }

  const testAverages: ClassGradebookDTO['testAverages'] = {};
  for (const test of tests) testAverages[test.id] = average(columnScores.get(test.id)!);

  return { students, tests, cells, studentAverages, testAverages };
}

/**
 * GET /api/teacher/classes/:classId/students — the class roster for the "Học sinh" tab:
 * `[{ id, name, email, submittedCount, averageScorePercent }]`, sorted by name.
 *
 * `submittedCount` = how many of the class's currently assigned tests the student has
 * submitted (each test counted once, however many tries they made) and
 * `averageScorePercent` = the mean of their best score on each of those — i.e. the very
 * same numbers as the gradebook row, by construction. `0` / `null` when they have submitted
 * nothing, or when the class has no current semester.
 */
teacherClassGradebookRouter.get(
  '/classes/:classId/students',
  asyncHandler(async (req, res) => {
    const cls = await requireOwnedClass(req.params.classId, req.user!, res);
    if (!cls) return;

    const grades = await loadClassGrades(cls.id, cls.currentPeriodId);
    const roster: ClassRosterStudentDTO[] = grades.students.map((student) => ({
      id: student.id,
      name: student.name,
      email: student.email,
      submittedCount: Object.values(grades.cells[student.id] ?? {}).filter((cell) => cell !== null)
        .length,
      averageScorePercent: grades.studentAverages[student.id] ?? null,
    }));
    res.status(200).json(roster);
  }),
);

/**
 * GET /api/teacher/classes/:classId/gradebook — the grid for the "Điểm số" tab. See the
 * module doc comment for what is counted and `loadClassGrades` for the best-attempt rule.
 * A class with no current semester (or no assigned tests) returns the class's students with
 * an empty `tests` list — an empty grid, not an error.
 */
teacherClassGradebookRouter.get(
  '/classes/:classId/gradebook',
  asyncHandler(async (req, res) => {
    const cls = await requireOwnedClass(req.params.classId, req.user!, res);
    if (!cls) return;

    const grades = await loadClassGrades(cls.id, cls.currentPeriodId);
    const response: ClassGradebookDTO = {
      classId: cls.id,
      periodId: cls.currentPeriodId,
      students: grades.students.map((student) => ({ id: student.id, name: student.name })),
      tests: grades.tests,
      cells: grades.cells,
      studentAverages: grades.studentAverages,
      testAverages: grades.testAverages,
    };
    res.status(200).json(response);
  }),
);
