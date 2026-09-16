/**
 * Admin-only scores/attempts management (T-072a): browse every attempt in the whole
 * system (any student, any test — not scoped to a specific test/session like the
 * existing teacher views) and delete one outright.
 *
 * Deliberately NOT the place viewing-one-attempt's-detail or editing its essay/Speaking
 * manual grade lives — those already exist at `GET /api/teacher/attempts/:attemptId` and
 * `PATCH /api/teacher/attempts/:attemptId/answers/:questionId/grade`
 * (`teacherSessions.routes.ts`), and were already extended in T-071 to accept an admin
 * caller via `isAdminOrOwner` (admin bypasses the `attempt.test.teacherId` ownership
 * check unconditionally). Reusing those endpoints as-is — rather than building a parallel
 * admin-only scoring mechanism — is exactly what T-072's acceptance criteria asks for, so
 * this router only adds the two things that genuinely don't exist anywhere yet: a
 * system-wide browse list, and attempt deletion.
 *
 * Every route here is admin-only (`requireRole('admin')`).
 */

import { Router } from 'express';
import type { AdminAttemptListResponseDTO, AttemptSummaryDTO } from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';

export const adminAttemptsRouter = Router();

adminAttemptsRouter.use(requireAuth, requireRole('admin'));

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function parsePositiveInt(raw: unknown, fallback: number, max?: number): number {
  const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  const value = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  return max !== undefined ? Math.min(value, max) : value;
}

/** GET /api/admin/attempts?search=&page=&pageSize= — every attempt in the system, newest
 * first, optionally narrowed by a case-insensitive substring match on the student's name/
 * email OR the test's title. Paginated (default 20/page, capped at 100/page) since this
 * has no other scoping and can grow unbounded across every student and every test. */
adminAttemptsRouter.get(
  '/attempts',
  asyncHandler(async (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const page = parsePositiveInt(req.query.page, 1);
    const pageSize = parsePositiveInt(req.query.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    const where = search
      ? {
          OR: [
            { student: { name: { contains: search, mode: 'insensitive' as const } } },
            { student: { email: { contains: search, mode: 'insensitive' as const } } },
            { test: { title: { contains: search, mode: 'insensitive' as const } } },
          ],
        }
      : {};

    const [total, attempts] = await Promise.all([
      prisma.attempt.count({ where }),
      prisma.attempt.findMany({
        where,
        include: { student: true, test: { select: { id: true, title: true } } },
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const summaries: AttemptSummaryDTO[] = attempts.map((a) => ({
      attemptId: a.id,
      sessionId: a.sessionId,
      testId: a.testId,
      testTitle: a.test.title,
      studentId: a.studentId,
      studentName: a.student.name,
      studentEmail: a.student.email,
      status: a.status,
      correctCount: a.correctCount,
      totalCount: a.totalCount,
      scorePercent: a.scorePercent,
      startedAt: a.startedAt.toISOString(),
      submittedAt: a.submittedAt ? a.submittedAt.toISOString() : null,
      timeTakenSeconds: a.timeTakenSeconds,
      tabSwitchCount: a.tabSwitchCount,
      // T-092: admin-facing (same "always full detail" rule as every teacher-facing
      // view) — never gated by the per-(test,class) score-release toggle.
      scoresPublished: true,
    }));

    const response: AdminAttemptListResponseDTO = { attempts: summaries, total, page, pageSize };
    res.status(200).json(response);
  }),
);

/** DELETE /api/admin/attempts/:attemptId — permanently deletes an attempt (and, per the
 * existing schema relation `Answer.attempt onDelete: Cascade`, every one of its answers)
 * regardless of which student/test/teacher it belongs to. No soft-delete/undo — same
 * "cascades exactly per the existing schema relations, no custom semantics" convention
 * already established for `DELETE /api/admin/users/:userId` (T-070). */
adminAttemptsRouter.delete(
  '/attempts/:attemptId',
  asyncHandler(async (req, res) => {
    const attempt = await prisma.attempt.findUnique({ where: { id: req.params.attemptId } });
    if (!attempt) {
      res.status(404).json({ error: 'Attempt not found.' });
      return;
    }

    await prisma.attempt.delete({ where: { id: attempt.id } });
    res.status(204).send();
  }),
);
