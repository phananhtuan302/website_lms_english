/**
 * Admin-only write endpoint for the site-wide language setting (T-072b), completing the
 * read/write split `settings.routes.ts`'s module doc comment documented (T-067 built only
 * the public `GET /api/settings` read side; this was left as an explicit TODO for
 * whoever picked up T-072). This is the ONLY place in the entire product that can change
 * the site language — there is no public/per-user switcher anywhere else (PROJECT_PLAN
 * Guiding Principle 3 / Assumption A13).
 */

import { Router } from 'express';
import {
  THEME_IDS,
  UI_STYLE_IDS,
  type AiGradingSettingsDTO,
  type SettingsDTO,
  type UpdateAiGradingSettingsRequest,
  type UpdateSettingsRequest,
} from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { SETTINGS_ID } from './settings.routes';
import { encryptSecret } from '../lib/secretCrypto';
import { DEFAULT_ESSAY_GRADING_SYSTEM_PROMPT } from '../grading/essayGradingPrompt';
import { DEFAULT_SPEAKING_GRADING_SYSTEM_PROMPT } from '../grading/speakingGradingPrompt';

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
    const hasUiStyle = body.uiStyle !== undefined;

    if (!hasLanguage && !hasTheme && !hasUiStyle) {
      res.status(400).json({ error: 'Provide language, themeId, and/or uiStyle.' });
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
    if (hasUiStyle && !UI_STYLE_IDS.includes(body.uiStyle!)) {
      res.status(400).json({ error: `uiStyle must be one of: ${UI_STYLE_IDS.join(', ')}.` });
      return;
    }

    const settings = await prisma.settings.upsert({
      where: { id: SETTINGS_ID },
      update: {
        ...(hasLanguage ? { language: body.language } : {}),
        ...(hasTheme ? { themeId: body.themeId } : {}),
        ...(hasUiStyle ? { uiStyle: body.uiStyle } : {}),
      },
      create: {
        id: SETTINGS_ID,
        ...(hasLanguage ? { language: body.language } : {}),
        ...(hasTheme ? { themeId: body.themeId } : {}),
        ...(hasUiStyle ? { uiStyle: body.uiStyle } : {}),
      },
    });

    const response: SettingsDTO = {
      language: settings.language,
      themeId: settings.themeId,
      uiStyle: settings.uiStyle,
    };
    res.status(200).json(response);
  }),
);

/** GET /api/admin/settings/ai-grading — admin-only read of the AI essay/writing grading
 * config (2026-10). Never part of the public `GET /api/settings` — see
 * `AiGradingSettingsDTO`'s doc comment in `@platform/shared`. Never returns the stored
 * API key itself, only `hasApiKey`. */
adminSettingsRouter.get(
  '/settings/ai-grading',
  asyncHandler(async (_req, res) => {
    const settings = await prisma.settings.findUnique({ where: { id: SETTINGS_ID } });
    const response: AiGradingSettingsDTO = {
      essayGradingEnabled: settings?.essayGradingEnabled ?? false,
      apiBaseUrl: settings?.essayGradingApiBaseUrl ?? null,
      hasApiKey: Boolean(settings?.essayGradingApiKeyEncrypted),
      model: settings?.essayGradingModel ?? null,
      systemPrompt: settings?.essayGradingSystemPrompt ?? DEFAULT_ESSAY_GRADING_SYSTEM_PROMPT,
      defaultSystemPrompt: DEFAULT_ESSAY_GRADING_SYSTEM_PROMPT,
      speakingGradingEnabled: settings?.speakingGradingEnabled ?? false,
      speakingSystemPrompt: settings?.speakingGradingSystemPrompt ?? DEFAULT_SPEAKING_GRADING_SYSTEM_PROMPT,
      defaultSpeakingSystemPrompt: DEFAULT_SPEAKING_GRADING_SYSTEM_PROMPT,
    };
    res.status(200).json(response);
  }),
);

/** PATCH /api/admin/settings/ai-grading — admin-only partial update. Validates that
 * turning `essayGradingEnabled` OR `speakingGradingEnabled` on never leaves the provider
 * unable to actually call an endpoint (missing base URL/model/key) — see
 * `AiGradingSettingsDTO`'s doc comment for the exact field semantics (`apiKey` replaces,
 * `clearApiKey` removes, omitting both leaves the stored key untouched). */
