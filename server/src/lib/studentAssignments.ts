/**
 * T-105 (Phase 13): builds the student's unified "Bài cần làm" list for
 * `GET /api/student/assignments` — ONE list across every content type for the student's own
 * class + that class's CURRENT semester, replacing the old per-type student menus.
 *
 * The one hard rule: this list must never advertise something the START endpoint would
 * reject. So nothing here invents its own visibility/availability logic — every decision is
 * a composition of the exact rules `practice.routes.ts` (`GET /api/tests` + `POST
 * /:testId/practice`), `studentAssignedTests.routes.ts` and `sessions.routes.ts` already
 * enforce, reusing their helpers:
 *
 * - candidate set: same `where` clauses as those lists — generic/listening/mock tests need a
 *   `TestClassPeriodAssignment` for (my class, my class's current period); a Unit Test also
 *   needs `published`; a Vocabulary Check comes from MY `TestAssignment` rows and is NEVER
 *   class-scoped (its grant is per student, see `practice.routes.ts`).
 * - `getStudentClassAndPeriod` — class + current period, read fresh from the DB.
 * - `checkAttemptWindow` — the SAME open/close-window check the start/join endpoints run
 *   (returns non-`null` exactly when a brand-new attempt would be rejected); I only add the
 *   "was it rejected because too early or too late" classification on top of it.
 * - `isScorePublished` — the SAME "effectively published" rule `GET /api/attempts` uses, so a
 *   score is only ever revealed when that route would also reveal it.
 * - a test with no `TestVariant` at all is left out: `findOrCreateAttempt` answers 400 "no
 *   variants yet" for it, so it is not something a student can start (unless they already
 *   have an attempt, which necessarily has a variant).
 *
 * An existing attempt takes priority over the schedule window, exactly like the start
 * endpoints: continuing/finishing an already-started attempt is never cut off by `closeAt`
 * (BACKLOG T-093), and a submitted attempt is `submitted` whatever the window says.
 */

import type { Attempt, TestClassSchedule } from '@prisma/client';
import type {
  StudentAssignmentAttemptDTO,
  StudentAssignmentDTO,
  StudentAssignmentStatus,
  StudentAssignmentsResponseDTO,
} from '@platform/shared';
import { prisma } from './prisma';
import { getStudentClassAndPeriod } from './classScoping';
import { checkAttemptWindow, isScorePublished } from './testClassSchedule';

/** Status precedence for the final display order (matches the dashboard's section order). */
const STATUS_ORDER: StudentAssignmentStatus[] = ['inProgress', 'open', 'upcoming', 'submitted', 'closed'];

/** A row plus the internal timestamps used only for sorting within its status group. */
interface SortableRow {
  dto: StudentAssignmentDTO;
  startedAt: Date | null;
  submittedAt: Date | null;
  openAt: Date | null;
  closeAt: Date | null;
}

function asc(a: Date | null, b: Date | null): number {
  // Earliest first; `null` (no date) sorts last.
  if (a && b) return a.getTime() - b.getTime();
  if (a) return -1;
  if (b) return 1;
  return 0;
}

function desc(a: Date | null, b: Date | null): number {
  if (a && b) return b.getTime() - a.getTime();
  if (a) return -1;
  if (b) return 1;
  return 0;
}

function compareRows(a: SortableRow, b: SortableRow): number {
  const byStatus = STATUS_ORDER.indexOf(a.dto.status) - STATUS_ORDER.indexOf(b.dto.status);
  if (byStatus !== 0) return byStatus;
  let byTime = 0;
  switch (a.dto.status) {
    case 'inProgress':
      byTime = desc(a.startedAt, b.startedAt);
      break;
    case 'open':
      byTime = asc(a.closeAt, b.closeAt);
      break;
    case 'upcoming':
      byTime = asc(a.openAt, b.openAt);
      break;
    case 'submitted':
      byTime = desc(a.submittedAt, b.submittedAt);
      break;
    case 'closed':
      byTime = desc(a.closeAt, b.closeAt);
      break;
  }
  return byTime || a.dto.title.localeCompare(b.dto.title);
}

/** The attempt to show for a test: an in-progress one wins (it is the actionable one),
 * else the most recent. `attempts` must already be newest-first. */
function pickAttempt(attempts: Attempt[] | undefined): Attempt | null {
  if (!attempts || attempts.length === 0) return null;
  return attempts.find((a) => a.status === 'inProgress') ?? attempts[0];
}

