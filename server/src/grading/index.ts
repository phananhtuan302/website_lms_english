/**
 * Grading-provider factories — the ONE place that decides which provider
 * implementation is active for each AI-graded content type, so every caller depends
 * only on the relevant interface, never on a concrete class:
 * - `getAIGradingProvider()` (T-051, extended 2026-10) — Speaking, called from the
 *   Speaking-answer submit endpoint in `attempts.routes.ts` (T-054).
 * - `getEssayGradingProvider()` (2026-09) — Essay/Writing, called from the whole-attempt
 *   submit endpoint in `attempts.routes.ts` (essays have no per-question submit moment).
 *
 * Both factories follow the same shape: an env-driven STATIC fallback (mock by default,
 * unchanged since this product's early phases) wrapped by a DB-CONFIGURED dispatcher that
 * takes priority whenever an admin has turned the real AI endpoint on from
 * `/admin/settings/ai-grading` (`adminSettings.routes.ts`) — see each `DbConfigured*`
 * class below.
 */

import type { AIGradingProvider } from './aiGradingProvider';
import { MockAIGradingProvider } from './mockAIGradingProvider';
import { OpenAiCompatibleSpeakingGradingProvider } from './openAiCompatibleSpeakingGradingProvider';
import { DEFAULT_SPEAKING_GRADING_SYSTEM_PROMPT } from './speakingGradingPrompt';
import type { EssayGradingProvider } from './essayGradingProvider';
import { MockEssayGradingProvider } from './mockEssayGradingProvider';
import { AnthropicEssayGradingProvider } from './anthropicEssayGradingProvider';
import { OpenAiCompatibleEssayGradingProvider } from './openAiCompatibleEssayGradingProvider';
import { DEFAULT_ESSAY_GRADING_SYSTEM_PROMPT } from './essayGradingPrompt';
import { prisma } from '../lib/prisma';
import { decryptSecret } from '../lib/secretCrypto';

export type { AIGradingProvider, AIGradingResult } from './aiGradingProvider';
export type { EssayGradingProvider, EssayGradingInput, EssayGradingResult, EssayGradingCriteria } from './essayGradingProvider';

/** Env-driven fallback provider (`AI_GRADING_PROVIDER=mock`), memoized — unchanged
 * behavior from before the DB-driven admin config existed. Used by
 * `DbConfiguredSpeakingGradingProvider` whenever the admin hasn't turned AI Speaking
 * grading on (or hasn't fully configured it) from the UI. */
let cachedStaticSpeaking: AIGradingProvider | undefined;

function getStaticSpeakingGradingProvider(): AIGradingProvider {
  if (cachedStaticSpeaking) return cachedStaticSpeaking;

  // Defaults to 'mock' when unset — no customer-supplied AI provider credential exists
  // yet, and per TECH_STACK.md's integration rule that must never block the rest of the
  // Speaking flow from working end-to-end in dev.
  const configured = (process.env.AI_GRADING_PROVIDER ?? 'mock').trim().toLowerCase();

  switch (configured) {
    case 'mock':
      cachedStaticSpeaking = new MockAIGradingProvider();
      return cachedStaticSpeaking;
    default:
      // Fails loudly and clearly rather than silently falling back to Mock — a
      // misconfigured env var (a typo, or naming a provider that was never actually
      // implemented) should never be mistaken for a real provider being active.
      throw new Error(
        `Unknown AI_GRADING_PROVIDER "${configured}". Only "mock" is implemented in this build — ` +
          'see docs/INTEGRATIONS_TODO.md for how to add and register a real provider.',
      );
  }
}

/**
 * Dispatches to the admin-configured OpenAI-compatible endpoint (same
 * `Settings.essayGrading*` connection fields, gated by its OWN `speakingGradingEnabled`
 * flag — see `Settings`'s doc comment in schema.prisma) when it's turned on and fully
 * filled in, otherwise falls back to the env-driven static provider (mock by default).
 * Reads `Settings` fresh on every call — same "no server restart to pick up an admin
 * edit" reasoning as `DbConfiguredEssayGradingProvider` below.
 *
 * Unlike essay grading (where a failure is caught much further up, at the whole-attempt
 * submit route, and simply leaves that essay ungraded — see
 * `attempts.routes.ts`/`docs`), a Speaking answer is graded synchronously at its own
 * per-question submit moment and the route has always assumed `provider.grade()` never
 * throws (no try/catch there, by original T-054 design — the student sees an immediate
 * score). A real network/API call CAN fail where a pure heuristic never could, so a
 * throw from the real provider here is caught and silently falls back to the mock
 * grade for just that one answer, logged via `console.warn` — the student still gets an
 * immediate, if lower-quality, score and the submission is never blocked. The result is
 * flagged `usedFallback: true` so the caller (`attempts.routes.ts`) can persist it on
 * `Answer.speakingAiFellBackToMock` — a silent server log alone would never reach a
 * teacher; this flag is what lets the UI actually tell them the score isn't real AI.
 */
