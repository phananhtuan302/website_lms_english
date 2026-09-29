/**
 * Small read endpoints behind the Phase 15 grading / score-release screens. Neither writes.
 *
 * - `GET /api/teacher/attempts/:attemptId/next-ungraded` — where "Lưu và chấm bài kế tiếp" goes.
 *   Phase 17 (T-118B): widened from ONE class to every class the test's owning teacher currently
 *   has this same test assigned to — see the handler's own doc comment for the exact cycle order.
 * - `GET /api/teacher/attempts/:attemptId/siblings` — "Học sinh {{position}}/{{total}}" plus
 *   "← Học sinh trước" / "Học sinh sau →" on the attempt detail page. Deliberately UNCHANGED by
 *   Phase 17 — this is "browse this one class's roster order", a different feature from the
 *   cross-class grading queue above; it still scopes to the student's own class only.
 * - `GET /api/teacher/tests/:testId/grading-status?classId=` — how many students handed a test in
 *   and how many of them still wait for an essay grade; drives the confirmation before letting a
 *   class see its scores ("Còn X bài viết chưa chấm — điểm của các em đó chỉ là tạm tính") and the
 *   "tạm tính" marks on the class results table.
 *
 * Ownership is the same as everywhere else: the attempt's / test's owning teacher (or an admin);
 * anything else looks like it does not exist (404).
 */

import { Router } from 'express';
import type { AttemptSiblingsDTO, NextUngradedAttemptDTO, TestGradingStatusDTO } from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { isAdminOrOwner } from '../lib/authz';
import { requireOwnedTest } from '../lib/ownedTest';
import { isClassScopeFailure, resolveTeacherClassId } from '../lib/reportClassScope';
import { awaitingGradingWhere } from '../lib/classAttention';
import { loadProvisionalInfo } from '../lib/attemptScore';

export const teacherScoringRouter = Router();

teacherScoringRouter.use(requireAuth, requireRole('teacher', 'admin'));

/**
 * The next submitted attempt of the SAME test that still holds an ungraded essay, cycling through
 * every class the test's owning teacher currently has this test assigned to (Phase 17, T-118B —
 * previously scoped to the attempt's own class only).
 *
 * Cycle order (documented choice — classes are ordered by NAME, not by
 * `TestClassPeriodAssignment.createdAt`, since a teacher recognises "lớp 6A1, 6A2, 7A1…" faster
 * than an arbitrary assignment-history order):
 *  1. The SAME class as the attempt being graded: submissions after this one first (submission
 *     order), then wrapping round to that class's own earliest ungraded one — byte-identical to
 *     the pre-Phase-17 behaviour, so grading inside one class feels completely unchanged.
 *  2. If that class has nothing left: every OTHER class currently assigned this test (by the same
 *     owning teacher), in name order STARTING right after the current class and wrapping back
 *     round to it (so a class alphabetically before the current one is visited last, not first) —
 *     the first such class with any ungraded attempt is entered, at ITS OWN earliest ungraded one.
 *  3. `nextAttemptId: null` only once EVERY eligible class (current + every other one) has nothing
 *     ungraded left for this test.
 *
 * A student without a class has no "same class" step (as before) — the walk then starts straight
 * from the first eligible class in name order. "Eligible" = a `Class` owned by the test's teacher
 * whose CURRENT period has this test assigned via `TestClassPeriodAssignment` (the same "currently
 * assigned" rule `loadClassGrades`/`computeClassesAttention` already use elsewhere) — a class with
 * no current period, or whose current period doesn't have this test, is never crossed into.
 */
