/**
 * Teacher class management (T-074, Phase 12): CRUD for a teacher's own `Class` rows
 * (list/create/rename/delete) — same pattern as `curriculum.routes.ts`'s Unit CRUD.
 *
 * Every route here is teacher-only (`requireRole('teacher', 'admin')` — a student gets
 * 403) and every route that touches a specific class enforces ownership via
 * `requireOwnedClass` (a different teacher's class id gets 404). `admin` bypasses
 * ownership per PROJECT_PLAN Assumption A12, same convention as every other
 * teacher-owned entity in this codebase.
 *
 * Unlike `Unit`/`AcademicPeriod` (global, shared by every teacher), a `Class` is
 * genuinely per-teacher (Assumption A14: no co-teaching) — `GET /classes` here always
 * means "MY classes", never every teacher's, mirroring `teacherTests.routes.ts`'s
 * `GET /tests`. The public, cross-teacher list for registration is a SEPARATE endpoint
 * (`GET /api/classes`, no auth) in `classes.routes.ts`, not this router.
 */

import { Router } from 'express';
import type {
  ClassDTO,
  CreateClassRequest,
  UpdateClassCurrentPeriodRequest,
  UpdateClassRequest,
} from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { requireOwnedClass } from '../lib/ownedClass';

export const teacherClassesRouter = Router();

teacherClassesRouter.use(requireAuth, requireRole('teacher', 'admin'));

function toClassDTO(cls: {
  id: string;
  name: string;
  createdAt: Date;
  currentPeriodId: string | null;
  currentPeriod: { name: string } | null;
  _count: { students: number };
}): ClassDTO {
  return {
    id: cls.id,
    name: cls.name,
    studentCount: cls._count.students,
    createdAt: cls.createdAt.toISOString(),
    currentPeriodId: cls.currentPeriodId,
    currentPeriodName: cls.currentPeriod?.name ?? null,
  };
}

/** Same "return an English error string, or null if valid" convention as
 * `curriculum.routes.ts`'s `validateUnitBody`. */
function validateClassBody(body: Partial<CreateClassRequest>): string | null {
  if (typeof body.name !== 'string' || body.name.trim() === '') {
    return 'Class name is required.';
  }
  return null;
}

/** Every read of a `Class` in this file includes this same `currentPeriod` shape so
 * `toClassDTO` above always has what it needs — one small shared `include` fragment
 * rather than repeating it at every call site. */
const CLASS_INCLUDE = {
  _count: { select: { students: true } },
  currentPeriod: { select: { name: true } },
} as const;

teacherClassesRouter.get(
  '/classes',
  asyncHandler(async (req, res) => {
    const classes = await prisma.class.findMany({
      where: { teacherId: req.user!.sub },
      orderBy: { createdAt: 'asc' },
      include: CLASS_INCLUDE,
    });
    res.status(200).json(classes.map(toClassDTO));
  }),
);

teacherClassesRouter.post(
  '/classes',
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<CreateClassRequest>;
    const validationError = validateClassBody(body);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }
    const cls = await prisma.class.create({
      data: { name: body.name!.trim(), teacherId: req.user!.sub },
      include: CLASS_INCLUDE,
    });
    res.status(201).json(toClassDTO(cls));
  }),
);

teacherClassesRouter.patch(
  '/classes/:classId',
  asyncHandler(async (req, res) => {
    const cls = await requireOwnedClass(req.params.classId, req.user!, res);
    if (!cls) return;

    const body = req.body as Partial<UpdateClassRequest>;
    const validationError = validateClassBody(body);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const updated = await prisma.class.update({
      where: { id: cls.id },
      data: { name: body.name!.trim() },
      include: CLASS_INCLUDE,
    });
    res.status(200).json(toClassDTO(updated));
  }),
);

/**
 * PATCH /api/teacher/classes/:classId/current-period (T-099) — switches which semester
 * is presently "live" for this class. Ownership-checked (`requireOwnedClass`, same 404
 * for another teacher's class as every other route in this file). `periodId` must
 * reference an EXISTING `AcademicPeriod` — global, not per-teacher (same "just validate
 * existence" rule as `Test.unitId`'s own tag validation in `teacherTests.routes.ts`).
 *
 * Deliberately just a plain column update: switching NEVER deletes/touches any other
 * period's `*ClassPeriodAssignment`/`TestClassSchedule` rows for this class — they simply
 * stop being the ones any content-visibility/enforcement check resolves to (every one of
 * those checks keys off `Class.currentPeriodId` fresh, at read time), so the old
 * semester's data stays fully intact and reappears correctly the moment the teacher
 * switches back (BACKLOG.md T-099's explicit "hoàn toàn khác nhau" — completely
 * different, no overlap — framing).
 */
teacherClassesRouter.patch(
  '/classes/:classId/current-period',
  asyncHandler(async (req, res) => {
    const cls = await requireOwnedClass(req.params.classId, req.user!, res);
    if (!cls) return;

    const body = req.body as Partial<UpdateClassCurrentPeriodRequest>;
    if (typeof body.periodId !== 'string' || body.periodId.trim() === '') {
      res.status(400).json({ error: 'periodId is required.' });
      return;
    }

    const period = await prisma.academicPeriod.findUnique({ where: { id: body.periodId } });
    if (!period) {
      res.status(400).json({ error: 'periodId does not reference an existing AcademicPeriod.' });
      return;
    }

    const updated = await prisma.class.update({
      where: { id: cls.id },
      data: { currentPeriodId: period.id },
      include: CLASS_INCLUDE,
    });
    res.status(200).json(toClassDTO(updated));
  }),
);

/** Documented choice (T-074 "your call, document it — block or reassign"): BLOCKED.
 * Deleting a class that still has students assigned returns 409 with a clear message
 * rather than silently reassigning/orphaning them — see the `Class` model's doc comment
 * in schema.prisma for the full reasoning. Deleting an empty class is always allowed. */
teacherClassesRouter.delete(
  '/classes/:classId',
  asyncHandler(async (req, res) => {
    const cls = await requireOwnedClass(req.params.classId, req.user!, res);
    if (!cls) return;

    const studentCount = await prisma.user.count({ where: { classId: cls.id } });
    if (studentCount > 0) {
      res.status(409).json({
        error: `Cannot delete a class with students still assigned to it (${studentCount} student(s)). Reassign or remove those students first.`,
      });
      return;
    }

    await prisma.class.delete({ where: { id: cls.id } });
    res.status(204).send();
  }),
);
