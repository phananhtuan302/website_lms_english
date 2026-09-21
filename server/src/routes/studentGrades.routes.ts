/**
 * Student "Điểm của tôi" (T-110, Phase 14): `GET /api/student/grades[?periodId=]` — the
 * calling student's OWN grades for one semester of their OWN class.
 *
 * Built from the same rules the rest of the student side already enforces, nothing new:
 *  - candidate tests = what `GET /api/student/assignments` lists for the class + semester
 *    (`TestClassPeriodAssignment`; a Unit Test also needs `published`), except Vocabulary
 *    Checks: those are granted per student, have no per-semester schedule (so their score
 *    is never "published" for anyone) and therefore have no meaningful row in a grade list.
 *    A test with no variants and no attempt is left out (not startable, so not a to-do).
 *  - the score-withholding rule is `isScorePublished` on the (test, class, semester)
 *    `TestClassSchedule` — the very check `GET /api/attempts` uses (T-092/T-093). A row that
 *    is not `graded` carries NO score field of any kind (they are absent, not `null`), and
 *    the "best attempt" is not even chosen for it — choosing by hidden score would itself
 *    leak something.
 *  - "best attempt" = the highest `scorePercent`, a tie goes to the later submission —
 *    identical to the teacher's gradebook (`teacherClassGradebook.routes.ts`), so a
 *    student's average here equals the teacher's figure for them when everything is released.
 *
 * Isolation: every query is keyed by the caller's own id and their own class id (read fresh
 * from the DB via `getStudentClassAndPeriod`) — there is no way to name another student or
 * class. A `periodId` that is not one of the caller's class's semesters answers 404.
 */

import { Router } from 'express';
import type {
  StudentGradeGradedTestDTO,
  StudentGradePendingTestDTO,
  StudentGradesPeriodDTO,
  StudentGradesProgressDTO,
  StudentGradesResponseDTO,
  StudentGradeTestDTO,
} from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { getStudentClassAndPeriod } from '../lib/classScoping';
import { isScorePublished } from '../lib/testClassSchedule';
import { loadProvisionalInfo } from '../lib/attemptScore';
import { summarizeCardStatuses } from '../lib/vocabProgress';

export const studentGradesRouter = Router();

studentGradesRouter.use(requireAuth, requireRole('student'));

/** Mean of `values` rounded to 1 decimal (same rounding as the gradebook), `null` if empty. */
function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Number((values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(1));
}

interface SubmittedAttempt {
  id: string;
  scorePercent: number | null;
  correctCount: number | null;
  totalCount: number | null;
  submittedAt: Date | null;
}

/** Best = highest score; a tie goes to the later submission. Attempts without a score are
 * never "best" (a submitted attempt that has no score yet cannot be ranked). */
function pickBest(attempts: SubmittedAttempt[]): SubmittedAttempt | null {
  let best: SubmittedAttempt | null = null;
  for (const attempt of attempts) {
    if (attempt.scorePercent == null) continue;
    if (!best) {
      best = attempt;
      continue;
    }
    const isLater = (attempt.submittedAt?.getTime() ?? 0) > (best.submittedAt?.getTime() ?? 0);
    if (attempt.scorePercent > best.scorePercent! || (attempt.scorePercent === best.scorePercent && isLater)) {
      best = attempt;
    }
  }
  return best;
}

function latestSubmittedAt(attempts: SubmittedAttempt[]): Date | null {
  let latest: Date | null = null;
  for (const attempt of attempts) {
    if (attempt.submittedAt && (!latest || attempt.submittedAt > latest)) latest = attempt.submittedAt;
  }
  return latest;
}

