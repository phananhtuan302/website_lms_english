/**
 * Realtime session infrastructure (T-015): Socket.IO wiring for live in-class
 * monitoring. This task is pure infrastructure — the teacher-facing dashboard UI is
 * T-016; this module only has to prove the plumbing (auth, room membership, event
 * relay, reconnect-safety) works end to end. Verified with a real `socket.io-client`
 * script — see `server/scripts/verify-realtime.ts` (`npm run verify:realtime -w server`).
 *
 * Design:
 * - Every socket is authenticated the same way REST is (T-005's JWT): the client sends
 *   the token via `socket.handshake.auth.token`, verified here through the existing
 *   `verifyToken` — no separate realtime auth scheme, no re-implementing JWT checks.
 * - One Socket.IO room per active `TestSession`: `teacherRoom(sessionId)`. Only teacher
 *   sockets that own that session's test may join it — ownership is re-checked from the
 *   DB on every join, exactly like every REST route (`requireOwnedTest`'s pattern),
 *   never trusting a client-asserted id.
 * - A student does NOT join that room. If it did, `io.to(room).emit(...)` would leak one
 *   student's progress to every other student in the same room. Instead, `student:join`
 *   registers the socket against an in-memory per-session progress map keyed by
 *   `studentId`, and `student:progress` updates that map and re-emits ONLY into the
 *   teacher room — so progress is always relayed teacher-ward, never broadcast
 *   student-to-student.
 * - Keying the progress map by `studentId` (not socket id) is what makes a disconnect +
 *   reconnect an in-place overwrite of the same entry rather than a second entry — the
 *   acceptance criteria's "does not duplicate them" requirement. Socket.IO itself already
 *   removes a dead socket from every room it was in on disconnect, so there is no stale
 *   room-membership state to clean up either.
 * - In-memory only, no DB writes: this is inherently live/ephemeral data ("what is this
 *   student looking at right now"). The student's actual answers are still persisted via
 *   the existing REST autosave (T-012) — this module never touches `Answer` rows.
 *   Module-level `Map`s are fine because this app runs as a single Node process (no
 *   horizontal scaling / no Redis adapter exists or is needed for this local-dev-only
 *   product per TECH_STACK.md's deployment note).
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';
import type { AuthTokenPayload, LiveStudentProgressDTO } from '@platform/shared';
import { verifyToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';

/** Kept as a local alias (rather than renaming every usage below) — the shape now lives
 * in `@platform/shared` as `LiveStudentProgressDTO` (T-016) so the client's live
 * dashboard shares the exact same type instead of redeclaring it. */
export type StudentProgress = LiveStudentProgressDTO;

type AckResponse = { ok: true; [key: string]: unknown } | { ok: false; error: string };
type Ack = (response: AckResponse) => void;

function isAck(value: unknown): value is Ack {
  return typeof value === 'function';
}

/** sessionId -> studentId -> latest known progress. Keyed by studentId (never socket
 * id) so a reconnect overwrites the existing entry instead of adding a second one. */
const sessionProgress = new Map<string, Map<string, StudentProgress>>();

/** Sessions that have been closed (T-016), via either close path in
 * `teacherSessions.routes.ts` (`markSessionClosed` below). Checked before relaying any
 * further `student:progress` update into a teacher room — "closing/finishing the
 * session stops further live updates" per T-016's acceptance criteria. In-memory only,
 * same single-process assumption as `sessionProgress` above (see this module's top doc
 * comment); never cleared, but bounded by the number of sessions ever closed in one
 * server process lifetime, which is fine for this local-dev-only product. */
const closedSessionIds = new Set<string>();

/** Set once by `attachSessionRealtime` at server startup so `markSessionClosed` (called
 * from the REST session-close routes, a different module) can push a `session:closed`
 * event to any teacher dashboard that already has the room open — without that module
 * needing its own reference to `io`. */
let ioRef: SocketIOServer | null = null;

export function teacherRoom(sessionId: string): string {
  return `teacher:${sessionId}`;
}

/**
 * Marks a session closed (T-016): called from `teacherSessions.routes.ts` on BOTH paths
 * that stop a session accepting joins (explicit `POST /sessions/:sessionId/close`, and
 * starting a new session auto-closing the test's previous active one) — same two paths
 * documented in that file's module comment. From this point on, `student:progress` /
 * `student:join` for this session update the in-memory snapshot (so a teacher opening
 * the dashboard for the first time after close still sees the final state) but no longer
 * relay into the teacher room, and a `session:closed` event is pushed immediately to
 * anyone already watching so an open dashboard doesn't have to poll to notice.
 */
