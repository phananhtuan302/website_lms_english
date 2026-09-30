/**
 * `GET /api/teacher/classes/:classId/overview` (T-107, Phase 14) — the read model behind the
 * class workspace's "Tổng quan" tab, which is a "Cần chú ý" (needs attention) dashboard:
 * what is about to close, which submissions wait for the teacher's grade, who has not handed
 * in a closed / closing test, and the latest submissions.
 *
 * Read-only, and it invents no new rule — every notion is one the product already has:
 * - the scope is the tests assigned to (this class, the class's CURRENT period)
 *   (`TestClassPeriodAssignment`, T-099) and the students CURRENTLY in the class — identical to
 *   the gradebook/roster (`teacherClassGradebook.routes.ts`);
 * - "open / closing / closed" is `checkAttemptWindow` on the test's `TestClassSchedule` row
 *   (the very check the start endpoints run); "score visible" is `isScorePublished`;
 * - a test only counts as "something students can do" under the rules of
 *   `lib/studentAssignments.ts`: not a per-student Vocabulary Check, an unpublished Unit Test
 *   is invisible to students, and a test with no `TestVariant` cannot be started;
 * - "awaiting grading" is the existing essay state: a submitted attempt with an `essay`
 *   answer whose `manualScore` is still `null` (the "Chưa chấm" state of the teacher attempt
 *   page and the student result page). Speaking is AI-scored the moment it is submitted
 *   (`Answer.speakingAiScore`) — a teacher override is optional — so Speaking has no
 *   "awaiting grading" state and is not part of that list.
 *
 * Ownership: same convention as every class route — a missing class and another teacher's
 * class answer an identical 404; `admin` bypasses. No current semester → everything empty,
 * never an error.
 *
 * Query budget is constant (roster, assignments, schedules, three counts, one distinct
 * (test, student) submission scan, the grading count + top-N, the recent-N) — no per-student or
 * per-test loops that issue queries.
 *
 * The same router also serves `GET /api/teacher/classes-attention` (Phase 14, usability pass): the
 * per-class counts behind the badges on the teacher home page's class cards. The rules both
 * endpoints share (startable test, closing soon / closed, awaiting grading) live in
 * `lib/classAttention.ts`.
 */

import { Router } from 'express';
import type {
  ClassesAttentionResponseDTO,
  ClassOverviewActivityDTO,
  ClassOverviewClosingSoonDTO,
  ClassOverviewDTO,
  ClassOverviewNeedsGradingItemDTO,
  ClassOverviewNotSubmittedDTO,
} from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { isAdminOrOwner } from '../lib/authz';
import { isScorePublished } from '../lib/testClassSchedule';
import { awaitingGradingWhere, classifyClassTests, computeClassesAttention } from '../lib/classAttention';

export const teacherClassOverviewRouter = Router();

teacherClassOverviewRouter.use(requireAuth, requireRole('teacher', 'admin'));

/** How many awaiting-grading attempts the list shows (the total is returned separately). */
const NEEDS_GRADING_LIMIT = 8;
/** How many tests / students per test the "chưa nộp" card lists (the rest is a "+N"). */
const NOT_SUBMITTED_TEST_LIMIT = 5;
const NOT_SUBMITTED_STUDENT_LIMIT = 8;
const RECENT_ACTIVITY_LIMIT = 10;

