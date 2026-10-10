import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { CreateSessionResponse, TestSessionDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { friendlyEditorError, rawErrorText } from '../lib/editorErrors';
import CustomDateTimePicker from './ui/CustomDateTimePicker';

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

  function downloadQrCode(dataUrl: string, code: string) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `QR-${code || 'session'}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 text-xs text-slate-600 leading-relaxed">
        <span className="font-semibold text-blue-900">Hướng dẫn: </span>
        {t('teacherTestEditor.sessions.description')}
      </div>

      {/* Form tạo phiên mới */}
      <div className="rounded-2xl border border-slate-200/80 bg-slate-50/40 p-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">Tạo phiên làm bài mới</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
            <span>{t('teacherTestEditor.sessions.startAtLabel')}</span>
            <CustomDateTimePicker
              value={sessionStartAtInput}
              onChange={setSessionStartAtInput}
              placeholder="Chọn ngày giờ bắt đầu..."
            />
            <span className="text-[11px] font-normal text-slate-400 mt-0.5">{t('teacherTestEditor.sessions.startAtHint')}</span>
          </div>
          <div className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
            <span>{t('teacherTestEditor.sessions.endAtLabel')}</span>
            <CustomDateTimePicker
              value={sessionEndAtInput}
              onChange={setSessionEndAtInput}
              placeholder="Chọn ngày giờ kết thúc..."
            />
            <span className="text-[11px] font-normal text-slate-400 mt-0.5">{t('teacherTestEditor.sessions.endAtHint')}</span>
          </div>
          <div className="flex flex-col justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="invisible text-xs font-semibold leading-normal select-none">
                {t('teacherTestEditor.sessions.endAtLabel')}
              </span>
              <label className="flex h-10 items-center gap-2.5 text-xs font-medium text-slate-700 cursor-pointer max-w-xs">
                <input
                  type="checkbox"
                  checked={sessionAllowGuests}
                  onChange={(event) => setSessionAllowGuests(event.target.checked)}
                  className="h-4 w-4 shrink-0 rounded border-slate-300 text-primary-600 focus:ring-primary-200"
                />
                <span className="leading-snug">
                  <strong className="font-semibold text-slate-800">Cho phép khách vãng lai</strong>
                  <span className="block text-[11px] text-slate-400 font-normal">
                    (không cần tài khoản, chỉ nhập tên)
                  </span>
                </span>
              </label>
            </div>
            <button
              type="button"
              onClick={handleStartSession}
              disabled={isStartingSession}
              className="self-start rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isStartingSession ? t('teacherTestEditor.sessions.starting') : t('teacherTestEditor.sessions.start')}
            </button>
          </div>
        </div>
        {sessionError && <p className="mt-2 text-xs font-semibold text-rose-600">{sessionError}</p>}
      </div>

      {currentSession && (
        <div className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/50 via-white to-slate-50 p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            {/* Cột mã QR */}
            <div className="flex flex-col items-center gap-2.5 shrink-0">
              <div className="relative group rounded-2xl border-2 border-emerald-500/20 bg-white p-3 shadow-sm">
                <img
                  src={currentSession.qrCodeDataUrl}
                  alt={t('teacherTestEditor.sessions.qrCodeAlt', { title: testTitle })}
                  className="h-36 w-36 object-contain"
                />
              </div>
              <button
                type="button"
                onClick={() => downloadQrCode(currentSession.qrCodeDataUrl, currentSession.manualCode)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 hover:text-primary-600"
              >
                <svg className="h-4 w-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Tải mã QR
              </button>
            </div>

            {/* Cột thông tin chi tiết phiên */}
            <div className="flex-1 text-center sm:text-left flex flex-col justify-between">
              <div>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    ĐANG HOẠT ĐỘNG
                  </span>
                  {currentSession.allowGuests && (
                    <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                      Cho phép khách vãng lai
                    </span>
                  )}
                </div>

                <div className="mt-3">
                  <span className="text-xs font-medium text-slate-500">Mã dự phòng nhập tay:</span>
                  <div className="mt-0.5 font-mono text-3xl font-extrabold tracking-widest text-primary-700">
                    {currentSession.manualCode}
                  </div>
                </div>

                <div className="mt-3">
                  <span className="text-xs font-medium text-slate-500">Liên kết tham gia:</span>
                  <div className="mt-1 flex items-center justify-center sm:justify-start gap-2">
                    <code className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-mono font-medium text-primary-800 break-all select-all">
                      {currentSession.joinUrl}
                    </code>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(currentSession.joinUrl)}
                      title="Sao chép liên kết"
                      className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                </div>

                {(currentSession.startAt || currentSession.endAt) && (
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                    {currentSession.startAt && (
                      <p>
                        <span className="text-slate-400">Bắt đầu:</span> {new Date(currentSession.startAt).toLocaleString()}
                      </p>
                    )}
                    {currentSession.endAt && (
                      <p>
                        <span className="text-slate-400">Đóng lúc:</span> {new Date(currentSession.endAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-center sm:justify-start gap-2.5 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => navigate(`/teacher/sessions/${currentSession.id}/live`)}
                  className="rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-slate-800"
                >
                  Giám sát trực tiếp
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/teacher/sessions/${currentSession.id}/attempts`)}
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
                >
                  Xem lượt làm bài
                </button>
                {currentSession.status === 'active' && (
                  <button
                    type="button"
                    onClick={() => void handleCloseSession(currentSession.id)}
                    className="rounded-xl border border-rose-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-rose-600 shadow-2xs hover:bg-rose-50"
                  >
                    Kết thúc phiên
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {sessions.length > 0 && (
        <div className="mt-2 border-t border-slate-100 pt-3">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2.5">Phiên đã tạo gần đây</p>
          <div className="flex flex-col gap-2">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3 hover:bg-slate-50/90 transition-colors text-xs"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold text-slate-700">Mã:</span>
                  <span className="font-mono font-bold text-base text-primary-700">{session.manualCode}</span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      session.status === 'active'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {session.status === 'active' ? 'Đang hoạt động' : 'Đã đóng'}
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-500">
                    Bắt đầu {new Date(session.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
                    {new Date(session.createdAt).toLocaleDateString()}
                  </span>
                  {session.allowGuests && (
                    <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                      Khách vãng lai
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
                  {currentSession?.id === session.id && currentSession.qrCodeDataUrl && (
                    <button
                      type="button"
                      onClick={() => downloadQrCode(currentSession.qrCodeDataUrl, session.manualCode)}
                      title="Tải mã QR"
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-600 shadow-2xs hover:bg-slate-50 hover:text-primary-600"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      <span>Tải QR</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => navigate(`/teacher/sessions/${session.id}/live`)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 shadow-2xs hover:bg-slate-50"
                  >
                    Giám sát trực tiếp
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/teacher/sessions/${session.id}/attempts`)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 shadow-2xs hover:bg-slate-50"
                  >
                    Xem lượt làm bài
                  </button>
                  {session.status === 'active' && (
                    <button
                      type="button"
                      onClick={() => void handleCloseSession(session.id)}
                      className="rounded-lg border border-rose-200 bg-white px-2.5 py-1 font-semibold text-rose-600 shadow-2xs hover:bg-rose-50"
                    >
                      Kết thúc
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default LiveSessionManager;
