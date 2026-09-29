/**
 * Curriculum tagging: Unit & Academic Period management (T-018).
 *
 * Documented choice (T-018 "your call, document it — global or per-teacher"): both
 * `Unit` and `AcademicPeriod` are GLOBAL, not owned per-teacher — see the matching doc
 * comments on the `Unit`/`AcademicPeriod` Prisma models in `schema.prisma` for the
 * reasoning. Every route below is `teacher`-only (`requireRole('teacher')`) per T-018's
 * acceptance criteria ("can be managed by a teacher"); there is no student-facing read
 * endpoint yet — nothing before T-036 ("Unit Tests") needs students to see this data.
 *
 * This task explicitly does NOT build the "Unit Test" feature (T-036) or reporting
 * (T-019) — it only introduces the tagging data + minimal CRUD, per the backlog note.
 */

import { Router } from 'express';
import type {
  AcademicPeriodDTO,
  CreateAcademicPeriodRequest,
  CreateUnitRequest,
  UnitDTO,
  UpdateAcademicPeriodRequest,
  UpdateUnitRequest,
} from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';

export const curriculumRouter = Router();

// T-071: `admin` also allowed (PROJECT_PLAN Assumption A12). Units/AcademicPeriods are
// already global (not owned per-teacher, see this file's module doc comment) — the
// existing CRUD below already applies identically to every caller, so admin needs
// nothing beyond this role-gate extension to fully manage them through these same routes.
curriculumRouter.use(requireAuth, requireRole('teacher', 'admin'));

// --- Units ---------------------------------------------------------------------------

function toUnitDTO(unit: {
  id: string;
  name: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}): UnitDTO {
  return {
    id: unit.id,
    name: unit.name,
    order: unit.order,
    createdAt: unit.createdAt.toISOString(),
    updatedAt: unit.updatedAt.toISOString(),
  };
}

/** Same "return an English error string, or null if valid" convention as
 * `teacherTests.routes.ts`'s `validateQuestionBody`/`validateTimeLimit`. */
function validateUnitBody(body: Partial<CreateUnitRequest>): string | null {
  if (typeof body.name !== 'string' || body.name.trim() === '') {
    return 'Unit name is required.';
  }
  if (typeof body.order !== 'number' || !Number.isInteger(body.order)) {
    return 'Unit order must be an integer.';
  }
  return null;
}

curriculumRouter.post(
  '/units',
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<CreateUnitRequest>;
    const validationError = validateUnitBody(body);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }
    const unit = await prisma.unit.create({
      data: { name: body.name!.trim(), order: body.order! },
    });
    res.status(201).json(toUnitDTO(unit));
  }),
);

curriculumRouter.get(
  '/units',
  asyncHandler(async (_req, res) => {
    const units = await prisma.unit.findMany({ orderBy: { order: 'asc' } });
    res.status(200).json(units.map(toUnitDTO));
  }),
);

curriculumRouter.patch(
  '/units/:unitId',
  asyncHandler(async (req, res) => {
    const unit = await prisma.unit.findUnique({ where: { id: req.params.unitId } });
    if (!unit) {
      res.status(404).json({ error: 'Unit not found.' });
      return;
    }
    const body = req.body as Partial<UpdateUnitRequest>;
    const validationError = validateUnitBody(body);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }
    const updated = await prisma.unit.update({
      where: { id: unit.id },
      data: { name: body.name!.trim(), order: body.order! },
    });
    res.status(200).json(toUnitDTO(updated));
  }),
);

/** Deleting a Unit that's still tagged on some tests is allowed — `Test.unitId` is
 * `onDelete: SetNull` (schema.prisma), so those tests simply become untagged rather
 * than blocking the delete or cascading. */
curriculumRouter.delete(
  '/units/:unitId',
  asyncHandler(async (req, res) => {
    const unit = await prisma.unit.findUnique({ where: { id: req.params.unitId } });
    if (!unit) {
      res.status(404).json({ error: 'Unit not found.' });
      return;
    }
    await prisma.unit.delete({ where: { id: unit.id } });
    res.status(204).send();
  }),
);

// --- Academic Periods ------------------------------------------------------------------

/** Fixed timezone offset for Asia/Ho_Chi_Minh (UTC+7, no DST) — PROJECT_PLAN Assumption
 * A5, applied to every date this route reads/writes. */
const HCM_OFFSET = '+07:00';

/** Parses a plain `YYYY-MM-DD` request field as local midnight in Asia/Ho_Chi_Minh,
 * returning the equivalent UTC instant to store. Rejects anything else (including a
 * full ISO datetime) so the request contract stays unambiguous — see `CreateAcademicPeriodRequest`'s
 * doc comment in `@platform/shared`. */
function parseHcmDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00${HCM_OFFSET}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toAcademicPeriodDTO(period: {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
}): AcademicPeriodDTO {
  return {
    id: period.id,
    name: period.name,
    startDate: period.startDate.toISOString(),
    endDate: period.endDate.toISOString(),
    createdAt: period.createdAt.toISOString(),
    updatedAt: period.updatedAt.toISOString(),
  };
}

