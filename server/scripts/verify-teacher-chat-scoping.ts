/**
 * Security verification for the teacher AI chat assistant's tool registry (feature 4 of
 * the "AI Content Tools" set) — see `src/aiTools/teacherChatTools.ts`'s doc comment for the
 * rule this script exists to prove: every tool handler must re-verify ownership of every
 * id-shaped argument against `ctx.teacherId`, with NO admin bypass, so one teacher's data
 * can never leak to another teacher even via a crafted/adversarial tool-call argument.
 *
 * UNLIKE every other `verify-*.ts` script in this folder, this one imports the server's
 * internal tool registry directly (`src/aiTools/teacherChatTools.ts`) instead of only
 * hitting HTTP endpoints — there is no way to deterministically exercise one specific tool
 * with one specific argument through the real `POST /api/teacher/chat/messages` endpoint,
 * since WHICH tool runs (and with what arguments) is the AI model's own decision, not
 * something a test script can dictate, and no real AI connection is expected to be
 * configured in a dev/CI environment anyway. Testing the registry's functions directly is
 * the only way to deterministically prove the scoping rule holds.
 *
 * Usage: `npm run verify:teacher-chat-scoping -w server`. Creates its own 2 throwaway
 * teacher accounts plus Class/Test/student fixtures under them (rather than relying on
 * `prisma/seed.ts`'s accounts, which may not exist in every environment this runs
 * against — e.g. a DB that's been used for real/demo data instead of the generic seed) —
 * no HTTP login, no JWT, these ids are only ever used directly against the tool registry.
 * Deletes everything it created again at the end, regardless of pass/fail, and never
 * touches any other existing account/class/test in the database.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

let failures = 0;
function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  [pass] ${label}`);
  } else {
    failures += 1;
    console.error(`  [FAIL] ${label}`, detail ?? '');
  }
}

function isError(value: unknown): value is { error: string } {
  return typeof value === 'object' && value !== null && 'error' in value;
}

/** Narrow, no-`any` helpers for poking at a tool handler's plain-object result without
 * typing out its full shape here (the tool registry already owns that). */
function arrayContainsId(value: unknown, arrayKey: string, id: string): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const arr = (value as Record<string, unknown>)[arrayKey];
  if (!Array.isArray(arr)) return false;
  return arr.some((item) => typeof item === 'object' && item !== null && (item as Record<string, unknown>).id === id);
}
function numberField(value: unknown, key: string): number | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const v = (value as Record<string, unknown>)[key];
  return typeof v === 'number' ? v : undefined;
}

