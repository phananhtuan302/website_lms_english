/**
 * OpenAiCompatibleSpeakingGradingProvider (2026-10) — the REAL `AIGradingProvider`
 * implementation, sending the candidate's actual recorded audio (not just the
 * browser-generated draft transcript) to an OpenAI Chat-Completions-compatible endpoint
 * that supports multimodal audio input (the `input_audio` content block — same shape
 * OpenAI's own audio-capable models use), configured from the admin UI exactly like
 * `OpenAiCompatibleEssayGradingProvider` (same `Settings.essayGradingApiBaseUrl/
 * ApiKeyEncrypted/Model` connection, a separate `speakingGradingEnabled` toggle — see
 * `adminSettings.routes.ts`'s `/settings/ai-grading` routes).
 *
 * Verified against the admin-configured endpoint during development: a silent/empty
 * audio clip makes the model HALLUCINATE a plausible-sounding but fabricated transcript
 * (a known failure mode of many audio-capable models/gateways on degenerate input) —
 * but real speech (including deliberately imperfect speech with filler words and
 * grammar mistakes) is transcribed and graded accurately, correctly identifying the
 * exact words/mistakes actually spoken. There is no server-side guard against the
 * silent-audio failure mode (nothing in this product can distinguish "silent recording"
 * from "a real recording a provider mishandles" without re-implementing audio analysis
 * itself) — a silent submission gets an AI grade like any other; a teacher reviewing the
 * attached playback will immediately notice and override it.
 *
 * Failure handling is the caller's job, same as every other grading provider — see
 * `AIGradingProvider`'s doc comment. The caller (`attempts.routes.ts`'s speaking-answer
 * route) must never let a provider error block the student's submission.
 */

import type { AIGradingProvider, AIGradingResult } from './aiGradingProvider';
import { buildSpeakingUserPrompt, parseSpeakingGradingResponse } from './speakingGradingPrompt';

const MAX_RESPONSE_TOKENS = 1024;
const SPEAKING_SCORE_SCALE = 100;

export interface OpenAiCompatibleSpeakingGradingConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
}

interface OpenAiChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

/** Splits a `data:<mime>;base64,<payload>` URL into its MIME subtype (used as the
 * `input_audio.format`, e.g. `audio/webm` -> `webm`) and raw base64 payload. Throws on
 * anything else — callers only ever pass what `MediaRecorder`-produced `data:` URLs
 * look like (validated as a non-empty string at the submit route already). */
function parseAudioDataUrl(dataUrl: string): { format: string; base64: string } {
  const match = /^data:audio\/([a-zA-Z0-9.+-]+)(?:;codecs=[^;]+)?;base64,(.+)$/s.exec(dataUrl.trim());
  if (!match) {
    throw new Error('Speaking audio must be a base64 "data:audio/..." URL.');
  }
  // Gateways generally expect a short format token (wav/mp3/ogg/webm), not an x-codec
  // subtype suffix some browsers include (e.g. "webm;codecs=opus" already stripped above,
  // but a subtype like "x-wav" is normalized to "wav" for the common case).
  const format = match[1].replace(/^x-/, '');
  return { format, base64: match[2] };
}

export class OpenAiCompatibleSpeakingGradingProvider implements AIGradingProvider {
  constructor(private readonly config: OpenAiCompatibleSpeakingGradingConfig) {}

  async grade(transcript: string, audioReference: string | null, prompt: string): Promise<AIGradingResult> {
    if (!audioReference) {
      throw new Error('OpenAiCompatibleSpeakingGradingProvider requires an audio recording to grade.');
    }
    const { format, base64 } = parseAudioDataUrl(audioReference);

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
        stream: false,
        messages: [
          { role: 'system', content: this.config.systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: buildSpeakingUserPrompt(prompt, transcript) },
              { type: 'input_audio', input_audio: { data: base64, format } },
            ],
          },
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

    const result = parseSpeakingGradingResponse(text, SPEAKING_SCORE_SCALE);
    return { score: result.score, feedback: result.feedback };
  }
}
