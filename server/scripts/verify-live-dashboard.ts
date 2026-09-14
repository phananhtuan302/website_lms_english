/**
 * T-016 live-monitoring-dashboard verification script — a REAL `socket.io-client`
 * end-to-end check (same convention as `verify-realtime.ts`, T-015's script), run
 * against an already-running dev server + Postgres. Focuses on exactly the acceptance
 * criteria that go beyond what T-015 already proved:
 *
 *   1. Opening the teacher's live monitor BEFORE any student has joined shows an empty
 *      (not erroring) snapshot.
 *   2. A student progresses through several questions BEFORE any teacher dashboard is
 *      open, then a BRAND NEW teacher socket connects and calls `teacher:join` for the
 *      FIRST time — it must show the student's CURRENT state immediately (not zero,
 *      not blank), because `teacher:join`'s ack includes the current in-memory
 *      snapshot, not just future deltas. This is the literal "opening the dashboard
 *      mid-session shows current state" acceptance criterion.
 *   3. The snapshot's `totalQuestions` field (added in T-016) is correct.
 *   4. Live updates: further `student:progress` events are relayed to the already-open
 *      teacher socket without a refresh.
 *   5. Closing the session (`POST /api/teacher/sessions/:sessionId/close`):
 *        a. pushes a `session:closed` event to the already-connected teacher socket
 *           immediately (no polling needed to notice),
 *        b. a further `student:progress` emitted by the student socket afterward is
 *           NOT relayed to the teacher room (asserted via a timeout — no event arrives),
 *        c. a FRESH `teacher:join` call after close still succeeds (does not error out)
 *           and reports `sessionStatus: 'closed'` plus the final snapshot.
 *
 * Usage: start the dev server first (`npm run dev:server` from the repo root), then
 * `npm run verify:live-dashboard -w server`. Requires the same seeded teacher account
 * as `verify-realtime.ts`.
 */

import { io, type Socket } from 'socket.io-client';

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
  if (condition) {
    pass(label);
  } else {
    fail(label, detail);
  }
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

function waitForEvent<T>(socket: Socket, event: string, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`${event}: not received within ${timeoutMs}ms`));
    }, timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });
}

/** Asserts an event does NOT arrive within the window — used to prove a closed
 * session's teacher room stops receiving `student:progress` relays. */
