/**
 * Tool registry for the teacher AI chat assistant (feature 4 of the "AI Content Tools"
 * set) — the ONLY place the assistant is allowed to read data from. See
 * `teacherChatEngine.ts` for the loop that calls these.
 *
 * ============================== SECURITY — READ THIS FIRST ==============================
 * The system prompt (admin-editable) and every tool-call ARGUMENT (model-generated) are
 * BOTH untrusted input — neither can be allowed to decide whose data gets read. The ONLY
 * trust boundary is this file: `ctx.teacherId` is always the CALLING teacher's own id
 * (`req.user!.sub`, set once by `teacherChat.routes.ts` and never overridable by a tool
 * argument of the same name), and every handler below re-derives/re-verifies ownership of
 * EVERY id-shaped argument it receives — not just at the top of a list, but at every hop
 * (e.g. `check_test_issues(testId)` verifies `test.teacherId` itself; it does not assume
 * `testId` was already safe because `list_tests` happened to only return owned tests
 * earlier in the same conversation). A crafted tool-call argument, or an instruction
 * smuggled into tool-result content that later gets fed back into context (e.g. inside a
 * student's free-text submission), can only ever select WHICH registered function runs —
 * it can never change what that function is allowed to read, because the function itself
 * hard-codes the scoping.
 *
 * Unlike every other ownership helper in this codebase (`requireOwnedTest`,
 * `requireOwnedFlashcardSet`, `requireOwnedGrammarTopic` — see `lib/authz.ts`'s
 * `isAdminOrOwner`), there is DELIBERATELY NO ADMIN BYPASS here. If an admin account opens
 * the teacher chat assistant, it should see its OWN data (almost certainly none, since
 * admin owns no classes) — never another teacher's, "because admin can see everything
 * everywhere else." Do not "fix" this to be consistent with the rest of the app.
 *
 * Every handler returns an explicit, allow-listed plain object — never a raw Prisma row —
 * so a future column added to `User`/`Class`/etc. can never silently leak into a chat
 * response just because a handler's `include` was written loosely.
 */

import { prisma } from '../lib/prisma';

export interface TeacherChatToolContext {
  /** Always `req.user!.sub` of the teacher who owns this conversation — NEVER a
   * model-supplied value. */
  teacherId: string;
}

export interface TeacherChatTool {
  name: string;
  description: string;
  /** JSON Schema object (OpenAI function-calling `parameters` shape). */
  parameters: Record<string, unknown>;
  handler: (ctx: TeacherChatToolContext, args: Record<string, unknown>) => Promise<unknown>;
}

// --- Per-entity ownership verification (the one reachable path for each entity type) ----

async function verifyOwnedClass(classId: unknown, teacherId: string) {
  if (typeof classId !== 'string' || !classId) return { error: 'classId is required.' };
  const cls = await prisma.class.findUnique({ where: { id: classId } });
  if (!cls || cls.teacherId !== teacherId) return { error: 'No class with that id belongs to you.' };
  return { class: cls };
}

async function verifyOwnedTest(testId: unknown, teacherId: string) {
  if (typeof testId !== 'string' || !testId) return { error: 'testId is required.' };
  const test = await prisma.test.findUnique({ where: { id: testId } });
  if (!test || test.teacherId !== teacherId) return { error: 'No test with that id belongs to you.' };
  return { test };
}

// --- Tool: list_classes ----------------------------------------------------------------

async function listClasses(ctx: TeacherChatToolContext) {
  const classes = await prisma.class.findMany({
    where: { teacherId: ctx.teacherId },
    include: {
      currentPeriod: { select: { id: true, name: true } },
      _count: { select: { students: true } },
    },
    orderBy: { name: 'asc' },
  });
  return {
    classes: classes.map((c) => ({
      id: c.id,
      name: c.name,
      studentCount: c._count.students,
      currentPeriod: c.currentPeriod ? { id: c.currentPeriod.id, name: c.currentPeriod.name } : null,
    })),
  };
}

// --- Tool: get_class_roster -------------------------------------------------------------

async function getClassRoster(ctx: TeacherChatToolContext, args: Record<string, unknown>) {
  const verified = await verifyOwnedClass(args.classId, ctx.teacherId);
  if ('error' in verified) return verified;

  const students = await prisma.user.findMany({
    where: { classId: verified.class.id, role: 'student' },
    select: { id: true, name: true, isGuest: true },
    orderBy: { name: 'asc' },
  });
  return {
    classId: verified.class.id,
    className: verified.class.name,
    students: students.filter((s) => !s.isGuest).map((s) => ({ id: s.id, name: s.name })),
  };
}

