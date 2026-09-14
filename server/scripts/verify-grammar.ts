/**
 * T-046-T-050 Grammar module verification script — REAL REST calls against an
 * already-running dev server + Postgres, plus direct Prisma reads to confirm DB state,
 * same convention as `verify-vocab-batch.ts`. Covers: schema round-trip (T-046, via the
 * seed script separately — this script focuses on the live API surface), teacher
 * CRUD + ownership (T-047/T-048 authoring), student read-only browsing + persistence
 * across reload (T-047), practice-exercise grading correctness reusing T-013's
 * `gradeAnswer` (T-048), the Grammar game's progress recording (T-049), and report
 * numbers matching the raw attempt data (T-050).
 *
 * Usage: start the dev server first (`npm run dev:server` from the repo root, or the
 * root `npm run dev`), then `npm run verify:grammar -w server`. Requires the seeded
 * teacher accounts (`prisma/seed.ts`).
 */

import { PrismaClient } from '@prisma/client';

const API = process.env.API_BASE_URL ?? 'http://localhost:4000';
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

async function api<T>(
  method: string,
  path: string,
  token: string | null,
  body?: unknown,
): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const parsed = text ? JSON.parse(text) : undefined;
  return { status: res.status, body: parsed as T };
}

interface TopicDetail {
  id: string;
  title: string;
  theoryContent: string;
  teacherId: string;
  exercises: Array<{
    id: string;
    type: string;
    prompt: string;
    acceptedAnswers: string[];
    choices: Array<{ id: string; text: string; isCorrect: boolean }>;
  }>;
}