export function markSessionClosed(sessionId: string): void {
  closedSessionIds.add(sessionId);
  ioRef?.to(teacherRoom(sessionId)).emit('session:closed', { sessionId });
}

function getOrCreateSessionMap(sessionId: string): Map<string, StudentProgress> {
  let map = sessionProgress.get(sessionId);
  if (!map) {
    map = new Map();
    sessionProgress.set(sessionId, map);
  }
  return map;
}

/** Exposed for T-016 (the dashboard reads this on mount to show state for students who
 * were already mid-test before the teacher opened the page) and for tests. Not used
 * anywhere yet in T-015 beyond the `teacher:join` ack below. */
export function getSessionProgress(sessionId: string): StudentProgress[] {
  return [...getOrCreateSessionMap(sessionId).values()];
}

interface StudentSocketState {
  sessionId: string;
  attemptId: string;
  studentName: string;
  /** Captured once at `student:join` time so `student:progress` never has to re-query
   * the DB just to keep echoing the same value (T-016 — see `LiveStudentProgressDTO`). */
  totalQuestions: number;
}

// `Socket.data` is typed `any` by the library itself (the class's `SocketData` generic
// defaults to `any` — see `socket.io`'s own `socket.d.ts`), so it's read/written here via
// plain property access + explicit casts on read, rather than a `declare module`
// augmentation (merging a typed interface onto a *generic* class like `Socket<...>` is
// unreliable in TypeScript and not worth the risk for two internal-only fields).

