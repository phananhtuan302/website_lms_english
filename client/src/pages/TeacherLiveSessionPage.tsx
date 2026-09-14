import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Socket } from 'socket.io-client';
import type { CreateSessionResponse, LiveStudentProgressDTO, TestDetailDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';
import { createSessionSocket } from '../lib/socket';

interface TeacherJoinAck {
  ok: boolean;
  error?: string;
  students?: LiveStudentProgressDTO[];
  sessionStatus?: 'active' | 'closed';
}

/**
 * Teacher's live monitoring dashboard (T-016), reachable at
 * `/teacher/sessions/:sessionId/live` from the session panel in the test editor
 * (`TeacherTestEditorPage`) or from the attempts list (`TeacherSessionAttemptsPage`).
 *
 * Consumes the Socket.IO room/relay T-015 already built (`teacher:join` /
 * `student:progress` — see `server/src/realtime/sessionRealtime.ts`) rather than
 * polling REST: `teacher:join`'s ack includes the CURRENT snapshot of every student's
 * progress (so opening this page mid-session shows real state immediately, not just
 * updates from this point on), and every subsequent `student:progress` event updates
 * the same in-memory map here, keyed by `studentId` — matching the server's own
 * dedup-on-reconnect key, so a student's transient disconnect/reconnect never shows up
 * as a second row.
 *
 * Once the session is closed (either explicitly or by starting a new one for the same
 * test), the server stops relaying further `student:progress` events into this room and
 * pushes a `session:closed` event immediately — handled below by freezing the table and
 * showing a banner, rather than the page silently going stale with no explanation.
 */
function TeacherLiveSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();

  const [session, setSession] = useState<CreateSessionResponse | null>(null);
  const [test, setTest] = useState<TestDetailDTO | null>(null);
  const [students, setStudents] = useState<Record<string, LiveStudentProgressDTO>>({});
  const [isClosed, setIsClosed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // T-041: same socket connection used for `teacher:join` below also carries this
  // teacher's `teacher:playAudio` presses — kept in a ref so the Play button handler
  // (outside the connection effect) can reach the live socket instance.
  const socketRef = useRef<Socket | null>(null);
  const [playbackStatus, setPlaybackStatus] = useState<Record<string, string>>({});

  // Session + test detail (T-016 needs the test title for the header; totalQuestions
  // for the percent-complete math travels with each `LiveStudentProgressDTO` instead,
  // computed server-side at `student:join` time — see that DTO's doc comment).
  useEffect(() => {
    if (!sessionId) return;
    teacherApi
      .getSession(sessionId)
      .then((data) => {
        setSession(data);
        setIsClosed(data.status === 'closed');
        return teacherApi.getTest(data.testId);
      })
      .then(setTest)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load session.'));
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return undefined;

    let cancelled = false;
    const socket: Socket = createSessionSocket();
    socketRef.current = socket;

    function join() {
      socket.emit('teacher:join', { sessionId }, (ack: TeacherJoinAck) => {
        if (cancelled) return;
        if (!ack.ok) {
          setError(ack.error ?? 'Failed to join this session’s live monitor.');
          return;
        }
        const byStudentId: Record<string, LiveStudentProgressDTO> = {};
        for (const s of ack.students ?? []) {
          byStudentId[s.studentId] = s;
        }
        setStudents(byStudentId);
        setIsClosed(ack.sessionStatus === 'closed');
      });
    }

    socket.on('connect', join);
    socket.io.on('reconnect', join);

    socket.on('student:progress', (progress: LiveStudentProgressDTO) => {
      setStudents((prev) => ({ ...prev, [progress.studentId]: progress }));
    });

    socket.on('session:closed', () => {
      setIsClosed(true);
    });

    socket.on('connect_error', (err: Error) => {
      if (!cancelled) {
        setError(`Realtime connection failed: ${err.message}`);
      }
    });

    return () => {
      cancelled = true;
      socket.disconnect();
      socketRef.current = null;
    };
  }, [sessionId]);

  /** T-041: broadcasts a `teacher:playAudio` press for one Listening section to every
   * joined student's screen (via the realtime relay already set up above). Students
   * never get an equivalent "play" emit of their own during a live session — this
   * button is the only way Listening audio starts playing for them (see
   * `TakeTestPage.tsx`'s `audio:play` listener). */
  function handlePlayAudio(sectionId: string) {
    if (!sessionId) return;
    setPlaybackStatus((prev) => ({ ...prev, [sectionId]: 'Playing…' }));
    socketRef.current?.emit(
      'teacher:playAudio',
      { sessionId, sectionId },
      (ack: { ok: boolean; error?: string }) => {
        setPlaybackStatus((prev) => ({
          ...prev,
          [sectionId]: ack.ok ? 'Played for all connected students.' : (ack.error ?? 'Failed to play.'),
        }));
      },
    );
  }

  if (!sessionId) return null;

  const listeningSections = test?.sections.filter((s) => s.audioUrl) ?? [];
  const rows = Object.values(students).sort((a, b) => a.studentName.localeCompare(b.studentName));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <Link
          to={`/teacher/sessions/${sessionId}/attempts`}
          className="text-sm text-primary-600 hover:underline"
        >
          ← Back to attempts
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-primary-700">
          Live monitor{test ? ` — ${test.title}` : ''}
        </h1>
        {session && (
          <p className="mt-1 text-sm text-base-black/60">
            Session code <span className="font-mono font-semibold">{session.manualCode}</span>
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {isClosed && (
        <p className="rounded-md border border-primary-200 bg-primary-50 px-3 py-2 text-sm text-primary-700">
          This session is closed. The table below reflects the final state — no further live
          updates will appear.
        </p>
      )}

      {listeningSections.length > 0 && (
        <section className="rounded-xl border border-primary-200 p-4">
          <h2 className="text-lg font-bold text-base-black">Listening playback control</h2>
          <p className="mt-1 text-sm text-base-black/60">
            Students in this live session do not see a Play button of their own (T-041) — press
            Play below to play a section's audio on every connected student's screen at once.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {listeningSections.map((section) => (
              <li
                key={section.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary-100 px-3 py-2 text-sm"
              >
                <span className="font-medium text-base-black">{section.title}</span>
                <div className="flex items-center gap-3">
                  {playbackStatus[section.id] && (
                    <span className="text-xs text-base-black/60">{playbackStatus[section.id]}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => handlePlayAudio(section.id)}
                    disabled={isClosed}
                    className="rounded-md bg-primary-500 px-4 py-1.5 text-xs font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    ▶ Play for students
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rows.length === 0 && !error && (
        <p className="text-sm text-base-black/60">
          No students connected yet. This updates live as students join and progress through the
          test — no need to refresh.
        </p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-primary-200">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-primary-50 text-xs font-semibold uppercase text-primary-700">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Current question</th>
                <th className="px-4 py-3">Progress</th>
                <th className="px-4 py-3">Last update</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const percent =
                  s.totalQuestions > 0 ? Math.round((s.answeredCount / s.totalQuestions) * 100) : 0;
                return (
                  <tr key={s.studentId} className="border-t border-primary-100">
                    <td className="px-4 py-3 font-medium text-base-black">{s.studentName}</td>
                    <td className="px-4 py-3 text-base-black/80">
                      {s.currentQuestionIndex + 1} of {s.totalQuestions || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-28 overflow-hidden rounded-full bg-primary-100">
                          <div
                            className="h-full rounded-full bg-primary-500"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className="text-xs text-base-black/60">
                          {percent}% ({s.answeredCount}/{s.totalQuestions})
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-base-black/50">
                      {new Date(s.updatedAt).toLocaleTimeString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default TeacherLiveSessionPage;