teacherClassOverviewRouter.get(
  '/classes/:classId/overview',
  asyncHandler(async (req, res) => {
    const cls = await prisma.class.findUnique({
      where: { id: req.params.classId },
      select: {
        id: true,
        teacherId: true,
        currentPeriodId: true,
        currentPeriod: { select: { name: true } },
      },
    });
    if (!cls || !isAdminOrOwner(req.user!, cls.teacherId)) {
      res.status(404).json({ error: 'Class not found.' });
      return;
    }

    const students = await prisma.user.findMany({
      where: { classId: cls.id, role: 'student' },
      select: { id: true, name: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    const studentName = new Map(students.map((student) => [student.id, student.name]));

    const periodId = cls.currentPeriodId;
    const body: ClassOverviewDTO = {
      classId: cls.id,
      periodId: null,
      periodName: null,
      studentCount: students.length,
      assignmentCount: 0,
      openCount: 0,
      closingSoon: [],
      needsGrading: { count: 0, items: [] },
      notSubmitted: { tests: [], moreTestCount: 0 },
      recentActivity: [],
    };
    if (periodId == null) {
      res.status(200).json(body);
      return;
    }
    body.periodId = periodId;
    body.periodName = cls.currentPeriod?.name ?? null;

    const scope = { classId: cls.id, periodId };
    const [testRows, flashcardSetCount, grammarTopicCount] = await Promise.all([
      prisma.testClassPeriodAssignment.findMany({
        where: scope,
        select: {
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
      prisma.flashcardSetClassPeriodAssignment.count({ where: scope }),
      prisma.grammarTopicClassPeriodAssignment.count({ where: scope }),
    ]);
    const tests = testRows.map((row) => row.test);
    body.assignmentCount = tests.length + flashcardSetCount + grammarTopicCount;
    if (tests.length === 0) {
      res.status(200).json(body);
      return;
    }

    const testIds = tests.map((test) => test.id);
    const schedules = await prisma.testClassSchedule.findMany({
      where: { ...scope, testId: { in: testIds } },
    });
    const scheduleByTest = new Map(schedules.map((schedule) => [schedule.testId, schedule]));

    // Classify every test against ONE instant so a boundary crossed mid-request cannot make
    // the lists disagree with each other (rules shared with the class-card badges).
    const now = new Date();
    const {
      openCount,
      closingSoon: closingSoonTests,
      closed: closedTests,
    } = classifyClassTests(tests, scheduleByTest, now);
    body.openCount = openCount;

    const gradingWhere = awaitingGradingWhere(testIds, cls.id);
    const watchedTestIds = [...closingSoonTests, ...closedTests].map((test) => test.id);
    const studentIds = students.map((student) => student.id);

    const [submittedPairs, gradingCount, gradingRows, recentRows] = await Promise.all([
      // One row per distinct (test, student) pair with a submitted attempt — a student's
      // retakes collapse, so a per-test tally is "N students submitted", not "N attempts".
      watchedTestIds.length === 0 || studentIds.length === 0
        ? Promise.resolve([] as Array<{ testId: string; studentId: string }>)
        : prisma.attempt.findMany({
            where: { status: 'submitted', testId: { in: watchedTestIds }, studentId: { in: studentIds } },
            distinct: ['testId', 'studentId'],
            select: { testId: true, studentId: true },
          }),
      prisma.attempt.count({ where: gradingWhere }),
      prisma.attempt.findMany({
        where: gradingWhere,
        // Longest-waiting first: this is a queue, not a feed.
        orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
        take: NEEDS_GRADING_LIMIT,
        select: {
          id: true,
          studentId: true,
          testId: true,
          submittedAt: true,
          _count: { select: { answers: { where: { manualScore: null, essayAiScore: null, question: { type: 'essay' } } } } },
        },
      }),
      prisma.attempt.findMany({
        where: {
          status: 'submitted',
          submittedAt: { not: null },
          testId: { in: testIds },
          student: { classId: cls.id },
        },
        orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }],
        take: RECENT_ACTIVITY_LIMIT,
        select: { id: true, studentId: true, testId: true, submittedAt: true, scorePercent: true },
      }),
    ]);

    const submittedByTest = new Map<string, Set<string>>();
    for (const pair of submittedPairs) {
      const set = submittedByTest.get(pair.testId);
      if (set) set.add(pair.studentId);
      else submittedByTest.set(pair.testId, new Set([pair.studentId]));
    }
    const testTitle = new Map(tests.map((test) => [test.id, test.title]));

    body.closingSoon = closingSoonTests.map(
      (test): ClassOverviewClosingSoonDTO => ({
        testId: test.id,
        title: test.title,
        closeAt: test.closeAt.toISOString(),
        submittedCount: submittedByTest.get(test.id)?.size ?? 0,
        studentCount: students.length,
      }),
    );

    // Closing-soon tests first (soonest deadline), then closed ones (most recently closed).
    const notSubmitted: ClassOverviewNotSubmittedDTO[] = [];
    for (const test of [...closingSoonTests, ...closedTests]) {
      const submitted = submittedByTest.get(test.id);
      const missing = students.filter((student) => !submitted?.has(student.id));
      if (missing.length === 0) continue;
      notSubmitted.push({
        testId: test.id,
        title: test.title,
        closeAt: test.closeAt.toISOString(),
        closed: test.closeAt < now,
        missingCount: missing.length,
        students: missing.slice(0, NOT_SUBMITTED_STUDENT_LIMIT),
        moreCount: Math.max(0, missing.length - NOT_SUBMITTED_STUDENT_LIMIT),
      });
    }
    body.notSubmitted = {
      tests: notSubmitted.slice(0, NOT_SUBMITTED_TEST_LIMIT),
      moreTestCount: Math.max(0, notSubmitted.length - NOT_SUBMITTED_TEST_LIMIT),
    };

    body.needsGrading = {
      count: gradingCount,
      items: gradingRows.map(
        (attempt): ClassOverviewNeedsGradingItemDTO => ({
          attemptId: attempt.id,
          studentId: attempt.studentId,
          studentName: studentName.get(attempt.studentId) ?? '',
          testId: attempt.testId,
          testTitle: testTitle.get(attempt.testId) ?? '',
          submittedAt: attempt.submittedAt ? attempt.submittedAt.toISOString() : '',
          ungradedCount: attempt._count.answers,
        }),
      ),
    };

    body.recentActivity = recentRows.map((attempt): ClassOverviewActivityDTO => {
      const scoresPublished = isScorePublished(scheduleByTest.get(attempt.testId) ?? null);
      return {
        attemptId: attempt.id,
        studentId: attempt.studentId,
        studentName: studentName.get(attempt.studentId) ?? '',
        testId: attempt.testId,
        testTitle: testTitle.get(attempt.testId) ?? '',
        submittedAt: attempt.submittedAt ? attempt.submittedAt.toISOString() : '',
        scoresPublished,
        scorePercent: scoresPublished ? attempt.scorePercent : null,
      };
    });

    res.status(200).json(body);
  }),
);

/**
 * `GET /api/teacher/classes-attention` — for each of the calling teacher's classes (the same set
 * as `GET /api/teacher/classes`), how many tests are closing soon, how many students have not
 * submitted a closing-soon or closed test (and, of those, how many are missing a test that is
 * already closed), and how many submissions await grading. All are 0 for a class with no
 * current semester or nothing assigned. The path deliberately is not
 * under `/classes/:classId`, so it can never be mistaken for a class id.
 */
teacherClassOverviewRouter.get(
  '/classes-attention',
  asyncHandler(async (req, res) => {
    const classes = await prisma.class.findMany({
      where: { teacherId: req.user!.sub },
      orderBy: { createdAt: 'asc' },
      select: { id: true, currentPeriodId: true },
    });
    const body: ClassesAttentionResponseDTO = { classes: await computeClassesAttention(classes) };
    res.status(200).json(body);
  }),
);