function assertNoEvent(socket: Socket, event: string, timeoutMs = 1500): Promise<void> {
  return new Promise((resolve, reject) => {
    const handler = () => {
      clearTimeout(timeout);
      reject(new Error(`${event}: unexpectedly received an event after the session was closed`));
    };
    const timeout = setTimeout(() => {
      socket.off(event, handler);
      resolve();
    }, timeoutMs);
    socket.once(event, handler);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface LiveStudentProgress {
  studentId: string;
  studentName: string;
  attemptId: string;
  currentQuestionIndex: number;
  answeredCount: number;
  totalQuestions: number;
  updatedAt: string;
}

interface TeacherJoinAck {
  ok: boolean;
  error?: string;
  students?: LiveStudentProgress[];
  sessionStatus?: 'active' | 'closed';
}

async function main() {
  console.log(`[verify-live-dashboard] Target: ${API_BASE_URL}\n`);

  // --- 1. REST fixtures: teacher, test with 3 questions, student, session ------------
  console.log('Setting up fixtures via REST...');

  const teacherLogin = await apiRequest<{ token: string }>('/api/auth/login', null, {
    method: 'POST',
    body: { email: SEED_TEACHER_EMAIL, password: SEED_TEACHER_PASSWORD },
  });
  const teacherToken = teacherLogin.token;
  pass('Logged in as seeded teacher');

  const studentEmail = `live-dash-verify-${Date.now()}@example.com`;
  const studentRegister = await apiRequest<{ token: string; user: { id: string } }>(
    '/api/auth/register',
    null,
    { method: 'POST', body: { email: studentEmail, password: 'verify-pass-123', name: 'Live Dash Student' } },
  );
  const studentToken = studentRegister.token;
  const studentId = studentRegister.user.id;
  pass(`Registered throwaway student ${studentEmail}`);

  const test = await apiRequest<{ id: string }>('/api/teacher/tests', teacherToken, {
    method: 'POST',
    body: { title: `T-016 live dashboard verify ${Date.now()}` },
  });
  const withSection = await apiRequest<{ sections: { id: string }[] }>(
    `/api/teacher/tests/${test.id}/sections`,
    teacherToken,
    { method: 'POST', body: { title: 'Section 1' } },
  );
  const sectionId = withSection.sections[0].id;
  // 3 questions -> totalQuestions must read 3 in the live snapshot below.
  for (let i = 0; i < 3; i += 1) {
    await apiRequest(`/api/teacher/tests/${test.id}/sections/${sectionId}/questions`, teacherToken, {
      method: 'POST',
      body: {
        type: 'trueFalse',
        prompt: `Question ${i + 1}`,
        choices: [
          { text: 'True', isCorrect: true },
          { text: 'False', isCorrect: false },
        ],
      },
    });
  }
  await apiRequest(`/api/teacher/tests/${test.id}/variants`, teacherToken, {
    method: 'POST',
    body: { count: 1 },
  });
  pass('Created a test with 3 questions and generated a variant');

  const session = await apiRequest<{ id: string; joinToken: string }>(
    `/api/teacher/tests/${test.id}/sessions`,
    teacherToken,
    { method: 'POST' },
  );
  const sessionId = session.id;
  pass(`Started session ${sessionId}`);

  // --- 2. Teacher opens the dashboard BEFORE any student joins -----------------------
  console.log('\nOpening the live dashboard BEFORE any student joins...');
  const earlyTeacherSocket = await connectSocket(teacherToken, 'early teacher socket');
  const earlyAck = await emitWithAck<TeacherJoinAck>(earlyTeacherSocket, 'teacher:join', { sessionId });
  assert(earlyAck.ok === true, 'teacher:join acked ok:true before any student joins');
  assert(
    Array.isArray(earlyAck.students) && earlyAck.students.length === 0,
    'Dashboard opened before any student joins shows an empty (not erroring) snapshot',
    earlyAck,
  );
  assert(earlyAck.sessionStatus === 'active', 'Fresh session reports sessionStatus: active', earlyAck);
  earlyTeacherSocket.disconnect(); // Simulates the teacher closing the tab.

  // --- 3. Student joins + progresses WHILE NO teacher dashboard is open --------------
  console.log('\nStudent joining + progressing with no teacher dashboard open...');
  await apiRequest(`/api/sessions/join/${session.joinToken}`, studentToken, { method: 'POST' });
  const studentSocket = await connectSocket(studentToken, 'student socket');
  const studentJoinAck = await emitWithAck<{ ok: boolean }>(studentSocket, 'student:join', { sessionId });
  assert(studentJoinAck.ok === true, 'student:join acked ok:true');

  await emitWithAck(studentSocket, 'student:progress', { currentQuestionIndex: 0, answeredCount: 1 });
  await emitWithAck(studentSocket, 'student:progress', { currentQuestionIndex: 1, answeredCount: 2 });
  const progressAck = await emitWithAck<{ ok: boolean }>(studentSocket, 'student:progress', {
    currentQuestionIndex: 2,
    answeredCount: 3,
  });
  assert(progressAck.ok === true, 'Student progressed through 3 questions with no dashboard watching');

  // --- 4. A BRAND NEW teacher socket opens the dashboard for the FIRST time NOW ------
  console.log('\nOpening the live dashboard AFTER the student already progressed...');
  const midSessionTeacherSocket = await connectSocket(teacherToken, 'mid-session teacher socket');
  const midSessionAck = await emitWithAck<TeacherJoinAck>(midSessionTeacherSocket, 'teacher:join', {
    sessionId,
  });
  assert(midSessionAck.ok === true, 'teacher:join acked ok:true when opened mid-session');
  const snapshotEntry = (midSessionAck.students ?? []).find((s) => s.studentId === studentId);
  assert(
    snapshotEntry !== undefined,
    'Mid-session teacher:join snapshot includes the student who already progressed',
    midSessionAck.students,
  );
  assert(
    snapshotEntry!.currentQuestionIndex === 2 && snapshotEntry!.answeredCount === 3,
    'Snapshot reflects CURRENT state immediately (question index 2, 3 answered) — not zero/blank',
    snapshotEntry,
  );
  assert(
    snapshotEntry!.totalQuestions === 3,
    'Snapshot correctly reports totalQuestions for the test (3)',
    snapshotEntry,
  );

  // --- 5. Live update while the dashboard IS open -------------------------------------
  console.log('\nVerifying a further live update reaches the open dashboard...');
  const liveUpdatePromise = waitForEvent<LiveStudentProgress>(midSessionTeacherSocket, 'student:progress');
  await emitWithAck(studentSocket, 'student:progress', { currentQuestionIndex: 2, answeredCount: 3 });
  const liveUpdate = await liveUpdatePromise;
  assert(
    liveUpdate.studentId === studentId && liveUpdate.totalQuestions === 3,
    'Open dashboard receives a live student:progress update without refreshing',
    liveUpdate,
  );

  // --- 6. Close the session -----------------------------------------------------------
  console.log('\nClosing the session and verifying live updates stop...');
  const closedEventPromise = waitForEvent<{ sessionId: string }>(midSessionTeacherSocket, 'session:closed');
  await apiRequest(`/api/teacher/sessions/${sessionId}/close`, teacherToken, { method: 'POST' });
  const closedEvent = await closedEventPromise;
  assert(
    closedEvent.sessionId === sessionId,
    'An already-open dashboard receives a session:closed event immediately on close',
    closedEvent,
  );

  // A further student:progress after close must NOT be relayed to the teacher room.
  const noFurtherUpdates = assertNoEvent(midSessionTeacherSocket, 'student:progress');
  await sleep(100); // Let the close settle server-side before the student emits again.
  const postCloseAck = await emitWithAck<{ ok: boolean }>(studentSocket, 'student:progress', {
    currentQuestionIndex: 2,
    answeredCount: 3,
  });
  assert(postCloseAck.ok === true, 'Student socket does not error/crash sending progress after close');
  await noFurtherUpdates;
  pass('No further student:progress relay reached the teacher dashboard after the session closed');

  // A fresh teacher:join after close must not error and must report the final snapshot.
  const afterCloseAck = await emitWithAck<TeacherJoinAck>(midSessionTeacherSocket, 'teacher:join', {
    sessionId,
  });
  assert(afterCloseAck.ok === true, 'teacher:join after close does not error out (reconnect-safe)');
  assert(
    afterCloseAck.sessionStatus === 'closed',
    'teacher:join after close reports sessionStatus: closed',
    afterCloseAck,
  );
  const finalEntry = (afterCloseAck.students ?? []).find((s) => s.studentId === studentId);
  assert(
    finalEntry !== undefined && finalEntry.currentQuestionIndex === 2,
    'teacher:join after close still returns the final known snapshot',
    finalEntry,
  );

  // --- Cleanup -------------------------------------------------------------------------
  studentSocket.disconnect();
  midSessionTeacherSocket.disconnect();

  console.log(`\n${passCount} check(s) passed, ${failCount} failed.`);
  if (failCount > 0) {
    process.exitCode = 1;
  } else {
    console.log('T-016 live-dashboard verification: ALL CHECKS PASSED.');
  }
}

main().catch((err) => {
  console.error('\n[verify-live-dashboard] FAILED:', err);
  process.exitCode = 1;
});
