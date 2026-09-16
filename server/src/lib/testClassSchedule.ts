/**
 * T-093: shared helpers for `TestClassSchedule` (the per-(test, class) availability
 * window + score-publish state — see that model's doc comment in `schema.prisma` for the
 * full design). Centralized here so the "effectively published" rule and the "can a
 * student start/join a NEW attempt right now" rule are computed IDENTICALLY everywhere
 * they're needed (`attempts.routes.ts`, `teacherTests.routes.ts`, `practice.routes.ts`,
 * `sessions.routes.ts`) instead of re-derived per route.
 */

import type { TestClassSchedule } from '@prisma/client';
import type { TestClassScheduleDTO } from '@platform/shared';
import { prisma } from './prisma';

/** Looks up the (testId, classId) schedule row, or `null` if the teacher never
 * configured one — callers must treat `null` as "fully unrestricted, not published",
 * exactly like every test authored before T-092/T-093 (backward compatible). */
export function findTestClassSchedule(testId: string, classId: string) {
  return prisma.testClassSchedule.findUnique({ where: { testId_classId: { testId, classId } } });
}

/** "Effectively published" (T-093's OR rule): `scoresPublishedManually === true` OR
 * (`autoPublishScoresOnClose === true` AND `closeAt` is set AND has already passed).
 * Evaluated lazily against `new Date()` at call time — no cron job/background scheduler,
 * matching this codebase's existing "evaluate time windows lazily at request time"
 * convention (e.g. Speaking's response-window check). `null` (no row at all) = not
 * published, same as T-092's original "row presence" rule. */
export function isScorePublished(
  schedule: Pick<TestClassSchedule, 'scoresPublishedManually' | 'autoPublishScoresOnClose' | 'closeAt'> | null,
): boolean {
  if (!schedule) return false;
  if (schedule.scoresPublishedManually) return true;
  return schedule.autoPublishScoresOnClose && schedule.closeAt !== null && schedule.closeAt.getTime() <= Date.now();
}

/** Can a student start/join a brand-NEW attempt right now, per this class's
 * `openAt`/`closeAt` window? Returns `null` if allowed, or a user-facing rejection
 * message (Vietnamese, per the customer's exact requested wording in BACKLOG.md T-093)
 * if not. `null` schedule (no row configured) = unrestricted, exactly like every test
 * authored before T-093.
 *
 * Deliberately takes only `openAt`/`closeAt` — never called for an attempt that already
 * exists (see both call sites' "resume an existing attempt" exemption, per BACKLOG.md
 * T-093's explicit scoping: an attempt already legitimately started before `closeAt` is
 * NOT cut off mid-attempt). Never called from any answer-writing/continuation endpoint. */
export function checkAttemptWindow(
  schedule: Pick<TestClassSchedule, 'openAt' | 'closeAt'> | null,
): string | null {
  if (!schedule) return null;
  const now = new Date();
  if (schedule.openAt && now < schedule.openAt) return 'Bài chưa mở, quay lại sau.';
  if (schedule.closeAt && now > schedule.closeAt) return 'Đã quá giờ làm bài, bài này đã đóng.';
  return null;
}

/** Builds the full `TestClassScheduleDTO` for a (testId, classId) pair, including the
 * computed `scoresPublished` field — used by `GET /api/teacher/tests/:testId/attempts`
 * and `PUT /api/teacher/tests/:testId/schedule`'s response so the teacher UI always sees
 * the complete current schedule, not just a single boolean. A `null` schedule (no row
 * configured yet) renders as every field at its backward-compatible default. */
export function toTestClassScheduleDTO(
  testId: string,
  classId: string,
  schedule: TestClassSchedule | null,
): TestClassScheduleDTO {
  return {
    testId,
    classId,
    openAt: schedule?.openAt ? schedule.openAt.toISOString() : null,
    closeAt: schedule?.closeAt ? schedule.closeAt.toISOString() : null,
    scoresPublishedManually: schedule?.scoresPublishedManually ?? false,
    autoPublishScoresOnClose: schedule?.autoPublishScoresOnClose ?? false,
    scoresPublished: isScorePublished(schedule),
  };
}
