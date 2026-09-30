/**
 * "What needs the teacher's attention" rules shared by the class workspace's "Tổng quan" tab
 * (`teacherClassOverview.routes.ts`, one class, full lists) and the class-card badges on the
 * teacher home page (`GET /api/teacher/classes-attention`, every class of the teacher, counts
 * only). Both answer from the SAME notions, kept here so the two can never drift apart:
 *
 * - a test only counts as "something students can do" under the rules of
 *   `lib/studentAssignments.ts` — not a per-student Vocabulary Check, an unpublished Unit Test
 *   is invisible to students, a test with no `TestVariant` cannot be started (`isStartableTest`);
 * - "open / closing soon / closed" is `checkAttemptWindow` on the test's `TestClassSchedule` row
 *   (`classifyClassTests`); "closing soon" = `closeAt` within `CLOSING_SOON_WINDOW_MS`;
 * - "awaiting grading" is a submitted attempt holding an `essay` answer with no `manualScore`
 *   AND no `essayAiScore` (`awaitingGradingWhere`) — 2026-09: essays are now AI-graded
 *   automatically at submit time too, same as Speaking, so a routine AI-graded essay no longer
 *   sits in this queue; only the rare case the AI grading call itself failed does. A teacher can
 *   still open and override any AI-graded essay at any time — this queue is just "genuinely
 *   nobody has scored this yet", not "no human has looked at it";
 * - "not submitted" = a student of the class with no submitted attempt on a closing-soon or
 *   closed test.
 *
 * Scope everywhere: the tests assigned to (class, the class's CURRENT period) and the students
 * CURRENTLY in the class. A class with no current period has nothing to report (all zeros).
 */

import type { Prisma } from '@prisma/client';
import type { ClassAttentionDTO } from '@platform/shared';
import { prisma } from './prisma';
import { checkAttemptWindow } from './testClassSchedule';

/** A test whose `closeAt` falls within this long from now is "closing soon". */
export const CLOSING_SOON_WINDOW_MS = 72 * 60 * 60 * 1000;

/** The fields of a test the attention rules need. */
export interface AttentionTest {
  id: string;
  title: string;
  testType: string;
  published: boolean;
  _count: { variants: number };
}

/** The window fields of a `TestClassSchedule` row the classification needs. */
export interface AttentionSchedule {
  openAt: Date | null;
  closeAt: Date | null;
}

/** A test that is closing soon or already closed, with the moment it closes. */
export interface WatchedTest {
  id: string;
  title: string;
  closeAt: Date;
}

/** Students can only ever do what the student list would show them (see module doc). */
export function isStartableTest(test: AttentionTest): boolean {
  return (
    test.testType !== 'vocabularyCheck' &&
    (test.testType !== 'unitTest' || test.published) &&
    test._count.variants > 0
  );
}

/**
 * Classifies a class's tests against ONE instant (so a boundary crossed mid-request cannot make
 * two lists disagree): how many are open right now, which of the open ones close within
 * `CLOSING_SOON_WINDOW_MS` (soonest first) and which have already closed (most recently closed
 * first). A test with no schedule row is unrestricted: open, never closing, never closed.
 */
export function classifyClassTests(
  tests: AttentionTest[],
  scheduleByTest: Map<string, AttentionSchedule>,
  now: Date,
): { openCount: number; closingSoon: WatchedTest[]; closed: WatchedTest[] } {
  const soonLimit = now.getTime() + CLOSING_SOON_WINDOW_MS;
  let openCount = 0;
  const closingSoon: WatchedTest[] = [];
  const closed: WatchedTest[] = [];
  for (const test of tests) {
    if (!isStartableTest(test)) continue;
    const schedule = scheduleByTest.get(test.id) ?? null;
    if (checkAttemptWindow(schedule, now) === null) {
      openCount += 1;
      const closeAt = schedule?.closeAt ?? null;
      if (closeAt && closeAt.getTime() <= soonLimit) {
        closingSoon.push({ id: test.id, title: test.title, closeAt });
      }
    } else if (schedule?.closeAt && now > schedule.closeAt) {
      closed.push({ id: test.id, title: test.title, closeAt: schedule.closeAt });
    }
  }
  closingSoon.sort((a, b) => a.closeAt.getTime() - b.closeAt.getTime());
  closed.sort((a, b) => b.closeAt.getTime() - a.closeAt.getTime());
  return { openCount, closingSoon, closed };
}

/** Submitted attempts, on `testIds`, by students of `classId` (one class or several), that hold
 * an essay answer nobody has graded yet. */
export function awaitingGradingWhere(
  testIds: string[],
  classId: string | string[],
): Prisma.AttemptWhereInput {
  return {
    status: 'submitted',
    testId: { in: testIds },
    student: { classId: typeof classId === 'string' ? classId : { in: classId } },
    answers: { some: { manualScore: null, essayAiScore: null, question: { type: 'essay' } } },
  };
}

function emptyAttention(classId: string): ClassAttentionDTO {
  return {
    classId,
    closingSoonCount: 0,
    notSubmittedStudentCount: 0,
    overdueNotSubmittedStudentCount: 0,
    needsGradingCount: 0,
  };
}