export function attachSessionRealtime(io: SocketIOServer): void {
  ioRef = io;

  // Auth handshake middleware — runs for every new connection, including every
  // reconnect (each reconnect is a brand-new Socket.IO connection with a new socket id,
  // so this always re-verifies rather than trusting stale state).
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      next(new Error('Authentication required.'));
      return;
    }
    try {
      socket.data.user = verifyToken(token);
      next();
    } catch {
      next(new Error('Invalid or expired authentication token.'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as AuthTokenPayload | undefined;
    if (!user) {
      // Defensive only — the `io.use` middleware above always sets this or rejects the
      // connection before it gets here.
      socket.disconnect(true);
      return;
    }

    console.log(`[socket.io] client connected: ${socket.id} (${user.role} ${user.email})`);

    /** `teacher:join({ sessionId }, ack)` — joins the calling teacher's socket to that
     * session's monitor room, after verifying they own the session's test. Acks with the
     * currently-known progress of every student in the session (T-016's dashboard
     * renders this as the initial state), so opening the monitor mid-session (or
     * reconnecting, including AFTER the session has been closed) immediately shows
     * current state rather than erroring or starting blank. `sessionStatus` lets the
     * dashboard show a "closed, no more live updates" banner immediately on open,
     * without waiting for a `session:closed` event that may have fired before it
     * connected. */
    socket.on('teacher:join', (payload: { sessionId?: string }, ack?: Ack) => {
      const respond = isAck(ack) ? ack : () => undefined;
      const sessionId = payload?.sessionId;

      if (user.role !== 'teacher') {
        respond({ ok: false, error: 'Only teachers can monitor a session.' });
        return;
      }
      if (!sessionId) {
        respond({ ok: false, error: 'sessionId is required.' });
        return;
      }

      prisma.testSession
        .findUnique({
          where: { id: sessionId },
          include: { test: { select: { teacherId: true } } },
        })
        .then(async (session) => {
          if (!session || session.test.teacherId !== user.sub) {
            respond({ ok: false, error: 'Session not found.' });
            return;
          }
          await socket.join(teacherRoom(sessionId));
          respond({
            ok: true,
            students: getSessionProgress(sessionId),
            sessionStatus: session.status,
          });
        })
        .catch((err: unknown) => {
          console.error('[socket.io] teacher:join failed:', err);
          respond({ ok: false, error: 'Failed to join session monitor.' });
        });
    });

    /** `student:join({ sessionId }, ack)` — registers the calling student's socket
     * against their existing `Attempt` for that session (created by the T-011 REST join
     * — this event never creates one). Safe to call repeatedly (initial join, and every
     * reconnect): it looks up the existing progress entry for this `studentId` and
     * reuses it rather than resetting to zero, so a mid-test reconnect doesn't make the
     * teacher's view jump backwards. */
    socket.on('student:join', (payload: { sessionId?: string }, ack?: Ack) => {
      const respond = isAck(ack) ? ack : () => undefined;
      const sessionId = payload?.sessionId;

      if (user.role !== 'student') {
        respond({ ok: false, error: 'Only students can report progress.' });
        return;
      }
      if (!sessionId) {
        respond({ ok: false, error: 'sessionId is required.' });
        return;
      }

      prisma.attempt
        .findUnique({
          where: { sessionId_studentId: { sessionId, studentId: user.sub } },
          include: {
            student: { select: { name: true } },
            // Needed once here to compute `totalQuestions` (T-016) for the percent-complete
            // calculation the dashboard renders — same flattened count as
            // `flattenQuestionsInAuthoredOrder` uses elsewhere, just inlined since this is
            // the only place in this module that touches Prisma models directly.
            test: { include: { sections: { include: { questions: { select: { id: true } } } } } },
          },
        })
        .then((attempt) => {
          if (!attempt) {
            respond({ ok: false, error: 'You have not joined this session.' });
            return;
          }

          const totalQuestions = attempt.test.sections.reduce(
            (sum, section) => sum + section.questions.length,
            0,
          );

          socket.data.studentSession = {
            sessionId,
            attemptId: attempt.id,
            studentName: attempt.student.name,
            totalQuestions,
          };

          const map = getOrCreateSessionMap(sessionId);
          const existing = map.get(user.sub);
          const progress: StudentProgress = existing ?? {
            studentId: user.sub,
            studentName: attempt.student.name,
            attemptId: attempt.id,
            currentQuestionIndex: 0,
            answeredCount: 0,
            totalQuestions,
            updatedAt: new Date().toISOString(),
          };
          map.set(user.sub, progress);

          // T-016: a closed session's teacher room no longer receives live updates —
          // the map above still records the latest snapshot (so a first-ever
          // `teacher:join` after close still sees final state), it just isn't relayed.
          if (!closedSessionIds.has(sessionId)) {
            io.to(teacherRoom(sessionId)).emit('student:progress', progress);
          }
          respond({ ok: true });
        })
        .catch((err: unknown) => {
          console.error('[socket.io] student:join failed:', err);
          respond({ ok: false, error: 'Failed to join session as a student.' });
        });
    });

    /** `student:progress({ currentQuestionIndex, answeredCount }, ack)` — requires a
     * prior successful `student:join` on THIS socket (reconnecting requires re-joining,
     * same as the REST convention of never trusting stale client state). Relayed ONLY
     * into the teacher room for this session — never broadcast back to other students. */
    socket.on(
      'student:progress',
      (payload: { currentQuestionIndex?: number; answeredCount?: number }, ack?: Ack) => {
        const respond = isAck(ack) ? ack : () => undefined;
        const studentSession = socket.data.studentSession as StudentSocketState | undefined;

        if (!studentSession) {
          respond({ ok: false, error: 'Call student:join before sending progress.' });
          return;
        }

        const { sessionId, attemptId, studentName, totalQuestions } = studentSession;
        const map = getOrCreateSessionMap(sessionId);
        const previous = map.get(user.sub);

        const progress: StudentProgress = {
          studentId: user.sub,
          studentName,
          attemptId,
          currentQuestionIndex:
            typeof payload?.currentQuestionIndex === 'number'
              ? payload.currentQuestionIndex
              : (previous?.currentQuestionIndex ?? 0),
          answeredCount:
            typeof payload?.answeredCount === 'number'
              ? payload.answeredCount
              : (previous?.answeredCount ?? 0),
          totalQuestions: previous?.totalQuestions ?? totalQuestions,
          updatedAt: new Date().toISOString(),
        };
        map.set(user.sub, progress);

        // T-016: see the matching comment in `student:join` above — snapshot is always
        // kept current, relay is skipped once the session is closed.
        if (!closedSessionIds.has(sessionId)) {
          io.to(teacherRoom(sessionId)).emit('student:progress', progress);
        }
        respond({ ok: true });
      },
    );

    socket.on('disconnect', (reason) => {
      // Deliberately a no-op beyond logging: the student's last-known progress stays in
      // `sessionProgress` (keyed by studentId, not socket id) so a teacher's dashboard
      // doesn't lose their state on a transient disconnect, and Socket.IO itself already
      // drops the dead socket from every room it was in — there is no stale/duplicate
      // room membership to clean up here. A reconnect just calls `teacher:join` /
      // `student:join` again, which re-joins the room / overwrites the same map entry.
      console.log(`[socket.io] client disconnected: ${socket.id} (${reason})`);
    });
  });
}
