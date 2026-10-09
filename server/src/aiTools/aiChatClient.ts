/**
 * Generic OpenAI-Chat-Completions-compatible `fetch` client shared by every AI Content
 * Tools generator (`vocabGenerator.ts`, `grammarGenerator.ts`, `examImportGenerator.ts`,
 * `teacherChatEngine.ts`) — the same wire shape the existing grading providers already use
 * (`server/src/grading/openAiCompatibleEssayGradingProvider.ts`), generalized here so it
 * isn't copy-pasted 4 more times. Adds two things the grading providers never needed:
 * multimodal (image) content parts (for exam-image import) and `tools`/`tool_calls`
 * passthrough (for the teacher chat assistant's function-calling loop).
 *
 * No AI SDK dependency, matching the rest of this codebase — plain `fetch`.
 */

const DEFAULT_MAX_RESPONSE_TOKENS = 2048;

export interface AiToolsChatConnectionConfig {
  /** e.g. `https://api-ai.example.com/v1` — `/chat/completions` is appended here. */
  baseUrl: string;
  apiKey: string;
  model: string;
}

export type AiChatContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

export interface AiChatToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type AiChatMessage =
  | { role: 'system' | 'user'; content: string | AiChatContentPart[] }
  | { role: 'assistant'; content: string | null; tool_calls?: AiChatToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string };

export interface AiChatToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    /** JSON Schema object describing the function's arguments. */
    parameters: Record<string, unknown>;
  };
}

export interface AiChatCompletionResult {
  content: string | null;
  toolCalls: AiChatToolCall[];
}

interface AiChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: AiChatToolCall[];
    };
  }>;
}

/**
 * Calls `${config.baseUrl}/chat/completions`. Always sends `stream: false` explicitly —
 * some OpenAI-compatible gateways default to a streamed (SSE chunk) response when this is
 * omitted, even without `stream: true` (the same gotcha documented on
 * `OpenAiCompatibleEssayGradingProvider`). Throws on a non-2xx response or a response with
 * no message at all; callers decide their own fallback behavior (mock mode, etc.) — this
 * function never silently swallows a failure.
 */
export async function callChatCompletion(
  config: AiToolsChatConnectionConfig,
  messages: AiChatMessage[],
  options?: { tools?: AiChatToolDefinition[]; toolChoice?: 'auto' | 'none'; maxTokens?: number },
): Promise<AiChatCompletionResult> {
  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: options?.maxTokens ?? DEFAULT_MAX_RESPONSE_TOKENS,
      stream: false,
      messages,
      ...(options?.tools ? { tools: options.tools, tool_choice: options.toolChoice ?? 'auto' } : {}),
    }),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new Error(`AI Content Tools API request failed (${res.status}): ${bodyText.slice(0, 300)}`);
  }

  const data = (await res.json()) as AiChatCompletionResponse;
  const message = data.choices?.[0]?.message;
  if (!message) {
    throw new Error('AI Content Tools API response contained no message.');
  }

  return {
    content: message.content ?? null,
    toolCalls: message.tool_calls ?? [],
  };
}
