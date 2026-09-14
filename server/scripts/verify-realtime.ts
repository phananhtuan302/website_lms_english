/**
 * T-015 realtime verification script — a REAL `socket.io-client` end-to-end check, not
 * just code inspection (per T-015's acceptance criteria). Exercises the whole stack
 * against an already-running dev server + Postgres:
 *
 *   1. Logs in as the seeded teacher and registers a fresh throwaway student (REST).
 *   2. Creates a test, generates a variant, starts a session, and joins it as the
 *      student (REST) — this is the same real join flow T-011 built.
 *   3. Connects two real `socket.io-client` sockets (teacher + student), authenticated
 *      via the JWT handshake exactly like a real browser client would be.
 *   4. Verifies `teacher:join` (ownership-checked room join), `student:join`, and that a
 *      `student:progress` event sent by the student socket is relayed to the teacher's
 *      socket — and ONLY the teacher's socket.
 *   5. Disconnects and reconnects the student socket THREE times, re-joining and sending
 *      progress after each reconnect, and asserts: the server never crashes (a REST
 *      health check still responds), progress keeps being relayed correctly after every
 *      reconnect, and a fresh `teacher:join` afterward reports exactly ONE entry for
 *      this student (never duplicated).
 *
 * Usage: start the dev server first (`npm run dev:server` from the repo root, or
 * `npm run dev -w server`), then in another terminal: `npm run verify:realtime -w server`.
 * Requires the same Postgres DB the dev server is using (so the seeded teacher account
 * from `prisma/seed.ts` exists) — run `npm run seed -w server` first if you haven't.
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

// --- Small REST helper, same contract as the client's apiClient.ts -------------------

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

// --- Socket helpers --------------------------------------------------------------------

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

function waitForEvent<T>(
  socket: Socket,
  event: string,
  predicate: (payload: T) => boolean,
  timeoutMs = 5000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`${event}: matching event not received within ${timeoutMs}ms`));
    }, timeoutMs);
    function handler(payload: T) {
      if (predicate(payload)) {
        clearTimeout(timeout);
        socket.off(event, handler);
        resolve(payload);
      }
    }
    socket.on(event, handler);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface StudentProgress {
  studentId: string;
  studentName: string;
  attemptId: string;
  currentQuestionIndex: number;
  answeredCount: number;
  updatedAt: string;
}

async function main() {
  console.log(`[verify-realtime] Target: ${API_BASE_URL}\n`);

  // --- 1. REST setup: teacher login, fresh student, test + variant + session + join ---
  console.log('Setting up fixtures via REST...');

  const teacherLogin = await apiRequest<{ token: string; user: { id: string } }>(
    '/api/auth/login',
    null,
    { method: 'POST', body: { email: SEED_TEACHER_EMAIL, password: SEED_TEACHER_PASSWORD } },
  );
  const teacherToken = teacherLogin.token;
  pass('Logged in as seeded teacher');

  const studentEmail = `realtime-verify-${Date.now()}@example.com`;
  const studentRegister = await apiRequest<{ token: string; user: { id: string; name: string } }>(
    '/api/auth/register',
    null,
    {
      method: 'POST',
      body: { email: studentEmail, password: 'verify-pass-123', name: 'Realtime Verify Student' },
    },
  );
  const studentToken = studentRegister.token;
  const studentId = studentRegister.user.id;
  pass(`Registered throwaway student ${studentEmail}`);

  const test = await apiRequest<{ id: string }>('/api/teacher/tests', teacherToken, {
    method: 'POST',
    body: { title: `T-015 realtime verify ${Date.now()}` },
  });
  const withSection = await apiRequest<{ sections: { id: string }[] }>(
    `/api/teacher/tests/${test.id}/sections`,
    teacherToken,
    { method: 'POST', body: { title: 'Section 1' } },
  );
  const sectionId = withSection.sections[0].id;
  await apiRequest(`/api/teacher/tests/${test.id}/sections/${sectionId}/questions`, teacherToken, {
    method: 'POST',
    body: {
      type: 'trueFalse',
      prompt: 'Realtime verification question.',
      choices: [
        { text: 'True', isCorrect: true },
        { text: 'False', isCorrect: false },
      ],
    },
  });
  await apiRequest(`/api/teacher/tests/${test.id}/variants`, teacherToken, {
    method: 'POST',
    body: { count: 1 },
  });
  pass('Created a test with 1 section/question and generated a variant');

  const session = await apiRequest<{ id: string; joinToken: string }>(
    `/api/teacher/tests/${test.id}/sessions`,
    teacherToken,
    { method: 'POST' },
  );
  const sessionId = session.id;
  pass(`Started session ${sessionId}`);

  const joinResult = await apiRequest<{ attemptId: string }>(
    `/api/sessions/join/${session.joinToken}`,
    studentToken,
    { method: 'POST' },
  );
  pass(`Student joined session -> attempt ${joinResult.attemptId}`);

  // --- 2. Socket.IO connections --------------------------------------------------------
  console.log('\nConnecting sockets...');
  const teacherSocket = await connectSocket(teacherToken, 'teacher socket');
  pass('Teacher socket connected (JWT handshake accepted)');

  let studentSocket = await connectSocket(studentToken, 'student socket');
  pass('Student socket connected (JWT handshake accepted)');

  // --- 3. teacher:join / student:join + basic relay ------------------------------------
  console.log('\nVerifying room join + relay...');

  const teacherJoinAck = await emitWithAck<{ ok: boolean; students?: StudentProgress[] }>(
    teacherSocket,
    'teacher:join',
    { sessionId },
  );
  assert(teacherJoinAck.ok === true, 'teacher:join acked ok:true for the session owner');
  assert(
    Array.isArray(teacherJoinAck.students) && teacherJoinAck.students.length === 0,
    'teacher:join initial students list is empty (student has not joined the socket layer yet)',
    teacherJoinAck,
  );

  // Ownership check: a teacher may NOT monitor a session they don't own. Log in as the
  // seeded second teacher fixture (prisma/seed.ts) and confirm they're rejected.
  const teacher2Login = await apiRequest<{ token: string }>('/api/auth/login', null, {
    method: 'POST',
    body: {
      email: process.env.SEED_TEACHER_2_EMAIL ?? 'teacher2@example.com',
      password: process.env.SEED_TEACHER_2_PASSWORD ?? 'teacher2-dev-password123',
    },
  });
  const otherTeacherSocket = await connectSocket(teacher2Login.token, 'other teacher socket');
  const otherTeacherAck = await emitWithAck<{ ok: boolean; error?: string }>(
    otherTeacherSocket,
    'teacher:join',
    { sessionId },
  );
  assert(
    otherTeacherAck.ok === false,
    "A different teacher cannot join this session's monitor room (ownership enforced server-side)",
    otherTeacherAck,
  );
  otherTeacherSocket.disconnect();

  const studentJoinAck = await emitWithAck<{ ok: boolean }>(studentSocket, 'student:join', {
    sessionId,
  });
  assert(studentJoinAck.ok === true, 'student:join acked ok:true');

  // Student join should have already pushed an initial progress snapshot into the room —
  // capture it via a fresh teacher:join before testing the live-update path below.
  const afterJoinAck = await emitWithAck<{ ok: boolean; students: StudentProgress[] }>(
    teacherSocket,
    'teacher:join',
    { sessionId },
  );
  assert(
    afterJoinAck.students.length === 1 && afterJoinAck.students[0].studentId === studentId,
    'Teacher sees exactly one student entry immediately after student:join',
    afterJoinAck,
  );

  const firstProgressPromise = waitForEvent<StudentProgress>(
    teacherSocket,
    'student:progress',
    (p) => p.studentId === studentId && p.currentQuestionIndex === 1,
  );
  const progressAck = await emitWithAck<{ ok: boolean }>(studentSocket, 'student:progress', {
    currentQuestionIndex: 1,
    answeredCount: 1,
  });
  assert(progressAck.ok === true, 'student:progress acked ok:true');
  const firstProgress = await firstProgressPromise;
  assert(
    firstProgress.answeredCount === 1 && firstProgress.attemptId === joinResult.attemptId,
    'Teacher received the student:progress event with the correct payload',
    firstProgress,
  );

  // --- 4. Disconnect/reconnect the student socket a few times, mid-"test" -------------
  console.log('\nVerifying disconnect/reconnect does not duplicate or crash...');

  for (let i = 1; i <= 3; i += 1) {
    studentSocket.disconnect();
    await sleep(150);

    studentSocket = await connectSocket(studentToken, `student socket (reconnect #${i})`);
    pass(`Reconnected student socket, attempt #${i}`);

    const rejoinAck = await emitWithAck<{ ok: boolean }>(studentSocket, 'student:join', {
      sessionId,
    });
    assert(rejoinAck.ok === true, `student:join re-acked ok:true after reconnect #${i}`);

    const expectedIndex = 1 + i;
    const reconnectProgressPromise = waitForEvent<StudentProgress>(
      teacherSocket,
      'student:progress',
      (p) => p.studentId === studentId && p.currentQuestionIndex === expectedIndex,
    );
    await emitWithAck(studentSocket, 'student:progress', {
      currentQuestionIndex: expectedIndex,
      answeredCount: expectedIndex,
    });
    const reconnectProgress = await reconnectProgressPromise;
    assert(
      reconnectProgress.currentQuestionIndex === expectedIndex,
      `Progress after reconnect #${i} relayed correctly to teacher`,
      reconnectProgress,
    );
  }

  // Health check — proves the server process is still alive and responsive, not crashed
  // by any of the disconnects above.
  const health = await apiRequest<{ status: string }>('/health', null);
  assert(
    health.status === 'ok',
    'Server health check still responds after reconnect cycles',
    health,
  );

  // Final teacher:join — must show exactly ONE entry for this student (never duplicated
  // across the 3 disconnect/reconnect cycles), with the LATEST progress values.
  const finalAck = await emitWithAck<{ ok: boolean; students: StudentProgress[] }>(
    teacherSocket,
    'teacher:join',
    { sessionId },
  );
  const thisStudentEntries = finalAck.students.filter((s) => s.studentId === studentId);
  assert(
    thisStudentEntries.length === 1,
    'Exactly one progress entry exists for the student after 3 disconnect/reconnect cycles (no duplication)',
    finalAck.students,
  );
  assert(
    thisStudentEntries[0].currentQuestionIndex === 4 && thisStudentEntries[0].answeredCount === 4,
    'The single entry reflects the latest progress, not a stale/duplicated one',
    thisStudentEntries[0],
  );

  // --- 5. Negative case: a student who never joined this session cannot send progress -
  const strangerRegister = await apiRequest<{ token: string }>('/api/auth/register', null, {
    method: 'POST',
    body: {
      email: `realtime-verify-stranger-${Date.now()}@example.com`,
      password: 'verify-pass-123',
      name: 'Realtime Verify Stranger',
    },
  });
  const strangerSocket = await connectSocket(strangerRegister.token, 'stranger socket');
  const strangerJoinAck = await emitWithAck<{ ok: boolean }>(strangerSocket, 'student:join', {
    sessionId,
  });
  assert(
    strangerJoinAck.ok === false,
    'A student who never joined this session via REST cannot register progress for it',
    strangerJoinAck,
  );
  strangerSocket.disconnect();

  // --- Cleanup ---------------------------------------------------------------------------
  teacherSocket.disconnect();
  studentSocket.disconnect();
  await apiRequest(`/api/teacher/sessions/${sessionId}/close`, teacherToken, { method: 'POST' });
  console.log('\nClosed the verification session; sockets disconnected.');

  console.log(`\n${passCount} check(s) passed, ${failCount} failed.`);
  if (failCount > 0) {
    process.exitCode = 1;
  } else {
    console.log('T-015 realtime verification: ALL CHECKS PASSED.');
  }
}

main().catch((err) => {
  console.error('\n[verify-realtime] FAILED:', err);
  process.exitCode = 1;
});
