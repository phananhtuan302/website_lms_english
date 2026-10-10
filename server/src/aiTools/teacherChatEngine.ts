/**
 * Teacher AI chat assistant engine (feature 4 of the "AI Content Tools" set) — the
 * tool-calling loop that answers a teacher's question using ONLY the tool registry in
 * `teacherChatTools.ts` (never raw, unscoped DB access). See that file's doc comment for
 * the security model this engine must never undermine: `teacherId` always comes from the
 * calling route (`req.user!.sub`), never from anywhere inside a model response.
 *
 * Not every OpenAI-compatible gateway an admin might configure supports `tools`/
 * function-calling. Rather than assuming it does, this probes once (the first call after
 * install/after an admin edits the connection, cached in
 * `Settings.teacherChatToolsSupported`) and falls back to a "data digest" mode: the
 * argument-less tools (`list_classes`/`list_tests`/`list_schedule`) are called EAGERLY and
 * their results are stuffed into context up front, then the model answers in a single
 * shot with no tool-calling round-trip. This is strictly less capable (no drill-down into
 * one specific class/test) but still answers general "what classes do I have" questions
 * without requiring function-calling support at all.
 */

import { prisma } from '../lib/prisma';
import { callChatCompletion, type AiChatMessage, type AiChatToolDefinition, type AiToolsChatConnectionConfig } from './aiChatClient';
import { getAiToolsConnection } from './aiToolsConnection';
import { DEFAULT_TEACHER_CHAT_SYSTEM_PROMPT } from './defaultPrompts';
import { runTeacherChatTool, TEACHER_CHAT_TOOLS } from './teacherChatTools';

const MAX_TOOL_ROUNDS = 4;

export interface TeacherChatTurnResult {
  reply: string;
  toolsUsed: string[];
}

function toolDefinitions(): AiChatToolDefinition[] {
  return TEACHER_CHAT_TOOLS.map((tool) => ({
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
}

async function runToolCallingLoop(
  connection: AiToolsChatConnectionConfig,
  initialMessages: AiChatMessage[],
  teacherId: string,
): Promise<TeacherChatTurnResult> {
  const messages: AiChatMessage[] = [...initialMessages];
  const toolsUsed: string[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const result = await callChatCompletion(connection, messages, { tools: toolDefinitions(), toolChoice: 'auto' });

    if (result.toolCalls.length === 0) {
      return { reply: result.content ?? '', toolsUsed };
    }

    messages.push({ role: 'assistant', content: result.content, tool_calls: result.toolCalls });

    for (const call of result.toolCalls) {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
      } catch {
        args = {};
      }
      toolsUsed.push(call.function.name);
      // `teacherId` is the ONLY source of scoping — `args` is whatever the model sent and
      // is passed through verbatim; every handler re-verifies ownership itself.
      const toolResult = await runTeacherChatTool(call.function.name, args, { teacherId });
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(toolResult) });
    }
  }

  // Round cap reached — one final call with no `tools` at all, forcing a plain-text
  // answer from whatever was gathered, rather than looping forever.
  const final = await callChatCompletion(connection, messages);
  return { reply: final.content ?? '', toolsUsed };
}

async function runDigestModeTurn(
  connection: AiToolsChatConnectionConfig,
  initialMessages: AiChatMessage[],
  teacherId: string,
): Promise<TeacherChatTurnResult> {
  const [classes, tests, schedule] = await Promise.all([
    runTeacherChatTool('list_classes', {}, { teacherId }),
    runTeacherChatTool('list_tests', {}, { teacherId }),
    runTeacherChatTool('list_schedule', {}, { teacherId }),
  ]);

  const digest = [
    'CHẾ ĐỘ DỮ LIỆU TÓM TẮT (endpoint AI hiện không hỗ trợ gọi tool, nên dữ liệu dưới đây đã',
    'được lấy sẵn — chỉ được dùng đúng dữ liệu này để trả lời, không được suy diễn thêm):',
    `- Lớp học: ${JSON.stringify(classes)}`,
    `- Đề thi: ${JSON.stringify(tests)}`,
    `- Lịch mở/đóng đề và thông báo lớp: ${JSON.stringify(schedule)}`,
    'Nếu câu hỏi cần thông tin chi tiết hơn mức này (ví dụ danh sách học sinh của một lớp cụ',
    'thể, kiểm tra lỗi một đề cụ thể, điểm số, tiến độ học sinh...), hãy trả lời rằng chế độ',
    'hiện tại chỉ hỗ trợ câu hỏi tổng quan ở trên, và đề nghị giáo viên nhờ quản trị viên bật',
    'chế độ đầy đủ (kết nối AI hỗ trợ gọi tool) để hỏi được chi tiết hơn.',
  ].join('\n');

  const messages: AiChatMessage[] = [...initialMessages, { role: 'system', content: digest }];
  const result = await callChatCompletion(connection, messages);
  return { reply: result.content ?? '', toolsUsed: ['list_classes', 'list_tests', 'list_schedule'] };
}

/** A gateway that doesn't support `tools` typically rejects the request outright (a 4xx
 * mentioning the `tools`/`functions` field) rather than silently ignoring it — this is a
 * best-effort heuristic for recognizing that specific failure, not a general "retry on any
 * error" rule (an unrelated transient failure should surface as a real error, not silently
 * downgrade the feature for every future call). */
function looksLikeUnsupportedToolsError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : '';
  return /\(4\d\d\)/.test(message) && /tool/i.test(message);
}

export async function runTeacherChatTurn(
  teacherId: string,
  history: AiChatMessage[],
  newMessage: string,
): Promise<TeacherChatTurnResult> {
  const connection = await getAiToolsConnection('teacherChat');
  if (!connection) {
    return {
      reply: 'Trợ lý chat AI chưa được quản trị viên bật hoặc cấu hình đầy đủ. Vui lòng liên hệ quản trị viên.',
      toolsUsed: [],
    };
  }

  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  const systemPrompt = settings?.teacherChatSystemPrompt || DEFAULT_TEACHER_CHAT_SYSTEM_PROMPT;
  const initialMessages: AiChatMessage[] = [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: newMessage }];

  if (settings?.teacherChatToolsSupported === false) {
    return runDigestModeTurn(connection, initialMessages, teacherId);
  }

  try {
    const result = await runToolCallingLoop(connection, initialMessages, teacherId);
    if (settings?.teacherChatToolsSupported !== true) {
      await prisma.settings
        .update({ where: { id: 'singleton' }, data: { teacherChatToolsSupported: true } })
        .catch(() => undefined);
    }
    return result;
  } catch (err) {
    if (looksLikeUnsupportedToolsError(err)) {
      await prisma.settings
        .upsert({
          where: { id: 'singleton' },
          update: { teacherChatToolsSupported: false },
          create: { id: 'singleton', teacherChatToolsSupported: false },
        })
        .catch(() => undefined);
      return runDigestModeTurn(connection, initialMessages, teacherId);
    }
    throw err;
  }
}
