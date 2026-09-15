/**
 * Public site-wide settings (T-067, Phase 10 Vietnamese localization).
 *
 * `GET /api/settings` is intentionally PUBLIC — no `requireAuth` — per PROJECT_PLAN
 * Guiding Principle 3 / Assumption A13: the current UI language is a single, global,
 * admin-controlled setting, never a per-user preference and never behind a public
 * switcher. Even a logged-out visitor must see the admin-chosen language before they've
 * logged in (e.g. on the home/login page), so this endpoint has to work with no
 * `Authorization` header at all.
 *
 * WRITE SIDE NOT BUILT HERE — documented for whoever picks up T-072 (Admin Settings
 * page): add `PATCH /api/admin/settings` gated behind `requireAuth,
 * requireRole('admin')` that validates `req.body.language` is `'en' | 'vi'` and calls
 * `prisma.settings.upsert({ where: { id: SETTINGS_ID }, update: { language }, create: {
 * id: SETTINGS_ID, language } })` — `upsert` (not a plain `update`) so it still works
 * even against a brand-new DB where `prisma/seed.ts` hasn't run yet. Nothing about the
 * `Settings` table shape needs to change for that endpoint to be trivial to add.
 */

import { Router } from 'express';
import type { SettingsDTO } from '@platform/shared';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../lib/asyncHandler';

/** Fixed id of the one-and-only `Settings` row (matches the Prisma model's `@default`).
 * Exported so a future admin write endpoint (T-072) targets the exact same row without
 * redefining this constant. */
export const SETTINGS_ID = 'singleton';

export const settingsRouter = Router();

settingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    // No `upsert`/write here on purpose — this is a hot, public, unauthenticated GET
    // that every page load calls, and `prisma/seed.ts` already guarantees the singleton
    // row exists in any dev DB. If it's ever genuinely missing (e.g. a fresh DB before
    // the first seed run), fall back to the documented default (`en`, Assumption A13)
    // rather than erroring or writing on a read.
    const settings = await prisma.settings.findUnique({ where: { id: SETTINGS_ID } });
    const body: SettingsDTO = { language: settings?.language ?? 'en' };
    res.status(200).json(body);
  }),
);