// --- Tool: list_tests --------------------------------------------------------------------

async function listTests(ctx: TeacherChatToolContext, args: Record<string, unknown>) {
  const search = typeof args.search === 'string' && args.search.trim() ? args.search.trim() : undefined;
  const tests = await prisma.test.findMany({
    where: {
      teacherId: ctx.teacherId,
      ...(search ? { title: { contains: search, mode: 'insensitive' } } : {}),
    },
    include: { sections: { include: { _count: { select: { questions: true } } } } },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  });
  return {
    tests: tests.map((test) => ({
      id: test.id,
      title: test.title,
      testType: test.testType,
      published: test.published,
      sectionCount: test.sections.length,
      questionCount: test.sections.reduce((sum, s) => sum + s._count.questions, 0),
    })),
  };
}

// --- Tool: check_test_issues ------------------------------------------------------------

interface TestIssue {
  sectionTitle: string;
  questionIndex: number | null;
  message: string;
}

async function checkTestIssues(ctx: TeacherChatToolContext, args: Record<string, unknown>) {
  const verified = await verifyOwnedTest(args.testId, ctx.teacherId);
  if ('error' in verified) return verified;

  const test = await prisma.test.findUniqueOrThrow({
    where: { id: verified.test.id },
    include: { sections: { include: { questions: { include: { choices: true } } }, orderBy: { order: 'asc' } } },
  });

  const issues: TestIssue[] = [];
  if (test.sections.length === 0) {
    issues.push({ sectionTitle: '(không có)', questionIndex: null, message: 'Đề chưa có phần/nhóm câu hỏi nào.' });
  }

  for (const section of test.sections) {
    if (section.questions.length === 0) {
      issues.push({ sectionTitle: section.title, questionIndex: null, message: 'Phần này chưa có câu hỏi nào.' });
      continue;
    }
    section.questions.forEach((q, index) => {
      if (q.type === 'multipleChoice' || q.type === 'trueFalse' || q.type === 'matching') {
        const correctCount = q.choices.filter((c) => c.isCorrect).length;
        if (q.choices.length < 2) {
          issues.push({ sectionTitle: section.title, questionIndex: index, message: 'Câu hỏi có ít hơn 2 lựa chọn.' });
        } else if (correctCount === 0) {
          issues.push({ sectionTitle: section.title, questionIndex: index, message: 'Chưa đánh dấu đáp án đúng.' });
        } else if (correctCount > 1) {
          issues.push({ sectionTitle: section.title, questionIndex: index, message: 'Có nhiều hơn 1 đáp án được đánh dấu đúng.' });
        }
      } else if (q.type === 'fillBlank' && q.acceptedAnswers.length === 0) {
        issues.push({ sectionTitle: section.title, questionIndex: index, message: 'Câu điền từ chưa có đáp án chấp nhận nào.' });
      }
    });
  }

  return { testId: test.id, title: test.title, issueCount: issues.length, issues };
}

// --- Tool: list_students_missing_submission ---------------------------------------------

