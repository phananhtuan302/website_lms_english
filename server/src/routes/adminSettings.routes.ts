/**
 * Admin-only write endpoint for the site-wide language setting (T-072b), completing the
 * read/write split `settings.routes.ts`'s module doc comment documented (T-067 built only
 * the public `GET /api/settings` read side; this was left as an explicit TODO for
 * whoever picked up T-072). This is the ONLY place in the entire product that can change
 * the site language — there is no public/per-user switcher anywhere else (PROJECT_PLAN
 * Guiding Principle 3 / Assumption A13).
 */

import { Router } from 'express';
import type { SettingsDTO, UpdateSettingsRequest } from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { SETTINGS_ID } from './settings.routes';

export const adminSettingsRouter = Router();

adminSettingsRouter.use(requireAuth, requireRole('admin'));

/** PATCH /api/admin/settings — validates `{ language: 'en' | 'vi' }` and upserts the
 * `Settings` singleton row exactly as `settings.routes.ts`'s doc comment specified
 * (`upsert`, not a plain `update`, so this also works against a brand-new DB where
 * `prisma/seed.ts` hasn't run yet). */
adminSettingsRouter.patch(
  '/settings',
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<UpdateSettingsRequest>;
    if (body.language !== 'en' && body.language !== 'vi') {
      res.status(400).json({ error: "language must be 'en' or 'vi'." });
      return;
    }

    const settings = await prisma.settings.upsert({
      where: { id: SETTINGS_ID },
      update: { language: body.language },
      create: { id: SETTINGS_ID, language: body.language },
    });

    const response: SettingsDTO = { language: settings.language };
    res.status(200).json(response);
  }),
);
