/**
 * AnthropicEssayGradingProvider (2026-09) — the REAL `EssayGradingProvider`
 * implementation, built and ready ahead of time per the customer's own request ("làm
 * sẵn full bộ prompt chấm điểm chuẩn IELTS, đợi bỏ API key sau" — build the full
 * IELTS-standard grading prompt now, the API key comes later). NOT the default
 * provider (`MockEssayGradingProvider` is, see `./index.ts`) until an operator sets
 * `ESSAY_GRADING_PROVIDER=anthropic` AND supplies a real `ANTHROPIC_API_KEY` — see
 * `docs/INTEGRATIONS_TODO.md` for the exact activation steps. (The admin-configurable
 * endpoint added 2026-10 — `OpenAiCompatibleEssayGradingProvider`, see
 * `./openAiCompatibleEssayGradingProvider.ts` — is a separate, DB-driven path that takes
 * priority over this one when enabled; this class is unchanged, env-driven, dev/ops-only.)
 *
 * Calls the Anthropic Messages API directly via `fetch` (no SDK dependency needed —
 * one JSON POST, no streaming, no tool use) and asks for a strict JSON response so the
 * result can be parsed deterministically rather than scraped out of prose.
 *
 * The system prompt (`DEFAULT_ESSAY_GRADING_SYSTEM_PROMPT`, in `./essayGradingPrompt.ts`,
 * shared with `OpenAiCompatibleEssayGradingProvider`) embeds a condensed but faithful
 * version of IELTS's own PUBLICLY PUBLISHED Writing Band Descriptors — this is what makes
 * the grading genuinely IELTS-CALIBRATED rather than a generic "grade this essay"
 * request, the model is anchored to the same band language a real examiner references.
 *
 * Failure handling is the caller's job (the whole-attempt submit route in
 * `attempts.routes.ts` treats AI essay grading as best-effort — a thrown error here
 * just leaves that essay ungraded, exactly like a never-submitted grade, rather than
 * blocking the student's entire submission over an AI/network hiccup).
 */

import type { EssayGradingInput, EssayGradingProvider, EssayGradingResult } from './essayGradingProvider';
import { DEFAULT_ESSAY_GRADING_SYSTEM_PROMPT, buildEssayUserPrompt, parseEssayGradingResponse } from './essayGradingPrompt';

export { DEFAULT_ESSAY_GRADING_SYSTEM_PROMPT as IELTS_WRITING_BAND_DESCRIPTORS };

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_VERSION = '2023-06-01';
/** Overridable via `ANTHROPIC_ESSAY_GRADING_MODEL` — defaults to the latest Sonnet at
 * the time this was written. Grading quality/cost tradeoffs may call for a different
 * model later; that's a one-line env change, never a code change. */
const DEFAULT_MODEL = 'claude-sonnet-5';
const MAX_RESPONSE_TOKENS = 1024;

interface AnthropicMessageResponse {
  content?: Array<{ type: string; text?: string }>;
}

export class AnthropicEssayGradingProvider implements EssayGradingProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model: string = process.env.ANTHROPIC_ESSAY_GRADING_MODEL || DEFAULT_MODEL) {
    if (!apiKey) {
      throw new Error(
        'AnthropicEssayGradingProvider requires ANTHROPIC_API_KEY to be set — see docs/INTEGRATIONS_TODO.md.',
      );
    }
    this.apiKey = apiKey;
    this.model = model;
  }

  async grade(input: EssayGradingInput): Promise<EssayGradingResult> {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': ANTHROPIC_API_VERSION,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: MAX_RESPONSE_TOKENS,
        system: DEFAULT_ESSAY_GRADING_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildEssayUserPrompt(input) }],
      }),
    });

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      throw new Error(`Anthropic API request failed (${res.status}): ${bodyText.slice(0, 300)}`);
    }

    const data = (await res.json()) as AnthropicMessageResponse;
    const text = data.content?.find((block) => block.type === 'text')?.text;
    if (!text) {
      throw new Error('Anthropic API response contained no text content block.');
    }

    return parseEssayGradingResponse(text, input);
  }
}