/**
 * The per-class counts behind the class-card badges, for every class in `classes` at once —
 * a constant number of queries however many classes there are (students, assigned tests,
 * schedules, the awaiting-grading attempts, the distinct (test, student) submissions), never a
 * query per class. Each count equals the matching figure of the class's own overview:
 * `closingSoonCount` = `closingSoon.length`, `needsGradingCount` = `needsGrading.count`,
 * `notSubmittedStudentCount` = the distinct students named in `notSubmitted` (uncapped).
 * `overdueNotSubmittedStudentCount` is the subset of those missing a test that is already CLOSED
 * (a student who only lacks a still-open, closing-soon test is not counted there).
 */
export async function computeClassesAttention(
  classes: Array<{ id: string; currentPeriodId: string | null }>,
): Promise<ClassAttentionDTO[]> {
  const result = new Map<string, ClassAttentionDTO>(classes.map((cls) => [cls.id, emptyAttention(cls.id)]));
  const scoped = classes.filter(
    (cls): cls is { id: string; currentPeriodId: string } => cls.currentPeriodId !== null,
  );
  if (scoped.length === 0) return classes.map((cls) => result.get(cls.id)!);

  const classIds = scoped.map((cls) => cls.id);
  const scopes = scoped.map((cls) => ({ classId: cls.id, periodId: cls.currentPeriodId }));

  const [students, assignmentRows] = await Promise.all([
    prisma.user.findMany({
      where: { classId: { in: classIds }, role: 'student' },
      select: { id: true, classId: true },
    }),
    prisma.testClassPeriodAssignment.findMany({
      where: { OR: scopes },
      select: {
        classId: true,
        test: {
          select: {
            id: true,
            title: true,
            testType: true,
            published: true,
            _count: { select: { variants: true } },
          },
        },
      },
    }),
  ]);

  const testsByClass = new Map<string, AttentionTest[]>();
  for (const row of assignmentRows) {
    const list = testsByClass.get(row.classId);
    if (list) list.push(row.test);
    else testsByClass.set(row.classId, [row.test]);
  }
  const allTestIds = [...new Set(assignmentRows.map((row) => row.test.id))];
  if (allTestIds.length === 0) return classes.map((cls) => result.get(cls.id)!);

  const scheduleRows = await prisma.testClassSchedule.findMany({
    where: { OR: scopes, testId: { in: allTestIds } },
    select: { classId: true, testId: true, openAt: true, closeAt: true },
  });
  const schedulesByClass = new Map<string, Map<string, AttentionSchedule>>();
  for (const row of scheduleRows) {
    const byTest = schedulesByClass.get(row.classId) ?? new Map<string, AttentionSchedule>();
    byTest.set(row.testId, row);
    schedulesByClass.set(row.classId, byTest);
  }

  const now = new Date();
  const studentsByClass = new Map<string, string[]>();
  for (const student of students) {
    if (student.classId === null) continue;
    const list = studentsByClass.get(student.classId);
    if (list) list.push(student.id);
    else studentsByClass.set(student.classId, [student.id]);
  }
  const watchedByClass = new Map<string, WatchedTest[]>();
  const closedByClass = new Map<string, WatchedTest[]>();
  for (const cls of scoped) {
    const { closingSoon, closed } = classifyClassTests(
      testsByClass.get(cls.id) ?? [],
      schedulesByClass.get(cls.id) ?? new Map(),
      now,
    );
    result.get(cls.id)!.closingSoonCount = closingSoon.length;
    watchedByClass.set(cls.id, [...closingSoon, ...closed]);
    closedByClass.set(cls.id, closed);
  }

  const watchedTestIds = [...new Set([...watchedByClass.values()].flat().map((test) => test.id))];
  const studentIds = students.map((student) => student.id);
  const [gradingRows, submittedPairs] = await Promise.all([
    prisma.attempt.findMany({
      where: awaitingGradingWhere(allTestIds, classIds),
      select: { testId: true, student: { select: { classId: true } } },
    }),
    watchedTestIds.length === 0 || studentIds.length === 0
      ? Promise.resolve([] as Array<{ testId: string; studentId: string }>)
      : prisma.attempt.findMany({
          where: { status: 'submitted', testId: { in: watchedTestIds }, studentId: { in: studentIds } },
          distinct: ['testId', 'studentId'],
          select: { testId: true, studentId: true },
        }),
  ]);

  // A test can be assigned to several classes, so an attempt only counts for the class its
  // student belongs to (and only when that class has the test assigned for its current period).
  const classTestIds = new Map<string, Set<string>>(
    [...testsByClass].map(([classId, tests]) => [classId, new Set(tests.map((test) => test.id))]),
  );
  for (const row of gradingRows) {
    const classId = row.student.classId;
    if (classId !== null && classTestIds.get(classId)?.has(row.testId)) {
      result.get(classId)!.needsGradingCount += 1;
    }
  }

  const submitted = new Set(submittedPairs.map((pair) => `${pair.testId}:${pair.studentId}`));
  for (const cls of scoped) {
    const watched = watchedByClass.get(cls.id) ?? [];
    const closed = closedByClass.get(cls.id) ?? [];
    const missing = new Set<string>();
    const missingClosed = new Set<string>();
    for (const studentId of studentsByClass.get(cls.id) ?? []) {
      if (watched.some((test) => !submitted.has(`${test.id}:${studentId}`))) missing.add(studentId);
      if (closed.some((test) => !submitted.has(`${test.id}:${studentId}`))) missingClosed.add(studentId);
    }
    result.get(cls.id)!.notSubmittedStudentCount = missing.size;
    result.get(cls.id)!.overdueNotSubmittedStudentCount = missingClosed.size;
  }

  return classes.map((cls) => result.get(cls.id)!);
}
