/**
 * Class announcements "Thông báo lớp" (T-108, Phase 14): short plain-text notices a
 * teacher posts to ONE class, read by that class's students on their home page.
 *
 * Two routers live here because the two audiences hang off different mount points:
 *
 * - `teacherClassAnnouncementsRouter` (`/api/teacher`): the owner of the class (or an admin)
 *   manages them — `GET/POST /classes/:classId/announcements` and
 *   `PATCH/DELETE /classes/:classId/announcements/:id` (edit the text, pin/unpin, delete).
 *   Teacher/admin-only (`requireRole`, a student gets 403); ownership via `requireOwnedClass`
 *   (another teacher's class id gets the same 404 as a missing one; `admin` bypasses, per
 *   PROJECT_PLAN Assumption A12 — same convention as every other class route).
 * - `studentAnnouncementsRouter` (`/api/student`): `GET /announcements` — only the
 *   student's OWN class (read fresh from the DB by `getStudentClassId`, never from the JWT),
 *   so one class's announcements can never leak to another class's students. A student with
 *   no class simply gets an empty list.
 *
 * An announcement belongs to the class, not to a semester, so nothing here looks at the
 * current period. `body` is stored and returned as plain text; the clients render it as
 * text (never HTML). Order everywhere: pinned first, then newest first.
 */

import { Router } from 'express';
import type { Response } from 'express';
import {
  CLASS_ANNOUNCEMENT_MAX_LENGTH,
  type ClassAnnouncementDTO,
  type CreateClassAnnouncementRequest,
  type StudentAnnouncementsResponseDTO,
  type UpdateClassAnnouncementRequest,
} from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { requireOwnedClass } from '../lib/ownedClass';
import { getStudentClassId } from '../lib/classScoping';

export const teacherClassAnnouncementsRouter = Router();
export const studentAnnouncementsRouter = Router();

teacherClassAnnouncementsRouter.use(requireAuth, requireRole('teacher', 'admin'));
studentAnnouncementsRouter.use(requireAuth, requireRole('student'));

/** The most a student sees at once (BACKLOG T-108: "limited to ~30"). */
const STUDENT_ANNOUNCEMENT_LIMIT = 30;
/** Safety cap for the teacher's management list — a class will not realistically get near it. */
const TEACHER_ANNOUNCEMENT_LIMIT = 200;

/** Pinned first, then newest first (`id` only makes equal timestamps deterministic). */
const ANNOUNCEMENT_ORDER = [{ pinned: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }] as const;

const ANNOUNCEMENT_INCLUDE = { author: { select: { name: true } } } as const;

/** Text edited after posting = `updatedAt` moved past `createdAt` (pin-only changes keep
 * `updatedAt` as it was — see the PATCH handler — so they never show up as "edited"). The
 * 1 s slack absorbs the few ms between the two column defaults on insert. */
const EDITED_SLACK_MS = 1000;

function toAnnouncementDTO(row: {
  id: string;
  body: string;
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
  author: { name: string };
}): ClassAnnouncementDTO {
  return {
    id: row.id,
    body: row.body,
    pinned: row.pinned,
    authorName: row.author.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    edited: row.updatedAt.getTime() - row.createdAt.getTime() > EDITED_SLACK_MS,
  };
}

/** Validates a body value. Returns the cleaned text (trimmed, `\r\n` → `\n`) or sends the
 * 400 itself and returns `null`. Whitespace-only counts as empty; the length cap applies to
 * the trimmed text. */
function parseBody(value: unknown, res: Response): string | null {
  if (typeof value !== 'string') {
    res.status(400).json({ error: 'Announcement text is required.' });
    return null;
  }
  const text = value.replace(/\r\n?/g, '\n').trim();
  if (text === '') {
    res.status(400).json({ error: 'Announcement text is required.' });
    return null;
  }
  if (text.length > CLASS_ANNOUNCEMENT_MAX_LENGTH) {
    res
      .status(400)
      .json({ error: `Announcement text must be at most ${CLASS_ANNOUNCEMENT_MAX_LENGTH} characters.` });
    return null;
  }
  return text;
}

/** `GET /classes/:classId/announcements` — every announcement of the class, pinned first. */
teacherClassAnnouncementsRouter.get(
  '/classes/:classId/announcements',
  asyncHandler(async (req, res) => {
    const cls = await requireOwnedClass(req.params.classId, req.user!, res);
    if (!cls) return;

    const rows = await prisma.classAnnouncement.findMany({
      where: { classId: cls.id },
      orderBy: [...ANNOUNCEMENT_ORDER],
      take: TEACHER_ANNOUNCEMENT_LIMIT,
      include: ANNOUNCEMENT_INCLUDE,
    });
    res.status(200).json(rows.map(toAnnouncementDTO));
  }),
);