type AcademicPeriodValidation =
  { error: string } | { name: string; startDate: Date; endDate: Date };

function validateAcademicPeriodBody(
  body: Partial<CreateAcademicPeriodRequest>,
): AcademicPeriodValidation {
  if (typeof body.name !== 'string' || body.name.trim() === '') {
    return { error: 'Academic period name is required.' };
  }
  const startDate = parseHcmDate(body.startDate);
  const endDate = parseHcmDate(body.endDate);
  if (!startDate || !endDate) {
    return { error: 'startDate and endDate are required, formatted YYYY-MM-DD.' };
  }
  if (startDate.getTime() >= endDate.getTime()) {
    return { error: 'startDate must be before endDate.' };
  }
  return { name: body.name.trim(), startDate, endDate };
}

curriculumRouter.post(
  '/academic-periods',
  asyncHandler(async (req, res) => {
    const validated = validateAcademicPeriodBody(req.body as Partial<CreateAcademicPeriodRequest>);
    if ('error' in validated) {
      res.status(400).json({ error: validated.error });
      return;
    }
    const period = await prisma.academicPeriod.create({ data: validated });
    res.status(201).json(toAcademicPeriodDTO(period));
  }),
);

curriculumRouter.get(
  '/academic-periods',
  asyncHandler(async (_req, res) => {
    const periods = await prisma.academicPeriod.findMany({ orderBy: { startDate: 'asc' } });
    res.status(200).json(periods.map(toAcademicPeriodDTO));
  }),
);

/**
 * `GET /academic-periods/selectable` — the SAME global list above, but for the two class
 * pickers ("Tạo lớp"'s Học kỳ select and the class-header semester switcher), not for managing
 * periods themselves (that page keeps calling the unfiltered route above).
 *
 * Real incident this fixes (Phase 15, cô Thu's usability review, round 2): `AcademicPeriod` is
 * documented as GLOBAL (not owned per teacher, see this file's header comment) — so EVERY
 * teacher's picker showed EVERY period ever created by ANY teacher, including two dev/e2e-seed
 * periods ("Semester 1 2026", "Semester 2 2026") that only the seed accounts' throwaway
 * "Default Class" rows use. A real teacher had no way to tell which of the 3 was hers.
 *
 * Kept intentionally simple, no schema change: a period is offered to a teacher when (a) at
 * least one of THAT teacher's own classes already uses it, or (b) no class anywhere uses it yet
 * (so a freshly created period stays available to everyone until some teacher adopts it — the
 * first person to use "Học kỳ 2" for a class shouldn't be blocked from picking it). This hides a
 * period in active use by a DIFFERENT teacher's classes without ever touching/renaming/deleting
 * any period, class, or seed fixture. Admin manages everything, so admin is not filtered.
 */
curriculumRouter.get(
  '/academic-periods/selectable',
  asyncHandler(async (req, res) => {
    const periods = await prisma.academicPeriod.findMany({ orderBy: { startDate: 'asc' } });
    if (req.user!.role === 'admin') {
      res.status(200).json(periods.map(toAcademicPeriodDTO));
      return;
    }
    const classes = await prisma.class.findMany({
      select: { teacherId: true, currentPeriodId: true },
      where: { currentPeriodId: { not: null } },
    });
    const usedByCaller = new Set(
      classes.filter((c) => c.teacherId === req.user!.sub).map((c) => c.currentPeriodId),
    );
    const usedByAnyone = new Set(classes.map((c) => c.currentPeriodId));
    const visible = periods.filter((p) => usedByCaller.has(p.id) || !usedByAnyone.has(p.id));
    res.status(200).json(visible.map(toAcademicPeriodDTO));
  }),
);

curriculumRouter.patch(
  '/academic-periods/:periodId',
  asyncHandler(async (req, res) => {
    const period = await prisma.academicPeriod.findUnique({ where: { id: req.params.periodId } });
    if (!period) {
      res.status(404).json({ error: 'Academic period not found.' });
      return;
    }
    const validated = validateAcademicPeriodBody(req.body as Partial<UpdateAcademicPeriodRequest>);
    if ('error' in validated) {
      res.status(400).json({ error: validated.error });
      return;
    }
    const updated = await prisma.academicPeriod.update({
      where: { id: period.id },
      data: validated,
    });
    res.status(200).json(toAcademicPeriodDTO(updated));
  }),
);

curriculumRouter.delete(
  '/academic-periods/:periodId',
  asyncHandler(async (req, res) => {
    const period = await prisma.academicPeriod.findUnique({ where: { id: req.params.periodId } });
    if (!period) {
      res.status(404).json({ error: 'Academic period not found.' });
      return;
    }
    await prisma.academicPeriod.delete({ where: { id: period.id } });
    res.status(204).send();
  }),
);
