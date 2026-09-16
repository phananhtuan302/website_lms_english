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
import { loadOwnerClassesWithCurrentPeriod } from '../lib/contentClassAssignment';

export const teacherContentRouter = Router();

teacherContentRouter.use(requireAuth, requireRole('teacher', 'admin'));

teacherContentRouter.get(
  '/content',
  asyncHandler(async (req, res) => {
    const teacherId = req.user!.sub;

    const [classes, tests, flashcardSets, grammarTopics, ownerClassPeriods] = await Promise.all([
      prisma.class.findMany({
        where: { teacherId },
        orderBy: { createdAt: 'asc' },
        include: { _count: { select: { students: true } }, currentPeriod: { select: { name: true } } },
      }),
      prisma.test.findMany({
        where: { teacherId },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, title: true },
      }),
      prisma.flashcardSet.findMany({
        where: { teacherId },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, name: true },
      }),
      prisma.grammarTopic.findMany({
        where: { teacherId },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, title: true },
      }),
      // T-099: this teacher's own classes that have a current semester selected — every
      // classIds list below means "assigned for that class's CURRENT semester" (see
      // `TeacherContentItemDTO`'s doc comment in `@platform/shared`), computed here in
      // bulk (one query per content type, not one per item) rather than N+1.
      loadOwnerClassesWithCurrentPeriod(teacherId),
    ]);

    const [testAssignments, flashcardSetAssignments, grammarTopicAssignments] = await Promise.all([
      ownerClassPeriods.length === 0 || tests.length === 0
        ? Promise.resolve([])
        : prisma.testClassPeriodAssignment.findMany({
            where: { testId: { in: tests.map((t) => t.id) }, OR: ownerClassPeriods },
            select: { testId: true, classId: true },
          }),
      ownerClassPeriods.length === 0 || flashcardSets.length === 0
        ? Promise.resolve([])
        : prisma.flashcardSetClassPeriodAssignment.findMany({
            where: { flashcardSetId: { in: flashcardSets.map((f) => f.id) }, OR: ownerClassPeriods },
            select: { flashcardSetId: true, classId: true },
          }),
      ownerClassPeriods.length === 0 || grammarTopics.length === 0
        ? Promise.resolve([])
        : prisma.grammarTopicClassPeriodAssignment.findMany({
            where: { grammarTopicId: { in: grammarTopics.map((g) => g.id) }, OR: ownerClassPeriods },
            select: { grammarTopicId: true, classId: true },
          }),
    ]);

    function groupClassIdsBy<T extends { classId: string }>(rows: T[], key: (row: T) => string): Map<string, string[]> {
      const map = new Map<string, string[]>();
      for (const row of rows) {
        const list = map.get(key(row)) ?? [];
        list.push(row.classId);
        map.set(key(row), list);
      }
      return map;
    }

    const testClassIds = groupClassIdsBy(testAssignments, (a) => a.testId);
    const flashcardSetClassIds = groupClassIdsBy(flashcardSetAssignments, (a) => a.flashcardSetId);
    const grammarTopicClassIds = groupClassIdsBy(grammarTopicAssignments, (a) => a.grammarTopicId);

    const testItems: TeacherContentItemDTO[] = tests.map((t) => ({
      id: t.id,
      type: 'test',
      title: t.title,
      classIds: testClassIds.get(t.id) ?? [],
    }));
    const flashcardSetItems: TeacherContentItemDTO[] = flashcardSets.map((f) => ({
      id: f.id,
      type: 'flashcardSet',
      title: f.name,
      classIds: flashcardSetClassIds.get(f.id) ?? [],
    }));
    const grammarTopicItems: TeacherContentItemDTO[] = grammarTopics.map((g) => ({
      id: g.id,
      type: 'grammarTopic',
      title: g.title,
      classIds: grammarTopicClassIds.get(g.id) ?? [],
    }));

    const body: TeacherContentResponseDTO = {
      classes: classes.map((c) => ({
        id: c.id,
        name: c.name,
        studentCount: c._count.students,
        createdAt: c.createdAt.toISOString(),
        currentPeriodId: c.currentPeriodId,
        currentPeriodName: c.currentPeriod?.name ?? null,
      })),
      tests: testItems,
      flashcardSets: flashcardSetItems,
      grammarTopics: grammarTopicItems,
    };
    res.status(200).json(body);
  }),
);
