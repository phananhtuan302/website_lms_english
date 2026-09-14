/**
 * Teacher-only Unit Test management (T-036): a grouped-by-Unit view of the calling
 * teacher's own `testType: 'unitTest'` tests. Tagging a test AS a Unit Test (setting
 * `testType`/`unitId`/`published`) is done through the existing test editor
 * (`PATCH /api/teacher/tests/:testId`, extended in `teacherTests.routes.ts`) — this file
 * only adds the read-side "list them grouped by Unit" view, per Guiding Principle 6
 * (extend the one Test authoring engine, don't fork a parallel one).
 *
 * Mounted at `/api/teacher` (same prefix as `teacherTestsRouter`) but under the distinct
 * top-level path segment `unit-tests`, so there is no route-ordering collision with
 * `teacherTestsRouter`'s own `/tests/:testId` param route.
 */

import { Router } from 'express';
import type { TeacherUnitTestsResponseDTO, TestSummaryDTO, UnitTestGroupDTO } from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';

export const teacherUnitTestsRouter = Router();

teacherUnitTestsRouter.use(requireAuth, requireRole('teacher'));

teacherUnitTestsRouter.get(
  '/unit-tests',
  asyncHandler(async (req, res) => {
    const tests = await prisma.test.findMany({
      where: { teacherId: req.user!.sub, testType: 'unitTest' },
      orderBy: { updatedAt: 'desc' },
      include: {
        sections: { include: { _count: { select: { questions: true } } } },
        unit: { select: { id: true, name: true, order: true } },
      },
    });

    const timeStats = await prisma.attempt.groupBy({
      by: ['testId'],
      where: { testId: { in: tests.map((t) => t.id) }, status: 'submitted', timeTakenSeconds: { not: null } },
      _avg: { timeTakenSeconds: true },
      _count: { _all: true },
    });
    const timeStatsByTestId = new Map(timeStats.map((s) => [s.testId, s]));

    const summaries: Array<TestSummaryDTO & { unitOrder: number }> = tests.map((test) => {
      const stats = timeStatsByTestId.get(test.id);
      return {
        id: test.id,
        title: test.title,
        sectionCount: test.sections.length,
        questionCount: test.sections.reduce((sum, s) => sum + s._count.questions, 0),
        unitId: test.unitId,
        unitName: test.unit?.name ?? null,
        testType: test.testType,
        published: test.published,
        createdAt: test.createdAt.toISOString(),
        updatedAt: test.updatedAt.toISOString(),
        averageTimeTakenSeconds:
          stats && stats._avg.timeTakenSeconds != null ? Math.round(stats._avg.timeTakenSeconds) : null,
        completedAttemptCount: stats?._count._all ?? 0,
        // Sort-only field, stripped before responding — see the grouping below.
        unitOrder: test.unit?.order ?? Number.MAX_SAFE_INTEGER,
      };
    });

    // Group by Unit (curriculum order; "Untagged" last), same convention as
    // `computeReport`'s `buildUnitBuckets` (T-019) for the "0-row untagged bucket last"
    // ordering rule.
    const groupsByUnitId = new Map<string, UnitTestGroupDTO<TestSummaryDTO>>();
    const order: string[] = [];
    for (const summary of summaries.sort((a, b) => a.unitOrder - b.unitOrder || a.title.localeCompare(b.title))) {
      const key = summary.unitId ?? 'untagged';
      if (!groupsByUnitId.has(key)) {
        groupsByUnitId.set(key, { unitId: summary.unitId, unitName: summary.unitName, tests: [] });
        order.push(key);
      }
      const { unitOrder: _unitOrder, ...rest } = summary;
      groupsByUnitId.get(key)!.tests.push(rest);
    }

    const response: TeacherUnitTestsResponseDTO = {
      groups: order.map((key) => groupsByUnitId.get(key)!),
    };
    res.status(200).json(response);
  }),
);