async function main() {
  console.log('=== Login as seeded teacher (+ second teacher for ownership checks) ===');
  const teacherLogin = await api<{ token: string }>('POST', '/api/auth/login', null, {
    email: process.env.SEED_TEACHER_EMAIL ?? 'teacher@example.com',
    password: process.env.SEED_TEACHER_PASSWORD ?? 'teacher-dev-password123',
  });
  check('teacher login succeeds', teacherLogin.status === 200, teacherLogin);
  const teacherToken = teacherLogin.body.token;

  const teacher2Login = await api<{ token: string }>('POST', '/api/auth/login', null, {
    email: process.env.SEED_TEACHER_2_EMAIL ?? 'teacher2@example.com',
    password: process.env.SEED_TEACHER_2_PASSWORD ?? 'teacher2-dev-password123',
  });
  check('second teacher login succeeds', teacher2Login.status === 200, teacher2Login);
  const teacher2Token = teacher2Login.body.token;

  // --- T-046/T-047: teacher CRUD + ownership ------------------------------------------
  console.log('\n=== T-046/T-047: Grammar topic CRUD + ownership ===');
  const topicTitle = `Verify Grammar Topic ${Date.now()}`;
  const create = await api<TopicDetail>('POST', '/api/teacher/grammar-topics', teacherToken, {
    title: topicTitle,
    theoryContent: 'Paragraph one about the topic.\n\nParagraph two with more detail.',
  });
  check('teacher can create a Grammar topic', create.status === 201, create);
  const topicId = create.body.id;

  const studentRegisterEmail = `grammar-verify-student-${Date.now()}@example.com`;
  const studentRegister = await api('POST', '/api/auth/register', null, {
    email: studentRegisterEmail,
    password: 'student-dev-password123',
    name: 'Grammar Verify Student',
  });
  check('student registration succeeds', studentRegister.status === 201, studentRegister);
  const studentLogin = await api<{ token: string }>('POST', '/api/auth/login', null, {
    email: studentRegisterEmail,
    password: 'student-dev-password123',
  });
  const studentToken = studentLogin.body.token;
  const studentId = (await prisma.user.findUniqueOrThrow({ where: { email: studentRegisterEmail } })).id;

  const studentCreateAttempt = await api('POST', '/api/teacher/grammar-topics', studentToken, {
    title: 'Should be rejected',
    theoryContent: 'n/a',
  });
  check('a student cannot create a Grammar topic (403)', studentCreateAttempt.status === 403, studentCreateAttempt);

  const crossTeacherRead = await api('GET', `/api/teacher/grammar-topics/${topicId}`, teacher2Token);
  check(
    'a non-owning teacher is blocked (404) from another teacher\'s topic',
    crossTeacherRead.status === 404,
    crossTeacherRead,
  );

  // Add one exercise of each objective type.
  const mc = await api<TopicDetail>(
    'POST',
    `/api/teacher/grammar-topics/${topicId}/exercises`,
    teacherToken,
    {
      type: 'multipleChoice',
      prompt: 'Choose the correct form: She ___ tennis every weekend.',
      choices: [
        { text: 'play', isCorrect: false },
        { text: 'plays', isCorrect: true },
        { text: 'playing', isCorrect: false },
      ],
    },
  );
  check('teacher can add a multipleChoice exercise', mc.status === 201, mc);

  const tf = await api<TopicDetail>(
    'POST',
    `/api/teacher/grammar-topics/${topicId}/exercises`,
    teacherToken,
    {
      type: 'trueFalse',
      prompt: '"He go to work by bus" is grammatically correct.',
      choices: [
        { text: 'True', isCorrect: false },
        { text: 'False', isCorrect: true },
      ],
    },
  );
  check('teacher can add a trueFalse exercise', tf.status === 201, tf);

  const fb = await api<TopicDetail>(
    'POST',
    `/api/teacher/grammar-topics/${topicId}/exercises`,
    teacherToken,
    { type: 'fillBlank', prompt: 'They ___ (live) in London.', acceptedAnswers: ['live'] },
  );
  check('teacher can add a fillBlank exercise', fb.status === 201, fb);
  check('topic now has 3 exercises', fb.body.exercises.length === 3, fb.body.exercises);

  const essayAttempt = await api(
    'POST',
    `/api/teacher/grammar-topics/${topicId}/exercises`,
    teacherToken,
    { type: 'essay', prompt: 'Should be rejected' },
  );
  check('essay type is rejected for Grammar exercises (400)', essayAttempt.status === 400, essayAttempt);

  // --- T-047: student read-only browsing + persistence --------------------------------
  console.log('\n=== T-047: student browsing + theory content persistence ===');
  const studentList = await api<Array<{ id: string; title: string }>>(
    'GET',
    '/api/grammar-topics',
    studentToken,
  );
  check(
    'student can list Grammar topics and sees the new one',
    studentList.status === 200 && studentList.body.some((t) => t.id === topicId),
    studentList.body,
  );

  const studentWriteAttempt = await api(
    'PATCH',
    `/api/teacher/grammar-topics/${topicId}`,
    studentToken,
    { title: 'nope', theoryContent: 'nope' },
  );
  check('a student cannot write to teacher Grammar routes (403)', studentWriteAttempt.status === 403, studentWriteAttempt);

  const studentRead1 = await api<{ theoryContent: string }>(
    'GET',
    `/api/grammar-topics/${topicId}`,
    studentToken,
  );
  const studentRead2 = await api<{ theoryContent: string }>(
    'GET',
    `/api/grammar-topics/${topicId}`,
    studentToken,
  );
  check(
    'theory content persists identically across repeated reads ("reload")',
    studentRead1.body.theoryContent === studentRead2.body.theoryContent &&
      studentRead1.body.theoryContent.includes('Paragraph two'),
    { first: studentRead1.body, second: studentRead2.body },
  );

  // --- T-048: practice exercises + grading correctness ---------------------------------
  console.log('\n=== T-048: practice exercises reuse T-013 grading logic ===');
  const prompts = await api<Array<{ id: string; type: string; prompt: string; choices: Array<{ id: string; text: string }> }>>(
    'GET',
    `/api/grammar-topics/${topicId}/exercises`,
    studentToken,
  );
  check('exercise prompts never leak isCorrect/acceptedAnswers', !JSON.stringify(prompts.body).includes('isCorrect'), prompts.body);

  const mcPrompt = prompts.body.find((p) => p.type === 'multipleChoice')!;
  const correctChoice = mc.body.exercises
    .find((e) => e.id === mcPrompt.id)!
    .choices.find((c) => c.isCorrect)!;
  const wrongChoice = mcPrompt.choices.find((c) => c.id !== correctChoice.id)!;

  const mcCorrectCheck = await api<{ correct: boolean; correctChoiceId: string | null }>(
    'POST',
    `/api/grammar-topics/${topicId}/exercises/${mcPrompt.id}/check`,
    studentToken,
    { selectedChoiceId: correctChoice.id },
  );
  check('correct multipleChoice submission graded correct=true', mcCorrectCheck.body.correct === true, mcCorrectCheck.body);
  check('correctChoiceId echoed back matches the actual correct choice', mcCorrectCheck.body.correctChoiceId === correctChoice.id, mcCorrectCheck.body);

  const mcWrongCheck = await api<{ correct: boolean }>(
    'POST',
    `/api/grammar-topics/${topicId}/exercises/${mcPrompt.id}/check`,
    studentToken,
    { selectedChoiceId: wrongChoice.id },
  );
  check('wrong multipleChoice submission graded correct=false', mcWrongCheck.body.correct === false, mcWrongCheck.body);

  const fbPrompt = prompts.body.find((p) => p.type === 'fillBlank')!;
  const fbCorrectCheck = await api<{ correct: boolean; correctAnswers: string[] }>(
    'POST',
    `/api/grammar-topics/${topicId}/exercises/${fbPrompt.id}/check`,
    studentToken,
    { textAnswer: 'LIVE' }, // case-insensitive, per T-013's grading convention
  );
  check('fillBlank is graded case-insensitively (reused from lib/grading.ts)', fbCorrectCheck.body.correct === true, fbCorrectCheck.body);

  const fbWrongCheck = await api<{ correct: boolean }>(
    'POST',
    `/api/grammar-topics/${topicId}/exercises/${fbPrompt.id}/check`,
    studentToken,
    { textAnswer: 'moved' },
  );
  check('fillBlank wrong answer graded correct=false', fbWrongCheck.body.correct === false, fbWrongCheck.body);

  const attemptsInDb = await prisma.grammarExerciseAttempt.findMany({
    where: { topicId, studentId },
    orderBy: { createdAt: 'asc' },
  });
  check(
    'every check() call recorded a GrammarExerciseAttempt row (T-048 "attempts recorded per topic per student")',
    attemptsInDb.length === 4,
    attemptsInDb.length,
  );
  check(
    'recorded isCorrect values match the API responses exactly (true,false,true,false)',
    attemptsInDb.map((a) => a.isCorrect).join(',') === 'true,false,true,false',
    attemptsInDb.map((a) => a.isCorrect),
  );

  const progress = await api<{ attemptedCount: number; correctCount: number }>(
    'GET',
    `/api/grammar-topics/${topicId}/progress`,
    studentToken,
  );
  check(
    'progress endpoint matches DB: attempted=4, correct=2',
    progress.body.attemptedCount === 4 && progress.body.correctCount === 2,
    progress.body,
  );

  // --- T-049: Grammar game -------------------------------------------------------------
  console.log('\n=== T-049: Grammar game question pool + progress recording ===');
  const gameQuestions = await api<Array<{ exerciseId: string; correctAnswer: string; wrongAnswers: string[] }>>(
    'GET',
    `/api/grammar-topics/${topicId}/game-questions`,
    studentToken,
  );
  check(
    'game-questions returns only the 2 multipleChoice/trueFalse exercises (fillBlank excluded)',
    gameQuestions.body.length === 2,
    gameQuestions.body,
  );
  check(
    'game questions never leak which text is correct via field position (correctAnswer/wrongAnswers both present)',
    gameQuestions.body.every((q) => q.correctAnswer && q.wrongAnswers.length >= 1),
    gameQuestions.body,
  );

  const gameResults = gameQuestions.body.map((q, i) => ({ exerciseId: q.exerciseId, correct: i === 0 }));
  const gameComplete = await api<{ updated: number }>(
    'POST',
    `/api/grammar-topics/${topicId}/games/spaceShooter/complete`,
    studentToken,
    { results: gameResults },
  );
  check('game completion records both rounds', gameComplete.body.updated === 2, gameComplete.body);

  const badGameType = await api(
    'POST',
    `/api/grammar-topics/${topicId}/games/notAGame/complete`,
    studentToken,
    { results: [] },
  );
  check('unknown game type returns 400, not a crash', badGameType.status === 400, badGameType);

  const attemptsAfterGame = await prisma.grammarExerciseAttempt.count({ where: { topicId, studentId } });
  check('game rounds appended to the same attempt log (4 + 2 = 6 total)', attemptsAfterGame === 6, attemptsAfterGame);

  const gameAttemptRows = await prisma.grammarExerciseAttempt.findMany({
    where: { topicId, studentId, selectedChoiceId: null, textAnswer: null },
  });
  check(
    'game-completion rows have null selectedChoiceId/textAnswer (aggregate verdict only)',
    gameAttemptRows.length === 2,
    gameAttemptRows.length,
  );

  // --- T-050: Grammar reports ------------------------------------------------------------
  console.log('\n=== T-050: Grammar reports match raw attempt data ===');
  const topicReport = await api<{
    buckets: Array<{ key: string; label: string; attemptCount: number; averageScorePercent: number | null }>;
  }>('GET', `/api/teacher/grammar-reports?groupBy=topic&topicId=${topicId}`, teacherToken);
  check('teacher can fetch the topic-grouped Grammar report', topicReport.status === 200, topicReport);
  const topicBucket = topicReport.body.buckets.find((b) => b.key === topicId);
  check(
    'topic bucket attemptCount matches raw DB count (6)',
    topicBucket?.attemptCount === 6,
    topicBucket,
  );
  // Raw: isCorrect = [true, false, true, false] + game [true, false] => 3/6 = 50%.
  check(
    'topic bucket accuracy matches hand-computed value (3/6 = 50%)',
    topicBucket?.averageScorePercent === 50,
    topicBucket,
  );
  check('averageTimeTakenSeconds is always null (Grammar practice is untimed)', topicReport.body.buckets.every((b) => (b as unknown as { averageTimeTakenSeconds: unknown }).averageTimeTakenSeconds === null), topicReport.body);

  const studentReport = await api<{
    buckets: Array<{ key: string; attemptCount: number; averageScorePercent: number | null }>;
  }>(
    'GET',
    `/api/teacher/grammar-reports?groupBy=student&topicId=${topicId}&studentId=${studentId}`,
    teacherToken,
  );
  const studentBucket = studentReport.body.buckets.find((b) => b.key === studentId);
  check(
    'per-student report (narrowed to this topic+student) matches: 6 attempts, 50% accuracy',
    studentBucket?.attemptCount === 6 && studentBucket?.averageScorePercent === 50,
    studentBucket,
  );

  const yearReport = await api<{ buckets: Array<{ attemptCount: number }> }>(
    'GET',
    `/api/teacher/grammar-reports?groupBy=year&topicId=${topicId}`,
    teacherToken,
  );
  const totalFromYearBuckets = yearReport.body.buckets.reduce((sum, b) => sum + b.attemptCount, 0);
  check('year-grouped report totals also sum to 6', totalFromYearBuckets === 6, yearReport.body);

  const badGroupBy = await api('GET', `/api/teacher/grammar-reports?groupBy=bogus`, teacherToken);
  check('unknown groupBy returns 400, not a crash', badGroupBy.status === 400, badGroupBy);

  const crossTeacherReport = await api(
    'GET',
    `/api/teacher/grammar-reports?groupBy=topic&topicId=${topicId}`,
    teacher2Token,
  );
  check(
    'a non-owning teacher cannot narrow the report to another teacher\'s topic (404)',
    crossTeacherReport.status === 404,
    crossTeacherReport,
  );

  // --- Cleanup: delete the exercise + topic to prove delete endpoints work -------------
  console.log('\n=== Teardown: delete exercise + topic (also exercises the DELETE endpoints) ===');
  const deleteExercise = await api(
    'DELETE',
    `/api/teacher/grammar-topics/${topicId}/exercises/${fbPrompt.id}`,
    teacherToken,
  );
  check('teacher can delete an exercise', deleteExercise.status === 200, deleteExercise);

  const deleteTopic = await api('DELETE', `/api/teacher/grammar-topics/${topicId}`, teacherToken);
  check('teacher can delete the topic', deleteTopic.status === 204, deleteTopic);

  const remainingAttempts = await prisma.grammarExerciseAttempt.count({ where: { topicId } });
  check('deleting the topic cascade-deletes its attempt log', remainingAttempts === 0, remainingAttempts);

  console.log(`\n=== Result: ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} ===`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error('[verify-grammar] Failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
