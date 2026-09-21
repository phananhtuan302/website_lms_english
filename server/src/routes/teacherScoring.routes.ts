/**
 * Two small read endpoints behind the Phase 15 grading / score-release screens. Neither writes.
 *
 * - `GET /api/teacher/attempts/:attemptId/next-ungraded` — where "Lưu và chấm bài kế tiếp" goes.
 * - `GET /api/teacher/tests/:testId/grading-status?classId=` — how many students handed a test in
 *   and how many of them still wait for an essay grade; drives the confirmation before letting a
 *   class see its scores ("Còn X bài viết chưa chấm — điểm của các em đó chỉ là tạm tính") and the
 *   "tạm tính" marks on the class results table.
 *
 * Ownership is the same as everywhere else: the attempt's / test's owning teacher (or an admin);
 * anything else looks like it does not exist (404).
 */

import { Router } from 'express';
import type { NextUngradedAttemptDTO, TestGradingStatusDTO } from '@platform/shared';
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
 * The next submitted attempt of the SAME test by a student of the SAME class (the student's class
 * right now) that still holds an ungraded essay, in submission order: the ones submitted after this
 * attempt first, then wrapping round to the earliest — so the teacher walks the whole pile once.
 * A student without a class has no "same class", so nothing else is offered.
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
    const response: NextUngradedAttemptDTO = {
      classId,
      nextAttemptId: (afterThis ?? others[0])?.id ?? null,
      remainingCount: others.length,
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
