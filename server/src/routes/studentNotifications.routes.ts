/**
 * Student reminders (T-109, Phase 14): the notification bell and the "Lịch" agenda page.
 *
 * Nothing here is stored. Both endpoints are computed on request from data that already
 * exists, for the CALLING student only (every query is keyed by their own id and their own
 * class, read fresh from the DB — there is no way to name another student or class):
 *
 * - `GET /notifications` — four kinds of item, each only for what the student can act on:
 *   `closingSoon` (a test they have not submitted that closes within 48 h), `newAssignment`
 *   (assigned in the last 7 days, not started, still startable or opening later),
 *   `scoresPublished` (scores became visible in the last 7 days for a test they submitted) and
 *   `newAnnouncement` (a class announcement of the last 7 days).
 * - `GET /calendar` — the open/close events of the student's tests for the current semester,
 *   ahead of now or within the last 14 days.
 *
 * The test set and each test's status come from `buildStudentAssignments` (T-105) — the very
 * list the home page shows, itself derived from the rules the start endpoint enforces — so a
 * reminder can never point at something the student cannot actually do. "Scores published"
 * uses the same `isScorePublished` rule as everywhere else, and a message never contains a
 * score.
 *
 * "Scores published" timing: the schema keeps no publish timestamp, so the moment is derived —
 * `closeAt` when auto-publish-on-close is what made it visible, the schedule row's `updatedAt`
 * when the teacher released manually (the earlier of the two if both apply). Editing the
 * schedule of an already released test therefore moves that moment; accepted for a reminder
 * that is only looked at for 7 days.
 */

import { Router } from 'express';
import type {
  StudentAssignmentDTO,
  StudentCalendarEventDTO,
  StudentCalendarResponseDTO,
  StudentNotificationDTO,
  StudentNotificationsResponseDTO,
} from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { buildStudentAssignments } from '../lib/studentAssignments';
import { isScorePublished } from '../lib/testClassSchedule';

export const studentNotificationsRouter = Router();

studentNotificationsRouter.use(requireAuth, requireRole('student'));

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** A test closing within this long counts as "closing soon" (BACKLOG T-109: 48 hours). */
const CLOSING_SOON_MS = 48 * HOUR_MS;
/** How long a "new" thing (assignment, scores, announcement) stays a notification. */
const RECENT_MS = 7 * DAY_MS;
/** Calendar: how far back past events are still listed. */
const CALENDAR_PAST_MS = 14 * DAY_MS;
const MAX_NOTIFICATIONS = 30;
const MAX_CALENDAR_EVENTS = 200;
/** Announcement text shown in a notification message. */
const SNIPPET_LENGTH = 100;

type TestLikeItem = StudentAssignmentDTO & { kind: 'test' | 'unitTest' | 'vocabularyCheck' };

function isTestLike(item: StudentAssignmentDTO): item is TestLikeItem {
  return item.kind === 'test' || item.kind === 'unitTest' || item.kind === 'vocabularyCheck';
}

/** "25 phút" / "3 giờ" — never rounds down to zero, so "còn 0 giờ" cannot happen. */
function formatTimeLeft(ms: number): string {
  if (ms < HOUR_MS) return `${Math.max(1, Math.ceil(ms / MINUTE_MS))} phút`;
  return `${Math.ceil(ms / HOUR_MS)} giờ`;
}

/** Collapse whitespace/line breaks and cut to `SNIPPET_LENGTH` characters. */
function toSnippet(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > SNIPPET_LENGTH ? `${flat.slice(0, SNIPPET_LENGTH).trimEnd()}…` : flat;
}

function later(...dates: Array<Date | null>): Date {
  let best: Date | null = null;
  for (const d of dates) if (d && (!best || d > best)) best = d;
  return best as Date;
}

/** Where a row of the student's list leads: the attempt if there is one to resume/see, else the home list. */
function linkFor(item: StudentAssignmentDTO): string {
  const attempt = item.myAttempt;
  if (attempt && item.status === 'inProgress') return `/student/attempts/${attempt.attemptId}`;
  if (attempt && item.status === 'submitted') return `/student/attempts/${attempt.attemptId}/result`;
  return '/student/dashboard';
}

