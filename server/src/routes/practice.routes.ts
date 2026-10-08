/**
 * Student-facing home self-practice (T-040): lets a student take ANY test standalone,
 * outside a teacher-run QR/live session, so a Listening section behaves per T-040
 * (student's own Play button, optionally capped by `Section.maxPlayCount`) rather than
 * T-041 (teacher-broadcast-only during a live session). See `SessionMode`'s doc comment
 * in `schema.prisma` for the full reasoning.
 *
 * Documented choice: ONE shared `selfPractice` `TestSession` per `Test`, found-or-created
 * lazily on the first practice request for that test (by ANY student) and reused by
 * every subsequent student/request — same "global, not per-teacher/per-student" pattern
 * already used for `Unit`/`AcademicPeriod`/flashcard-set visibility elsewhere in this
 * codebase. It is never closed. Every student who practices the same test still gets
 * their OWN `Attempt` within it (`Attempt.@@unique([sessionId, studentId])`), assigned a
 * variant via the exact same round-robin rule as a live join
 * (`lib/attemptAssignment.ts`'s `findOrCreateAttempt`) — self-practice is the same
 * test-taking engine, not a parallel system (Guiding Principle 6). Per that same
 * uniqueness constraint, a student can only self-practice a given test ONCE per this
 * session row (re-opening `POST /:testId/practice` after already having a self-practice
 * attempt just returns the existing one, same idempotent-join behavior as T-011's live
 * join) — retaking self-practice from scratch is a possible future enhancement, not
 * required by T-040's acceptance criteria.
 */

import { Router } from 'express';
import type { JoinSessionResponse, PracticeTestSummaryDTO } from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { generateJoinToken, generateManualCode } from '../lib/sessionCodes';
import { findOrCreateAttempt } from '../lib/attemptAssignment';
import { getStudentClassAndPeriod } from '../lib/classScoping';
import { checkAttemptWindow, findTestClassSchedule } from '../lib/testClassSchedule';

export const practiceRouter = Router();

practiceRouter.use(requireAuth, requireRole('student'));

/** GET /api/tests — every test ASSIGNED TO THE CALLING STUDENT'S OWN CLASS, for the
 * student self-practice picker (T-040). Class-scoped as of T-076, Phase 12 — this
 * SUPERSEDES the earlier "every test visible to every student, no class/enrollment
 * concept" assumption `studentFlashcards.routes.ts`'s doc comment still describes for
 * flashcard sets (fixed by this same task, see that file). A student with no class at
 * all (`getStudentClassId` returning `null` — shouldn't happen post-T-074/T-075, see that
 * helper's doc comment) sees an empty list rather than every test or a crash.
 *
 * Still excludes `unitTest` and `vocabularyCheck` (T-036/T-038, unchanged): both have
 * their own purpose-built, properly-gated visibility rules (`Test.published` PLUS class
 * assignment for Unit Tests — see `GET /api/student/unit-tests`; `TestAssignment`,
 * individually per-student and NEVER class-assignment-based, for Vocabulary Check — see
 * `POST /:testId/practice` below) that this generic list would otherwise bypass. */
practiceRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const scp = await getStudentClassAndPeriod(req.user!.sub);
    if (!scp || scp.periodId == null) {
      res.status(200).json([] satisfies PracticeTestSummaryDTO[]);
      return;
    }

    const tests = await prisma.test.findMany({
      where: {
        testType: { notIn: ['unitTest', 'vocabularyCheck'] },
        classAssignments: { some: { classId: scp.classId, periodId: scp.periodId } },
      },
      select: { id: true, title: true, testType: true },
      orderBy: { title: 'asc' },
    });
    const response: PracticeTestSummaryDTO[] = tests;
    res.status(200).json(response);
  }),
);

/** Finds this test's shared self-practice session, creating it if this is the first
 * ever practice request for it. A `joinToken`/`manualCode` are generated even though
 * self-practice is never reached via QR/manual code — `TestSession.joinToken` is a
 * required unique column, so every row needs a valid value; a self-practice session's
 * token/code are simply never displayed or accepted by the QR-join endpoints. */
async function findOrCreatePracticeSession(testId: string) {
  const existing = await prisma.testSession.findFirst({
    where: { testId, mode: 'selfPractice' },
  });
  if (existing) return existing;

  try {
    return await prisma.testSession.create({
      data: {
        testId,
        joinToken: generateJoinToken(),
        manualCode: generateManualCode(),
        mode: 'selfPractice',
        status: 'active',
      },
    });
  } catch (err) {
    // Race: two students requesting self-practice for a brand-new test at the same
    // instant. `testId+mode` isn't a DB-level unique constraint (see this file's module
    // doc comment — enforced at the application layer, same pattern as elsewhere in this
    // codebase), so the race manifests as two rows rather than a P2002 — re-query and
    // take whichever one now exists (the other becomes simply unused, harmless).
    const race = await prisma.testSession.findFirst({ where: { testId, mode: 'selfPractice' } });
    if (race) return race;
    throw err;
  }
}