async function listStudentsMissingSubmission(ctx: TeacherChatToolContext, args: Record<string, unknown>) {
  const verifiedTest = await verifyOwnedTest(args.testId, ctx.teacherId);
  if ('error' in verifiedTest) return verifiedTest;
  const verifiedClass = await verifyOwnedClass(args.classId, ctx.teacherId);
  if ('error' in verifiedClass) return verifiedClass;

  const roster = await prisma.user.findMany({
    where: { classId: verifiedClass.class.id, role: 'student', isGuest: false },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  const submitted = await prisma.attempt.findMany({
    where: {
      testId: verifiedTest.test.id,
      status: 'submitted',
      studentId: { in: roster.map((s) => s.id) },
    },
    select: { studentId: true },
  });
  const submittedIds = new Set(submitted.map((a) => a.studentId));

  const missing = roster.filter((s) => !submittedIds.has(s.id));
  return {
    testId: verifiedTest.test.id,
    classId: verifiedClass.class.id,
    totalStudents: roster.length,
    submittedCount: roster.length - missing.length,
    missingStudents: missing.map((s) => ({ id: s.id, name: s.name })),
  };
}

// --- Tool: get_score_summary -------------------------------------------------------------

const LOW_SCORE_THRESHOLD_PERCENT = 50;

async function getScoreSummary(ctx: TeacherChatToolContext, args: Record<string, unknown>) {
  const verifiedTest = await verifyOwnedTest(args.testId, ctx.teacherId);
  if ('error' in verifiedTest) return verifiedTest;

  let classId: string | null = null;
  if (args.classId !== undefined) {
    const verifiedClass = await verifyOwnedClass(args.classId, ctx.teacherId);
    if ('error' in verifiedClass) return verifiedClass;
    classId = verifiedClass.class.id;
  }

  const attempts = await prisma.attempt.findMany({
    where: {
      testId: verifiedTest.test.id,
      status: 'submitted',
      scorePercent: { not: null },
      student: { isGuest: false, ...(classId ? { classId } : {}) },
    },
    select: { scorePercent: true, student: { select: { id: true, name: true } } },
  });

  if (attempts.length === 0) {
    return { testId: verifiedTest.test.id, classId, attemptCount: 0 };
  }

  const scores = attempts.map((a) => a.scorePercent!);
  const average = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  const lowPerformers = attempts
    .filter((a) => a.scorePercent! < LOW_SCORE_THRESHOLD_PERCENT)
    .map((a) => ({ id: a.student.id, name: a.student.name, scorePercent: a.scorePercent }))
    .sort((a, b) => (a.scorePercent ?? 0) - (b.scorePercent ?? 0))
    .slice(0, 20);

  return {
    testId: verifiedTest.test.id,
    classId,
    attemptCount: attempts.length,
    averageScorePercent: Math.round(average * 10) / 10,
    minScorePercent: Math.min(...scores),
    maxScorePercent: Math.max(...scores),
    lowPerformers,
  };
}

// --- Tool: get_progress_summary ----------------------------------------------------------

async function getProgressSummary(ctx: TeacherChatToolContext, args: Record<string, unknown>) {
  const verifiedClass = await verifyOwnedClass(args.classId, ctx.teacherId);
  if ('error' in verifiedClass) return verifiedClass;

  let studentIds: string[] | undefined;
  if (args.studentId !== undefined) {
    if (typeof args.studentId !== 'string') return { error: 'studentId must be a string.' };
    const student = await prisma.user.findUnique({ where: { id: args.studentId } });
    if (!student || student.classId !== verifiedClass.class.id) {
      return { error: 'No student with that id belongs to this class.' };
    }
    studentIds = [student.id];
  } else {
    const roster = await prisma.user.findMany({
      where: { classId: verifiedClass.class.id, role: 'student', isGuest: false },
      select: { id: true },
    });
    studentIds = roster.map((s) => s.id);
  }

  const students = await prisma.user.findMany({
    where: { id: { in: studentIds } },
    select: { id: true, name: true },
  });

  const [flashcardAttempts, grammarAttempts] = await Promise.all([
    prisma.flashcardExerciseAttempt.findMany({
      where: { studentId: { in: studentIds } },
      select: { studentId: true, correct: true },
    }),
    prisma.grammarExerciseAttempt.findMany({
      where: { studentId: { in: studentIds } },
      select: { studentId: true, isCorrect: true },
    }),
  ]);

  function summarize(rows: { studentId: string }[], correctRows: { studentId: string }[], studentId: string) {
    const mine = rows.filter((r) => r.studentId === studentId);
    const correct = correctRows.filter((r) => r.studentId === studentId).length;
    return {
      attemptCount: mine.length,
      correctRatePercent: mine.length > 0 ? Math.round((correct / mine.length) * 1000) / 10 : null,
    };
  }

  const correctFlashcardAttempts = flashcardAttempts.filter((r) => r.correct);
  const correctGrammarAttempts = grammarAttempts.filter((r) => r.isCorrect);

  return {
    classId: verifiedClass.class.id,
    students: students.map((s) => ({
      id: s.id,
      name: s.name,
      flashcards: summarize(flashcardAttempts, correctFlashcardAttempts, s.id),
      grammar: summarize(grammarAttempts, correctGrammarAttempts, s.id),
    })),
  };
}

// --- Tool: list_schedule -----------------------------------------------------------------

async function listSchedule(ctx: TeacherChatToolContext, args: Record<string, unknown>) {
  let classId: string | null = null;
  if (args.classId !== undefined) {
    const verifiedClass = await verifyOwnedClass(args.classId, ctx.teacherId);
    if ('error' in verifiedClass) return verifiedClass;
    classId = verifiedClass.class.id;
  }

  const schedules = await prisma.testClassSchedule.findMany({
    where: {
      class: { teacherId: ctx.teacherId },
      test: { teacherId: ctx.teacherId },
      ...(classId ? { classId } : {}),
    },
    include: { test: { select: { id: true, title: true } }, class: { select: { id: true, name: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 30,
  });

  const announcements = await prisma.classAnnouncement.findMany({
    where: { class: { teacherId: ctx.teacherId }, ...(classId ? { classId } : {}) },
    select: { id: true, classId: true, body: true, pinned: true, createdAt: true },
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    take: 20,
  });

  return {
    schedules: schedules.map((s) => ({
      testId: s.test.id,
      testTitle: s.test.title,
      classId: s.class.id,
      className: s.class.name,
      openAt: s.openAt ? s.openAt.toISOString() : null,
      closeAt: s.closeAt ? s.closeAt.toISOString() : null,
    })),
    announcements: announcements.map((a) => ({
      id: a.id,
      classId: a.classId,
      body: a.body,
      pinned: a.pinned,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

// --- Registry -----------------------------------------------------------------------

export const TEACHER_CHAT_TOOLS: TeacherChatTool[] = [
  {
    name: 'list_classes',
    description: "List the calling teacher's own classes, with student count and current academic period.",
    parameters: { type: 'object', properties: {} },
    handler: (ctx) => listClasses(ctx),
  },
  {
    name: 'get_class_roster',
    description: "List the students in one of the calling teacher's own classes.",
    parameters: {
      type: 'object',
      properties: { classId: { type: 'string', description: 'A class id owned by the calling teacher.' } },
      required: ['classId'],
    },
    handler: getClassRoster,
  },
  {
    name: 'list_tests',
    description: "List the calling teacher's own tests, optionally filtered by a title search string.",
    parameters: {
      type: 'object',
      properties: { search: { type: 'string', description: 'Optional case-insensitive substring to filter test titles by.' } },
    },
    handler: listTests,
  },
  {
    name: 'check_test_issues',
    description:
      'Run a deterministic structural check on one of the calling teacher\'s own tests (missing correct answer, too few choices, empty fillBlank answers, empty sections) and return the list of issues found.',
    parameters: {
      type: 'object',
      properties: { testId: { type: 'string', description: 'A test id owned by the calling teacher.' } },
      required: ['testId'],
    },
    handler: checkTestIssues,
  },
  {
    name: 'list_students_missing_submission',
    description: "List students in one of the calling teacher's own classes who have NOT submitted an attempt for one of the calling teacher's own tests.",
    parameters: {
      type: 'object',
      properties: {
        testId: { type: 'string', description: 'A test id owned by the calling teacher.' },
        classId: { type: 'string', description: 'A class id owned by the calling teacher.' },
      },
      required: ['testId', 'classId'],
    },
    handler: listStudentsMissingSubmission,
  },
  {
    name: 'get_score_summary',
    description: "Average/min/max score and the lowest-scoring students for one of the calling teacher's own tests, optionally narrowed to one of their own classes.",
    parameters: {
      type: 'object',
      properties: {
        testId: { type: 'string', description: 'A test id owned by the calling teacher.' },
        classId: { type: 'string', description: 'Optional class id owned by the calling teacher, to narrow the summary to just that class.' },
      },
      required: ['testId'],
    },
    handler: getScoreSummary,
  },
  {
    name: 'get_progress_summary',
    description: "Flashcard/Grammar practice completion and correctness rate for students in one of the calling teacher's own classes, optionally narrowed to one student.",
    parameters: {
      type: 'object',
      properties: {
        classId: { type: 'string', description: 'A class id owned by the calling teacher.' },
        studentId: { type: 'string', description: 'Optional student id, must belong to that class.' },
      },
      required: ['classId'],
    },
    handler: getProgressSummary,
  },
  {
    name: 'list_schedule',
    description: "List upcoming/active test open-close schedules and recent class announcements for the calling teacher's own classes, optionally narrowed to one class.",
    parameters: {
      type: 'object',
      properties: { classId: { type: 'string', description: 'Optional class id owned by the calling teacher.' } },
    },
    handler: listSchedule,
  },
];

export async function runTeacherChatTool(name: string, args: Record<string, unknown>, ctx: TeacherChatToolContext): Promise<unknown> {
  const tool = TEACHER_CHAT_TOOLS.find((t) => t.name === name);
  if (!tool) {
    return { error: `Unknown tool "${name}".` };
  }
  try {
    return await tool.handler(ctx, args);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Tool execution failed.' };
  }
}
