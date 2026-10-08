/**
 * Grading-provider factories — the ONE place that decides which provider
 * implementation is active for each AI-graded content type, so every caller depends
 * only on the relevant interface, never on a concrete class:
 * - `getAIGradingProvider()` (T-051) — Speaking, called from the Speaking-answer submit
 *   endpoint in `attempts.routes.ts` (T-054).
 * - `getEssayGradingProvider()` (2026-09) — Essay/Writing, called from the whole-attempt
 *   submit endpoint in `attempts.routes.ts` (essays have no per-question submit moment).
 *
 * To swap in a real provider later: implement a new class satisfying the relevant
 * interface, register it in the matching `switch` below, and set the matching env var
 * in `server/.env`. No other file needs to change — see `docs/INTEGRATIONS_TODO.md` for
 * the full swap-in instructions and what a real provider needs (e.g. an Anthropic API
 * key — `AnthropicEssayGradingProvider` is already built and registered below, just not
 * the default, waiting on that key).
 */

import type { AIGradingProvider } from './aiGradingProvider';
import { MockAIGradingProvider } from './mockAIGradingProvider';
import type { EssayGradingProvider } from './essayGradingProvider';
import { MockEssayGradingProvider } from './mockEssayGradingProvider';
import { AnthropicEssayGradingProvider } from './anthropicEssayGradingProvider';
import { OpenAiCompatibleEssayGradingProvider } from './openAiCompatibleEssayGradingProvider';
import { DEFAULT_ESSAY_GRADING_SYSTEM_PROMPT } from './essayGradingPrompt';
import { prisma } from '../lib/prisma';
import { decryptSecret } from '../lib/secretCrypto';

export type { AIGradingProvider, AIGradingResult } from './aiGradingProvider';
export type { EssayGradingProvider, EssayGradingInput, EssayGradingResult, EssayGradingCriteria } from './essayGradingProvider';

let cachedSpeaking: AIGradingProvider | undefined;

export function getAIGradingProvider(): AIGradingProvider {
  if (cachedSpeaking) return cachedSpeaking;

  // Defaults to 'mock' when unset — no customer-supplied AI provider credential exists
  // yet, and per TECH_STACK.md's integration rule that must never block the rest of the
  // Speaking flow from working end-to-end in dev.
  const configured = (process.env.AI_GRADING_PROVIDER ?? 'mock').trim().toLowerCase();

  switch (configured) {
    case 'mock':
      cachedSpeaking = new MockAIGradingProvider();
      return cachedSpeaking;
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

/** Env-driven fallback provider (`ESSAY_GRADING_PROVIDER=mock|anthropic`), memoized
 * exactly like `getAIGradingProvider()` above — unchanged behavior from before the
 * DB-driven admin config existed. Used by `DbConfiguredEssayGradingProvider` whenever
 * the admin hasn't turned AI grading on (or hasn't fully configured it) from the UI. */
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
