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
import type { ClassDTO, CreateClassRequest, UpdateClassRequest } from '@platform/shared';
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
  _count: { students: number };
}): ClassDTO {
  return {
    id: cls.id,
    name: cls.name,
    studentCount: cls._count.students,
    createdAt: cls.createdAt.toISOString(),
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

teacherClassesRouter.get(
  '/classes',
  asyncHandler(async (req, res) => {
    const classes = await prisma.class.findMany({
      where: { teacherId: req.user!.sub },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { students: true } } },
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
      include: { _count: { select: { students: true } } },
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
      include: { _count: { select: { students: true } } },
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
