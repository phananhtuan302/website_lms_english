/**
 * Admin-only write endpoint for the site-wide language setting (T-072b), completing the
 * read/write split `settings.routes.ts`'s module doc comment documented (T-067 built only
 * the public `GET /api/settings` read side; this was left as an explicit TODO for
 * whoever picked up T-072). This is the ONLY place in the entire product that can change
 * the site language — there is no public/per-user switcher anywhere else (PROJECT_PLAN
 * Guiding Principle 3 / Assumption A13).
 */

import { Router } from 'express';
import { THEME_IDS, type SettingsDTO, type UpdateSettingsRequest } from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { SETTINGS_ID } from './settings.routes';

export const adminSettingsRouter = Router();

adminSettingsRouter.use(requireAuth, requireRole('admin'));

/** PATCH /api/admin/settings — accepts `language` and/or `themeId` (either may be sent
 * alone, a partial update) and upserts the `Settings` singleton row exactly as
 * `settings.routes.ts`'s doc comment specified (`upsert`, not a plain `update`, so this
 * also works against a brand-new DB where `prisma/seed.ts` hasn't run yet). A field left
 * out of `create` falls back to the Prisma model's own `@default`, so a partial update
 * against a not-yet-existing row still ends up fully valid. */
adminSettingsRouter.patch(
  '/settings',
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<UpdateSettingsRequest>;
    const hasLanguage = body.language !== undefined;
    const hasTheme = body.themeId !== undefined;

    if (!hasLanguage && !hasTheme) {
      res.status(400).json({ error: 'Provide language and/or themeId.' });
      return;
    }
    if (hasLanguage && body.language !== 'en' && body.language !== 'vi') {
      res.status(400).json({ error: "language must be 'en' or 'vi'." });
      return;
    }
    if (hasTheme && !THEME_IDS.includes(body.themeId!)) {
      res.status(400).json({ error: `themeId must be one of: ${THEME_IDS.join(', ')}.` });
      return;
    }

    const settings = await prisma.settings.upsert({
      where: { id: SETTINGS_ID },
      update: {
        ...(hasLanguage ? { language: body.language } : {}),
        ...(hasTheme ? { themeId: body.themeId } : {}),
      },
      create: {
        id: SETTINGS_ID,
        ...(hasLanguage ? { language: body.language } : {}),
        ...(hasTheme ? { themeId: body.themeId } : {}),
      },
    });

    const response: SettingsDTO = { language: settings.language, themeId: settings.themeId };
    res.status(200).json(response);
  }),
);