adminSettingsRouter.patch(
  '/settings/ai-grading',
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<UpdateAiGradingSettingsRequest>;
    const hasEnabled = body.essayGradingEnabled !== undefined;
    const hasBaseUrl = body.apiBaseUrl !== undefined;
    const hasApiKey = typeof body.apiKey === 'string' && body.apiKey.trim() !== '';
    const hasClearApiKey = body.clearApiKey === true;
    const hasModel = body.model !== undefined;
    const hasSystemPrompt = body.systemPrompt !== undefined;
    const hasSpeakingEnabled = body.speakingGradingEnabled !== undefined;
    const hasSpeakingSystemPrompt = body.speakingSystemPrompt !== undefined;

    if (
      !hasEnabled &&
      !hasBaseUrl &&
      !hasApiKey &&
      !hasClearApiKey &&
      !hasModel &&
      !hasSystemPrompt &&
      !hasSpeakingEnabled &&
      !hasSpeakingSystemPrompt
    ) {
      res.status(400).json({ error: 'Provide at least one field to update.' });
      return;
    }
    if (hasBaseUrl && !/^https?:\/\/.+/i.test(body.apiBaseUrl!.trim())) {
      res.status(400).json({ error: 'apiBaseUrl must be a valid http(s) URL.' });
      return;
    }
    if (hasApiKey && hasClearApiKey) {
      res.status(400).json({ error: 'Provide either apiKey or clearApiKey, not both.' });
      return;
    }

    const existing = await prisma.settings.findUnique({ where: { id: SETTINGS_ID } });

    const resultingBaseUrl = hasBaseUrl ? body.apiBaseUrl!.trim() : existing?.essayGradingApiBaseUrl;
    const resultingModel = hasModel ? body.model!.trim() : existing?.essayGradingModel;
    const resultingHasKey = hasApiKey ? true : hasClearApiKey ? false : Boolean(existing?.essayGradingApiKeyEncrypted);

    if (hasEnabled && body.essayGradingEnabled && (!resultingBaseUrl || !resultingModel || !resultingHasKey)) {
      res.status(400).json({
        error: 'Cannot enable AI essay grading until apiBaseUrl, model, and an API key are all configured.',
      });
      return;
    }
    if (hasSpeakingEnabled && body.speakingGradingEnabled && (!resultingBaseUrl || !resultingModel || !resultingHasKey)) {
      res.status(400).json({
        error: 'Cannot enable AI speaking grading until apiBaseUrl, model, and an API key are all configured.',
      });
      return;
    }

    const data = {
      ...(hasEnabled ? { essayGradingEnabled: body.essayGradingEnabled } : {}),
      ...(hasBaseUrl ? { essayGradingApiBaseUrl: body.apiBaseUrl!.trim() } : {}),
      ...(hasApiKey ? { essayGradingApiKeyEncrypted: encryptSecret(body.apiKey!.trim()) } : {}),
      ...(hasClearApiKey ? { essayGradingApiKeyEncrypted: null } : {}),
      ...(hasModel ? { essayGradingModel: body.model!.trim() } : {}),
      ...(hasSystemPrompt ? { essayGradingSystemPrompt: body.systemPrompt } : {}),
      ...(hasSpeakingEnabled ? { speakingGradingEnabled: body.speakingGradingEnabled } : {}),
      ...(hasSpeakingSystemPrompt ? { speakingGradingSystemPrompt: body.speakingSystemPrompt } : {}),
    };

    const settings = await prisma.settings.upsert({
      where: { id: SETTINGS_ID },
      update: data,
      create: { id: SETTINGS_ID, ...data },
    });

    const response: AiGradingSettingsDTO = {
      essayGradingEnabled: settings.essayGradingEnabled,
      apiBaseUrl: settings.essayGradingApiBaseUrl,
      hasApiKey: Boolean(settings.essayGradingApiKeyEncrypted),
      model: settings.essayGradingModel,
      systemPrompt: settings.essayGradingSystemPrompt ?? DEFAULT_ESSAY_GRADING_SYSTEM_PROMPT,
      defaultSystemPrompt: DEFAULT_ESSAY_GRADING_SYSTEM_PROMPT,
      speakingGradingEnabled: settings.speakingGradingEnabled,
      speakingSystemPrompt: settings.speakingGradingSystemPrompt ?? DEFAULT_SPEAKING_GRADING_SYSTEM_PROMPT,
      defaultSpeakingSystemPrompt: DEFAULT_SPEAKING_GRADING_SYSTEM_PROMPT,
    };
    res.status(200).json(response);
  }),
);
