import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { CreateSessionResponse, TestSessionDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { friendlyEditorError, rawErrorText } from '../lib/editorErrors';

interface LiveSessionManagerProps {
  testId: string;
  testTitle: string;
  /** Called right before creating a session (e.g. to flush pending editor saves first so
   * variants reflect the latest content) — omitted where there's no such concern, such as
   * when this is embedded on the class "Bài tập" row, outside the test editor. */
  beforeStart?: () => Promise<void>;
  /** Called after a session is successfully created (e.g. to refresh the editor's own
   * variants list, since starting a session can auto-generate them). */
  afterStart?: () => void;
}

/**
 * 2026-10: the "Cho cả lớp vào làm bằng mã QR" live-session panel — originally only
 * reachable from inside the test editor page (`TeacherTestEditorPage.tsx`), extracted
 * here so it can ALSO be opened directly from a class's "Bài tập" row
 * (`ClassAssignmentsTab.tsx`) without a detour through "Sửa nội dung" first (customer:
 * "kéo chức năng tạo phiên kiểm tra trực tiếp ra bên ngoài... đó là chức năng hay sài").
 * Both call sites render the exact same component so the rules (one active session per
 * test, the `startAt`/`endAt` schedule, the manual Start/Kết thúc toggle) can never drift
 * apart between them.
 *
 * Creating a session already doubles as both "schedule it" and "start it now", per the
 * customer's "có thể setup thời gian mở đóng làm bài, hoặc có nút bắt đầu": leaving both
 * date fields blank and clicking the one button starts an unscheduled session immediately
 * (`status: 'active'`, joinable right away); filling either field pre-schedules when it
 * opens/auto-closes instead. Once a session is active, each row shows a "Kết thúc" button
 * (customer: "khi bấm bắt đầu thì có nút kết thúc") for a manual early close, on top of
 * the optional `endAt` auto-close.
 */
function LiveSessionManager({ testId, testTitle, beforeStart, afterStart }: LiveSessionManagerProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [sessions, setSessions] = useState<TestSessionDTO[]>([]);
  const [currentSession, setCurrentSession] = useState<CreateSessionResponse | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [isStartingSession, setIsStartingSession] = useState(false);
  // `datetime-local` input values (no timezone suffix) — empty means "no schedule."
  const [sessionStartAtInput, setSessionStartAtInput] = useState('');
  const [sessionEndAtInput, setSessionEndAtInput] = useState('');
  const [sessionAllowGuests, setSessionAllowGuests] = useState(false);

  const refresh = useCallback(() => {
    teacherApi
      .listSessions(testId)
      .then((all) => {
        setSessions(all);
        // Re-display a still-active session's QR code/join info after navigating away
        // and back (or a plain page reload) — `currentSession` otherwise only ever gets
        // set right after THIS component creates a brand-new session.
        const active = all.find((s) => s.status === 'active');
        if (active) {
          teacherApi.getSession(active.id).then(setCurrentSession).catch(() => undefined);
        } else {
          setCurrentSession(null);
        }
      })
      .catch(() => undefined);
  }, [testId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleStartSession() {
    setIsStartingSession(true);
    setSessionError(null);
    try {
      await beforeStart?.();
      // `datetime-local`'s value has no timezone suffix — `new Date(...)` parses it as
      // local time, which `.toISOString()` then converts to the UTC instant the server
      // expects, same as every other date input in this codebase.
      const startAt = sessionStartAtInput ? new Date(sessionStartAtInput).toISOString() : null;
      const endAt = sessionEndAtInput ? new Date(sessionEndAtInput).toISOString() : null;
      const session = await teacherApi.startSession(testId, { startAt, endAt, allowGuests: sessionAllowGuests });
      setCurrentSession(session);
      const all = await teacherApi.listSessions(testId);
      setSessions(all);
      afterStart?.();
    } catch (err) {
      console.warn('[liveSession] start session failed:', rawErrorText(err));
      setSessionError(friendlyEditorError(err, t));
    } finally {
      setIsStartingSession(false);
    }
  }

  async function handleCloseSession(sessionId: string) {
    try {
      await teacherApi.closeSession(sessionId);
      const all = await teacherApi.listSessions(testId);
      setSessions(all);
      if (currentSession?.id === sessionId) {
        setCurrentSession({ ...currentSession, status: 'closed' });
      }
    } catch (err) {
      console.warn('[liveSession] close session failed:', rawErrorText(err));
      setSessionError(friendlyEditorError(err, t));
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary-200 bg-base-white p-3">
      <div>
        <h3 className="text-sm font-semibold text-primary-700">{t('teacherTestEditor.sessions.heading')}</h3>
        <p className="mt-1 text-xs text-base-black/60">{t('teacherTestEditor.sessions.description')}</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex flex-col gap-1 text-xs font-medium text-base-black">
          {t('teacherTestEditor.sessions.startAtLabel')}
          <input
            type="datetime-local"
            value={sessionStartAtInput}
            onChange={(event) => setSessionStartAtInput(event.target.value)}
            className="rounded-md border border-primary-200 px-2 py-1 text-xs"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-base-black">
          {t('teacherTestEditor.sessions.endAtLabel')}
          <input
            type="datetime-local"
            value={sessionEndAtInput}
            onChange={(event) => setSessionEndAtInput(event.target.value)}
            className="rounded-md border border-primary-200 px-2 py-1 text-xs"
          />
        </label>
        <label className="flex items-center gap-2 pb-1.5 text-xs font-medium text-base-black">
          <input
            type="checkbox"
            checked={sessionAllowGuests}
            onChange={(event) => setSessionAllowGuests(event.target.checked)}
            className="h-4 w-4 rounded border-primary-300 text-primary-600 focus:ring-primary-200"
          />
          {t('teacherTestEditor.sessions.allowGuestsLabel')}
        </label>
      </div>
      <p className="text-[11px] text-base-black/50">{t('teacherTestEditor.sessions.startAtHint')}</p>
      <p className="text-[11px] text-base-black/50">{t('teacherTestEditor.sessions.endAtHint')}</p>

      <button
        type="button"
        onClick={handleStartSession}
        disabled={isStartingSession}
        className="self-start rounded-md bg-primary-500 px-4 py-2.5 sm:py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isStartingSession ? t('teacherTestEditor.sessions.starting') : t('teacherTestEditor.sessions.start')}
      </button>
      {sessionError && <p className="text-sm text-red-700">{sessionError}</p>}

      {currentSession && (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-primary-200 bg-primary-50 p-4 sm:flex-row sm:items-center">
          <img
            src={currentSession.qrCodeDataUrl}
            alt={t('teacherTestEditor.sessions.qrCodeAlt', { title: testTitle })}
            className="h-40 w-40 rounded-md border border-primary-200 bg-base-white p-2"
          />
          <div>
            <p className="text-sm text-base-black/70">{t('teacherTestEditor.sessions.scanOrJoin')}</p>
            <p className="mt-1 break-all font-mono text-sm text-primary-700">{currentSession.joinUrl}</p>
            <p className="mt-2 text-sm text-base-black/70">
              {t('teacherTestEditor.sessions.manualFallbackCode')}{' '}
              <span className="font-mono text-lg font-bold tracking-widest text-primary-700">
                {currentSession.manualCode}
              </span>
            </p>
            <p className="mt-1 text-xs uppercase text-base-black/50">
              {t('teacherTestEditor.sessions.statusLabel', {
                status: t(`teacherTestEditor.sessions.statusValues.${currentSession.status}`),
              })}
            </p>
            {currentSession.startAt && (
              <p className="mt-1 text-xs text-primary-700">
                {t('teacherTestEditor.sessions.scheduledFor', { time: new Date(currentSession.startAt).toLocaleString() })}
              </p>
            )}
            {currentSession.endAt && (
              <p className="mt-1 text-xs text-primary-700">
                {t('teacherTestEditor.sessions.closesAt', { time: new Date(currentSession.endAt).toLocaleString() })}
              </p>
            )}
            {currentSession.allowGuests && (
              <p className="mt-1 text-xs text-primary-700">{t('teacherTestEditor.sessions.guestsAllowedNote')}</p>
            )}
            {currentSession.status === 'active' && (
              <button
                type="button"
                onClick={() => void handleCloseSession(currentSession.id)}
                className="mt-2 rounded-md border border-red-300 bg-base-white px-3 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50"
              >
                {t('teacherTestEditor.sessions.close')}
              </button>
            )}
          </div>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {sessions.map((session) => (
          <li
            key={session.id}
            className="flex flex-col gap-2 rounded-md border border-primary-100 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <span>
              {t('teacherTestEditor.sessions.codeLabel')}{' '}
              <span className="font-mono font-semibold">{session.manualCode}</span> ·{' '}
              <span className={session.status === 'active' ? 'text-green-700' : 'text-base-black/50'}>
                {t(`teacherTestEditor.sessions.statusValues.${session.status}`)}
              </span>{' '}
              · {t('teacherTestEditor.sessions.startedAt', { date: new Date(session.createdAt).toLocaleString() })}
              {session.startAt && (
                <>
                  {' · '}
                  {t('teacherTestEditor.sessions.scheduledFor', { time: new Date(session.startAt).toLocaleString() })}
                </>
              )}
              {session.endAt && (
                <>
                  {' · '}
                  {t('teacherTestEditor.sessions.closesAt', { time: new Date(session.endAt).toLocaleString() })}
                </>
              )}
              {session.allowGuests && (
                <>
                  {' · '}
                  <span className="text-primary-700">{t('teacherTestEditor.sessions.guestsAllowedBadge')}</span>
                </>
              )}
            </span>
            <span className="flex flex-wrap items-center gap-x-3">
              <button
                type="button"
                onClick={() => navigate(`/teacher/sessions/${session.id}/live`)}
                className="py-3 text-xs font-medium text-primary-600 hover:underline sm:py-0"
              >
                {t('teacherTestEditor.sessions.liveMonitor')}
              </button>
              <button
                type="button"
                onClick={() => navigate(`/teacher/sessions/${session.id}/attempts`)}
                className="py-3 text-xs font-medium text-primary-600 hover:underline sm:py-0"
              >
                {t('teacherTestEditor.sessions.viewAttempts')}
              </button>
              {session.status === 'active' && (
                <button
                  type="button"
                  onClick={() => void handleCloseSession(session.id)}
                  className="rounded px-2 py-3 sm:py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  {t('teacherTestEditor.sessions.close')}
                </button>
              )}
            </span>
          </li>
        ))}
        {sessions.length === 0 && <p className="text-sm text-base-black/60">{t('teacherTestEditor.sessions.empty')}</p>}
      </ul>
    </div>
  );
}

export default LiveSessionManager;
