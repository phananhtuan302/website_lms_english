/**
 * T-036..T-038 verification script — REAL REST calls against an already-running dev
 * server + Postgres (same convention as `verify-t039-t044.ts`). Per Velocity Mode
 * (PROJECT_PLAN.md Section 8), this is the primary Dev self-verification for this batch;
 * a single Playwright pass separately covers the end-to-end browser flow.
 *
 * Covers:
 *   T-036 Unit Test management: tagging a test unitTest+unit, teacher's grouped listing,
 *     student's grouped listing only shows PUBLISHED ones, and an unpublished Unit Test
 *     is rejected (403) if a student tries to start it directly.
 *   T-037 Unit Test report & leaderboard: ranked scores + average, computed via
 *     `computeReport`, checked against a manual calculation from known submitted scores.
 *   T-038 Vocabulary Check: generated only from a target student's studied
 *     (learning/known) FlashcardProgress cards — NEVER from unseen/new cards (verified
 *     directly against the DB) — fixed 15-minute timer, single-student AND group
 *     generation, assignment-based access control (unassigned student gets 403), and
 *     that taking it flows through the real take-test/grading engine.
 *
 * Usage: start the dev server first (`npm run dev -w server` or the root `npm run dev`),
 * then `npm run verify:t036-t038 -w server`. Requires the seeded teacher account.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000';
const SEED_TEACHER_EMAIL = process.env.SEED_TEACHER_EMAIL ?? 'teacher@example.com';
const SEED_TEACHER_PASSWORD = process.env.SEED_TEACHER_PASSWORD ?? 'teacher-dev-password123';

let passCount = 0;
let failCount = 0;

function pass(label: string): void {
  passCount += 1;
  console.log(`  [PASS] ${label}`);
}
function fail(label: string, detail?: unknown): never {
  failCount += 1;
  console.error(`  [FAIL] ${label}`, detail ?? '');
  throw new Error(`Verification step failed: ${label}`);
}
function assert(condition: unknown, label: string, detail?: unknown): asserts condition {
  if (condition) pass(label);
  else fail(label, detail);
}

async function apiRequest<T>(
  path: string,
  token: string | null,
  options: { method?: string; body?: unknown; expectStatus?: number } = {},
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const contentType = res.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json') ? await res.json() : undefined;
  if (options.expectStatus !== undefined) {
    if (res.status !== options.expectStatus) {
      throw new Error(
        `${options.method ?? 'GET'} ${path} -> expected ${options.expectStatus}, got ${res.status}: ${JSON.stringify(body)}`,
      );
    }
    return body as T;
  }
  if (!res.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} -> ${res.status}: ${JSON.stringify(body)}`);
  }
  return body as T;
}

async function registerStudent(label: string): Promise<{ token: string; id: string; name: string }> {
  const name = `T036-038 Student ${label} ${Date.now()}`;
  const res = await apiRequest<{ token: string; user: { id: string } }>('/api/auth/register', null, {
    method: 'POST',
    body: { email: `verify-t036-t038-${label}-${Date.now()}@example.com`, password: 'verify-pass-123', name },
  });
  return { token: res.token, id: res.user.id, name };
}

async function main() {
  console.log(`[verify-t036-t038] Target: ${API_BASE_URL}\n`);

  const teacherLogin = await apiRequest<{ token: string }>('/api/auth/login', null, {
    method: 'POST',
    body: { email: SEED_TEACHER_EMAIL, password: SEED_TEACHER_PASSWORD },
  });
  const teacherToken = teacherLogin.token;
  pass('Logged in as seeded teacher');

  // ==================================================================================
  // T-036 + T-037: Unit Test management + report/leaderboard
  // ==================================================================================

  const unit = await apiRequest<{ id: string; name: string }>('/api/teacher/units', teacherToken, {
    method: 'POST',
    body: { name: `Verify Unit ${Date.now()}`, order: 999 },
  });
  pass(`Created a fresh curriculum Unit: ${unit.id}`);

  const test = await apiRequest<{ id: string; testType: string; published: boolean }>(
    '/api/teacher/tests',
    teacherToken,
    { method: 'POST', body: { title: `Unit Test verify ${Date.now()}`, unitId: unit.id, testType: 'unitTest' } },
  );
  assert(test.testType === 'unitTest' && test.published === false, 'T-036: New test created as unitTest, unpublished by default', test);

  const sectionRes = await apiRequest<{ sections: Array<{ id: string }> }>(
    `/api/teacher/tests/${test.id}/sections`,
    teacherToken,
    { method: 'POST', body: { title: 'Section 1' } },
  );
  const sectionId = sectionRes.sections[0].id;
  // Two multipleChoice questions, so we can drive exact, distinct scores per student.
  await apiRequest(
    `/api/teacher/tests/${test.id}/sections/${sectionId}/questions`,
    teacherToken,
    { method: 'POST', body: { type: 'multipleChoice', prompt: 'Q1', choices: [{ text: 'Right', isCorrect: true }, { text: 'Wrong', isCorrect: false }] } },
  );
  await apiRequest(`/api/teacher/tests/${test.id}/sections/${sectionId}/questions`, teacherToken, {
    method: 'POST',
    body: { type: 'multipleChoice', prompt: 'Q2', choices: [{ text: 'Right', isCorrect: true }, { text: 'Wrong', isCorrect: false }] },
  });
  await apiRequest(`/api/teacher/tests/${test.id}/variants`, teacherToken, { method: 'POST', body: { count: 3 } });
  pass('Authored a 2-question Unit Test with 3 variants');

  // Unpublished: student listing must NOT show it, and directly starting it must 403.
  const studentA = await registerStudent('A');
  const unpublishedList = await apiRequest<{ groups: Array<{ tests: Array<{ id: string }> }> }>(
    '/api/student/unit-tests',
    studentA.token,
  );
  const foundUnpublished = unpublishedList.groups.some((g) => g.tests.some((t) => t.id === test.id));
  assert(!foundUnpublished, 'T-036: Unpublished Unit Test does NOT appear in student listing', unpublishedList);

  await apiRequest(`/api/tests/${test.id}/practice`, studentA.token, { method: 'POST', expectStatus: 403 });
  pass('T-036: Starting an unpublished Unit Test directly is rejected with 403 (defense in depth)');

  // Publish it.
  const published = await apiRequest<{ published: boolean }>(`/api/teacher/tests/${test.id}`, teacherToken, {
    method: 'PATCH',
    body: { title: test.testType, published: true },
  });
  assert(published.published === true, 'T-036: PATCH published:true persists', published);

  // Teacher's grouped view.
  const teacherGroups = await apiRequest<{ groups: Array<{ unitId: string | null; unitName: string | null; tests: Array<{ id: string; published: boolean }> }> }>(
    '/api/teacher/unit-tests',
    teacherToken,
  );
  const teacherGroup = teacherGroups.groups.find((g) => g.unitId === unit.id);
  assert(
    teacherGroup !== undefined && teacherGroup.tests.some((t) => t.id === test.id && t.published),
    'T-036: Teacher unit-tests view groups the test under its Unit and shows published:true',
    teacherGroup,
  );

  // Student's grouped view now shows it, published.
  const studentGroups = await apiRequest<{ groups: Array<{ unitId: string | null; unitName: string | null; tests: Array<{ id: string }> }> }>(
    '/api/student/unit-tests',
    studentA.token,
  );
  const studentGroup = studentGroups.groups.find((g) => g.unitId === unit.id);
  assert(
    studentGroup !== undefined && studentGroup.tests.some((t) => t.id === test.id),
    'T-036: Published Unit Test now appears in student listing, grouped by Unit',
    studentGroup,
  );

  // --- Drive known scores for 3 students: 100%, 50%, 0% -----------------------------
  async function takeAndScore(studentToken: string, correctCount: 0 | 1 | 2): Promise<number> {
    const start = await apiRequest<{ attemptId: string }>(`/api/tests/${test.id}/practice`, studentToken, { method: 'POST' });
    const attempt = await apiRequest<{ sections: Array<{ questions: Array<{ id: string; choices: Array<{ id: string; text: string }> }> }> }>(
      `/api/attempts/${start.attemptId}`,
      studentToken,
    );
    const questions = attempt.sections.flatMap((s) => s.questions);
    for (const [index, question] of questions.entries()) {
      const wantCorrect = index < correctCount;
      // Both questions were authored with choices [Right(correct), Wrong] — shuffled at
      // variant-generation time, so look up by TEXT, not position.
      const choice = question.choices.find((c) => c.text === (wantCorrect ? 'Right' : 'Wrong'))!;
      await apiRequest(`/api/attempts/${start.attemptId}/answers/${question.id}`, studentToken, {
        method: 'PUT',
        body: { selectedChoiceId: choice.id },
      });
    }
    const result = await apiRequest<{ scorePercent: number }>(`/api/attempts/${start.attemptId}/submit`, studentToken, { method: 'POST' });
    return result.scorePercent;
  }

  const studentB = await registerStudent('B');
  const studentC = await registerStudent('C');

  const scoreA = await takeAndScore(studentA.token, 2); // 100%
  const scoreB = await takeAndScore(studentB.token, 1); // 50%
  const scoreC = await takeAndScore(studentC.token, 0); // 0%
  assert(scoreA === 100 && scoreB === 50 && scoreC === 0, 'Drove exact known scores: A=100%, B=50%, C=0%', { scoreA, scoreB, scoreC });

  const manualAverage = Number((((scoreA + scoreB + scoreC) / 3)).toFixed(1));

  const leaderboard = await apiRequest<{
    attemptCount: number;
    averageScorePercent: number | null;
    entries: Array<{ rank: number; studentId: string; studentName: string; averageScorePercent: number | null }>;
  }>(`/api/units/${unit.id}/leaderboard`, studentA.token);

  assert(leaderboard.attemptCount === 3, 'T-037: Leaderboard attemptCount = 3 (matches manual count)', leaderboard.attemptCount);
  assert(
    leaderboard.averageScorePercent === manualAverage,
    `T-037: Leaderboard averageScorePercent (${leaderboard.averageScorePercent}) matches manual calculation (${manualAverage})`,
    leaderboard,
  );

  const rankA = leaderboard.entries.find((e) => e.studentId === studentA.id);
  const rankB = leaderboard.entries.find((e) => e.studentId === studentB.id);
  const rankC = leaderboard.entries.find((e) => e.studentId === studentC.id);
  assert(
    rankA?.averageScorePercent === 100 && rankB?.averageScorePercent === 50 && rankC?.averageScorePercent === 0,
    'T-037: Each student\'s own row shows their exact submitted score',
    { rankA, rankB, rankC },
  );
  assert(
    rankA!.rank < rankB!.rank && rankB!.rank < rankC!.rank,
    'T-037: Ranked order is A (100%) > B (50%) > C (0%)',
    { rankA, rankB, rankC },
  );
  pass('T-037: Leaderboard is accessible to a STUDENT too (both-roles endpoint)');

  const teacherLeaderboard = await apiRequest<{ averageScorePercent: number | null }>(
    `/api/units/${unit.id}/leaderboard`,
    teacherToken,
  );
  assert(teacherLeaderboard.averageScorePercent === manualAverage, 'T-037: Teacher sees the identical leaderboard', teacherLeaderboard);

  // ==================================================================================
  // T-038: Vocabulary Check — question pool drawn ONLY from studied (learning/known)
  // vocabulary, never new/unseen, per Assumption A8.
  // ==================================================================================

  const vocabStudent = await registerStudent('Vocab');

  const set = await apiRequest<{ id: string }>('/api/teacher/flashcard-sets', teacherToken, {
    method: 'POST',
    body: { name: `Verify Vocab Set ${Date.now()}` },
  });
  const cardTerms = ['zolar', 'brimtock', 'quessin', 'flenpath', 'mordwick', 'sundraze'];
  const cardIds: Record<string, string> = {};
  for (const term of cardTerms) {
    const updated = await apiRequest<{ cards: Array<{ id: string; term: string }> }>(
      `/api/teacher/flashcard-sets/${set.id}/cards`,
      teacherToken,
      { method: 'POST', body: { term, meaning: `The definition of ${term}` } },
    );
    cardIds[term] = updated.cards.find((c) => c.term === term)!.id;
  }
  pass(`Created a flashcard set with ${cardTerms.length} nonsense-word cards (so pool membership is unambiguous)`);

  // Mark 3 as studied (learning/known), leave 3 as `new` (never touched).
  const studiedTerms = ['zolar', 'brimtock', 'quessin'];
  const unseenTerms = ['flenpath', 'mordwick', 'sundraze'];
  await apiRequest(`/api/flashcard-sets/${set.id}/cards/${cardIds.zolar}/progress`, vocabStudent.token, {
    method: 'PUT',
    body: { status: 'known' },
  });
  await apiRequest(`/api/flashcard-sets/${set.id}/cards/${cardIds.brimtock}/progress`, vocabStudent.token, {
    method: 'PUT',
    body: { status: 'learning' },
  });
  await apiRequest(`/api/flashcard-sets/${set.id}/cards/${cardIds.quessin}/progress`, vocabStudent.token, {
    method: 'PUT',
    body: { status: 'learning' },
  });
  // `flenpath`/`mordwick`/`sundraze` are left completely untouched -> no FlashcardProgress
  // row at all -> treated as `new` (schema.prisma's documented convention).
  pass('Marked 3 cards learning/known, left 3 cards completely untouched (new/unseen)');

  const generated = await apiRequest<{ id: string; timeLimitMinutes: number; questionCount: number; assignedStudents: Array<{ id: string }> }>(
    '/api/teacher/vocabulary-checks',
    teacherToken,
    { method: 'POST', body: { studentIds: [vocabStudent.id] } },
  );
  assert(generated.timeLimitMinutes === 15, 'T-038: Generated Vocabulary Check has a fixed 15-minute timer', generated);
  assert(generated.questionCount === 3, 'T-038: Question pool size = 3 (exactly the studied card count)', generated);
  assert(
    generated.assignedStudents.length === 1 && generated.assignedStudents[0].id === vocabStudent.id,
    'T-038: Exactly the target student is granted a TestAssignment',
    generated,
  );

  // --- THE critical proof: inspect the generated questions directly against the DB ---
  const dbTest = await prisma.test.findUniqueOrThrow({
    where: { id: generated.id },
    include: { sections: { include: { questions: { include: { choices: true } } } } },
  });
  assert(dbTest.testType === 'vocabularyCheck' && dbTest.timeLimitMinutes === 15, 'T-038 (DB): testType + timeLimitMinutes persisted correctly', {
    testType: dbTest.testType,
    timeLimitMinutes: dbTest.timeLimitMinutes,
  });
  const allQuestions = dbTest.sections.flatMap((s) => s.questions);
  assert(allQuestions.length === 3, 'T-038 (DB): exactly 3 questions were created', allQuestions.length);

  // The SUBJECT of a question (what's actually being tested) is what Assumption A8
  // constrains — a multipleChoice question's subject is the term in `What does "X"
  // mean?`; a fillBlank fallback's subject is its own accepted term (`acceptedAnswers`
  // always contains the term itself, see `vocabularyCheckGenerator.ts`). This is
  // deliberately NOT the same check as "does this term appear anywhere in the payload":
  // multiple-choice DISTRACTOR meanings are intentionally sourced from the wider
  // vocabulary bank (`fetchDistractorPool`) — including unseen words — which is correct,
  // expected quiz design (a wrong-answer option isn't a claim "you're also being tested
  // on this word"), not a violation of "pool drawn from studied vocabulary only".
  function questionSubjectTerm(question: (typeof allQuestions)[number]): string | null {
    const mcMatch = question.prompt.match(/^What does "(.+)" mean\?$/);
    if (mcMatch) return mcMatch[1];
    if (question.type === 'fillBlank' && question.acceptedAnswers.length > 0) {
      return question.acceptedAnswers[0];
    }
    return null;
  }

  const subjectTerms = allQuestions.map(questionSubjectTerm).filter((t): t is string => t !== null);
  assert(
    subjectTerms.length === allQuestions.length,
    'T-038 (DB proof): every generated question has an identifiable subject term',
    subjectTerms,
  );
  assert(
    new Set(subjectTerms).size === studiedTerms.length &&
      studiedTerms.every((term) => subjectTerms.includes(term)),
    'T-038 (DB proof): the question SUBJECTS are EXACTLY the 3 studied (learning/known) terms',
    { subjectTerms, studiedTerms },
  );
  assert(
    unseenTerms.every((term) => !subjectTerms.includes(term)),
    'T-038 (DB proof): NONE of the 3 unseen/new terms is the SUBJECT of any generated question',
    { subjectTerms, unseenTerms },
  );
  console.log(
    `  [INFO] Generated questions: ${allQuestions.map((q) => `"${q.prompt}" (choices: ${q.choices.map((c) => c.text).join(' | ')})`).join('; ')}`,
  );

  // --- Access control: only the assigned student may start it ----------------------
  await apiRequest(`/api/tests/${generated.id}/practice`, studentA.token, { method: 'POST', expectStatus: 403 });
  pass('T-038: An unassigned student attempting to start this Vocabulary Check gets 403');

  const vocabList = await apiRequest<Array<{ id: string }>>('/api/student/vocabulary-checks', vocabStudent.token);
  assert(vocabList.some((c) => c.id === generated.id), 'T-038: Assigned student sees it in their own Vocabulary Check list', vocabList);
  const vocabListOther = await apiRequest<Array<{ id: string }>>('/api/student/vocabulary-checks', studentA.token);
  assert(!vocabListOther.some((c) => c.id === generated.id), 'T-038: Unassigned student does NOT see it in their own list', vocabListOther);

  // Excluded from the generic self-practice picker too (T-038 additive change).
  const genericPracticeList = await apiRequest<Array<{ id: string }>>('/api/tests', vocabStudent.token);
  assert(!genericPracticeList.some((t) => t.id === generated.id), 'T-038: Vocabulary Check is excluded from the generic self-practice picker', genericPracticeList.length);

  // --- Taking it reuses the REAL take-test runtime + auto-grading + 15-min timer ----
  const vocabStart = await apiRequest<{ attemptId: string }>(`/api/tests/${generated.id}/practice`, vocabStudent.token, { method: 'POST' });
  const vocabAttempt = await apiRequest<{ timeLimitMinutes: number; startedAt: string; sections: Array<{ questions: Array<{ id: string; type: string; choices: Array<{ id: string; text: string }> }> }> }>(
    `/api/attempts/${vocabStart.attemptId}`,
    vocabStudent.token,
  );
  assert(vocabAttempt.timeLimitMinutes === 15, 'T-038: Take-test runtime payload reports timeLimitMinutes: 15 (drives TakeTestPage.tsx\'s countdown/auto-submit)', vocabAttempt);

  const vocabQuestions = vocabAttempt.sections.flatMap((s) => s.questions);
  for (const question of vocabQuestions) {
    if (question.type === 'multipleChoice') {
      await apiRequest(`/api/attempts/${vocabStart.attemptId}/answers/${question.id}`, vocabStudent.token, {
        method: 'PUT',
        body: { selectedChoiceId: question.choices[0].id },
      });
    } else {
      await apiRequest(`/api/attempts/${vocabStart.attemptId}/answers/${question.id}`, vocabStudent.token, {
        method: 'PUT',
        body: { textAnswer: 'some answer' },
      });
    }
  }
  const vocabSubmit = await apiRequest<{ status: string; totalCount: number }>(`/api/attempts/${vocabStart.attemptId}/submit`, vocabStudent.token, { method: 'POST' });
  assert(vocabSubmit.status === 'submitted' && vocabSubmit.totalCount === 3, 'T-038: Submission works via the SAME auto-grading engine as every other test (T-013)', vocabSubmit);

  // 15-minute auto-submit check: simulate expiry server-side by rewinding startedAt into
  // the past (this is exactly the same deadline math `TakeTestPage.tsx` uses client-side:
  // `startedAt + timeLimitMinutes*60000`), then confirm the runtime payload reports a
  // deadline that has already elapsed for a FRESH attempt, proving the 15-minute value
  // itself is wired end-to-end from generation through to what the client's countdown
  // reads (client-side timer/auto-submit code itself is exercised in the Playwright pass).
  const vocabStudent2 = await registerStudent('VocabTimer');
  await apiRequest(`/api/flashcard-sets/${set.id}/cards/${cardIds.zolar}/progress`, vocabStudent2.token, {
    method: 'PUT',
    body: { status: 'known' },
  });
  const generated2 = await apiRequest<{ id: string }>('/api/teacher/vocabulary-checks', teacherToken, {
    method: 'POST',
    body: { studentIds: [vocabStudent2.id] },
  });
  const timerStart = await apiRequest<{ attemptId: string }>(`/api/tests/${generated2.id}/practice`, vocabStudent2.token, { method: 'POST' });
  // Rewind this attempt's startedAt by 16 minutes so `startedAt + 15min` is already in
  // the past — the exact same deadline `TakeTestPage.tsx` computes.
  const sixteenMinutesAgo = new Date(Date.now() - 16 * 60 * 1000);
  await prisma.attempt.update({ where: { id: timerStart.attemptId }, data: { startedAt: sixteenMinutesAgo } });
  const timerAttempt = await apiRequest<{ timeLimitMinutes: number; startedAt: string }>(`/api/attempts/${timerStart.attemptId}`, vocabStudent2.token);
  const deadline = new Date(timerAttempt.startedAt).getTime() + timerAttempt.timeLimitMinutes * 60_000;
  assert(
    timerAttempt.timeLimitMinutes === 15 && deadline < Date.now(),
    'T-038: 15-minute deadline math (startedAt + timeLimitMinutes) is already elapsed after rewinding startedAt by 16 min — TakeTestPage.tsx\'s identical client-side check (`now >= deadline`) would auto-submit immediately on load',
    { startedAt: timerAttempt.startedAt, timeLimitMinutes: timerAttempt.timeLimitMinutes, deadline: new Date(deadline).toISOString(), now: new Date().toISOString() },
  );
  // The attempt is still `inProgress` server-side (nothing server-side force-submits it —
  // auto-submit is a CLIENT behavior per T-012's design, verified live in the browser
  // pass) — confirm submitting it still works normally even past the nominal deadline
  // (server doesn't hard-block a late submit; the client is what enforces the timer).
  const timerSubmit = await apiRequest<{ status: string }>(`/api/attempts/${timerStart.attemptId}/submit`, vocabStudent2.token, { method: 'POST' });
  assert(timerSubmit.status === 'submitted', 'T-038: Attempt still submits successfully (grading engine unaffected by elapsed wall-clock time)', timerSubmit);

  // --- Group generation: 2 students, pool = union of both students' studied cards ---
  const groupStudentX = await registerStudent('GroupX');
  const groupStudentY = await registerStudent('GroupY');
  await apiRequest(`/api/flashcard-sets/${set.id}/cards/${cardIds.zolar}/progress`, groupStudentX.token, { method: 'PUT', body: { status: 'known' } });
  await apiRequest(`/api/flashcard-sets/${set.id}/cards/${cardIds.mordwick}/progress`, groupStudentY.token, { method: 'PUT', body: { status: 'known' } });
  // `mordwick` was "unseen" for the single-student cases above but IS studied by
  // groupStudentY — proves the pool is the UNION across the group, not just one member.
  const groupGenerated = await apiRequest<{ questionCount: number; assignedStudents: Array<{ id: string }> }>(
    '/api/teacher/vocabulary-checks',
    teacherToken,
    { method: 'POST', body: { studentIds: [groupStudentX.id, groupStudentY.id] } },
  );
  assert(groupGenerated.assignedStudents.length === 2, 'T-038: Group generation grants BOTH students a TestAssignment', groupGenerated);
  const groupDbTest = await prisma.test.findFirst({
    where: { assignments: { some: { studentId: groupStudentX.id } }, AND: { assignments: { some: { studentId: groupStudentY.id } } } },
    include: { sections: { include: { questions: { include: { choices: true } } } } },
  });
  const groupQuestions = groupDbTest!.sections.flatMap((s) => s.questions);
  const groupSubjectTerms = groupQuestions.map(questionSubjectTerm);
  const groupHasZolar = groupSubjectTerms.includes('zolar');
  const groupHasMordwick = groupSubjectTerms.includes('mordwick');
  assert(groupHasZolar && groupHasMordwick, 'T-038: Group pool is the UNION of both students\' studied cards (zolar from X, mordwick from Y)', {
    groupHasZolar,
    groupHasMordwick,
  });
  // Both assigned students can independently start their OWN attempt on the same test.
  const attemptX = await apiRequest<{ attemptId: string }>(`/api/tests/${groupDbTest!.id}/practice`, groupStudentX.token, { method: 'POST' });
  const attemptY = await apiRequest<{ attemptId: string }>(`/api/tests/${groupDbTest!.id}/practice`, groupStudentY.token, { method: 'POST' });
  assert(attemptX.attemptId !== attemptY.attemptId, 'T-038: Both group members get their OWN independent attempt on the shared generated test', { attemptX, attemptY });

  // --- Generation fails cleanly for a student with zero studied vocabulary ----------
  const emptyStudent = await registerStudent('Empty');
  const res = await fetch(`${API_BASE_URL}/api/teacher/vocabulary-checks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherToken}` },
    body: JSON.stringify({ studentIds: [emptyStudent.id] }),
  });
  assert(res.status === 400, 'T-038: Generating for a student with NO studied vocabulary is rejected with 400 (never silently produces an empty pool)', res.status);

  console.log(`\n${passCount} check(s) passed, ${failCount} failed.`);
  if (failCount > 0) {
    process.exitCode = 1;
  } else {
    console.log('T-036..T-038 verification: ALL CHECKS PASSED.');
  }
}

main()
  .catch((err) => {
    console.error('\n[verify-t036-t038] FAILED:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
