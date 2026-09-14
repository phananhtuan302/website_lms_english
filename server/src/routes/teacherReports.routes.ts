/**
 * Teacher-only reporting endpoint (T-019): a thin HTTP layer over the shared
 * `computeReport` engine in `../lib/reporting.ts` — all the validation/ownership work
 * here, none of the actual bucketing/aggregation math (that lives in the engine so it
 * stays testable/reusable independent of Express).
 */

import { Router } from 'express';
import type { ReportResponseDTO, SpeakingReportResponseDTO, TestType } from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import {
  computeReport,
  computeSpeakingReport,
  REPORT_GROUP_BY_VALUES,
  SPEAKING_REPORT_GROUP_BY_VALUES,
  type ReportGroupBy,
  type SpeakingReportGroupBy,
} from '../lib/reporting';

export const teacherReportsRouter = Router();

teacherReportsRouter.use(requireAuth, requireRole('teacher'));

const TEST_TYPE_VALUES: TestType[] = ['generic', 'unitTest', 'vocabularyCheck', 'listeningTest', 'mockTest'];

function isReportGroupBy(value: unknown): value is ReportGroupBy {
  return typeof value === 'string' && (REPORT_GROUP_BY_VALUES as readonly string[]).includes(value);
}

function isTestType(value: unknown): value is TestType {
  return typeof value === 'string' && (TEST_TYPE_VALUES as readonly string[]).includes(value);
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

    // T-037: optional `testType` filter (e.g. `unitTest`) so the same shared engine can
    // narrow a Unit's report down to specifically its Unit Test(s) — see
    // `ComputeReportOptions.testType`'s doc comment.
    const testTypeRaw = req.query.testType;
    let testType: TestType | null = null;
    if (typeof testTypeRaw === 'string' && testTypeRaw.trim() !== '') {
      if (!isTestType(testTypeRaw)) {
        res.status(400).json({ error: `testType must be one of: ${TEST_TYPE_VALUES.join(', ')}.` });
        return;
      }
      testType = testTypeRaw;
    }

    const result = await computeReport({
      teacherId: req.user!.sub,
      groupBy: groupByRaw,
      testId,
      unitId,
      testType,
    });

    const body: ReportResponseDTO = result;
    res.status(200).json(body);
  }),
);

// --- Speaking reports (T-057) ---------------------------------------------------------
// Thin HTTP layer over `computeSpeakingReport`, same "validation here, math in the
// engine" split as the `/reports` handler above — added here (rather than a new router
// file) since this is already the teacher-only reporting router. See that engine
// function's doc comment in `../lib/reporting.ts` for what "average score" means for
// Speaking (teacher-override-wins effective score) and why "average time taken" is
// always null for this module.

function isSpeakingReportGroupBy(value: unknown): value is SpeakingReportGroupBy {
  return (
    typeof value === 'string' && (SPEAKING_REPORT_GROUP_BY_VALUES as readonly string[]).includes(value)
  );
}

teacherReportsRouter.get(
  '/speaking-reports',
  asyncHandler(async (req, res) => {
    const groupByRaw = req.query.groupBy;
    if (!isSpeakingReportGroupBy(groupByRaw)) {
      res.status(400).json({
        error: `groupBy is required and must be one of: ${SPEAKING_REPORT_GROUP_BY_VALUES.join(', ')}.`,
      });
      return;
    }

    const testIdRaw = req.query.testId;
    let testId: string | null = null;
    if (typeof testIdRaw === 'string' && testIdRaw.trim() !== '') {
      const test = await prisma.test.findUnique({ where: { id: testIdRaw } });
      if (!test || test.teacherId !== req.user!.sub) {
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

    const result = await computeSpeakingReport({
      teacherId: req.user!.sub,
      groupBy: groupByRaw,
      testId,
      unitId,
    });

    const body: SpeakingReportResponseDTO = result;
    res.status(200).json(body);
  }),
);
