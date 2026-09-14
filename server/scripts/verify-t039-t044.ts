/**
 * T-039..T-044 verification script — REAL REST + socket.io-client calls against an
 * already-running dev server + Postgres (same convention as `verify-realtime.ts` /
 * `verify-time-tracking.ts`). Per Velocity Mode (PROJECT_PLAN.md Section 8), this is the
 * primary Dev self-verification for this batch; a single Playwright pass separately
 * covers the end-to-end browser flow (authoring UI, live-session UI, anti-copy-paste DOM
 * events, tab-switch DOM events).
 *
 * Covers:
 *   T-039 Reading passage: a Section with passageText/passageImageUrl renders in the
 *     take-test runtime payload and grades exactly like any other objective section.
 *   T-040 Listening standalone: a self-practice attempt (`POST /api/tests/:testId/practice`)
 *     reports `sessionMode: 'selfPractice'` and exposes the section's audioUrl/maxPlayCount.
 *   T-041 Listening live broadcast: a teacher's `teacher:playAudio` socket event is
 *     relayed as `audio:play` to a joined student's socket, with the correct audioUrl —
 *     and REJECTED for a teacher who doesn't own the session.
 *   T-042 Essay + manual grading: an essay question is excluded from auto
 *     correctCount/totalCount, and a teacher's manual grade shows up in both the
 *     student's own result and the teacher's attempt-detail view.
 *   T-044 Tab-switch: recording increments count/log, is rejected after submit, and is
 *     visible on both the teacher's session-attempts list and attempt-detail view.
 *
 * Usage: start the dev server first (`npm run dev -w server` or the root `npm run dev`),
 * then `npm run verify:t039-t044 -w server`. Requires the seeded teacher account.
 */

import { io, type Socket } from 'socket.io-client';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000';
const SEED_TEACHER_EMAIL = process.env.SEED_TEACHER_EMAIL ?? 'teacher@example.com';
const SEED_TEACHER_PASSWORD = process.env.SEED_TEACHER_PASSWORD ?? 'teacher-dev-password123';
const SEED_TEACHER_2_EMAIL = process.env.SEED_TEACHER_2_EMAIL ?? 'teacher2@example.com';
const SEED_TEACHER_2_PASSWORD = process.env.SEED_TEACHER_2_PASSWORD ?? 'teacher2-dev-password123';

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

function connectSocket(token: string, label: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(API_BASE_URL, { auth: { token }, transports: ['websocket'] });
    const timeout = setTimeout(() => reject(new Error(`${label}: connect timed out`)), 8000);
    socket.on('connect', () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.on('connect_error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`${label}: connect_error: ${err.message}`));
    });
  });
}

function emitWithAck<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${event}: ack timed out`)), 5000);
    socket.emit(event, payload, (response: T) => {
      clearTimeout(timeout);
      resolve(response);
    });
  });
}

function waitForEvent<T>(socket: Socket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${event}: not received within ${timeoutMs}ms`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });
}

async function registerStudent(label: string): Promise<{ token: string; id: string }> {
  const res = await apiRequest<{ token: string; user: { id: string } }>('/api/auth/register', null, {
    method: 'POST',
    body: {
      email: `verify-t039-t044-${label}-${Date.now()}@example.com`,
      password: 'verify-pass-123',
      name: `T039-044 Student ${label}`,
    },
  });
  return { token: res.token, id: res.user.id };
}

interface AttemptDetail {
  id: string;
  sessionMode: 'live' | 'selfPractice';
  sections: Array<{
    id: string;
    title: string;
    passageText: string | null;
    passageImageUrl: string | null;
    audioUrl: string | null;
    maxPlayCount: number | null;
    questions: Array<{
      id: string;
      type: string;
      essayMaxScore: number | null;
      prompt: string;
      choices: Array<{ id: string; text: string }>;
    }>;
  }>;
}

