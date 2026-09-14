/**
 * Teacher-only reporting endpoint (T-019): a thin HTTP layer over the shared
 * `computeReport` engine in `../lib/reporting.ts` — all the validation/ownership work
 * here, none of the actual bucketing/aggregation math (that lives in the engine so it
 * stays testable/reusable independent of Express).
 */

import { Router } from 'express';
import type { ReportResponseDTO } from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { computeReport, REPORT_GROUP_BY_VALUES, type ReportGroupBy } from '../lib/reporting';

export const teacherReportsRouter = Router();

teacherReportsRouter.use(requireAuth, requireRole('teacher'));

function isReportGroupBy(value: unknown): value is ReportGroupBy {
  return typeof value === 'string' && (REPORT_GROUP_BY_VALUES as readonly string[]).includes(value);
}

teacherReportsRouter.get(
  '/reports',
  asyncHandler(async (req, res) => {
    const groupByRaw = req.query.groupBy;
    if (!isReportGroupBy(groupByRaw)) {
      res.status(400).json({
        error: `groupBy is required and must be one of: ${REPORT_GROUP_BY_VALUES.join(', ')}.`,
      });
      return;
    }

    const testIdRaw = req.query.testId;
    let testId: string | null = null;
    if (typeof testIdRaw === 'string' && testIdRaw.trim() !== '') {
      const test = await prisma.test.findUnique({ where: { id: testIdRaw } });
      if (!test || test.teacherId !== req.user!.sub) {
        // Same "identical 404 for not-found-or-not-yours" convention as
        // `requireOwnedTest` — a teacher probing another teacher's test id via this
        // query param learns nothing beyond "not found".
        res.status(404).json({ error: 'Test not found.' });
        return;
      }
      testId = test.id;
    }

    const unitIdRaw = req.query.unitId;
    let unitId: string | null = null;
    if (typeof unitIdRaw === 'string' && unitIdRaw.trim() !== '') {
      const unit = await prisma.unit.findUnique({ where: { id: unitIdRaw } });
      if (!unit) {
        res.status(400).json({ error: 'unitId does not reference an existing Unit.' });
        return;
      }
      unitId = unit.id;
    }

    const result = await computeReport({
      teacherId: req.user!.sub,
      groupBy: groupByRaw,
      testId,
      unitId,
    });

    const body: ReportResponseDTO = result;
    res.status(200).json(body);
  }),
);
