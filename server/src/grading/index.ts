/**
 * AIGradingProvider factory (T-051) — the ONE place that decides which provider
 * implementation is active, so every caller (currently just the Speaking-answer submit
 * endpoint in `attempts.routes.ts`, T-054) depends only on the `AIGradingProvider`
 * interface, never on a concrete class.
 *
 * To swap in a real provider later: implement a new class satisfying
 * `AIGradingProvider` (same `grade(transcript, audioReference, prompt)` signature),
 * register it in the `switch` below, and set `AI_GRADING_PROVIDER` in `server/.env`.
 * No other file needs to change — see `docs/INTEGRATIONS_TODO.md` for the full
 * swap-in instructions and what a real provider would need (e.g. an Anthropic API key).
 */

import type { AIGradingProvider } from './aiGradingProvider';
import { MockAIGradingProvider } from './mockAIGradingProvider';

export type { AIGradingProvider, AIGradingResult } from './aiGradingProvider';

let cached: AIGradingProvider | undefined;

export function getAIGradingProvider(): AIGradingProvider {
  if (cached) return cached;

  // Defaults to 'mock' when unset — no customer-supplied AI provider credential exists
  // yet, and per TECH_STACK.md's integration rule that must never block the rest of the
  // Speaking flow from working end-to-end in dev.
  const configured = (process.env.AI_GRADING_PROVIDER ?? 'mock').trim().toLowerCase();

  switch (configured) {
    case 'mock':
      cached = new MockAIGradingProvider();
      return cached;
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