studentNotificationsRouter.get(
  '/notifications',
  asyncHandler(async (req, res) => {
    const studentId = req.user!.sub;
    const now = new Date();
    const nowMs = now.getTime();
    const recentSince = new Date(nowMs - RECENT_MS);

    const assignments = await buildStudentAssignments(studentId);
    const { classId, periodId } = assignments;
    const scoped = classId !== null && periodId !== null;

    const tests = assignments.items.filter(isTestLike);
    const classTestIds = tests.filter((t) => t.kind !== 'vocabularyCheck').map((t) => t.id);
    const vocabCheckIds = tests.filter((t) => t.kind === 'vocabularyCheck').map((t) => t.id);
    const submittedIds = tests
      .filter((t) => t.kind !== 'vocabularyCheck' && t.status === 'submitted')
      .map((t) => t.id);

    const [assignedRows, grantRows, scheduleRows, submittedAttempts, announcements] = await Promise.all([
      scoped && classTestIds.length > 0
        ? prisma.testClassPeriodAssignment.findMany({
            where: { classId, periodId, testId: { in: classTestIds } },
            select: { testId: true, createdAt: true },
          })
        : Promise.resolve([]),
      vocabCheckIds.length > 0
        ? prisma.testAssignment.findMany({
            where: { studentId, testId: { in: vocabCheckIds } },
            select: { testId: true, createdAt: true },
          })
        : Promise.resolve([]),
      scoped && submittedIds.length > 0
        ? prisma.testClassSchedule.findMany({ where: { classId, periodId, testId: { in: submittedIds } } })
        : Promise.resolve([]),
      submittedIds.length > 0
        ? prisma.attempt.findMany({
            where: { studentId, status: 'submitted', testId: { in: submittedIds } },
            select: { testId: true, submittedAt: true },
          })
        : Promise.resolve([]),
      classId
        ? prisma.classAnnouncement.findMany({
            where: { classId, createdAt: { gte: recentSince } },
            orderBy: { createdAt: 'desc' },
            take: MAX_NOTIFICATIONS,
            select: { id: true, body: true, createdAt: true, author: { select: { name: true } } },
          })
        : Promise.resolve([]),
    ]);

    // When each test was given to this student: the class assignment row, or the per-student grant.
    const assignedAt = new Map<string, Date>();
    for (const row of assignedRows) assignedAt.set(row.testId, row.createdAt);
    for (const row of grantRows) assignedAt.set(row.testId, row.createdAt);
    const scheduleByTest = new Map(scheduleRows.map((s) => [s.testId, s]));
    const lastSubmittedAt = new Map<string, Date>();
    for (const attempt of submittedAttempts) {
      if (!attempt.submittedAt) continue;
      const prev = lastSubmittedAt.get(attempt.testId);
      if (!prev || attempt.submittedAt > prev) lastSubmittedAt.set(attempt.testId, attempt.submittedAt);
    }

    const out: StudentNotificationDTO[] = [];

    for (const item of tests) {
      const openAt = item.openAt ? new Date(item.openAt) : null;
      const closeAt = item.closeAt ? new Date(item.closeAt) : null;
      const given = assignedAt.get(item.id) ?? null;

      // 1. Closing soon: startable (or being worked on) and closing within 48 h. A submitted
      //    test never gets here (status `submitted`), nor does an upcoming/closed one.
      const closingIn = closeAt ? closeAt.getTime() - nowMs : null;
      if (
        (item.status === 'open' || item.status === 'inProgress') &&
        closingIn !== null &&
        closingIn > 0 &&
        closingIn <= CLOSING_SOON_MS
      ) {
        const at = later(new Date(closeAt!.getTime() - CLOSING_SOON_MS), openAt && openAt <= now ? openAt : null, given);
        out.push({
          id: `closingSoon:${item.id}`,
          type: 'closingSoon',
          title: item.title,
          message:
            item.status === 'inProgress'
              ? `Bài sắp đóng, còn ${formatTimeLeft(closingIn)}. Bạn đang làm dở, nhớ nộp bài nhé.`
              : `Bài sắp đóng, còn ${formatTimeLeft(closingIn)}. Bạn chưa làm bài này.`,
          at: new Date(Math.min(at.getTime(), nowMs)).toISOString(),
          link: linkFor(item),
        });
        continue;
      }

      // 2. New assignment: given in the last 7 days, not started, not already missed.
      if ((item.status === 'open' || item.status === 'upcoming') && given && given >= recentSince) {
        out.push({
          id: `newAssignment:${item.id}`,
          type: 'newAssignment',
          title: item.title,
          message:
            item.kind === 'vocabularyCheck'
              ? 'Giáo viên vừa giao bài kiểm tra từ vựng cho bạn.'
              : item.status === 'upcoming'
                ? 'Giáo viên vừa giao bài mới. Bài chưa mở, hãy quay lại sau.'
                : 'Giáo viên vừa giao bài mới. Bạn chưa làm bài này.',
          at: given.toISOString(),
          link: '/student/dashboard',
        });
        continue;
      }

      // 3. Scores published: submitted, and released to the student within the last 7 days
      //    — but not when they submitted AFTER the release (nothing was "published" to them).
      if (item.status === 'submitted' && item.myAttempt?.scoresPublished) {
        const schedule = scheduleByTest.get(item.id) ?? null;
        if (schedule && isScorePublished(schedule)) {
          const moments: Date[] = [];
          if (schedule.scoresPublishedManually) moments.push(schedule.updatedAt);
          if (schedule.autoPublishScoresOnClose && schedule.closeAt && schedule.closeAt.getTime() <= nowMs) {
            moments.push(schedule.closeAt);
          }
          const publishedAt = moments.length > 0 ? new Date(Math.min(...moments.map((d) => d.getTime()))) : null;
          const submittedAt = lastSubmittedAt.get(item.id) ?? null;
          if (
            publishedAt &&
            publishedAt >= recentSince &&
            publishedAt.getTime() <= nowMs &&
            (!submittedAt || publishedAt > submittedAt)
          ) {
            out.push({
              id: `scoresPublished:${item.id}`,
              type: 'scoresPublished',
              title: item.title,
              message: 'Giáo viên đã công bố điểm bài này. Bấm để xem kết quả.',
              at: publishedAt.toISOString(),
              link: linkFor(item),
            });
          }
        }
      }
    }

    // 4. Announcements of the student's own class, last 7 days.
    for (const a of announcements) {
      out.push({
        id: `newAnnouncement:${a.id}`,
        type: 'newAnnouncement',
        title: `Thông báo mới từ ${a.author.name}`,
        message: toSnippet(a.body),
        at: a.createdAt.toISOString(),
        link: '/student/dashboard',
      });
    }

    out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id.localeCompare(b.id)));
    const response: StudentNotificationsResponseDTO = { items: out.slice(0, MAX_NOTIFICATIONS) };
    res.status(200).json(response);
  }),
);