async function main() {
  const { runTeacherChatTool } = await import('../src/aiTools/teacherChatTools');

  console.log('=== Setup: 2 throwaway teacher accounts + Class/Test/student fixtures ===');
  const stamp = Date.now();
  const teacher1 = await prisma.user.create({
    data: {
      email: `verify-chat-scoping-teacher1-${stamp}@example.com`,
      passwordHash: 'not-a-real-hash',
      role: 'teacher',
      name: 'Verify Chat Scoping Teacher 1',
    },
  });
  const teacher2 = await prisma.user.create({
    data: {
      email: `verify-chat-scoping-teacher2-${stamp}@example.com`,
      passwordHash: 'not-a-real-hash',
      role: 'teacher',
      name: 'Verify Chat Scoping Teacher 2',
    },
  });
  const class1 = await prisma.class.create({ data: { name: `Verify-Chat-Scoping C1 ${stamp}`, teacherId: teacher1.id } });
  const class2 = await prisma.class.create({ data: { name: `Verify-Chat-Scoping C2 ${stamp}`, teacherId: teacher2.id } });

  const student = await prisma.user.create({
    data: {
      email: `verify-chat-scoping-student-${stamp}@example.com`,
      passwordHash: 'not-a-real-hash',
      role: 'student',
      name: 'Verify Chat Scoping Student',
      classId: class1.id,
    },
  });

  // Test 1 (teacher1) is deliberately malformed — a multipleChoice question with NO
  // correct choice marked, and a fillBlank question with no accepted answers — so
  // `check_test_issues` has something real to find.
  const test1 = await prisma.test.create({
    data: {
      title: `Verify-Chat-Scoping T1 ${stamp}`,
      teacherId: teacher1.id,
      sections: {
        create: [
          {
            title: 'Section 1',
            order: 1,
            questions: {
              create: [
                {
                  type: 'multipleChoice',
                  prompt: 'Broken MC question',
                  order: 1,
                  acceptedAnswers: [],
                  choices: { create: [{ text: 'A', isCorrect: false, order: 1 }, { text: 'B', isCorrect: false, order: 2 }] },
                },
                { type: 'fillBlank', prompt: 'Broken fillBlank question', order: 2, acceptedAnswers: [] },
              ],
            },
          },
        ],
      },
    },
  });

  const test2 = await prisma.test.create({ data: { title: `Verify-Chat-Scoping T2 ${stamp}`, teacherId: teacher2.id } });

  try {
    console.log('\n=== list_classes / list_tests: only the calling teacher\'s own rows ===');
    const t1Classes = (await runTeacherChatTool('list_classes', {}, { teacherId: teacher1.id })) as { classes: Array<{ id: string }> };
    check('teacher1 sees their own class', t1Classes.classes.some((c) => c.id === class1.id), t1Classes);
    check("teacher1 never sees teacher2's class", !t1Classes.classes.some((c) => c.id === class2.id), t1Classes);

    const t1Tests = (await runTeacherChatTool('list_tests', {}, { teacherId: teacher1.id })) as { tests: Array<{ id: string }> };
    check('teacher1 sees their own test', t1Tests.tests.some((t) => t.id === test1.id), t1Tests);
    check("teacher1 never sees teacher2's test", !t1Tests.tests.some((t) => t.id === test2.id), t1Tests);

    console.log('\n=== get_class_roster: cross-teacher classId is blocked, not partially leaked ===');
    const ownRoster = await runTeacherChatTool('get_class_roster', { classId: class1.id }, { teacherId: teacher1.id });
    check('teacher1 can read their own roster', !isError(ownRoster) && arrayContainsId(ownRoster, 'students', student.id), ownRoster);

    const crossRoster = await runTeacherChatTool('get_class_roster', { classId: class2.id }, { teacherId: teacher1.id });
    check("teacher1 is blocked from teacher2's class roster", isError(crossRoster), crossRoster);
    check("blocked response never contains teacher2's class name", !JSON.stringify(crossRoster).includes(class2.name), crossRoster);

    const reverseCrossRoster = await runTeacherChatTool('get_class_roster', { classId: class1.id }, { teacherId: teacher2.id });
    check("(reverse) teacher2 is blocked from teacher1's class roster", isError(reverseCrossRoster), reverseCrossRoster);

    console.log('\n=== check_test_issues: finds the planted issues, blocked for a foreign testId ===');
    const ownIssues = await runTeacherChatTool('check_test_issues', { testId: test1.id }, { teacherId: teacher1.id });
    check(
      'check_test_issues finds both planted issues on the owned test',
      !isError(ownIssues) && (numberField(ownIssues, 'issueCount') ?? 0) >= 2,
      ownIssues,
    );

    const crossIssues = await runTeacherChatTool('check_test_issues', { testId: test2.id }, { teacherId: teacher1.id });
    check("teacher1 is blocked from checking teacher2's test", isError(crossIssues), crossIssues);

    console.log('\n=== list_students_missing_submission: both ids re-verified independently ===');
    const ownMissing = await runTeacherChatTool(
      'list_students_missing_submission',
      { testId: test1.id, classId: class1.id },
      { teacherId: teacher1.id },
    );
    check(
      'the never-attempted student shows up as missing',
      !isError(ownMissing) && arrayContainsId(ownMissing, 'missingStudents', student.id),
      ownMissing,
    );

    const foreignTestOwnClass = await runTeacherChatTool(
      'list_students_missing_submission',
      { testId: test2.id, classId: class1.id },
      { teacherId: teacher1.id },
    );
    check('blocked when testId belongs to another teacher (even with an owned classId)', isError(foreignTestOwnClass), foreignTestOwnClass);

    const ownTestForeignClass = await runTeacherChatTool(
      'list_students_missing_submission',
      { testId: test1.id, classId: class2.id },
      { teacherId: teacher1.id },
    );
    check('blocked when classId belongs to another teacher (even with an owned testId)', isError(ownTestForeignClass), ownTestForeignClass);

    console.log('\n=== get_score_summary / get_progress_summary: cross-teacher ids blocked ===');
    const ownScoreSummary = await runTeacherChatTool('get_score_summary', { testId: test1.id }, { teacherId: teacher1.id });
    check('teacher1 can read their own score summary (0 attempts)', !isError(ownScoreSummary) && numberField(ownScoreSummary, 'attemptCount') === 0, ownScoreSummary);

    const crossScoreSummary = await runTeacherChatTool('get_score_summary', { testId: test2.id }, { teacherId: teacher1.id });
    check("teacher1 is blocked from teacher2's score summary", isError(crossScoreSummary), crossScoreSummary);

    const ownProgress = await runTeacherChatTool('get_progress_summary', { classId: class1.id }, { teacherId: teacher1.id });
    check('teacher1 can read their own class progress', !isError(ownProgress) && arrayContainsId(ownProgress, 'students', student.id), ownProgress);

    const crossProgress = await runTeacherChatTool('get_progress_summary', { classId: class2.id }, { teacherId: teacher1.id });
    check("teacher1 is blocked from teacher2's class progress", isError(crossProgress), crossProgress);

    console.log('\n=== list_schedule: cross-teacher classId blocked ===');
    const ownSchedule = await runTeacherChatTool('list_schedule', { classId: class1.id }, { teacherId: teacher1.id });
    check('teacher1 can list their own schedule (no throw)', !isError(ownSchedule), ownSchedule);
    const crossSchedule = await runTeacherChatTool('list_schedule', { classId: class2.id }, { teacherId: teacher1.id });
    check("teacher1 is blocked from teacher2's schedule", isError(crossSchedule), crossSchedule);

    console.log('\n=== Unknown tool name is rejected, not dispatched blindly ===');
    const unknown = await runTeacherChatTool('drop_all_data', {}, { teacherId: teacher1.id });
    check('an unregistered tool name returns an error instead of running anything', isError(unknown), unknown);
  } finally {
    console.log('\n=== Teardown ===');
    await prisma.test.delete({ where: { id: test1.id } }).catch(() => undefined);
    await prisma.test.delete({ where: { id: test2.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: student.id } }).catch(() => undefined);
    await prisma.class.delete({ where: { id: class1.id } }).catch(() => undefined);
    await prisma.class.delete({ where: { id: class2.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: teacher1.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: teacher2.id } }).catch(() => undefined);
  }

  console.log(`\n=== Result: ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} ===`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error('[verify-teacher-chat-scoping] Failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Importing `teacherChatTools.ts` transitively opens a SECOND `PrismaClient`
    // connection (the app's own `src/lib/prisma.ts` singleton) distinct from this
    // script's own `prisma` above — disconnect both, or the open connection keeps the
    // Node process (and this script) alive indefinitely after the last check runs.
    const { prisma: appPrisma } = await import('../src/lib/prisma');
    await Promise.all([prisma.$disconnect(), appPrisma.$disconnect()]);
    process.exit(process.exitCode ?? 0);
  });