/** POST /api/tests/:testId/practice — starts (or resumes) this student's self-practice
 * attempt for a test. Response shape matches the live-join endpoint's
 * `JoinSessionResponse` exactly, so the client reuses the same "navigate into
 * `/student/attempts/:attemptId`" logic as `JoinPage.tsx`. */
practiceRouter.post(
  '/:testId/practice',
  asyncHandler(async (req, res) => {
    const test = await prisma.test.findUnique({ where: { id: req.params.testId } });
    if (!test) {
      res.status(404).json({ error: 'Test not found.' });
      return;
    }

    // T-036: an unpublished Unit Test isn't "available" yet (`Test.published`'s doc
    // comment in schema.prisma) — defense in depth alongside `GET /api/student/unit-tests`
    // already only listing published ones, in case a student directly POSTs a known id.
    if (test.testType === 'unitTest' && !test.published) {
      res.status(403).json({ error: 'This Unit Test has not been published yet.' });
      return;
    }

    // T-038: a Vocabulary Check is generated FOR specific student(s) — only a student
    // explicitly granted a `TestAssignment` row may start it, per that model's doc
    // comment in schema.prisma (its question pool is drawn from THEIR OWN studied
    // vocabulary, so an unassigned student starting it would make no sense anyway).
    // Deliberately NOT also checked against the test's class assignment (T-076/T-099): a
    // generated Vocabulary Check is never assigned to any class in the first place (see
    // `teacherVocabularyCheck.routes.ts`) — class-scoping is superseded here by a strictly
    // NARROWER per-student grant, so adding a class check would only ever make this MORE
    // restrictive for no reason (in practice it has zero class-period assignments for this
    // type, which would reject everyone including already-assigned students).
    // Looked up once and reused below by both the T-076/T-099 class-assignment check and
    // the T-093 schedule-window check — `null`/`periodId: null` for a classless student,
    // a student whose class has no current semester yet, or a `vocabularyCheck` (which
    // isn't class-scoped at all, see the branch below).
    const scp = await getStudentClassAndPeriod(req.user!.sub);

    if (test.testType === 'vocabularyCheck') {
      const assignment = await prisma.testAssignment.findUnique({
        where: { testId_studentId: { testId: test.id, studentId: req.user!.sub } },
      });
      if (!assignment) {
        res.status(403).json({ error: 'This Vocabulary Check was not assigned to you.' });
        return;
      }
    } else {
      // T-076/T-099: every other test type (generic/unitTest/listeningTest/mockTest)
      // must be assigned to the calling student's own class FOR THAT CLASS'S CURRENT
      // SEMESTER — defense in depth alongside `GET /api/tests`/`GET
      // /api/student/unit-tests` already filtering their lists by the same rule, in case
      // a student POSTs a known/guessed test id directly.
      const assignment =
        scp && scp.periodId != null
          ? await prisma.testClassPeriodAssignment.findUnique({
              where: {
                testId_classId_periodId: { testId: test.id, classId: scp.classId, periodId: scp.periodId },
              },
            })
          : null;
      if (!assignment) {
        res.status(403).json({ error: 'This test is not assigned to your class.' });
        return;
      }
    }

    const session = await findOrCreatePracticeSession(test.id);

    // T-093 (extended T-099): block STARTING a brand-new attempt if this (class, period)
    // pair's `TestClassSchedule` window says so (`now < openAt` or `now > closeAt`). An
    // already-existing attempt is exempt — resuming/continuing it is explicitly OUT OF
    // SCOPE for being cut off mid-attempt (BACKLOG.md T-093), so this only ever gates the
    // FIRST request that would create the row (see `findOrCreateAttempt`'s doc comment
    // for the idempotent "already joined" check this mirrors).
    const alreadyStarted = await prisma.attempt.findUnique({
      where: { sessionId_studentId: { sessionId: session.id, studentId: req.user!.sub } },
    });
    if (!alreadyStarted && scp && scp.periodId != null) {
      const schedule = await findTestClassSchedule(test.id, scp.classId, scp.periodId);
      const windowError = checkAttemptWindow(schedule);
      if (windowError) {
        res.status(403).json({ error: windowError });
        return;
      }
    }

    const attempt = await findOrCreateAttempt(session, req.user!.sub);
    if (attempt === 'no-variants') {
      res.status(400).json({
        error: 'This test has no variants yet. Ask your teacher to generate variants first.',
      });
      return;
    }

    const variant = await prisma.testVariant.findUniqueOrThrow({
      where: { id: attempt.variantId },
      select: { code: true },
    });

    const response: JoinSessionResponse = {
      joined: true,
      attemptId: attempt.id,
      sessionId: session.id,
      testId: test.id,
      testTitle: test.title,
      variantCode: variant.code,
      status: attempt.status,
    };
    res.status(200).json(response);
  }),
);