studentNotificationsRouter.get(
  '/calendar',
  asyncHandler(async (req, res) => {
    const now = new Date();
    const nowMs = now.getTime();
    const since = nowMs - CALENDAR_PAST_MS;

    const assignments = await buildStudentAssignments(req.user!.sub);

    const events: StudentCalendarEventDTO[] = [];
    for (const item of assignments.items) {
      // Study areas and Vocabulary Checks have no schedule, so they never have events.
      if (item.kind !== 'test' && item.kind !== 'unitTest') continue;
      const link = linkFor(item);
      for (const [event, iso] of [
        ['opens', item.openAt],
        ['closes', item.closeAt],
      ] as const) {
        if (!iso) continue;
        const atMs = new Date(iso).getTime();
        if (atMs < since) continue;
        events.push({
          id: `${event}:${item.id}`,
          testId: item.id,
          title: item.title,
          kind: item.kind,
          event,
          at: iso,
          isPast: atMs <= nowMs,
          status: item.status,
          link,
        });
      }
    }
    events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id.localeCompare(b.id)));

    const response: StudentCalendarResponseDTO = {
      className: assignments.className,
      periodName: assignments.periodName,
      now: now.toISOString(),
      // Oldest first; if the cap is ever hit it is the oldest past events that drop out.
      events: events.slice(-MAX_CALENDAR_EVENTS),
    };
    res.status(200).json(response);
  }),
);
