/**
 * Teacher-only Vocabulary Check generation (T-038, Assumption A8): a teacher picks a
 * target student or group, and the server auto-generates a `testType: 'vocabularyCheck'`
 * `Test` (15-minute fixed timer) whose question pool is drawn from ONLY the vocabulary
 * those students have already studied (`FlashcardProgress` `learning`/`known`, never
 * `new`) — see `server/src/lib/vocabularyCheckGenerator.ts` for the pool/question-spec
 * logic this route just persists.
 *
 * The generated `Test`/`Section`/`Question`/`Choice` rows reuse the EXACT SAME engine as
 * every other test (Guiding Principle 6) — a generated Vocabulary Check plays through the
 * identical take-test runtime (T-012) and auto-grading (T-013) with zero special-casing;
 * this file's only new concept is `TestAssignment`, which scopes WHO may start an attempt
 * on it (checked by `practice.routes.ts`'s `POST /:testId/practice`, the same endpoint
 * every other self-practice attempt already goes through).
 *
 * T-076 (Phase 12) reviewed this generation flow for class-scoping and deliberately made
 * NO change here: the target student roster (`GET /students` below) is intentionally
 * every student account, not filtered to the calling teacher's own classes — a teacher
 * may generate a Vocabulary Check for any student regardless of class, same as every
 * other `TestAssignment`-gated flow. The generated `Test` is never assigned to a `Class`
 * at all (no `classes: { connect: ... }` anywhere in this file); access is controlled
 * entirely by the per-student `TestAssignment` rows created below, which is already
 * strictly narrower than class-scoping. See `studentAssignedTests.routes.ts`'s
 * `GET /vocabulary-checks` doc comment for the full "not a meaningful constraint here"
 * reasoning.
 */

import { Router } from 'express';
import type {
  GenerateVocabularyCheckRequest,
  TeacherStudentSummaryDTO,
  TeacherVocabularyCheckSummaryDTO,
} from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import {
  buildVocabularyCheckPool,
  VOCAB_CHECK_TIME_LIMIT_MINUTES,
  VocabCheckGenerationError,
} from '../lib/vocabularyCheckGenerator';
import { fetchNestedTest } from '../lib/testQueries';
import { generateVariantLayout, nextVariantCodes } from '../lib/variantShuffle';

export const teacherVocabularyCheckRouter = Router();

// T-071 follow-up (QA-found gap, same class as teacherReportsRouter's fix): this router
// shares the `/api/teacher` prefix with every other teacher router, so its blanket
// `.use()` role check runs for ANY `/api/teacher/*` request that reaches it in Express's
// registration order — leaving this at `'teacher'` only was silently 403ing admin
// requests destined for later-registered routers too (this router sits last in
// `index.ts`'s registration order, so it was 403ing everything after it, including
// `/api/teacher/students`). Widened to unblock the router chain; internal ownership
// scoping below is UNCHANGED, same "harmless empty own-data" pattern as
// `teacherReportsRouter`.
teacherVocabularyCheckRouter.use(requireAuth, requireRole('teacher', 'admin'));

/** `GET /api/teacher/students` — the target-student picker roster for generating a
 * Vocabulary Check. No prior endpoint returned a plain student list (T-030/T-050's
 * per-student views only ever return students ALREADY embedded in a bigger payload). */
teacherVocabularyCheckRouter.get(
  '/students',
  asyncHandler(async (_req, res) => {
    const students = await prisma.user.findMany({
      where: { role: 'student' },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    });
    const response: TeacherStudentSummaryDTO[] = students;
    res.status(200).json(response);
  }),
);

function toSummaryDTO(test: {
  id: string;
  title: string;
  timeLimitMinutes: number | null;
  createdAt: Date;
  sections: Array<{ questions: unknown[] }>;
  assignments: Array<{ student: { id: string; name: string } }>;
}): TeacherVocabularyCheckSummaryDTO {
  return {
    id: test.id,
    title: test.title,
    timeLimitMinutes: test.timeLimitMinutes ?? VOCAB_CHECK_TIME_LIMIT_MINUTES,
    questionCount: test.sections.reduce((sum, s) => sum + s.questions.length, 0),
    assignedStudents: test.assignments.map((a) => a.student),
    createdAt: test.createdAt.toISOString(),
  };
}