studentGradesRouter.get(
  '/grades',
  asyncHandler(async (req, res) => {
    const studentId = req.user!.sub;
    const askedPeriodId = typeof req.query.periodId === 'string' && req.query.periodId ? req.query.periodId : null;

    const scp = await getStudentClassAndPeriod(studentId);
    const empty: StudentGradesResponseDTO = {
      classId: null,
      className: null,
      periodId: null,
      periodName: null,
      currentPeriodId: null,
      periods: [],
      tests: [],
      averageScorePercent: null,
      progress: null,
    };
    if (!scp) {
      if (askedPeriodId) {
        res.status(404).json({ error: 'Không tìm thấy học kỳ này.' });
        return;
      }
      res.status(200).json(empty);
      return;
    }
    const classId = scp.classId;
    const currentPeriodId = scp.periodId;

    // Semesters the class has tests in, plus its current one, newest first.
    const [cls, assignedPeriods] = await Promise.all([
      prisma.class.findUnique({ where: { id: classId }, select: { name: true } }),
      prisma.testClassPeriodAssignment.findMany({
        where: { classId },
        distinct: ['periodId'],
        select: { periodId: true },
      }),
    ]);
    const periodIds = new Set(assignedPeriods.map((a) => a.periodId));
    if (currentPeriodId) periodIds.add(currentPeriodId);
    const periodRows = periodIds.size
      ? await prisma.academicPeriod.findMany({
          where: { id: { in: [...periodIds] } },
          orderBy: [{ startDate: 'desc' }, { name: 'asc' }],
          select: { id: true, name: true },
        })
      : [];
    const periods: StudentGradesPeriodDTO[] = periodRows.map((p) => ({
      id: p.id,
      name: p.name,
      isCurrent: p.id === currentPeriodId,
    }));

    const selectedPeriodId = askedPeriodId ?? currentPeriodId;
    if (askedPeriodId && !periods.some((p) => p.id === askedPeriodId)) {
      res.status(404).json({ error: 'Không tìm thấy học kỳ này.' });
      return;
    }
    const selectedPeriod = periods.find((p) => p.id === selectedPeriodId) ?? null;

    const response: StudentGradesResponseDTO = {
      ...empty,
      classId,
      className: cls?.name ?? null,
      periodId: selectedPeriod?.id ?? null,
      periodName: selectedPeriod?.name ?? null,
      currentPeriodId,
      periods,
    };
    if (!selectedPeriod) {
      res.status(200).json(response);
      return;
    }
    const periodId = selectedPeriod.id;

    // --- Tests of that semester, with the student's attempts + the class's schedule ------
    const tests = await prisma.test.findMany({
      where: {
        classAssignments: { some: { classId, periodId } },
        // Same candidate rule as `studentAssignments.ts`, minus Vocabulary Checks (see header).
        OR: [{ testType: { notIn: ['unitTest', 'vocabularyCheck'] } }, { testType: 'unitTest', published: true }],
      },
      select: { id: true, title: true, testType: true, _count: { select: { variants: true } } },
    });
    const testIds = tests.map((t) => t.id);

    const [attempts, schedules] = await Promise.all([
      testIds.length
        ? prisma.attempt.findMany({
            where: { studentId, testId: { in: testIds } },
            select: {
              id: true,
              testId: true,
              status: true,
              scorePercent: true,
              correctCount: true,
              totalCount: true,
              submittedAt: true,
            },
          })
        : Promise.resolve([]),
      testIds.length
        ? prisma.testClassSchedule.findMany({ where: { classId, periodId, testId: { in: testIds } } })
        : Promise.resolve([]),
    ]);
    const scheduleByTest = new Map(schedules.map((s) => [s.testId, s]));
    const submittedByTest = new Map<string, SubmittedAttempt[]>();
    const inProgressTests = new Set<string>();
    for (const attempt of attempts) {
      if (attempt.status === 'submitted') {
        const list = submittedByTest.get(attempt.testId);
        if (list) list.push(attempt);
        else submittedByTest.set(attempt.testId, [attempt]);
      } else {
        inProgressTests.add(attempt.testId);
      }
    }

    // The detailed result page checks release against the class's CURRENT semester, so only
    // offer its link when that is the semester being shown (otherwise it would say "pending").
    const resultLinkable = periodId === currentPeriodId;

    // Phase 15: which of the RELEASED best attempts still wait for an essay grade ("tạm tính").
    // Looked up only for released tests, so nothing about an unpublished test is derived at all.
    const releasedBestIds: string[] = [];
    for (const test of tests) {
      const submitted = submittedByTest.get(test.id) ?? [];
      if (submitted.length > 0 && isScorePublished(scheduleByTest.get(test.id) ?? null)) {
        const best = pickBest(submitted);
        if (best) releasedBestIds.push(best.id);
      }
    }
    const provisionalInfo = await loadProvisionalInfo(releasedBestIds);

    const rows: StudentGradeTestDTO[] = [];
    const bestScores: number[] = [];
    for (const test of tests) {
      const submitted = submittedByTest.get(test.id) ?? [];
      const inProgress = inProgressTests.has(test.id);
      // Not startable and never attempted: the teacher has not finished preparing it.
      if (submitted.length === 0 && !inProgress && test._count.variants === 0) continue;

      const schedule = scheduleByTest.get(test.id) ?? null;
      const base = {
        testId: test.id,
        title: test.title,
        kind: test.testType === 'unitTest' ? ('unitTest' as const) : ('test' as const),
        openAt: schedule?.openAt ? schedule.openAt.toISOString() : null,
        closeAt: schedule?.closeAt ? schedule.closeAt.toISOString() : null,
        attemptCount: submitted.length,
      };

      if (submitted.length > 0 && isScorePublished(schedule)) {
        const best = pickBest(submitted);
        if (best) {
          const graded: StudentGradeGradedTestDTO = {
            ...base,
            status: 'graded',
            scorePercent: best.scorePercent!,
            correctCount: best.correctCount ?? 0,
            totalCount: best.totalCount ?? 0,
            submittedAt: best.submittedAt ? best.submittedAt.toISOString() : '',
            attemptId: resultLinkable ? best.id : null,
            provisional: provisionalInfo.get(best.id)?.provisional ?? false,
          };
          rows.push(graded);
          bestScores.push(best.scorePercent!);
          continue;
        }
      }

      const latest = latestSubmittedAt(submitted);
      const pending: StudentGradePendingTestDTO = {
        ...base,
        status: submitted.length > 0 ? 'awaitingPublish' : inProgress ? 'inProgress' : 'notStarted',
        submittedAt: latest ? latest.toISOString() : null,
      };
      rows.push(pending);
    }

    // By title: stable and predictable (sorting by score would push the unfinished rows away).
    rows.sort((a, b) => a.title.localeCompare(b.title));
    response.tests = rows;
    response.averageScorePercent = average(bestScores);

    // --- Small learning-progress summary for that semester's sets/topics ------------------
    const [sets, topics] = await Promise.all([
      prisma.flashcardSet.findMany({
        where: { classAssignments: { some: { classId, periodId } } },
        select: { id: true, cards: { select: { id: true } } },
      }),
      prisma.grammarTopic.findMany({
        where: { classAssignments: { some: { classId, periodId } } },
        select: { id: true },
      }),
    ]);
    const cardIds = sets.flatMap((set) => set.cards.map((c) => c.id));
    const [progressRows, grammarGroups] = await Promise.all([
      cardIds.length
        ? prisma.flashcardProgress.findMany({
            where: { studentId, cardId: { in: cardIds } },
            select: { status: true },
          })
        : Promise.resolve([]),
      topics.length
        ? prisma.grammarExerciseAttempt.groupBy({
            by: ['isCorrect'],
            where: { studentId, topicId: { in: topics.map((t) => t.id) } },
            _count: { _all: true },
          })
        : Promise.resolve([]),
    ]);
    const { knownCount, learningCount } = summarizeCardStatuses(cardIds, progressRows);
    const grammarCorrect = grammarGroups.find((g) => g.isCorrect)?._count._all ?? 0;
    const grammarWrong = grammarGroups.find((g) => !g.isCorrect)?._count._all ?? 0;
    const progress: StudentGradesProgressDTO = {
      vocabulary: { setCount: sets.length, cardCount: cardIds.length, knownCount, learningCount },
      grammar: { attempted: grammarCorrect + grammarWrong, correct: grammarCorrect },
    };
    response.progress = progress;

    res.status(200).json(response);
  }),
);
