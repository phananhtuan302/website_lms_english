/**
 * Teacher AI chat assistant routes (2026-10, feature 4 of the "AI Content Tools" set).
 * Every route here is teacher-only (`requireRole('teacher', 'admin')`), but UNLIKE every
 * other router in this app, there is NO ownership helper with an admin bypass anywhere in
 * this file or in `teacherChatEngine.ts`/`teacherChatTools.ts` — every query is filtered by
 * `req.user!.sub` directly, always. An admin caller gets their OWN (almost certainly empty)
 * conversation and data, never another teacher's — see `teacherChatTools.ts`'s doc comment
 * for why this one feature deliberately does not follow the rest of the app's "admin can
 * manage any teacher's X" convention.
 */

import { Router } from 'express';
import type {
  ListTeacherChatMessagesResponse,
  SendTeacherChatMessageRequest,
  SendTeacherChatMessageResponse,
  TeacherChatMessageDTO,
} from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { runTeacherChatTurn } from '../aiTools/teacherChatEngine';
import type { AiChatMessage } from '../aiTools/aiChatClient';

export const teacherChatRouter = Router();

teacherChatRouter.use(requireAuth, requireRole('teacher', 'admin'));

/** Cap on one message's length — generous for a real question, cheap guard against an
 * accidental paste of an entire document driving up AI cost per turn. */
const MAX_MESSAGE_LENGTH = 4000;

/** How many of the most recent messages are replayed as conversation history for each new
 * turn — bounds both the AI request size/cost and how far back the assistant can
 * "remember", same spirit as every other fixed-window convention in this app rather than
 * replaying an ever-growing full history forever. */
const HISTORY_WINDOW = 20;

function toMessageDTO(row: { id: string; role: string; content: string; createdAt: Date }): TeacherChatMessageDTO {
  return {
    id: row.id,
    role: row.role === 'assistant' ? 'assistant' : 'user',
    content: row.content,
    createdAt: row.createdAt.toISOString(),
  };
}

/** `GET /chat/messages` — the calling teacher's own conversation history, oldest first. */
teacherChatRouter.get(
  '/chat/messages',
  asyncHandler(async (req, res) => {
    const rows = await prisma.teacherChatMessage.findMany({
      where: { teacherId: req.user!.sub },
      orderBy: { createdAt: 'asc' },
    });
    const response: ListTeacherChatMessagesResponse = { messages: rows.map(toMessageDTO) };
    res.status(200).json(response);
  }),
);

/** `POST /chat/messages` — sends one new message, runs the assistant (`teacherChatEngine.ts`,
 * scoped to `req.user!.sub` throughout), and persists both sides before responding.
 * Request/response, not streamed (matches every other AI call in this app). */
teacherChatRouter.post(
  '/chat/messages',
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<SendTeacherChatMessageRequest>;
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    if (!content) {
      res.status(400).json({ error: 'content is required.' });
      return;
    }
    if (content.length > MAX_MESSAGE_LENGTH) {
      res.status(400).json({ error: `content cannot exceed ${MAX_MESSAGE_LENGTH} characters.` });
      return;
    }

    const recent = await prisma.teacherChatMessage.findMany({
      where: { teacherId: req.user!.sub },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_WINDOW,
    });
    const history: AiChatMessage[] = recent
      .reverse()
      .map((row) => ({ role: row.role === 'assistant' ? 'assistant' : 'user', content: row.content }));

    const { reply, toolsUsed } = await runTeacherChatTurn(req.user!.sub, history, content);

    const [userMessage, assistantMessage] = await prisma.$transaction([
      prisma.teacherChatMessage.create({ data: { teacherId: req.user!.sub, role: 'user', content } }),
      prisma.teacherChatMessage.create({
        data: { teacherId: req.user!.sub, role: 'assistant', content: reply || '(Không có phản hồi.)' },
      }),
    ]);

    const response: SendTeacherChatMessageResponse = {
      userMessage: toMessageDTO(userMessage),
      assistantMessage: toMessageDTO(assistantMessage),
      toolsUsed,
    };
    res.status(201).json(response);
  }),
);

/** `DELETE /chat/messages` — clears the calling teacher's own history. Low-risk (scoped to
 * their own conversation only), no confirmation beyond the client's own UI. */
teacherChatRouter.delete(
  '/chat/messages',
  asyncHandler(async (req, res) => {
    await prisma.teacherChatMessage.deleteMany({ where: { teacherId: req.user!.sub } });
    res.status(204).send();
  }),
);
