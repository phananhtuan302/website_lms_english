/**
 * Public class list for registration (T-074, Phase 12).
 *
 * `GET /api/classes` is intentionally PUBLIC — no `requireAuth` — same "must work with no
 * `Authorization` header at all" reasoning as `settings.routes.ts`'s `GET /api/settings`:
 * a prospective student filling out the registration form doesn't have an account yet, so
 * this is the one endpoint that must be reachable logged-out. Returns every class from
 * every teacher (id + name + owning teacher's name only — no email, no student roster,
 * nothing sensitive), enough for a student to pick the right class.
 */

import { Router } from 'express';
import type { PublicClassSummaryDTO } from '@platform/shared';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../lib/asyncHandler';

export const classesRouter = Router();

classesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const classes = await prisma.class.findMany({
      orderBy: { createdAt: 'asc' },
      include: { teacher: { select: { name: true } } },
    });
    const body: PublicClassSummaryDTO[] = classes.map((cls) => ({
      id: cls.id,
      name: cls.name,
      teacherName: cls.teacher.name,
    }));
    res.status(200).json(body);
  }),
);