export async function buildStudentAssignments(studentId: string): Promise<StudentAssignmentsResponseDTO> {
  const scp = await getStudentClassAndPeriod(studentId);
  // null when there is nothing to scope class assignments against (no class, or no current period).
  const scope = scp && scp.periodId != null ? { classId: scp.classId, periodId: scp.periodId } : null;

  // Display names for the dashboard's "Lớp 1A1 · Học kỳ ..." line. Read in one query.
  const classInfo = scp
    ? await prisma.class.findUnique({
        where: { id: scp.classId },
        select: { name: true, currentPeriod: { select: { id: true, name: true } } },
      })
    : null;

  const response: StudentAssignmentsResponseDTO = {
    classId: scp?.classId ?? null,
    className: classInfo?.name ?? null,
    periodId: classInfo?.currentPeriod?.id ?? null,
    periodName: classInfo?.currentPeriod?.name ?? null,
    items: [],
  };

  const testSelect = {
    id: true,
    title: true,
    testType: true,
    unitId: true,
    unit: { select: { name: true } },
    _count: { select: { variants: true } },
  } as const;

  // --- Candidate tests: same visibility rules as the existing student lists -----------
  const [classTests, vocabChecks] = await Promise.all([
    scope
      ? prisma.test.findMany({
          where: {
            classAssignments: { some: { classId: scope.classId, periodId: scope.periodId } },
            // `GET /api/tests` excludes unitTest + vocabularyCheck from the generic list;
            // `GET /api/student/unit-tests` adds published Unit Tests back in. Together:
            OR: [{ testType: { notIn: ['unitTest', 'vocabularyCheck'] } }, { testType: 'unitTest', published: true }],
          },
          select: testSelect,
        })
      : Promise.resolve([]),
    // Per-student grant, never class-scoped (see module doc comment).
    prisma.test.findMany({
      where: { testType: 'vocabularyCheck', assignments: { some: { studentId } } },
      select: testSelect,
    }),
  ]);
  const tests = [...classTests, ...vocabChecks];
  const testIds = tests.map((t) => t.id);

  // --- The student's own attempts + the class's schedule rows, batched ---------------
  const [attempts, schedules] = await Promise.all([
    testIds.length > 0
      ? prisma.attempt.findMany({
          where: { studentId, testId: { in: testIds } },
          orderBy: { startedAt: 'desc' },
        })
      : Promise.resolve([] as Attempt[]),
    scope && testIds.length > 0
      ? prisma.testClassSchedule.findMany({
          where: { classId: scope.classId, periodId: scope.periodId, testId: { in: testIds } },
        })
      : Promise.resolve([] as TestClassSchedule[]),
  ]);
  const attemptsByTestId = new Map<string, Attempt[]>();
  for (const attempt of attempts) {
    const list = attemptsByTestId.get(attempt.testId);
    if (list) list.push(attempt);
    else attemptsByTestId.set(attempt.testId, [attempt]);
  }
  const scheduleByTestId = new Map(schedules.map((s) => [s.testId, s]));

  const now = new Date();
  const rows: SortableRow[] = [];

  for (const test of tests) {
    const schedule = scheduleByTestId.get(test.id) ?? null;
    const attempt = pickAttempt(attemptsByTestId.get(test.id));

    let status: StudentAssignmentStatus;
    if (attempt) {
      status = attempt.status === 'submitted' ? 'submitted' : 'inProgress';
    } else if (test._count.variants === 0) {
      // `POST /:testId/practice` would answer 400 "no variants yet" — not startable, so
      // not a to-do (the teacher hasn't finished preparing it).
      continue;
    } else if (checkAttemptWindow(schedule, now) === null) {
      status = 'open';
    } else if (schedule?.openAt && now < schedule.openAt) {
      // `checkAttemptWindow` tests `openAt` first, so a rejection while `now < openAt` is
      // the "too early" one; otherwise it was the `closeAt` one.
      status = 'upcoming';
    } else {
      status = 'closed';
    }

    let myAttempt: StudentAssignmentAttemptDTO | null = null;
    if (attempt) {
      // Same rule as `GET /api/attempts`: only a submitted attempt can have its score
      // withheld; an in-progress one has no score yet.
      const scoresPublished = attempt.status !== 'submitted' || isScorePublished(schedule);
      myAttempt = {
        attemptId: attempt.id,
        status: attempt.status,
        scorePercent: scoresPublished ? attempt.scorePercent : null,
        scoresPublished,
      };
    }

    rows.push({
      dto: {
        kind: test.testType === 'unitTest' ? 'unitTest' : test.testType === 'vocabularyCheck' ? 'vocabularyCheck' : 'test',
        id: test.id,
        title: test.title,
        status,
        openAt: schedule?.openAt ? schedule.openAt.toISOString() : null,
        closeAt: schedule?.closeAt ? schedule.closeAt.toISOString() : null,
        unitId: test.unitId,
        unitName: test.unit?.name ?? null,
        myAttempt,
      },
      startedAt: attempt?.startedAt ?? null,
      submittedAt: attempt?.submittedAt ?? null,
      openAt: schedule?.openAt ?? null,
      closeAt: schedule?.closeAt ?? null,
    });
  }

  rows.sort(compareRows);
  response.items = rows.map((r) => r.dto);

  // --- Study areas: always open, same class+period rule as their own list endpoints ----
  if (scope) {
    const [sets, topics] = await Promise.all([
      prisma.flashcardSet.findMany({
        where: { classAssignments: { some: { classId: scope.classId, periodId: scope.periodId } } },
        select: { id: true, name: true, unitId: true, unit: { select: { name: true } } },
        orderBy: { name: 'asc' },
      }),
      prisma.grammarTopic.findMany({
        where: { classAssignments: { some: { classId: scope.classId, periodId: scope.periodId } } },
        select: { id: true, title: true, unitId: true, unit: { select: { name: true } } },
        orderBy: { title: 'asc' },
      }),
    ]);
    for (const set of sets) {
      response.items.push({
        kind: 'flashcardSet',
        id: set.id,
        title: set.name,
        status: 'open',
        openAt: null,
        closeAt: null,
        unitId: set.unitId,
        unitName: set.unit?.name ?? null,
        myAttempt: null,
      });
    }
    for (const topic of topics) {
      response.items.push({
        kind: 'grammarTopic',
        id: topic.id,
        title: topic.title,
        status: 'open',
        openAt: null,
        closeAt: null,
        unitId: topic.unitId,
        unitName: topic.unit?.name ?? null,
        myAttempt: null,
      });
    }
  }

  return response;
}
