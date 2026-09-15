/**
 * Consolidated "My Content" listing (T-075, Phase 12): `GET /api/teacher/content` returns
 * every Test/FlashcardSet/GrammarTopic the calling teacher has authored, grouped by type,
 * each carrying its current assigned-classIds — everything the `/teacher/content` page
 * needs to render its per-item class-chip toggles in one round-trip, without opening any
 * item's full editor (per the customer's explicit "one consolidated page" request, see
 * PROJECT_PLAN.md Phase 12).
 *
 * Read-only: the actual per-item assignment writes go through each content type's own
 * `PUT .../:id/classes` endpoint (`teacherTests.routes.ts`/`teacherFlashcards.routes.ts`/
 * `teacherGrammar.routes.ts`), not this router — same "list here, mutate on the owning
 * resource's own router" split already used throughout this codebase (e.g. `GET /tests`
 * vs. `PATCH /tests/:testId`).
 *
 * Scoped to the calling teacher's OWN content only (`teacherId: req.user!.sub`), same
 * convention as every other "my X" list endpoint (`GET /tests`, `GET /flashcard-sets`,
 * `GET /grammar-topics`) — including for an admin caller, who simply sees their own
 * (typically empty) content here, exactly like those other endpoints. Admin's "browse
 * every teacher's content" need is already served by the separate T-071 oversight pages,
 * not this one.
 */

import { Router } from 'express';
import type { TeacherContentResponseDTO, TeacherContentItemDTO } from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';

export const teacherContentRouter = Router();

teacherContentRouter.use(requireAuth, requireRole('teacher', 'admin'));

teacherContentRouter.get(
  '/content',
  asyncHandler(async (req, res) => {
    const teacherId = req.user!.sub;

    const [classes, tests, flashcardSets, grammarTopics] = await Promise.all([
      prisma.class.findMany({
        where: { teacherId },
        orderBy: { createdAt: 'asc' },
        include: { _count: { select: { students: true } } },
      }),
      prisma.test.findMany({
        where: { teacherId },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, title: true, classes: { select: { id: true } } },
      }),
      prisma.flashcardSet.findMany({
        where: { teacherId },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, name: true, classes: { select: { id: true } } },
      }),
      prisma.grammarTopic.findMany({
        where: { teacherId },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, title: true, classes: { select: { id: true } } },
      }),
    ]);

    const testItems: TeacherContentItemDTO[] = tests.map((t) => ({
      id: t.id,
      type: 'test',
      title: t.title,
      classIds: t.classes.map((c) => c.id),
    }));
    const flashcardSetItems: TeacherContentItemDTO[] = flashcardSets.map((f) => ({
      id: f.id,
      type: 'flashcardSet',
      title: f.name,
      classIds: f.classes.map((c) => c.id),
    }));
    const grammarTopicItems: TeacherContentItemDTO[] = grammarTopics.map((g) => ({
      id: g.id,
      type: 'grammarTopic',
      title: g.title,
      classIds: g.classes.map((c) => c.id),
    }));

    const body: TeacherContentResponseDTO = {
      classes: classes.map((c) => ({
        id: c.id,
        name: c.name,
        studentCount: c._count.students,
        createdAt: c.createdAt.toISOString(),
      })),
      tests: testItems,
      flashcardSets: flashcardSetItems,
      grammarTopics: grammarTopicItems,
    };
    res.status(200).json(body);
  }),
);
