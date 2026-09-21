/**
 * Student-facing "tests relevant to me, grouped/filtered appropriately" views (T-036
 * Unit Tests, T-038 Vocabulary Checks). Both list endpoints return each test alongside
 * the student's OWN attempt status (if any), and both are STARTED via the exact same
 * self-practice endpoint (`POST /api/tests/:testId/practice`, `practice.routes.ts`) that
 * every other standalone test attempt already uses — nothing new is built for "taking"
 * either type, per Guiding Principle 6.
 *
 * Mounted at `/api/student` — a fresh top-level prefix distinct from `/api/teacher`
 * (teacher-only), `/api/tests` (self-practice), `/api/attempts`, `/api/sessions`,
 * `/api/flashcard-sets`, and `/api/grammar-topics`.
 */

import { Router } from 'express';
import type {
  StudentAssignmentsResponseDTO,
  StudentUnitTestSummaryDTO,
  StudentUnitTestsResponseDTO,
  StudentVocabularyCheckSummaryDTO,
  UnitTestGroupDTO,
} from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { getStudentClassAndPeriod } from '../lib/classScoping';
import { buildStudentAssignments } from '../lib/studentAssignments';
import { isScorePublished } from '../lib/testClassSchedule';

export const studentAssignedTestsRouter = Router();

studentAssignedTestsRouter.use(requireAuth, requireRole('student'));

/** Loads this student's most recent attempt (if any) for each of `testIds`, keyed by
 * `testId` — used to decorate both list endpoints below with "Take" vs. "Resume" vs.
 * "View result" without a second round-trip per test. */
async function loadMyAttemptsByTestId(
  studentId: string,
  testIds: string[],
): Promise<Map<string, { attemptId: string; status: 'inProgress' | 'submitted'; scorePercent: number | null }>> {
  if (testIds.length === 0) return new Map();
  const attempts = await prisma.attempt.findMany({
    where: { studentId, testId: { in: testIds } },
    orderBy: { startedAt: 'desc' },
    select: { id: true, testId: true, status: true, scorePercent: true },
  });
  const map = new Map<string, { attemptId: string; status: 'inProgress' | 'submitted'; scorePercent: number | null }>();
  for (const attempt of attempts) {
    // Already ordered newest-first — the first one seen per testId is the most recent.
    if (!map.has(attempt.testId)) {
      map.set(attempt.testId, { attemptId: attempt.id, status: attempt.status, scorePercent: attempt.scorePercent });
    }
  }
  return map;
}

/** `GET /api/student/unit-tests` — every PUBLISHED `unitTest`-type test ALSO ASSIGNED TO
 * THE CALLING STUDENT'S OWN CLASS, grouped by Unit (curriculum order, "Untagged" last).
 * See `Test.published`'s doc comment in schema.prisma for the "available to students"
 * semantics (T-036) — T-076 (Phase 12) adds the class-assignment condition ON TOP of
 * `published`, per that task's explicit "Unit Test visibility should follow the same
 * assigned-to-my-class rule as any other Test" requirement. A classless student
 * (shouldn't happen post-T-074/T-075) sees an empty response rather than every unit test
 * or a crash. */
