/**
 * Vocabulary leaderboard (T-031) — the ONLY vocab-progress endpoint visible to BOTH
 * roles (`requireAuth` only, no `requireRole`), per its acceptance criteria "visible to
 * both teacher and students." The monthly/yearly ranking VARIANTS (T-032/T-033) are
 * teacher-only per their own acceptance criteria ("a teacher can select...") and live in
 * `teacherVocabProgress.routes.ts` instead. All-time scoring math lives in
 * `../lib/vocabLeaderboard.ts` — this file is just the thin HTTP layer, same split as
 * `teacherReports.routes.ts` over `../lib/reporting.ts`.
 *
 * Class scoping (T-077, Phase 12): the leaderboard now ranks ONE class at a time —
 * `?classId=` resolved via `resolveViewerClassId` (`../lib/reportClassScope.ts`). A
 * student's own class is used automatically (any `classId` they pass is ignored, per that
 * resolver's doc comment); a teacher/admin either passes an explicit `classId` (must be
 * one of their own classes) or, with exactly one class, gets it auto-selected — 2+ classes
 * with no `classId` given is a 400 asking them to pick one.
 */

import { Router } from 'express';
import type { VocabLeaderboardResponseDTO } from '@platform/shared';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { computeAllTimeLeaderboard } from '../lib/vocabLeaderboard';
import { isClassScopeFailure, requireClassPeriod, resolveViewerClassId } from '../lib/reportClassScope';

export const vocabLeaderboardRouter = Router();

vocabLeaderboardRouter.use(requireAuth);

vocabLeaderboardRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const scope = await resolveViewerClassId(req.user!, req.query.classId);
    if (isClassScopeFailure(scope)) {
      res.status(scope.status).json({ error: scope.error });
      return;
    }
    // T-099: the leaderboard also requires a CONCRETE period — see
    // `computeAllTimeLeaderboard`'s doc comment in `../lib/vocabLeaderboard.ts`.
    const periodScope = requireClassPeriod(scope);
    if (isClassScopeFailure(periodScope)) {
      res.status(periodScope.status).json({ error: periodScope.error });
      return;
    }

    const entries = await computeAllTimeLeaderboard(periodScope.classId, periodScope.periodId);
    const response: VocabLeaderboardResponseDTO = {
      classId: periodScope.classId,
      className: periodScope.className,
      periodId: periodScope.periodId,
      periodName: periodScope.periodName,
      entries,
    };
    res.status(200).json(response);
  }),
);
