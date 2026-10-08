/**
 * 2026-10 (`TestSession.endAt`, customer: "có thể setup thời gian mở đóng làm bài"):
 * lazily closes a live QR session once its configured `endAt` has passed — same
 * "evaluate time windows at the next touch, no cron job" convention this codebase
 * already uses for `TestClassSchedule` (`checkAttemptWindow`) and for an abandoned
 * attempt's own time limit (`autoFinalizeIfExpired`, `attempts.routes.ts`).
 *
 * Scope: gates NEW joins only (same as `startAt`'s wait gate and `checkAttemptWindow`'s
 * `closeAt`) — a student already mid-attempt when `endAt` passes is never force-submitted
 * by this; their own test's time limit (if any) is what ends THEIR attempt.
 */
import { prisma } from './prisma';
import { markSessionClosed } from '../realtime/sessionRealtime';

/** At most one session is ever `active` per test (starting a new one auto-closes the
 * old — see `teacherSessions.routes.ts`), so this never touches more than one row in
 * practice; it still handles the general case (any `active` session of this test whose
 * `endAt` has passed) rather than assuming that invariant. */
export async function autoCloseExpiredSessionsForTest(testId: string): Promise<void> {
  const now = new Date();
  const expired = await prisma.testSession.findMany({
    where: { testId, status: 'active', endAt: { lte: now } },
    select: { id: true, endAt: true },
  });
  for (const session of expired) {
    await prisma.testSession.update({
      where: { id: session.id },
      // `closedAt` is the configured `endAt` itself, not `now` — more truthful to when
      // the teacher actually meant it to end, even if nobody loaded it again until later.
      data: { status: 'closed', closedAt: session.endAt },
    });
    markSessionClosed(session.id);
  }
}
