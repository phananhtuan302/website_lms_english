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
import { isClassScopeFailure, resolveTeacherClassId } from '../lib/reportClassScope';

export const teacherReportsRouter = Router();

// T-071: `admin` also allowed here — NOT because this batch extends full reporting
// oversight to admin (that is T-072's scope: "scores/attempts management"), but because
// this router is mounted at the SAME `/api/teacher` prefix as `teacherGrammarRouter`/
// `teacherVocabProgressRouter` (both extended for admin in this batch) and Express tries
// every router mounted at a shared prefix in registration order — this router's blanket
// `.use()` auth check runs for ANY `/api/teacher/*` request that reaches it, even ones
// destined for a router mounted later, and a role mismatch here would 403 the request
// before it ever got a chance to reach that later router. Leaving this at `'teacher'`
// only was found (via live verification) to silently 403 admin's Grammar-topic and
// vocab-progress requests despite those routers' OWN checks correctly allowing admin —
// this is a required unblocking fix, not scope creep. Internal ownership checks below
// (e.g. narrowing by `testId`) are UNCHANGED — an admin caller gets their own (likely
// empty) report data by default, same "harmless empty own-data" pattern as every other
// not-yet-fully-admin-scoped list endpoint in this codebase.
teacherReportsRouter.use(requireAuth, requireRole('teacher', 'admin'));

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

    // T-077: required class dimension — resolved via the shared teacher/admin resolver
    // (auto-selects the caller's sole class, 400s if they have none or more than one and
    // didn't say which).
    const scope = await resolveTeacherClassId(req.user!, req.query.classId);
    if (isClassScopeFailure(scope)) {
      res.status(scope.status).json({ error: scope.error });
      return;
    }

    const result = await computeReport({
      teacherId: req.user!.sub,
      groupBy: groupByRaw,
      testId,
      unitId,
      testType,
      classId: scope.classId,
    });

    const body: ReportResponseDTO = { ...result, classId: scope.classId, className: scope.className };
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

    const scope = await resolveTeacherClassId(req.user!, req.query.classId);
    if (isClassScopeFailure(scope)) {
      res.status(scope.status).json({ error: scope.error });
      return;
    }

    const result = await computeSpeakingReport({
      teacherId: req.user!.sub,
      groupBy: groupByRaw,
      testId,
      unitId,
      classId: scope.classId,
    });

    const body: SpeakingReportResponseDTO = { ...result, classId: scope.classId, className: scope.className };
    res.status(200).json(body);
  }),
);
