/**
 * Unit Test report & leaderboard (T-037) — visible to BOTH roles (`requireAuth` only, no
 * `requireRole`, same convention as `vocabLeaderboard.routes.ts`), built entirely on
 * T-019's shared `computeReport` engine (`groupBy: 'student'` for the ranked list,
 * `groupBy: 'unit'` for the unit-wide average), both narrowed to `unitId` + `testType:
 * 'unitTest'` — no one-off aggregation query is written here, per this task's explicit
 * instruction.
 *
 * Deliberately NOT scoped by `teacherId` (unlike `teacherReports.routes.ts`): `Unit` is a
 * GLOBAL curriculum entity (schema.prisma's `Unit` doc comment — this is a single small
 * teaching business, not a multi-tenant one), and a student has no single "their teacher"
 * to scope by in the first place. `computeReport`'s `teacherId` is optional exactly for
 * this caller (T-037) — see `ComputeReportOptions.teacherId`'s doc comment.
 *
 * Class scoping (T-077, Phase 12): the leaderboard/aggregate now covers ONE class at a
 * time — `?classId=` resolved via `resolveViewerClassId` (`../lib/reportClassScope.ts`),
 * same both-roles resolution rule as `vocabLeaderboard.routes.ts` (a student's own class
 * is used automatically; a teacher/admin passes/defaults an explicit `classId`, which for
 * this endpoint means "one of MY OWN classes" regardless of which teacher authored the
 * underlying Unit Test — `Unit`/its tests may be global/shared, but the class the caller
 * is scoping to is still their own).
 *
 * Mounted at `/api/units` — a fresh top-level prefix distinct from `/api/teacher/units`
 * (curriculum Unit CRUD, `curriculum.routes.ts`), so there is no route collision.
 */

import { Router } from 'express';
import type { UnitLeaderboardEntryDTO, UnitLeaderboardResponseDTO } from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { computeReport } from '../lib/reporting';
import { isClassScopeFailure, resolveViewerClassId } from '../lib/reportClassScope';

export const unitLeaderboardRouter = Router();

unitLeaderboardRouter.use(requireAuth);

unitLeaderboardRouter.get(
  '/:unitId/leaderboard',
  asyncHandler(async (req, res) => {
    const unit = await prisma.unit.findUnique({ where: { id: req.params.unitId } });
    if (!unit) {
      res.status(404).json({ error: 'Unit not found.' });
      return;
    }

    const scope = await resolveViewerClassId(req.user!, req.query.classId);
    if (isClassScopeFailure(scope)) {
      res.status(scope.status).json({ error: scope.error });
      return;
    }

    const [studentReport, unitReport] = await Promise.all([
      computeReport({ groupBy: 'student', unitId: unit.id, testType: 'unitTest', classId: scope.classId }),
      computeReport({ groupBy: 'unit', unitId: unit.id, testType: 'unitTest', classId: scope.classId }),
    ]);

    const entries: UnitLeaderboardEntryDTO[] = studentReport.buckets.map((bucket, index) => ({
      rank: index + 1,
      studentId: bucket.key,
      studentName: bucket.label,
      attemptCount: bucket.attemptCount,
      averageScorePercent: bucket.averageScorePercent,
    }));

    // `unitReport` narrows to exactly this one unit, so at most one bucket comes back.
    const aggregate = unitReport.buckets[0];

    const response: UnitLeaderboardResponseDTO = {
      unitId: unit.id,
      unitName: unit.name,
      classId: scope.classId,
      className: scope.className,
      attemptCount: aggregate?.attemptCount ?? 0,
      averageScorePercent: aggregate?.averageScorePercent ?? null,
      entries,
    };
    res.status(200).json(response);
  }),
);
