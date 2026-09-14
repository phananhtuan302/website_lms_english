/**
 * Vocabulary leaderboard (T-031) — the ONLY vocab-progress endpoint visible to BOTH
 * roles (`requireAuth` only, no `requireRole`), per its acceptance criteria "visible to
 * both teacher and students." The monthly/yearly ranking VARIANTS (T-032/T-033) are
 * teacher-only per their own acceptance criteria ("a teacher can select...") and live in
 * `teacherVocabProgress.routes.ts` instead. All-time scoring math lives in
 * `../lib/vocabLeaderboard.ts` — this file is just the thin HTTP layer, same split as
 * `teacherReports.routes.ts` over `../lib/reporting.ts`.
 */

import { Router } from 'express';
import type { VocabLeaderboardResponseDTO } from '@platform/shared';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { computeAllTimeLeaderboard } from '../lib/vocabLeaderboard';

export const vocabLeaderboardRouter = Router();

vocabLeaderboardRouter.use(requireAuth);

vocabLeaderboardRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const entries = await computeAllTimeLeaderboard();
    const response: VocabLeaderboardResponseDTO = { entries };
    res.status(200).json(response);
  }),
);
