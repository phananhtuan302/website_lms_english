/**
 * T-045 verification script — REAL REST calls against an already-running dev server +
 * Postgres (same convention as `verify-t039-t044.ts` / `verify-reporting.ts`). Per
 * Velocity Mode (PROJECT_PLAN.md Section 8), this is the primary Dev self-verification
 * for this batch; a single Playwright pass separately covers the end-to-end browser flow
 * (see `verify-t045.spec.md` / the scratchpad screenshots referenced in the Dev report).
 *
 * T-045 acceptance criteria (BACKLOG.md): `Test.testType` supports `mockTest`; the
 * existing authoring UI (T-008) lets a teacher assemble ONE test whose sections mix
 * Reading, Listening, Writing, and standard objective questions; taking/grading such a
 * test reuses T-012 (runtime)/T-013 (auto-grading)/T-042 (essay grading) as-is, with no
 * separate mock-test-only runtime.
 *
 * This script authors exactly that composition in ONE `testType: 'mockTest'` test:
 *   1. A Reading section (passage + multipleChoice question).
 *   2. A Listening section (audio + trueFalse question).
 *   3. A plain "Grammar & Vocabulary" section with standard objective questions
 *      (multipleChoice + fillBlank) — the "standard objective/vocab-sourced questions"
 *      part of the acceptance criteria; no new authoring/grading code needed since these
 *      are the same objective types T-007/T-013 already handle.
 *   4. A Writing section (essay question, manually graded).
 *   5. OPTIONALLY a Speaking section (T-051-054), if that code is present in this tree —
 *      wrapped so its absence does NOT fail this script, per the Dev brief ("mock tests
 *      without a Speaking section are still a complete, valid deliverable").
 *
 * Then: generates variants, discovers the test via BOTH the teacher's "My tests" list and
 * the student's self-practice picker (proving `mockTest` isn't accidentally filtered out
 * anywhere, and that it now carries a "Mock Test" label per T-045's minimal listing/label
 * glue), takes it as a student end-to-end (answers every question correctly, including
 * the essay), submits, and checks the result view: the auto-graded objective score
 * excludes the essay (and Speaking, if present) from its tally exactly like any
 * individual Reading/Listening/Writing test would, the essay starts "awaiting grading"
 * (manualScore: null), and after the teacher grades it, BOTH the student's own result view
 * and the teacher's attempt-detail view show the auto-graded score AND the manual essay
 * grade together, unchanged from what T-013/T-042 already do for a single-content-type
 * test.
 *
 * Usage: start the dev server first (`npm run dev -w server` or the root `npm run dev`),
 * then `npm run verify:t045 -w server`. Requires the seeded teacher account.
 */

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
  options: { method?: string; body?: unknown } = {},
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
  if (!res.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} -> ${res.status}: ${JSON.stringify(body)}`);
  }
  return body as T;
}

async function registerStudent(label: string): Promise<{ token: string; id: string }> {
  const res = await apiRequest<{ token: string; user: { id: string } }>('/api/auth/register', null, {
    method: 'POST',
    body: {
      email: `verify-t045-${label}-${Date.now()}@example.com`,
      password: 'verify-pass-123',
      name: `T045 Student ${label}`,
    },
  });
  return { token: res.token, id: res.user.id };
}

interface AttemptQuestion {
  id: string;
  type: string;
  prompt: string;
  choices: Array<{ id: string; text: string }>;
  essayMaxScore: number | null;
  allowedResponseSeconds: number | null;
}
interface AttemptSection {
  id: string;
  title: string;
  passageText: string | null;
  audioUrl: string | null;
  maxPlayCount: number | null;
  questions: AttemptQuestion[];
}
interface AttemptDetail {
  id: string;
  sessionMode: string;
  sections: AttemptSection[];
}
interface ResultQuestion {
  questionId: string;
  type: string;
  isCorrect: boolean | null;
  manualScore: number | null;
  manualComment: string | null;
  essayMaxScore: number | null;
}
interface AttemptResult {
  correctCount: number;
  totalCount: number;
  scorePercent: number;
  questions: ResultQuestion[];
}

async function main() {
  console.log(`[verify-t045] Target: ${API_BASE_URL}\n`);

  const teacherLogin = await apiRequest<{ token: string }>('/api/auth/login', null, {
    method: 'POST',
    body: { email: SEED_TEACHER_EMAIL, password: SEED_TEACHER_PASSWORD },
  });
  const teacherToken = teacherLogin.token;
  pass('Logged in as seeded teacher');

  // --- Author ONE test, tagged testType: mockTest at creation time -------------------
  const testTitle = `Mock Test T-045 verify ${Date.now()}`;
  const test = await apiRequest<{ id: string; testType: string }>('/api/teacher/tests', teacherToken, {
    method: 'POST',
    body: { title: testTitle, testType: 'mockTest' },
  });
  assert(test.testType === 'mockTest', 'testType: mockTest accepted at test creation (Test.testType enum)', test);

  // 1. Reading section: passage + multipleChoice question.
  const readingSection = await apiRequest<{ sections: Array<{ id: string }> }>(
    `/api/teacher/tests/${test.id}/sections`,
    teacherToken,
    { method: 'POST', body: { title: 'Reading' } },
  );
  const readingSectionId = readingSection.sections[0].id;
  await apiRequest(`/api/teacher/tests/${test.id}/sections/${readingSectionId}`, teacherToken, {
    method: 'PATCH',
    body: {
      title: 'Reading',
      passageText: 'The quick brown fox jumps over the lazy dog near the riverbank.',
    },
  });
  const readingQ = await apiRequest<{ sections: Array<{ id: string; questions: Array<{ id: string; choices: Array<{ id: string; text: string; isCorrect: boolean }> }> }> }>(
    `/api/teacher/tests/${test.id}/sections/${readingSectionId}/questions`,
    teacherToken,
    {
      method: 'POST',
      body: {
        type: 'multipleChoice',
        prompt: 'What animal jumps over the dog?',
        choices: [
          { text: 'Fox', isCorrect: true },
          { text: 'Cat', isCorrect: false },
        ],
      },
    },
  );
  const readingQuestionId = readingQ.sections.find((s) => s.id === readingSectionId)!.questions[0].id;
  pass('1. Reading section authored: passage + multipleChoice question referencing it (T-039, reused as-is)');

  // 2. Listening section: audio + trueFalse question.
  const listeningSection = await apiRequest<{ sections: Array<{ id: string }> }>(
    `/api/teacher/tests/${test.id}/sections`,
    teacherToken,
    { method: 'POST', body: { title: 'Listening' } },
  );
  const listeningSectionId = listeningSection.sections[1].id;
  await apiRequest(`/api/teacher/tests/${test.id}/sections/${listeningSectionId}`, teacherToken, {
    method: 'PATCH',
    body: {
      title: 'Listening',
      audioUrl: 'https://example.com/placeholder-assets/audio/t045-clip.mp3',
      maxPlayCount: 2,
    },
  });
  const listeningQ = await apiRequest<{ sections: Array<{ id: string; questions: Array<{ id: string; choices: Array<{ id: string; text: string; isCorrect: boolean }> }> }> }>(
    `/api/teacher/tests/${test.id}/sections/${listeningSectionId}/questions`,
    teacherToken,
    {
      method: 'POST',
      body: {
        type: 'trueFalse',
        prompt: 'The clip mentions a fox.',
        choices: [
          { text: 'True', isCorrect: true },
          { text: 'False', isCorrect: false },
        ],
      },
    },
  );
  const listeningQuestionId = listeningQ.sections.find((s) => s.id === listeningSectionId)!.questions[0].id;
  pass('2. Listening section authored: audio + trueFalse question (T-040/T-041, reused as-is)');

  // 3. Plain objective section: multipleChoice + fillBlank, no passage/audio at all —
  //    the "standard objective/vocab-sourced questions" part of the AC.
  const objectiveSection = await apiRequest<{ sections: Array<{ id: string }> }>(
    `/api/teacher/tests/${test.id}/sections`,
    teacherToken,
    { method: 'POST', body: { title: 'Grammar & Vocabulary' } },
  );
  const objectiveSectionId = objectiveSection.sections[2].id;
  await apiRequest(`/api/teacher/tests/${test.id}/sections/${objectiveSectionId}/questions`, teacherToken, {
    method: 'POST',
    body: {
      type: 'multipleChoice',
      prompt: 'Choose the correct synonym for "quick".',
      choices: [
        { text: 'Fast', isCorrect: true },
        { text: 'Slow', isCorrect: false },
      ],
    },
  });
  await apiRequest<{ sections: Array<{ id: string; questions: Array<{ id: string; type: string }> }> }>(
    `/api/teacher/tests/${test.id}/sections/${objectiveSectionId}/questions`,
    teacherToken,
    {
      method: 'POST',
      body: { type: 'fillBlank', prompt: 'Water ___ (boil) at 100 degrees Celsius.', acceptedAnswers: ['boils'] },
    },
  );
  pass('3. Plain objective section authored: multipleChoice + fillBlank, no Reading/Listening content (T-007/T-013, reused as-is)');

  // 4. Writing section: essay question, manually graded.
  const writingSection = await apiRequest<{ sections: Array<{ id: string }> }>(
    `/api/teacher/tests/${test.id}/sections`,
    teacherToken,
    { method: 'POST', body: { title: 'Writing' } },
  );
  const writingSectionId = writingSection.sections[3].id;
  const withEssay = await apiRequest<{
    sections: Array<{ id: string; questions: Array<{ id: string; type: string; essayMaxScore: number | null }> }>;
  }>(`/api/teacher/tests/${test.id}/sections/${writingSectionId}/questions`, teacherToken, {
    method: 'POST',
    body: { type: 'essay', prompt: 'Describe your favorite animal in 2-3 sentences.', essayMaxScore: 20 },
  });
  const essayQuestion = withEssay.sections.find((s) => s.id === writingSectionId)!.questions[0];
  assert(essayQuestion.type === 'essay' && essayQuestion.essayMaxScore === 20, '4. Writing section authored: essay question, essayMaxScore=20 (T-042, reused as-is)', essayQuestion);

  // 5. OPTIONAL Speaking section (T-051-054) — only if that code is present in this tree.
  //    Per the Dev brief: a mock test without Speaking is still a fully valid T-045
  //    deliverable, so any failure here is logged as informational, never a hard FAIL.
  let speakingIncluded = false;
  try {
    const speakingSection = await apiRequest<{ sections: Array<{ id: string }> }>(
      `/api/teacher/tests/${test.id}/sections`,
      teacherToken,
      { method: 'POST', body: { title: 'Speaking' } },
    );
    const speakingSectionId = speakingSection.sections[4].id;
    await apiRequest(`/api/teacher/tests/${test.id}/sections/${speakingSectionId}/questions`, teacherToken, {
      method: 'POST',
      body: { type: 'speaking', prompt: 'Describe your morning routine.', allowedResponseSeconds: 30 },
    });
    speakingIncluded = true;
    pass('5. (Bonus) Speaking section authored: T-051-054 code is present in this tree and accepted a speaking question');
  } catch (err) {
    console.log(`  [INFO] Speaking section not added (T-051-056 not landed / not usable yet): ${(err as Error).message}`);
    console.log('  [INFO] Per the Dev brief, this does not block T-045 — continuing with a 4-content-type mock test.');
  }

  await apiRequest(`/api/teacher/tests/${test.id}/variants`, teacherToken, { method: 'POST', body: { count: 2 } });
  pass('Generated variants for the mixed-content mockTest (T-009, reused as-is)');

  // --- Discoverability: teacher's "My tests" list shows it, correctly tagged --------
  const teacherTestList = await apiRequest<Array<{ id: string; title: string; testType: string }>>(
    '/api/teacher/tests',
    teacherToken,
  );
  const ownRow = teacherTestList.find((t) => t.id === test.id);
  assert(
    ownRow?.testType === 'mockTest',
    'Teacher\'s "My tests" list shows this test with testType: mockTest (T-045 minimal listing glue)',
    ownRow,
  );

  // --- Discoverability: student's self-practice picker lists it too, with testType --
  const student = await registerStudent('main');
  const practiceTests = await apiRequest<Array<{ id: string; title: string; testType: string }>>('/api/tests', student.token);
  const practiceRow = practiceTests.find((t) => t.id === test.id);
  assert(
    practiceRow?.testType === 'mockTest',
    'Student self-practice picker (GET /api/tests) lists the mockTest (not filtered out) with testType: mockTest for the "Mock Test" badge',
    practiceRow,
  );

  // --- Take the test end-to-end as a student ------------------------------------------
  const start = await apiRequest<{ attemptId: string; status: string }>(`/api/tests/${test.id}/practice`, student.token, {
    method: 'POST',
  });
  pass(`Student started self-practice -> attempt ${start.attemptId}`);

  const runtime = await apiRequest<AttemptDetail>(`/api/attempts/${start.attemptId}`, student.token);
  const runtimeReading = runtime.sections.find((s) => s.title === 'Reading');
  const runtimeListening = runtime.sections.find((s) => s.title === 'Listening');
  const runtimeObjective = runtime.sections.find((s) => s.title === 'Grammar & Vocabulary');
  const runtimeWriting = runtime.sections.find((s) => s.title === 'Writing');
  assert(
    runtimeReading?.passageText != null &&
      runtimeListening?.audioUrl != null &&
      runtimeObjective != null &&
      runtimeWriting?.questions.some((q) => q.type === 'essay'),
    'Take-test runtime (TakeTestPage.tsx via GET /api/attempts/:id, T-012) renders ALL FOUR content types from ONE attempt payload — no per-content-type gate, no separate mock-test-only runtime',
    { runtimeReading, runtimeListening, runtimeObjective, runtimeWriting },
  );
  if (speakingIncluded) {
    const runtimeSpeaking = runtime.sections.find((s) => s.title === 'Speaking');
    assert(
      runtimeSpeaking?.questions.some((q) => q.type === 'speaking' && q.allowedResponseSeconds === 30),
      '(Bonus) Take-test runtime also renders the Speaking section within the SAME mockTest attempt',
      runtimeSpeaking,
    );
  }

  // Answer every question. Objective ones answered CORRECTLY (so we can assert a 100%
  // auto-graded score); essay answered with real text; speaking (if present) submitted
  // via its own endpoint per T-052-054's per-question submission flow.
  for (const section of runtime.sections) {
    for (const question of section.questions) {
      if (question.type === 'essay') {
        await apiRequest(`/api/attempts/${start.attemptId}/answers/${question.id}`, student.token, {
          method: 'PUT',
          body: { textAnswer: 'My favorite animal is the fox because it is clever, quick, and lives near rivers.' },
        });
      } else if (question.type === 'speaking') {
        // T-064: the response window must be explicitly started (server-side timing
        // anchor) before a speaking-answer submission is accepted.
        await apiRequest(`/api/attempts/${start.attemptId}/questions/${question.id}/speaking-window/start`, student.token, {
          method: 'POST',
        });
        await apiRequest(`/api/attempts/${start.attemptId}/questions/${question.id}/speaking-answer`, student.token, {
          method: 'POST',
          body: { audioData: 'data:audio/webm;base64,AAAA', transcript: 'My morning routine is simple and calm.' },
        });
      } else {
        // multipleChoice/trueFalse/fillBlank: answer with the KNOWN correct value so the
        // auto-graded score is deterministic (100% of gradable questions).
        if (question.id === readingQuestionId || question.id === listeningQuestionId) {
          const correctChoice = question.choices.find((c) => c.text === 'Fox' || c.text === 'True')!;
          await apiRequest(`/api/attempts/${start.attemptId}/answers/${question.id}`, student.token, {
            method: 'PUT',
            body: { selectedChoiceId: correctChoice.id },
          });
        } else if (question.type === 'fillBlank') {
          await apiRequest(`/api/attempts/${start.attemptId}/answers/${question.id}`, student.token, {
            method: 'PUT',
            body: { textAnswer: 'boils' },
          });
        } else {
          const correctChoice = question.choices.find((c) => c.text === 'Fast')!;
          await apiRequest(`/api/attempts/${start.attemptId}/answers/${question.id}`, student.token, {
            method: 'PUT',
            body: { selectedChoiceId: correctChoice.id },
          });
        }
      }
    }
  }
  pass('Answered every question across all sections (Reading MC, Listening T/F, objective MC+fillBlank, essay, speaking-if-present)');

  const submitResult = await apiRequest<AttemptResult>(`/api/attempts/${start.attemptId}/submit`, student.token, {
    method: 'POST',
  });
  // 4 gradable objective questions regardless of whether Speaking was included (essay AND
  // speaking are both excluded from the auto-graded tally, per grading.ts/attemptView.ts).
  assert(
    submitResult.totalCount === 4,
    'Auto-graded totalCount = 4 (Reading MC + Listening T/F + objective MC + fillBlank) — essay (and speaking, if present) correctly EXCLUDED from the tally in a MIXED test, exactly like a single-content-type test (T-013/T-042/attempts.routes.ts)',
    submitResult,
  );
  assert(
    submitResult.correctCount === 4 && submitResult.scorePercent === 100,
    'All 4 gradable objective questions auto-graded correct -> scorePercent: 100 (grading correctly aggregates across mixed section types)',
    submitResult,
  );

  // --- Result view: essay awaiting grading, alongside the finished objective score ---
  const preGradeResult = await apiRequest<AttemptResult>(`/api/attempts/${start.attemptId}/result`, student.token);
  assert(
    preGradeResult.correctCount === 4 && preGradeResult.totalCount === 4 && preGradeResult.scorePercent === 100,
    'Result view shows the objective auto-graded score (4/4, 100%) immediately after submit',
    preGradeResult,
  );
  const essayResultRow = preGradeResult.questions.find((q) => q.type === 'essay')!;
  assert(
    essayResultRow.manualScore === null && essayResultRow.essayMaxScore === 20,
    'Result view ALSO shows the essay as awaiting manual grading (manualScore: null, essayMaxScore: 20) alongside the finished objective score — nothing broke by combining content types in one test',
    essayResultRow,
  );
  if (speakingIncluded) {
    const speakingResultRow = preGradeResult.questions.find((q) => q.type === 'speaking');
    assert(
      speakingResultRow != null && speakingResultRow.isCorrect === null,
      '(Bonus) Result view shows the Speaking answer too (AI-graded, isCorrect: null since it is never part of the objective tally)',
      speakingResultRow,
    );
  }

  // --- Teacher grades the essay; both views reflect the combined result -------------
  const gradeResponse = await apiRequest<{ manualScore: number; manualComment: string | null }>(
    `/api/teacher/attempts/${start.attemptId}/answers/${essayResultRow.questionId}/grade`,
    teacherToken,
    { method: 'PATCH', body: { score: 18, comment: 'Well-written and on topic.' } },
  );
  assert(gradeResponse.manualScore === 18, 'Teacher successfully grades the essay via the existing T-042 grading endpoint', gradeResponse);

  const postGradeStudentResult = await apiRequest<AttemptResult>(`/api/attempts/${start.attemptId}/result`, student.token);
  const gradedEssayRow = postGradeStudentResult.questions.find((q) => q.type === 'essay')!;
  assert(
    postGradeStudentResult.correctCount === 4 &&
      postGradeStudentResult.totalCount === 4 &&
      postGradeStudentResult.scorePercent === 100 &&
      gradedEssayRow.manualScore === 18 &&
      gradedEssayRow.manualComment === 'Well-written and on topic.',
    'FINAL CHECK: student\'s own result view shows the objective auto-graded score (4/4, 100%) PLUS the graded essay (18/20, comment) together, in ONE combined mockTest attempt — exactly like it would for either content type individually',
    postGradeStudentResult,
  );

  const teacherAttemptView = await apiRequest<AttemptResult>(`/api/teacher/attempts/${start.attemptId}`, teacherToken);
  const teacherEssayRow = teacherAttemptView.questions.find((q) => q.type === 'essay')!;
  assert(
    teacherAttemptView.correctCount === 4 && teacherAttemptView.scorePercent === 100 && teacherEssayRow.manualScore === 18,
    'FINAL CHECK: teacher\'s attempt-detail view shows the SAME combined picture (auto-graded score + manual essay grade)',
    teacherAttemptView,
  );

  console.log(`\n${passCount} check(s) passed, ${failCount} failed.`);
  console.log(`Speaking section included: ${speakingIncluded}`);
  if (failCount > 0) {
    process.exitCode = 1;
  } else {
    console.log('T-045 verification: ALL CHECKS PASSED.');
  }
}

main().catch((err) => {
  console.error('\n[verify-t045] FAILED:', err);
  process.exitCode = 1;
});
