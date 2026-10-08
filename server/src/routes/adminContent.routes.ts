/**
 * Admin-only "browse everything" list views (T-071): one list endpoint per content type
 * (Tests, Flashcard sets, Grammar topics) showing which teacher owns each item — the one
 * thing the existing teacher-only list endpoints never needed to show (a teacher only
 * ever sees their own items there). This is deliberately the ONLY new admin-specific
 * surface for content oversight — actually viewing/editing/deleting a specific item
 * reuses the EXISTING teacher-side routes/editor pages as-is, since
 * `requireOwnedTest`/`requireOwnedFlashcardSet`/`requireOwnedGrammarTopic` (and the
 * teacher-only routers' role gates) were extended to also allow `role === 'admin'` — see
 * `lib/authz.ts`'s `isAdminOrOwner` and each of those routers' own doc comments.
 *
 * Every route here is admin-only (`requireRole('admin')`).
 */

import { Router } from 'express';
import type {
  AdminFlashcardSetSummaryDTO,
  AdminGrammarTopicSummaryDTO,
  AdminTestSummaryDTO,
} from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';

export const adminContentRouter = Router();

adminContentRouter.use(requireAuth, requireRole('admin'));

/** GET /api/admin/tests — every test in the system, newest-updated first, with its
 * owning teacher's identity. Same average-time-taken computation as the teacher-only
 * `GET /api/teacher/tests` list (T-017), just across every test instead of one teacher's. */
adminContentRouter.get(
  '/tests',
  asyncHandler(async (_req, res) => {
    const tests = await prisma.test.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        sections: { include: { _count: { select: { questions: true } } } },
        unit: { select: { id: true, name: true } },
        teacher: { select: { id: true, name: true, email: true } },
      },
    });

    const timeStats = await prisma.attempt.groupBy({
      by: ['testId'],
      where: {
        testId: { in: tests.map((t) => t.id) },
        status: 'submitted',
        timeTakenSeconds: { not: null },
        // 2026-10: exclude no-account guest QR-session joins — see the identical note in
        // `teacherTests.routes.ts`'s own `timeStats` query.
        student: { isGuest: false },
      },
      _avg: { timeTakenSeconds: true },
      _count: { _all: true },
    });
    const timeStatsByTestId = new Map(timeStats.map((s) => [s.testId, s]));

    const summaries: AdminTestSummaryDTO[] = tests.map((test) => {
      const stats = timeStatsByTestId.get(test.id);
      const averageTimeTakenSeconds =
        stats && stats._avg.timeTakenSeconds != null ? Math.round(stats._avg.timeTakenSeconds) : null;
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
        averageTimeTakenSeconds,
        completedAttemptCount: stats?._count._all ?? 0,
        teacherId: test.teacher.id,
        teacherName: test.teacher.name,
        teacherEmail: test.teacher.email,
      };
    });

    res.status(200).json(summaries);
  }),
);

/** GET /api/admin/flashcard-sets — every flashcard set in the system, with owner info. */
adminContentRouter.get(
  '/flashcard-sets',
  asyncHandler(async (_req, res) => {
    const sets = await prisma.flashcardSet.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        unit: { select: { id: true, name: true } },
        teacher: { select: { id: true, name: true, email: true } },
        _count: { select: { cards: true } },
      },
    });

    const summaries: AdminFlashcardSetSummaryDTO[] = sets.map((set) => ({
      id: set.id,
      name: set.name,
      unitId: set.unitId,
      unitName: set.unit?.name ?? null,
      cardCount: set._count.cards,
      createdAt: set.createdAt.toISOString(),
      updatedAt: set.updatedAt.toISOString(),
      teacherId: set.teacher.id,
      teacherName: set.teacher.name,
      teacherEmail: set.teacher.email,
    }));

    res.status(200).json(summaries);
  }),
);

/** GET /api/admin/grammar-topics — every Grammar topic in the system, with owner info. */
adminContentRouter.get(
  '/grammar-topics',
  asyncHandler(async (_req, res) => {
    const topics = await prisma.grammarTopic.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        unit: { select: { id: true, name: true } },
        teacher: { select: { id: true, name: true, email: true } },
        _count: { select: { exercises: true } },
      },
    });

    const summaries: AdminGrammarTopicSummaryDTO[] = topics.map((topic) => ({
      id: topic.id,
      title: topic.title,
      unitId: topic.unitId,
      unitName: topic.unit?.name ?? null,
      exerciseCount: topic._count.exercises,
      createdAt: topic.createdAt.toISOString(),
      updatedAt: topic.updatedAt.toISOString(),
      teacherId: topic.teacher.id,
      teacherName: topic.teacher.name,
      teacherEmail: topic.teacher.email,
    }));

    res.status(200).json(summaries);
  }),
);
