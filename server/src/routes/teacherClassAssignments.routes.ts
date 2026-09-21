/**
 * `GET /api/teacher/classes/:classId/assignments` (T-103, Phase 13) — the read side of the
 * class workspace's "Bài tập" tab: everything currently ASSIGNED to one class for that
 * class's CURRENT semester, across all three content types, in a single round-trip.
 *
 * Read-only and deliberately thin — it invents no new data model or visibility rule:
 * - "assigned" = a row in the T-099 3-key tables (`TestClassPeriodAssignment` /
 *   `FlashcardSetClassPeriodAssignment` / `GrammarTopicClassPeriodAssignment`) for
 *   (this class, the class's `currentPeriodId`), exactly what `studentAssignments.ts` and
 *   every student list read;
 * - a test's schedule = its `TestClassSchedule` row for the same (test, class, period),
 *   read through the shared `toTestClassScheduleDTO`-style rule (`isScorePublished`);
 * - writes stay where they already live: `PUT .../:id/classes` per content type (assign /
 *   remove) and `PUT /api/teacher/tests/:testId/schedule` (schedule / publish).
 *
 * Ownership: same convention as every class route (`requireOwnedClass`): a class that is
 * missing or belongs to another teacher answers an identical 404; `admin` bypasses.
 *
 * No current semester → `periodId: null` + three empty lists, never an error (BACKLOG
 * T-103): with no semester there is no (class, period) key to have assigned anything under.
 *
 * Counts are computed with grouped/aggregated queries over the whole page of items (one
 * query per kind), never per item.
 */

import { Router } from 'express';
import type {
  ClassAssignmentFlashcardSetDTO,
  ClassAssignmentGrammarTopicDTO,
  ClassAssignmentScheduleDTO,
  ClassAssignmentTestDTO,
  ClassAssignmentsResponseDTO,
} from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { isAdminOrOwner } from '../lib/authz';
import { isScorePublished } from '../lib/testClassSchedule';

export const teacherClassAssignmentsRouter = Router();

teacherClassAssignmentsRouter.use(requireAuth, requireRole('teacher', 'admin'));

teacherClassAssignmentsRouter.get(
  '/classes/:classId/assignments',
  asyncHandler(async (req, res) => {
    // One query for ownership + everything the header of the response needs.
    const cls = await prisma.class.findUnique({
      where: { id: req.params.classId },
      select: {
        id: true,
        teacherId: true,
        currentPeriodId: true,
        currentPeriod: { select: { name: true } },
        _count: { select: { students: true } },
      },
    });
    if (!cls || !isAdminOrOwner(req.user!, cls.teacherId)) {
      res.status(404).json({ error: 'Class not found.' });
      return;
    }

    const periodId = cls.currentPeriodId;
    const empty: ClassAssignmentsResponseDTO = {
      classId: cls.id,
      periodId: null,
      periodName: null,
      studentCount: cls._count.students,
      tests: [],
      flashcardSets: [],
      grammarTopics: [],
    };
    if (periodId == null) {
      res.status(200).json(empty);
      return;
    }

    const where = { classId: cls.id, periodId };
    const [testRows, setRows, topicRows] = await Promise.all([
      prisma.testClassPeriodAssignment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          createdAt: true,
          test: {
            select: {
              id: true,
              title: true,
              testType: true,
              published: true,
              unitId: true,
              unit: { select: { name: true } },
              sections: { select: { _count: { select: { questions: true } } } },
              _count: { select: { variants: true } },
            },
          },
        },
      }),
      prisma.flashcardSetClassPeriodAssignment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          createdAt: true,
          flashcardSet: {
            select: {
              id: true,
              name: true,
              unit: { select: { name: true } },
              _count: { select: { cards: true } },
            },
          },
        },
      }),
      prisma.grammarTopicClassPeriodAssignment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          createdAt: true,
          grammarTopic: {
            select: {
              id: true,
              title: true,
              unit: { select: { name: true } },
              _count: { select: { exercises: true } },
            },
          },
        },
      }),
    ]);

    const testIds = testRows.map((row) => row.test.id);
    const [schedules, submitted] =
      testIds.length === 0
        ? [[], []]
        : await Promise.all([
            prisma.testClassSchedule.findMany({ where: { ...where, testId: { in: testIds } } }),
            // One (testId, studentId) row per distinct student of THIS class who has at least
            // one submitted attempt at the test — `distinct` collapses a student's retakes, so
            // counting rows per testId yields "N students submitted", not "N attempts".
            prisma.attempt.findMany({
              where: { testId: { in: testIds }, status: 'submitted', student: { classId: cls.id } },
              distinct: ['testId', 'studentId'],
              select: { testId: true },
            }),
          ]);

    const scheduleByTestId = new Map(schedules.map((s) => [s.testId, s]));
    const submittedByTestId = new Map<string, number>();
    for (const row of submitted) {
      submittedByTestId.set(row.testId, (submittedByTestId.get(row.testId) ?? 0) + 1);
    }

    const tests: ClassAssignmentTestDTO[] = testRows.map(({ createdAt, test }) => {
      const schedule = scheduleByTestId.get(test.id) ?? null;
      const scheduleDto: ClassAssignmentScheduleDTO | null = schedule
        ? {
            openAt: schedule.openAt ? schedule.openAt.toISOString() : null,
            closeAt: schedule.closeAt ? schedule.closeAt.toISOString() : null,
            autoPublishScoresOnClose: schedule.autoPublishScoresOnClose,
            scoresPublishedManually: schedule.scoresPublishedManually,
            scoresPublished: isScorePublished(schedule),
          }
        : null;
      return {
        id: test.id,
        title: test.title,
        testType: test.testType,
        unitId: test.unitId,
        unitName: test.unit?.name ?? null,
        sectionCount: test.sections.length,
        questionCount: test.sections.reduce((sum, section) => sum + section._count.questions, 0),
        published: test.published,
        variantCount: test._count.variants,
        assignedAt: createdAt.toISOString(),
        schedule: scheduleDto,
        submittedStudentCount: submittedByTestId.get(test.id) ?? 0,
      };
    });

    const flashcardSets: ClassAssignmentFlashcardSetDTO[] = setRows.map(({ createdAt, flashcardSet }) => ({
      id: flashcardSet.id,
      name: flashcardSet.name,
      unitName: flashcardSet.unit?.name ?? null,
      cardCount: flashcardSet._count.cards,
      assignedAt: createdAt.toISOString(),
    }));

    const grammarTopics: ClassAssignmentGrammarTopicDTO[] = topicRows.map(({ createdAt, grammarTopic }) => ({
      id: grammarTopic.id,
      title: grammarTopic.title,
      unitName: grammarTopic.unit?.name ?? null,
      exerciseCount: grammarTopic._count.exercises,
      assignedAt: createdAt.toISOString(),
    }));

    const body: ClassAssignmentsResponseDTO = {
      classId: cls.id,
      periodId,
      periodName: cls.currentPeriod?.name ?? null,
      studentCount: cls._count.students,
      tests,
      flashcardSets,
      grammarTopics,
    };
    res.status(200).json(body);
  }),
);
