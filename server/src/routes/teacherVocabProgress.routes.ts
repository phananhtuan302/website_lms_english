/**
 * Teacher-only vocabulary reporting: per-set progress (T-030) and monthly/yearly
 * ranking (T-032/T-033). Kept as its own file (rather than folded into
 * `teacherFlashcards.routes.ts`, which is set/card CRUD, or `teacherReports.routes.ts`,
 * which is the T-019 test-attempt reporting engine) since this is a sizeable,
 * self-contained reporting area with its own two data sources
 * (`FlashcardProgress`/`FlashcardExerciseAttempt`) — same "own file per feature area"
 * convention as every other route module in this codebase.
 */

import { Router } from 'express';
import type {
  TeacherVocabProgressDTO,
  TeacherVocabProgressStudentRowDTO,
  VocabPeriodLeaderboardResponseDTO,
} from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { requireOwnedFlashcardSet } from '../lib/ownedFlashcardSet';
import { summarizeActivityStats, summarizeCardStatuses } from '../lib/vocabProgress';
import { computePeriodLeaderboard } from '../lib/vocabLeaderboard';
import { hcmMonthRange, hcmYearRange } from '../lib/reporting';

export const teacherVocabProgressRouter = Router();

// T-071: `admin` also allowed (PROJECT_PLAN Assumption A12) — reachable from the
// flashcard-set editor page's "View progress" link, which admin now reuses as-is for
// ANY teacher's set (`requireOwnedFlashcardSet` below already covers the one
// ownership-scoped endpoint in this file; the ranking endpoints are class-wide already).
teacherVocabProgressRouter.use(requireAuth, requireRole('teacher', 'admin'));

// --- Per-set progress: per-student + per-class (T-030) --------------------------------

/**
 * `GET /flashcard-sets/:setId/progress` — ownership-checked (this teacher's own set
 * only, same 404-for-not-found-or-not-yours convention as every other owned-set route).
 *
 * Documented choice (see `TeacherVocabProgressDTO`'s doc comment in `@platform/shared`
 * for the full reasoning): `students` includes EVERY student account, not just ones
 * who've touched this set, so a teacher can see who has zero activity ("hasn't
 * practiced" per the acceptance criteria) as a visibly-zero row rather than a silent
 * absence. `classSummary` rolls up the exact same per-student rows into class-wide
 * totals — there is no smaller Class/cohort subdivision in this schema (every set is
 * visible to every student), so "the class" is the full student roster.
 */
teacherVocabProgressRouter.get(
  '/flashcard-sets/:setId/progress',
  asyncHandler(async (req, res) => {
    const set = await requireOwnedFlashcardSet(req.params.setId, req.user!, res);
    if (!set) return;

    const cards = await prisma.flashcardCard.findMany({
      where: { setId: set.id },
      select: { id: true },
    });
    const cardIds = cards.map((c) => c.id);

    const students = await prisma.user.findMany({
      where: { role: 'student' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    const [progressRows, attemptRows] = await Promise.all([
      cardIds.length > 0
        ? prisma.flashcardProgress.findMany({
            where: { cardId: { in: cardIds } },
            select: { studentId: true, status: true },
          })
        : Promise.resolve([]),
      cardIds.length > 0
        ? prisma.flashcardExerciseAttempt.findMany({
            where: { cardId: { in: cardIds } },
            select: { studentId: true, type: true, correct: true },
          })
        : Promise.resolve([]),
    ]);

    const progressByStudent = new Map<string, Array<{ status: (typeof progressRows)[number]['status'] }>>();
    for (const row of progressRows) {
      const list = progressByStudent.get(row.studentId) ?? [];
      list.push({ status: row.status });
      progressByStudent.set(row.studentId, list);
    }

    const attemptsByStudent = new Map<string, Array<{ type: (typeof attemptRows)[number]['type']; correct: boolean }>>();
    for (const row of attemptRows) {
      const list = attemptsByStudent.get(row.studentId) ?? [];
      list.push({ type: row.type, correct: row.correct });
      attemptsByStudent.set(row.studentId, list);
    }

    const studentRows: TeacherVocabProgressStudentRowDTO[] = students.map((student) => {
      const { knownCount, learningCount, newCount } = summarizeCardStatuses(
        cardIds,
        progressByStudent.get(student.id) ?? [],
      );
      return {
        studentId: student.id,
        studentName: student.name,
        knownCount,
        learningCount,
        newCount,
        activityStats: summarizeActivityStats(attemptsByStudent.get(student.id) ?? []),
      };
    });

    const classSummary = {
      studentCount: students.length,
      knownCount: studentRows.reduce((sum, row) => sum + row.knownCount, 0),
      learningCount: studentRows.reduce((sum, row) => sum + row.learningCount, 0),
      newCount: studentRows.reduce((sum, row) => sum + row.newCount, 0),
      activityStats: summarizeActivityStats(attemptRows),
    };

    const response: TeacherVocabProgressDTO = {
      setId: set.id,
      setName: set.name,
      cardCount: cardIds.length,
      classSummary,
      students: studentRows,
    };
    res.status(200).json(response);
  }),
);

// --- Monthly (T-032) / yearly (T-033) vocabulary ranking ------------------------------

function parseYearParam(raw: unknown): number | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const year = Number(raw);
  return Number.isInteger(year) && year >= 2000 && year <= 3000 ? year : null;
}

function parseMonthParam(raw: unknown): number | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const month = Number(raw);
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : null;
}

/** `GET /vocab-leaderboard/monthly?year=YYYY&month=1-12` (T-032). Uses the exact same
 * `Asia/Ho_Chi_Minh` fixed-offset month range T-019's reporting engine computes
 * internally for `groupBy=month`, exported from `../lib/reporting.ts` as
 * `hcmMonthRange` specifically for this reuse — see that function's doc comment. */
teacherVocabProgressRouter.get(
  '/vocab-leaderboard/monthly',
  asyncHandler(async (req, res) => {
    const year = parseYearParam(req.query.year);
    const month = parseMonthParam(req.query.month);
    if (year === null) {
      res.status(400).json({ error: 'year query param is required and must be an integer (e.g. 2026).' });
      return;
    }
    if (month === null) {
      res.status(400).json({ error: 'month query param is required and must be an integer 1-12.' });
      return;
    }

    const range = hcmMonthRange(year, month);
    const entries = await computePeriodLeaderboard(range);
    const response: VocabPeriodLeaderboardResponseDTO = {
      period: 'month',
      year,
      month,
      periodStart: range.start.toISOString(),
      periodEnd: range.end.toISOString(),
      entries,
    };
    res.status(200).json(response);
  }),
);

/** `GET /vocab-leaderboard/yearly?year=YYYY` (T-033). Same reuse of the reporting
 * engine's HCM-fixed-offset date math via `hcmYearRange`. */
teacherVocabProgressRouter.get(
  '/vocab-leaderboard/yearly',
  asyncHandler(async (req, res) => {
    const year = parseYearParam(req.query.year);
    if (year === null) {
      res.status(400).json({ error: 'year query param is required and must be an integer (e.g. 2026).' });
      return;
    }

    const range = hcmYearRange(year);
    const entries = await computePeriodLeaderboard(range);
    const response: VocabPeriodLeaderboardResponseDTO = {
      period: 'year',
      year,
      month: null,
      periodStart: range.start.toISOString(),
      periodEnd: range.end.toISOString(),
      entries,
    };
    res.status(200).json(response);
  }),
);
