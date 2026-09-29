/**
 * Teacher-level score comparison across ALL of the calling teacher's classes (Phase 17,
 * T-118B — BACKLOG's "Tổng quan điểm số"): `GET /api/teacher/classes-grades-overview`.
 * One row per class, so a teacher managing several classes can see at a glance which is
 * ahead/behind without opening each class's own "Điểm số" tab one at a time.
 *
 * `averageScorePercent` reuses `loadClassGrades` (exported from
 * `teacherClassGradebook.routes.ts`, the SAME computation that tab's own grid and Excel
 * export are built from) rather than a second scoring formula: it is the mean of that
 * class's own `studentAverages` (each student's own best-score average, ignoring students
 * with nothing submitted yet) — i.e. "the average of the class's students' averages",
 * exactly the number a teacher reads off that class's gradebook by eye. `null` when the
 * class has no current period (nothing to compute) or has one but no student has any
 * score yet. `assignedTestCount` is `loadClassGrades`'s own `tests` column count — tests
 * assigned to the class for its current period.
 *
 * Teacher/admin only; "my classes" scoping matches the plain `GET /api/teacher/classes`
 * list (`teacherId: req.user!.sub`, no per-id ownership check needed since nothing here
 * is keyed off a URL param).
 */

import { Router } from 'express';
import type { ClassesGradesOverviewResponseDTO, ClassGradesOverviewRowDTO } from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { average, loadClassGrades } from './teacherClassGradebook.routes';

export const teacherGradesOverviewRouter = Router();

teacherGradesOverviewRouter.use(requireAuth, requireRole('teacher', 'admin'));

teacherGradesOverviewRouter.get(
  '/classes-grades-overview',
  asyncHandler(async (req, res) => {
    const classes = await prisma.class.findMany({
      where: { teacherId: req.user!.sub },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        name: true,
        currentPeriodId: true,
        currentPeriod: { select: { name: true } },
        _count: { select: { students: true } },
      },
    });

    const rows: ClassGradesOverviewRowDTO[] = await Promise.all(
      classes.map(async (cls) => {
        const grades = await loadClassGrades(cls.id, cls.currentPeriodId);
        const studentAverages = Object.values(grades.studentAverages).filter(
          (value): value is number => value !== null,
        );
        return {
          classId: cls.id,
          name: cls.name,
          studentCount: cls._count.students,
          currentPeriodName: cls.currentPeriod?.name ?? null,
          averageScorePercent: studentAverages.length > 0 ? average(studentAverages) : null,
          assignedTestCount: grades.tests.length,
        };
      }),
    );

    const response: ClassesGradesOverviewResponseDTO = { classes: rows };
    res.status(200).json(response);
  }),
);