/** `POST /classes/:classId/announcements` `{ body, pinned? }` → 201 with the new announcement. */
teacherClassAnnouncementsRouter.post(
  '/classes/:classId/announcements',
  asyncHandler(async (req, res) => {
    const cls = await requireOwnedClass(req.params.classId, req.user!, res);
    if (!cls) return;

    const input = (req.body ?? {}) as Partial<CreateClassAnnouncementRequest>;
    const body = parseBody(input.body, res);
    if (body === null) return;
    if (input.pinned !== undefined && typeof input.pinned !== 'boolean') {
      res.status(400).json({ error: 'pinned must be true or false.' });
      return;
    }

    const created = await prisma.classAnnouncement.create({
      data: { classId: cls.id, authorId: req.user!.sub, body, pinned: input.pinned ?? false },
      include: ANNOUNCEMENT_INCLUDE,
    });
    res.status(201).json(toAnnouncementDTO(created));
  }),
);

/** `PATCH /classes/:classId/announcements/:id` `{ body?, pinned? }` — edit the text and/or
 * pin/unpin. An id that belongs to a different class than the one in the URL is a 404. */
teacherClassAnnouncementsRouter.patch(
  '/classes/:classId/announcements/:id',
  asyncHandler(async (req, res) => {
    const cls = await requireOwnedClass(req.params.classId, req.user!, res);
    if (!cls) return;

    const existing = await prisma.classAnnouncement.findFirst({
      where: { id: req.params.id, classId: cls.id },
    });
    if (!existing) {
      res.status(404).json({ error: 'Announcement not found.' });
      return;
    }

    const input = (req.body ?? {}) as Partial<UpdateClassAnnouncementRequest>;
    if (input.body === undefined && input.pinned === undefined) {
      res.status(400).json({ error: 'Nothing to update.' });
      return;
    }
    if (input.pinned !== undefined && typeof input.pinned !== 'boolean') {
      res.status(400).json({ error: 'pinned must be true or false.' });
      return;
    }
    let body: string | undefined;
    if (input.body !== undefined) {
      const parsed = parseBody(input.body, res);
      if (parsed === null) return;
      body = parsed;
    }

    const updated = await prisma.classAnnouncement.update({
      where: { id: existing.id },
      data: {
        ...(body !== undefined ? { body } : {}),
        ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
        // Pinning alone is not an edit of the text: keep the old `updatedAt` so the
        // "đã chỉnh sửa" mark only appears when the text really changed.
        ...(body === undefined || body === existing.body ? { updatedAt: existing.updatedAt } : {}),
      },
      include: ANNOUNCEMENT_INCLUDE,
    });
    res.status(200).json(toAnnouncementDTO(updated));
  }),
);

/** `DELETE /classes/:classId/announcements/:id` → 204. */
teacherClassAnnouncementsRouter.delete(
  '/classes/:classId/announcements/:id',
  asyncHandler(async (req, res) => {
    const cls = await requireOwnedClass(req.params.classId, req.user!, res);
    if (!cls) return;

    const existing = await prisma.classAnnouncement.findFirst({
      where: { id: req.params.id, classId: cls.id },
      select: { id: true },
    });
    if (!existing) {
      res.status(404).json({ error: 'Announcement not found.' });
      return;
    }
    await prisma.classAnnouncement.delete({ where: { id: existing.id } });
    res.status(204).end();
  }),
);

/** `GET /announcements` — the calling student's own class's announcements (pinned first,
 * newest first, at most 30). No class → an empty list, never someone else's. */
studentAnnouncementsRouter.get(
  '/announcements',
  asyncHandler(async (req, res) => {
    const classId = await getStudentClassId(req.user!.sub);
    const rows = classId
      ? await prisma.classAnnouncement.findMany({
          where: { classId },
          orderBy: [...ANNOUNCEMENT_ORDER],
          take: STUDENT_ANNOUNCEMENT_LIMIT,
          include: ANNOUNCEMENT_INCLUDE,
        })
      : [];
    const response: StudentAnnouncementsResponseDTO = { items: rows.map(toAnnouncementDTO) };
    res.status(200).json(response);
  }),
);
