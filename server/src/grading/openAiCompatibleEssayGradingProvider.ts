/**
 * OpenAiCompatibleEssayGradingProvider (2026-10) — a REAL `EssayGradingProvider`
 * implementation for any OpenAI Chat-Completions-compatible endpoint (base URL + API
 * key + model, same three fields Cline/most AI coding tools ask for under "OpenAI
 * Compatible"), configured entirely by an admin from the UI (`Settings.essayGrading*`
 * columns — see `adminSettings.routes.ts`'s `/settings/ai-grading` routes) rather than
 * env vars. This is what lets an admin point grading at a self-hosted/proxy endpoint
 * (e.g. a LiteLLM/OneAPI-style gateway) without a code change or redeploy.
 *
 * Reuses the exact same user-prompt building and strict-JSON response parsing as
 * `AnthropicEssayGradingProvider` (`./essayGradingPrompt.ts`) — only the wire format
 * (OpenAI's `/chat/completions` shape, Bearer auth) differs from Anthropic's Messages API.
 *
 * Failure handling is the caller's job, same as every other `EssayGradingProvider` — see
 * that interface's doc comment.
 */

import type { EssayGradingInput, EssayGradingProvider, EssayGradingResult } from './essayGradingProvider';
import { buildEssayUserPrompt, parseEssayGradingResponse } from './essayGradingPrompt';

const MAX_RESPONSE_TOKENS = 1024;

export interface OpenAiCompatibleEssayGradingConfig {
  /** e.g. `https://api-ai.example.com/v1` — `/chat/completions` is appended by `grade()`. */
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
}

interface OpenAiChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export class OpenAiCompatibleEssayGradingProvider implements EssayGradingProvider {
  constructor(private readonly config: OpenAiCompatibleEssayGradingConfig) {}

  async grade(input: EssayGradingInput): Promise<EssayGradingResult> {
    const url = `${this.config.baseUrl.replace(/\/+$/, '')}/chat/completions`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: MAX_RESPONSE_TOKENS,
        // Some OpenAI-compatible gateways default to a streamed (SSE chunk) response
        // when this is omitted, even without `stream: true` — explicit `false` is what
        // actually guarantees the single-JSON-object shape this class parses below
        // (confirmed against the admin-configured endpoint during development).
        stream: false,
        messages: [
          { role: 'system', content: this.config.systemPrompt },
          { role: 'user', content: buildEssayUserPrompt(input) },
        ],
      }),
    });

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      throw new Error(`AI grading API request failed (${res.status}): ${bodyText.slice(0, 300)}`);
    }

    const data = (await res.json()) as OpenAiChatCompletionResponse;
    const text = data.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error('AI grading API response contained no message content.');
    }

    return parseEssayGradingResponse(text, input);
  }
}