studentAssignedTestsRouter.get(
  '/unit-tests',
  asyncHandler(async (req, res) => {
    const scp = await getStudentClassAndPeriod(req.user!.sub);
    if (!scp || scp.periodId == null) {
      res.status(200).json({ groups: [] } satisfies StudentUnitTestsResponseDTO);
      return;
    }

    const tests = await prisma.test.findMany({
      where: {
        testType: 'unitTest',
        published: true,
        classAssignments: { some: { classId: scp.classId, periodId: scp.periodId } },
      },
      include: { unit: { select: { id: true, name: true, order: true } } },
      orderBy: { title: 'asc' },
    });

    const myAttempts = await loadMyAttemptsByTestId(req.user!.sub, tests.map((t) => t.id));
    // T-092 also applies here: a submitted attempt's score stays hidden until the teacher releases
    // scores for the student's class + semester (the same `isScorePublished` rule as everywhere).
    const schedules = await prisma.testClassSchedule.findMany({
      where: { classId: scp.classId, periodId: scp.periodId, testId: { in: tests.map((t) => t.id) } },
    });
    const scheduleByTestId = new Map(schedules.map((schedule) => [schedule.testId, schedule]));
    for (const test of tests) {
      const attempt = myAttempts.get(test.id);
      if (attempt && attempt.status === 'submitted' && !isScorePublished(scheduleByTestId.get(test.id) ?? null)) {
        myAttempts.set(test.id, { ...attempt, scorePercent: null });
      }
    }

    const sorted = [...tests].sort(
      (a, b) => (a.unit?.order ?? Number.MAX_SAFE_INTEGER) - (b.unit?.order ?? Number.MAX_SAFE_INTEGER) ||
        a.title.localeCompare(b.title),
    );

    const groupsByUnitId = new Map<string, UnitTestGroupDTO<StudentUnitTestSummaryDTO>>();
    const order: string[] = [];
    for (const test of sorted) {
      const key = test.unitId ?? 'untagged';
      if (!groupsByUnitId.has(key)) {
        groupsByUnitId.set(key, { unitId: test.unitId, unitName: test.unit?.name ?? null, tests: [] });
        order.push(key);
      }
      groupsByUnitId.get(key)!.tests.push({
        id: test.id,
        title: test.title,
        unitId: test.unitId,
        unitName: test.unit?.name ?? null,
        myAttempt: myAttempts.get(test.id) ?? null,
      });
    }

    const response: StudentUnitTestsResponseDTO = { groups: order.map((key) => groupsByUnitId.get(key)!) };
    res.status(200).json(response);
  }),
);

/** `GET /api/student/vocabulary-checks` — every `vocabularyCheck`-type test this student
 * has been individually GRANTED via `TestAssignment` (T-038) — never the whole class,
 * unlike Unit Tests' `published`-flag gate (see `TestAssignment`'s doc comment in
 * schema.prisma for why these two access mechanisms differ).
 *
 * T-076 (Phase 12) deliberately adds NO class-assignment condition here: a Vocabulary
 * Check's per-student `TestAssignment` grant is already a strictly NARROWER access rule
 * than class-scoping (one specific student, not "anyone in class X"), and its question
 * pool is drawn from that SAME student's own studied vocabulary rather than from one
 * particular class-assignable `FlashcardSet` — there is no meaningful "source content
 * assigned to a class" to check it against, and `Test.classes` is never populated for
 * this type in the first place (see `teacherVocabularyCheck.routes.ts`). Confirmed as
 * part of T-076's acceptance criteria ("if that's even a meaningful constraint here") —
 * it isn't, so this endpoint is unchanged. */
studentAssignedTestsRouter.get(
  '/vocabulary-checks',
  asyncHandler(async (req, res) => {
    const tests = await prisma.test.findMany({
      where: { testType: 'vocabularyCheck', assignments: { some: { studentId: req.user!.sub } } },
      include: { sections: { select: { questions: { select: { id: true } } } } },
      orderBy: { createdAt: 'desc' },
    });

    const myAttempts = await loadMyAttemptsByTestId(req.user!.sub, tests.map((t) => t.id));

    const response: StudentVocabularyCheckSummaryDTO[] = tests.map((test) => ({
      id: test.id,
      title: test.title,
      timeLimitMinutes: test.timeLimitMinutes ?? 15,
      questionCount: test.sections.reduce((sum, s) => sum + s.questions.length, 0),
      myAttempt: myAttempts.get(test.id) ?? null,
      createdAt: test.createdAt.toISOString(),
    }));
    res.status(200).json(response);
  }),
);

/** `GET /api/student/assignments` (T-105, Phase 13) — the student's unified "Bài cần làm"
 * list: everything assigned to their own class + that class's current semester (plus their
 * personally-granted Vocabulary Checks), across every content type, each with a
 * server-derived status. All the rules live in `lib/studentAssignments.ts`, which composes
 * the same checks the start endpoints enforce — this route is just the HTTP shell. */
studentAssignedTestsRouter.get(
  '/assignments',
  asyncHandler(async (req, res) => {
    const response: StudentAssignmentsResponseDTO = await buildStudentAssignments(req.user!.sub);
    res.status(200).json(response);
  }),
);