async function main() {
  console.log(`[verify-t039-t044] Target: ${API_BASE_URL}\n`);

  const teacherLogin = await apiRequest<{ token: string }>('/api/auth/login', null, {
    method: 'POST',
    body: { email: SEED_TEACHER_EMAIL, password: SEED_TEACHER_PASSWORD },
  });
  const teacherToken = teacherLogin.token;
  pass('Logged in as seeded teacher');

  // --- Author a mock-ish test: Reading + Listening + Writing sections -----------------
  const test = await apiRequest<{ id: string }>('/api/teacher/tests', teacherToken, {
    method: 'POST',
    body: { title: `T-039..T-044 verify ${Date.now()}` },
  });

  const readingSection = await apiRequest<{ sections: Array<{ id: string }> }>(
    `/api/teacher/tests/${test.id}/sections`,
    teacherToken,
    { method: 'POST', body: { title: 'Reading' } },
  );
  const readingSectionId = readingSection.sections[0].id;
  const withPassage = await apiRequest<{ sections: Array<{ id: string; passageText: string | null; passageImageUrl: string | null }> }>(
    `/api/teacher/tests/${test.id}/sections/${readingSectionId}`,
    teacherToken,
    {
      method: 'PATCH',
      body: {
        title: 'Reading',
        passageText: 'The quick brown fox jumps over the lazy dog.',
        passageImageUrl: 'https://example.com/placeholder-assets/images/fox.png',
      },
    },
  );
  const savedReadingSection = withPassage.sections.find((s) => s.id === readingSectionId)!;
  assert(
    savedReadingSection.passageText === 'The quick brown fox jumps over the lazy dog.' &&
      savedReadingSection.passageImageUrl === 'https://example.com/placeholder-assets/images/fox.png',
    'T-039: Section persists passageText + passageImageUrl',
    savedReadingSection,
  );

  await apiRequest(`/api/teacher/tests/${test.id}/sections/${readingSectionId}/questions`, teacherToken, {
    method: 'POST',
    body: {
      type: 'multipleChoice',
      prompt: 'What animal jumps over the dog?',
      choices: [
        { text: 'Fox', isCorrect: true },
        { text: 'Cat', isCorrect: false },
      ],
    },
  });
  pass('T-039: Added a multipleChoice question to the Reading section (reuses existing grading)');

  const listeningSection = await apiRequest<{ sections: Array<{ id: string }> }>(
    `/api/teacher/tests/${test.id}/sections`,
    teacherToken,
    { method: 'POST', body: { title: 'Listening' } },
  );
  const listeningSectionId = listeningSection.sections[1].id;
  const withAudio = await apiRequest<{ sections: Array<{ id: string; audioUrl: string | null; maxPlayCount: number | null }> }>(
    `/api/teacher/tests/${test.id}/sections/${listeningSectionId}`,
    teacherToken,
    {
      method: 'PATCH',
      body: {
        title: 'Listening',
        audioUrl: 'https://example.com/placeholder-assets/audio/listening-clip.mp3',
        maxPlayCount: 2,
      },
    },
  );
  const savedListeningSection = withAudio.sections.find((s) => s.id === listeningSectionId)!;
  assert(
    savedListeningSection.audioUrl === 'https://example.com/placeholder-assets/audio/listening-clip.mp3' &&
      savedListeningSection.maxPlayCount === 2,
    'T-040/T-041: Section persists audioUrl + maxPlayCount',
    savedListeningSection,
  );

  await apiRequest(`/api/teacher/tests/${test.id}/sections/${listeningSectionId}/questions`, teacherToken, {
    method: 'POST',
    body: {
      type: 'trueFalse',
      prompt: 'The clip mentions a fox.',
      choices: [
        { text: 'True', isCorrect: true },
        { text: 'False', isCorrect: false },
      ],
    },
  });

  const writingSection = await apiRequest<{ sections: Array<{ id: string }> }>(
    `/api/teacher/tests/${test.id}/sections`,
    teacherToken,
    { method: 'POST', body: { title: 'Writing' } },
  );
  const writingSectionId = writingSection.sections[2].id;
  const withEssay = await apiRequest<{
    sections: Array<{ id: string; questions: Array<{ id: string; type: string; essayMaxScore: number | null }> }>;
  }>(`/api/teacher/tests/${test.id}/sections/${writingSectionId}/questions`, teacherToken, {
    method: 'POST',
    body: { type: 'essay', prompt: 'Describe your favorite animal in 2-3 sentences.', essayMaxScore: 20 },
  });
  const writingSectionAfter = withEssay.sections.find((s) => s.id === writingSectionId)!;
  const essayQuestion = writingSectionAfter.questions[0];
  assert(
    essayQuestion.type === 'essay' && essayQuestion.essayMaxScore === 20,
    'T-042: essay question created with essayMaxScore=20',
    essayQuestion,
  );

  await apiRequest(`/api/teacher/tests/${test.id}/variants`, teacherToken, {
    method: 'POST',
    body: { count: 2 },
  });
  pass('Generated 2 variants for the mixed test');

  // --- T-040: standalone self-practice ------------------------------------------------
  const practiceStudent = await registerStudent('practice');
  const practiceStart = await apiRequest<{ attemptId: string; sessionId: string; status: string }>(
    `/api/tests/${test.id}/practice`,
    practiceStudent.token,
    { method: 'POST' },
  );
  pass(`T-040: Student started self-practice -> attempt ${practiceStart.attemptId}`);

  const practiceAttempt = await apiRequest<AttemptDetail>(
    `/api/attempts/${practiceStart.attemptId}`,
    practiceStudent.token,
  );
  assert(
    practiceAttempt.sessionMode === 'selfPractice',
    'T-040: Standalone attempt reports sessionMode "selfPractice"',
    practiceAttempt.sessionMode,
  );
  const practiceListeningSection = practiceAttempt.sections.find((s) => s.title === 'Listening');
  assert(
    practiceListeningSection?.audioUrl === savedListeningSection.audioUrl &&
      practiceListeningSection?.maxPlayCount === 2,
    'T-040: Standalone runtime payload exposes the Listening section\'s audioUrl + maxPlayCount (client shows an enabled Play button in this mode)',
    practiceListeningSection,
  );
  const practiceReadingSection = practiceAttempt.sections.find((s) => s.title === 'Reading');
  assert(
    practiceReadingSection?.passageText === savedReadingSection.passageText,
    'T-039: Runtime payload includes the Reading passage text alongside its questions',
    practiceReadingSection,
  );

  // Idempotency: requesting practice again for the same test returns the SAME attempt.
  const practiceAgain = await apiRequest<{ attemptId: string }>(
    `/api/tests/${test.id}/practice`,
    practiceStudent.token,
    { method: 'POST' },
  );
  assert(
    practiceAgain.attemptId === practiceStart.attemptId,
    'T-040: Re-requesting self-practice for the same test returns the same attempt (idempotent, like a live join)',
    practiceAgain,
  );

  // --- T-041: teacher-broadcast synchronized playback, via a LIVE session ------------
  const liveStudent = await registerStudent('live');
  const session = await apiRequest<{ id: string; joinToken: string }>(
    `/api/teacher/tests/${test.id}/sessions`,
    teacherToken,
    { method: 'POST' },
  );
  const liveJoin = await apiRequest<{ attemptId: string }>(`/api/sessions/join/${session.joinToken}`, liveStudent.token, {
    method: 'POST',
  });
  const liveAttempt = await apiRequest<AttemptDetail>(`/api/attempts/${liveJoin.attemptId}`, liveStudent.token);
  assert(
    liveAttempt.sessionMode === 'live',
    'T-041: An attempt joined via the teacher QR/session flow reports sessionMode "live"',
    liveAttempt.sessionMode,
  );

  const teacherSocket = await connectSocket(teacherToken, 'teacher socket');
  const studentSocket = await connectSocket(liveStudent.token, 'student socket');
  pass('Teacher + student sockets connected');

  const studentJoinAck = await emitWithAck<{ ok: boolean }>(studentSocket, 'student:join', {
    sessionId: session.id,
  });
  assert(studentJoinAck.ok === true, 'Student joined the realtime session layer (joins studentRoom too)');

  const audioPlayPromise = waitForEvent<{ sectionId: string; audioUrl: string; playedAt: string }>(
    studentSocket,
    'audio:play',
  );
  const playAck = await emitWithAck<{ ok: boolean; error?: string }>(teacherSocket, 'teacher:playAudio', {
    sessionId: session.id,
    sectionId: listeningSectionId,
  });
  assert(playAck.ok === true, 'T-041: teacher:playAudio acked ok:true for the session-owning teacher', playAck);
  const audioPlayEvent = await audioPlayPromise;
  assert(
    audioPlayEvent.sectionId === listeningSectionId && audioPlayEvent.audioUrl === savedListeningSection.audioUrl,
    'T-041: Student socket received audio:play with the correct sectionId + audioUrl',
    audioPlayEvent,
  );

  // Ownership check: a DIFFERENT teacher cannot broadcast into this session.
  const teacher2Login = await apiRequest<{ token: string }>('/api/auth/login', null, {
    method: 'POST',
    body: { email: SEED_TEACHER_2_EMAIL, password: SEED_TEACHER_2_PASSWORD },
  });
  const otherTeacherSocket = await connectSocket(teacher2Login.token, 'other teacher socket');
  const otherTeacherPlayAck = await emitWithAck<{ ok: boolean }>(otherTeacherSocket, 'teacher:playAudio', {
    sessionId: session.id,
    sectionId: listeningSectionId,
  });
  assert(
    otherTeacherPlayAck.ok === false,
    'T-041: A different teacher cannot broadcast playback into this session (ownership enforced)',
    otherTeacherPlayAck,
  );
  otherTeacherSocket.disconnect();
  teacherSocket.disconnect();
  studentSocket.disconnect();

  // --- T-042: essay excluded from auto-grading; manual grading appears in results ----
  // Answer the objective questions correctly + the essay, for BOTH the practice and live
  // attempts, then submit the live one (used for grading below).
  const liveTestRuntime = await apiRequest<AttemptDetail>(`/api/attempts/${liveJoin.attemptId}`, liveStudent.token);
  for (const section of liveTestRuntime.sections) {
    for (const question of section.questions) {
      if (question.type === 'essay') {
        await apiRequest(`/api/attempts/${liveJoin.attemptId}/answers/${question.id}`, liveStudent.token, {
          method: 'PUT',
          body: { textAnswer: 'My favorite animal is the fox because it is clever and quick.' },
        });
      } else if (question.choices.length > 0) {
        // Correctness doesn't matter for this check, only that essay is excluded from
        // the objective tally — just pick the first (shuffled) choice.
        await apiRequest(`/api/attempts/${liveJoin.attemptId}/answers/${question.id}`, liveStudent.token, {
          method: 'PUT',
          body: { selectedChoiceId: question.choices[0].id },
        });
      }
    }
  }
  const submitResult = await apiRequest<{ totalCount: number; correctCount: number }>(
    `/api/attempts/${liveJoin.attemptId}/submit`,
    liveStudent.token,
    { method: 'POST' },
  );
  assert(
    submitResult.totalCount === 2,
    'T-042: totalCount excludes the essay question (2 objective questions: Reading MC + Listening T/F)',
    submitResult,
  );
  pass(`Submitted live attempt: ${submitResult.correctCount}/${submitResult.totalCount} objective questions correct`);

  const preGradeResult = await apiRequest<{ questions: Array<{ questionId: string; type: string; manualScore: number | null; essayMaxScore: number | null }> }>(
    `/api/attempts/${liveJoin.attemptId}/result`,
    liveStudent.token,
  );
  const essayResultRow = preGradeResult.questions.find((q) => q.type === 'essay')!;
  assert(
    essayResultRow.manualScore === null && essayResultRow.essayMaxScore === 20,
    'T-042: Before grading, the essay shows manualScore: null alongside essayMaxScore: 20',
    essayResultRow,
  );

  const gradeResponse = await apiRequest<{ manualScore: number; manualComment: string | null }>(
    `/api/teacher/attempts/${liveJoin.attemptId}/answers/${essayResultRow.questionId}/grade`,
    teacherToken,
    { method: 'PATCH', body: { score: 17, comment: 'Nice, clear answer.' } },
  );
  assert(
    gradeResponse.manualScore === 17 && gradeResponse.manualComment === 'Nice, clear answer.',
    'T-042: Teacher grade endpoint returns the saved score + comment',
    gradeResponse,
  );

  const postGradeStudentResult = await apiRequest<{ questions: Array<{ type: string; manualScore: number | null; manualComment: string | null }> }>(
    `/api/attempts/${liveJoin.attemptId}/result`,
    liveStudent.token,
  );
  const gradedRowStudent = postGradeStudentResult.questions.find((q) => q.type === 'essay')!;
  assert(
    gradedRowStudent.manualScore === 17 && gradedRowStudent.manualComment === 'Nice, clear answer.',
    'T-042: The manual grade appears in the STUDENT\'s own result view, alongside auto-graded questions',
    gradedRowStudent,
  );

  const teacherViewResult = await apiRequest<{ questions: Array<{ type: string; manualScore: number | null }> }>(
    `/api/teacher/attempts/${liveJoin.attemptId}`,
    teacherToken,
  );
  const gradedRowTeacher = teacherViewResult.questions.find((q) => q.type === 'essay')!;
  assert(
    gradedRowTeacher.manualScore === 17,
    'T-042: The manual grade also appears in the TEACHER\'s attempt-detail view',
    gradedRowTeacher,
  );

  // Score out of range is rejected.
  await apiRequest(`/api/teacher/attempts/${liveJoin.attemptId}/answers/${essayResultRow.questionId}/grade`, teacherToken, {
    method: 'PATCH',
    body: { score: 999 },
  })
    .then(() => fail('T-042: grading with an out-of-range score should have been rejected'))
    .catch((err: Error) => {
      assert(err.message.includes('400'), 'T-042: Out-of-range essay score is rejected with 400', err.message);
    });

  // --- T-044: global tab-switch / exit detection --------------------------------------
  const tabSwitchStudent = await registerStudent('tabswitch');
  const tabSwitchJoin = await apiRequest<{ attemptId: string }>(`/api/sessions/join/${session.joinToken}`, tabSwitchStudent.token, {
    method: 'POST',
  });
  const first = await apiRequest<{ tabSwitchCount: number }>(`/api/attempts/${tabSwitchJoin.attemptId}/tab-switch`, tabSwitchStudent.token, {
    method: 'POST',
  });
  assert(first.tabSwitchCount === 1, 'T-044: First tab-switch call reports count 1', first);
  const second = await apiRequest<{ tabSwitchCount: number }>(`/api/attempts/${tabSwitchJoin.attemptId}/tab-switch`, tabSwitchStudent.token, {
    method: 'POST',
  });
  assert(second.tabSwitchCount === 2, 'T-044: Second tab-switch call reports count 2', second);

  const sessionAttemptsList = await apiRequest<Array<{ attemptId: string; tabSwitchCount: number }>>(
    `/api/teacher/sessions/${session.id}/attempts`,
    teacherToken,
  );
  const tabSwitchRow = sessionAttemptsList.find((a) => a.attemptId === tabSwitchJoin.attemptId);
  assert(
    tabSwitchRow?.tabSwitchCount === 2,
    'T-044: tabSwitchCount=2 is visible on the teacher\'s session-attempts list',
    tabSwitchRow,
  );

  await apiRequest(`/api/attempts/${tabSwitchJoin.attemptId}/submit`, tabSwitchStudent.token, { method: 'POST' });
  await apiRequest(`/api/attempts/${tabSwitchJoin.attemptId}/tab-switch`, tabSwitchStudent.token, { method: 'POST' })
    .then(() => fail('T-044: recording a tab-switch after submit should have been rejected (409)'))
    .catch((err: Error) => {
      assert(err.message.includes('409'), 'T-044: Tab-switch after submit is rejected with 409', err.message);
    });

  const tabSwitchAttemptDetail = await apiRequest<{ tabSwitchCount: number; tabSwitchLog: string[] }>(
    `/api/teacher/attempts/${tabSwitchJoin.attemptId}`,
    teacherToken,
  );
  assert(
    tabSwitchAttemptDetail.tabSwitchCount === 2 && tabSwitchAttemptDetail.tabSwitchLog.length === 2,
    'T-044: Teacher\'s attempt-detail view shows tabSwitchCount + full tabSwitchLog',
    tabSwitchAttemptDetail,
  );

  console.log(`\n${passCount} check(s) passed, ${failCount} failed.`);
  if (failCount > 0) {
    process.exitCode = 1;
  } else {
    console.log('T-039..T-044 verification: ALL CHECKS PASSED.');
  }
}

main().catch((err) => {
  console.error('\n[verify-t039-t044] FAILED:', err);
  process.exitCode = 1;
});