class DbConfiguredSpeakingGradingProvider implements AIGradingProvider {
  async grade(transcript: string, audioReference: string | null, prompt: string) {
    const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });

    if (settings?.speakingGradingEnabled && settings.essayGradingApiBaseUrl && settings.essayGradingApiKeyEncrypted && settings.essayGradingModel) {
      const provider = new OpenAiCompatibleSpeakingGradingProvider({
        baseUrl: settings.essayGradingApiBaseUrl,
        apiKey: decryptSecret(settings.essayGradingApiKeyEncrypted),
        model: settings.essayGradingModel,
        systemPrompt: settings.speakingGradingSystemPrompt || DEFAULT_SPEAKING_GRADING_SYSTEM_PROMPT,
      });
      try {
        return await provider.grade(transcript, audioReference, prompt);
      } catch (err) {
        console.warn('[grading] Real AI speaking grading failed, falling back to mock for this answer:', err);
      }
      const fallback = await getStaticSpeakingGradingProvider().grade(transcript, audioReference, prompt);
      return { ...fallback, usedFallback: true };
    }

    return getStaticSpeakingGradingProvider().grade(transcript, audioReference, prompt);
  }
}

let cachedSpeaking: AIGradingProvider | undefined;

export function getAIGradingProvider(): AIGradingProvider {
  if (!cachedSpeaking) {
    cachedSpeaking = new DbConfiguredSpeakingGradingProvider();
  }
  return cachedSpeaking;
}

/** Env-driven fallback provider (`ESSAY_GRADING_PROVIDER=mock|anthropic`), memoized
 * exactly like `getStaticSpeakingGradingProvider()` above — unchanged behavior from
 * before the DB-driven admin config existed. Used by `DbConfiguredEssayGradingProvider`
 * whenever the admin hasn't turned AI grading on (or hasn't fully configured it) from
 * the UI. */
let cachedStaticEssay: EssayGradingProvider | undefined;

function getStaticEssayGradingProvider(): EssayGradingProvider {
  if (cachedStaticEssay) return cachedStaticEssay;

  const configured = (process.env.ESSAY_GRADING_PROVIDER ?? 'mock').trim().toLowerCase();

  switch (configured) {
    case 'mock':
      cachedStaticEssay = new MockEssayGradingProvider();
      return cachedStaticEssay;
    case 'anthropic': {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error(
          'ESSAY_GRADING_PROVIDER=anthropic requires ANTHROPIC_API_KEY to be set in server/.env — ' +
            'see docs/INTEGRATIONS_TODO.md.',
        );
      }
      cachedStaticEssay = new AnthropicEssayGradingProvider(apiKey);
      return cachedStaticEssay;
    }
    default:
      throw new Error(
        `Unknown ESSAY_GRADING_PROVIDER "${configured}". Implemented values: "mock", "anthropic" — ` +
          'see docs/INTEGRATIONS_TODO.md.',
      );
  }
}

/**
 * Dispatches to the admin-configured OpenAI-compatible endpoint (`Settings.essayGrading*`
 * — edited from `/admin/settings/ai-grading`, see `adminSettings.routes.ts`) when it's
 * turned on and fully filled in, otherwise falls back to the env-driven static provider
 * (mock by default) exactly as before this feature existed.
 *
 * Reads `Settings` fresh on every call rather than caching — essay grading only happens
 * once per essay question at whole-attempt submit time (never a hot path), so the extra
 * primary-key lookup is negligible, and it's what lets an admin's edit on the Settings
 * page take effect immediately with no server restart.
 */
class DbConfiguredEssayGradingProvider implements EssayGradingProvider {
  async grade(input: Parameters<EssayGradingProvider['grade']>[0]) {
    // 'singleton' mirrors `Settings`'s Prisma `@default` (see `settings.routes.ts`'s
    // `SETTINGS_ID`) — inlined rather than imported to keep this low-level grading
    // module from depending on the routes layer.
    const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });

    if (settings?.essayGradingEnabled && settings.essayGradingApiBaseUrl && settings.essayGradingApiKeyEncrypted && settings.essayGradingModel) {
      const provider = new OpenAiCompatibleEssayGradingProvider({
        baseUrl: settings.essayGradingApiBaseUrl,
        apiKey: decryptSecret(settings.essayGradingApiKeyEncrypted),
        model: settings.essayGradingModel,
        systemPrompt: settings.essayGradingSystemPrompt || DEFAULT_ESSAY_GRADING_SYSTEM_PROMPT,
      });
      return provider.grade(input);
    }

    return getStaticEssayGradingProvider().grade(input);
  }
}

let cachedEssay: EssayGradingProvider | undefined;

export function getEssayGradingProvider(): EssayGradingProvider {
  if (!cachedEssay) {
    cachedEssay = new DbConfiguredEssayGradingProvider();
  }
  return cachedEssay;
}