teacherScoringRouter.get(
  '/attempts/:attemptId/next-ungraded',
  asyncHandler(async (req, res) => {
    const attempt = await prisma.attempt.findUnique({
      where: { id: req.params.attemptId },
      include: {
        test: { select: { teacherId: true } },
        student: { select: { classId: true } },
      },
    });
    if (!attempt || !isAdminOrOwner(req.user!, attempt.test.teacherId)) {
      res.status(404).json({ error: 'Attempt not found.' });
      return;
    }

    const classId = attempt.student.classId;

    // Step 1: same-class walk, EXACTLY as before Phase 17.
    let others: Array<{ id: string; submittedAt: Date | null }> = [];
    if (classId) {
      others = await prisma.attempt.findMany({
        where: { ...awaitingGradingWhere([attempt.testId], classId), id: { not: attempt.id } },
        orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
        select: { id: true, submittedAt: true },
      });
    }
    const afterThis = others.find(
      (other) => (other.submittedAt?.getTime() ?? 0) >= (attempt.submittedAt?.getTime() ?? 0),
    );
    const sameClassNextId = (afterThis ?? others[0])?.id ?? null;

    // Step 2: every class (of this test's owning teacher) currently assigned this test, in name
    // order — used both to build the cross-class cycle and to total up `remainingCount`. Same
    // two-query "classes with a current period, then match assignment rows against each one's OWN
    // `currentPeriodId`" shape as `computeClassesAttention` (a class-to-period FK can't be
    // compared to a sibling column inside a single Prisma `where`, hence the second query).
    const teacherClasses = await prisma.class.findMany({
      where: { teacherId: attempt.test.teacherId, currentPeriodId: { not: null } },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, currentPeriodId: true },
    });
    const assignedClassIds =
      teacherClasses.length === 0
        ? new Set<string>()
        : new Set(
            (
              await prisma.testClassPeriodAssignment.findMany({
                where: {
                  testId: attempt.testId,
                  OR: teacherClasses.map((cls) => ({ classId: cls.id, periodId: cls.currentPeriodId! })),
                },
                select: { classId: true },
              })
            ).map((row) => row.classId),
          );
    const eligibleClasses = teacherClasses.filter((cls) => assignedClassIds.has(cls.id));

    let crossedInto: { id: string; name: string } | null = null;
    let crossAttemptId: string | null = null;
    let crossRemaining = 0;

    const otherClassIds = eligibleClasses.filter((cls) => cls.id !== classId).map((cls) => cls.id);
    if (otherClassIds.length > 0) {
      const crossAttempts = await prisma.attempt.findMany({
        where: awaitingGradingWhere([attempt.testId], otherClassIds),
        orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
        select: { id: true, student: { select: { classId: true } } },
      });
      crossRemaining = crossAttempts.length;

      if (sameClassNextId === null) {
        // Only actually CROSS when the current class truly has nothing left (step 1 empty).
        const byClass = new Map<string, string[]>();
        for (const a of crossAttempts) {
          const cid = a.student.classId;
          if (cid === null) continue;
          const list = byClass.get(cid);
          if (list) list.push(a.id);
          else byClass.set(cid, [a.id]);
        }
        // Rotate `eligibleClasses` so it starts right after the current class and wraps back to it.
        const currentIdx = classId ? eligibleClasses.findIndex((cls) => cls.id === classId) : -1;
        const rotation =
          currentIdx === -1
            ? eligibleClasses.filter((cls) => cls.id !== classId)
            : [...eligibleClasses.slice(currentIdx + 1), ...eligibleClasses.slice(0, currentIdx)];
        for (const cls of rotation) {
          const attemptIds = byClass.get(cls.id);
          if (attemptIds && attemptIds.length > 0) {
            crossedInto = cls;
            crossAttemptId = attemptIds[0];
            break;
          }
        }
      }
    }

    const response: NextUngradedAttemptDTO = {
      classId: sameClassNextId !== null ? classId : (crossedInto?.id ?? classId),
      nextAttemptId: sameClassNextId ?? crossAttemptId,
      remainingCount: others.length + crossRemaining,
      ...(crossedInto ? { crossedIntoClassId: crossedInto.id, crossedIntoClassName: crossedInto.name } : {}),
    };
    res.status(200).json(response);
  }),
);

/**
 * Every submitted attempt of the SAME test by a student of the SAME class (the student's class
 * right now), in submission order — graded or not, unlike `/next-ungraded` above. Used for plain
 * "previous / next student" browsing while grading, so a teacher can go back to check or fix an
 * already-graded one too, not just walk the ungraded pile once.
 */
teacherScoringRouter.get(
  '/attempts/:attemptId/siblings',
  asyncHandler(async (req, res) => {
    const attempt = await prisma.attempt.findUnique({
      where: { id: req.params.attemptId },
      include: {
        test: { select: { teacherId: true } },
        student: { select: { classId: true } },
      },
    });
    if (!attempt || !isAdminOrOwner(req.user!, attempt.test.teacherId)) {
      res.status(404).json({ error: 'Attempt not found.' });
      return;
    }

    const classId = attempt.student.classId;
    const siblings = classId
      ? await prisma.attempt.findMany({
          where: { testId: attempt.testId, status: 'submitted', student: { classId } },
          orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
          select: { id: true },
        })
      : [{ id: attempt.id }];

    const index = siblings.findIndex((sibling) => sibling.id === attempt.id);
    const position = index === -1 ? 1 : index + 1;
    const response: AttemptSiblingsDTO = {
      classId,
      position,
      total: siblings.length,
      prevAttemptId: index > 0 ? siblings[index - 1].id : null,
      nextAttemptId: index !== -1 && index < siblings.length - 1 ? siblings[index + 1].id : null,
    };
    res.status(200).json(response);
  }),
);

teacherScoringRouter.get(
  '/tests/:testId/grading-status',
  asyncHandler(async (req, res) => {
    const test = await requireOwnedTest(req.params.testId, req.user!, res);
    if (!test) return;

    const scope = await resolveTeacherClassId(req.user!, req.query.classId);
    if (isClassScopeFailure(scope)) {
      res.status(scope.status).json({ error: scope.error });
      return;
    }

    // Same rows as the class results page (`GET /tests/:testId/attempts`): submitted attempts of
    // this test by students currently in the class.
    const attempts = await prisma.attempt.findMany({
      where: { testId: test.id, status: 'submitted', student: { classId: scope.classId } },
      select: { id: true, studentId: true },
    });
    const info = await loadProvisionalInfo(attempts.map((a) => a.id));

    const provisionalAttempts: TestGradingStatusDTO['provisionalAttempts'] = {};
    const ungradedStudents = new Set<string>();
    for (const attempt of attempts) {
      const state = info.get(attempt.id);
      if (state?.provisional) {
        provisionalAttempts[attempt.id] = { provisional: true, ungradedCount: state.ungradedCount };
        ungradedStudents.add(attempt.studentId);
      }
    }

    const response: TestGradingStatusDTO = {
      testId: test.id,
      classId: scope.classId,
      submittedStudentCount: new Set(attempts.map((a) => a.studentId)).size,
      ungradedStudentCount: ungradedStudents.size,
      provisionalAttempts,
    };
    res.status(200).json(response);
  }),
);
