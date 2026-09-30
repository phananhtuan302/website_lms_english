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

let cachedEssay: EssayGradingProvider | undefined;

export function getEssayGradingProvider(): EssayGradingProvider {
  if (cachedEssay) return cachedEssay;

  // Defaults to 'mock' when unset — same "never block on a missing credential" rule as
  // Speaking above. `anthropic` IS implemented (unlike Speaking's real-provider slot,
  // still empty) — it's just not the default until an operator both opts in AND
  // supplies a real `ANTHROPIC_API_KEY`.
  const configured = (process.env.ESSAY_GRADING_PROVIDER ?? 'mock').trim().toLowerCase();

  switch (configured) {
    case 'mock':
      cachedEssay = new MockEssayGradingProvider();
      return cachedEssay;
    case 'anthropic': {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error(
          'ESSAY_GRADING_PROVIDER=anthropic requires ANTHROPIC_API_KEY to be set in server/.env — ' +
            'see docs/INTEGRATIONS_TODO.md.',
        );
      }
      cachedEssay = new AnthropicEssayGradingProvider(apiKey);
      return cachedEssay;
    }
    default:
      throw new Error(
        `Unknown ESSAY_GRADING_PROVIDER "${configured}". Implemented values: "mock", "anthropic" — ` +
          'see docs/INTEGRATIONS_TODO.md.',
      );
  }
}
