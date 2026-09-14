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
  StudentUnitTestSummaryDTO,
  StudentUnitTestsResponseDTO,
  StudentVocabularyCheckSummaryDTO,
  UnitTestGroupDTO,
} from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';

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

/** `GET /api/student/unit-tests` — every PUBLISHED `unitTest`-type test, grouped by Unit
 * (curriculum order, "Untagged" last). See `Test.published`'s doc comment in
 * schema.prisma for the documented "available to students" semantics (T-036). */
studentAssignedTestsRouter.get(
  '/unit-tests',
  asyncHandler(async (req, res) => {
    const tests = await prisma.test.findMany({
      where: { testType: 'unitTest', published: true },
      include: { unit: { select: { id: true, name: true, order: true } } },
      orderBy: { title: 'asc' },
    });

    const myAttempts = await loadMyAttemptsByTestId(req.user!.sub, tests.map((t) => t.id));

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
 * schema.prisma for why these two access mechanisms differ). */
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