const VOCAB_CHECK_INCLUDE = {
  sections: { select: { questions: { select: { id: true } } } },
  assignments: { include: { student: { select: { id: true, name: true } } } },
} as const;

teacherVocabularyCheckRouter.get(
  '/vocabulary-checks',
  asyncHandler(async (req, res) => {
    const tests = await prisma.test.findMany({
      where: { teacherId: req.user!.sub, testType: 'vocabularyCheck' },
      orderBy: { createdAt: 'desc' },
      include: VOCAB_CHECK_INCLUDE,
    });
    res.status(200).json(tests.map(toSummaryDTO));
  }),
);

teacherVocabularyCheckRouter.post(
  '/vocabulary-checks',
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<GenerateVocabularyCheckRequest>;
    const studentIds = Array.isArray(body.studentIds)
      ? [...new Set(body.studentIds.filter((id): id is string => typeof id === 'string' && id.trim() !== ''))]
      : [];
    if (studentIds.length === 0) {
      res.status(400).json({ error: 'studentIds must be a non-empty array of student user ids.' });
      return;
    }

    const students = await prisma.user.findMany({
      where: { id: { in: studentIds }, role: 'student' },
      select: { id: true, name: true },
    });
    if (students.length !== studentIds.length) {
      res.status(400).json({ error: 'One or more studentIds do not reference an existing student account.' });
      return;
    }

    let pool;
    try {
      pool = await buildVocabularyCheckPool(studentIds);
    } catch (err) {
      if (err instanceof VocabCheckGenerationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      throw err;
    }

    const requestedTitle = typeof body.title === 'string' ? body.title.trim() : '';
    const title =
      requestedTitle ||
      `Vocabulary Check — ${new Date().toISOString().slice(0, 10)} (${students.map((s) => s.name).join(', ')})`;

    const testId = await prisma.$transaction(async (tx) => {
      const test = await tx.test.create({
        data: {
          title,
          teacherId: req.user!.sub,
          testType: 'vocabularyCheck',
          timeLimitMinutes: VOCAB_CHECK_TIME_LIMIT_MINUTES,
          // Not gated by `published` at all (see `TestAssignment`'s doc comment in
          // schema.prisma) — access is controlled entirely by the assignment rows below.
          published: false,
        },
      });

      const section = await tx.section.create({
        data: { testId: test.id, title: 'Vocabulary Check', order: 1 },
      });

      let order = 1;
      for (const question of pool.questions) {
        if (question.type === 'multipleChoice') {
          await tx.question.create({
            data: {
              sectionId: section.id,
              type: 'multipleChoice',
              prompt: question.prompt,
              order: order++,
              choices: {
                create: question.choiceTexts.map((text, index) => ({
                  text,
                  isCorrect: text === question.correctText,
                  order: index + 1,
                })),
              },
            },
          });
        } else {
          await tx.question.create({
            data: {
              sectionId: section.id,
              type: 'fillBlank',
              prompt: question.prompt,
              order: order++,
              acceptedAnswers: question.acceptedAnswers,
            },
          });
        }
      }

      await tx.testAssignment.createMany({
        data: studentIds.map((studentId) => ({ testId: test.id, studentId })),
      });

      return test.id;
    });

    // Generate variant(s) so the round-robin assignment (`findOrCreateAttempt`, reused by
    // `practice.routes.ts`) has something to assign — one variant per target student (min
    // 1), same "at least one variant before anyone can start" requirement every other
    // test needs (T-009).
    const nested = await fetchNestedTest(testId);
    const codes = nextVariantCodes(0, Math.max(1, studentIds.length));
    await prisma.$transaction(
      codes.map((code) =>
        prisma.testVariant.create({
          data: { testId, code, layout: generateVariantLayout(nested) as object },
        }),
      ),
    );

    const created = await prisma.test.findUniqueOrThrow({
      where: { id: testId },
      include: VOCAB_CHECK_INCLUDE,
    });
    res.status(201).json(toSummaryDTO(created));
  }),
);
