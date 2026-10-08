import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { JoinSessionResponse } from '@platform/shared';
import { useAuth } from '../context/useAuth';
import { studentApi } from '../lib/studentApi';
import { ApiError } from '../lib/apiClient';

/** `mm:ss` (or `h:mm:ss` once past an hour) countdown string, floored to whole seconds,
 * never negative. */
function formatCountdown(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * QR/link/manual-code join-gate page (T-011, extended 2026-10), reachable at
 * `/join/:token` (from a scanned QR code or its link) or `/join` with no token (a
 * visitor typing the short manual fallback code instead) — deliberately NOT wrapped in
 * `ProtectedRoute`, since the whole point is to work for a logged-out visitor too.
 *
 * Flow:
 * 1. With a `:token` — checks it immediately via the public `GET /api/sessions/join/:token`.
 *    With no token — shows a manual-code entry form first; submitting it resolves the
 *    code via `GET /api/sessions/join-by-code/:code` (identical response shape).
 * 2. Once resolved: shows "you're about to join <test>", and — 2026-10 — a "starts at
 *    HH:mm" notice if the session has a scheduled start still in the future
 *    (`TestSession.startAt`).
 * 3. Logged out: Log in / Register links (existing, carrying `state.from` back to this
 *    page) PLUS — 2026-10, only if `allowGuests` — a "join with just your name, no
 *    account" form (`TestSession.allowGuests`).
 * 4. Logged in as a teacher: clear rejection (student-only flow).
 * 5. Logged in as a student: auto-calls the real join endpoint and navigates into the
 *    take-test runtime (or straight to the result page if already submitted).
 * 6. 2026-10: a join call (student or guest) can come back `{ joined: false, startAt }`
 *    instead of succeeding — the session's start hasn't arrived yet. Shows a waiting
 *    room with a live countdown and automatically retries the exact same join the
 *    instant it elapses (plus a manual "try now" button as a fallback, e.g. if the tab
 *    was backgrounded and its timer got throttled).
 */
function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const { user, isLoading, adoptSession } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [checkState, setCheckState] = useState<'checking' | 'needsCode' | 'valid' | 'error'>(
    token ? 'checking' : 'needsCode',
  );
  const [codeInput, setCodeInput] = useState('');
  const [resolvedCode, setResolvedCode] = useState<string | null>(null);
  const [codeCheckError, setCodeCheckError] = useState<string | null>(null);

  const [testTitle, setTestTitle] = useState('');
  const [scheduledStartAt, setScheduledStartAt] = useState<string | null>(null);
  const [allowGuests, setAllowGuests] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [waitingStartAt, setWaitingStartAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const joinInFlightRef = useRef(false);

  const [guestName, setGuestName] = useState('');
  const [isGuestJoining, setIsGuestJoining] = useState(false);
  const [guestError, setGuestError] = useState<string | null>(null);

  // --- Resolve via token (URL) automatically. ---------------------------------------
  useEffect(() => {
    if (!token) return;
    studentApi
      .checkJoinToken(token)
      .then((res) => {
        setTestTitle(res.testTitle);
        setScheduledStartAt(res.startAt);
        setAllowGuests(res.allowGuests);
        setCheckState('valid');
      })
      .catch((err) => {
        setCheckError(err instanceof ApiError ? err.message : t('join.checkFailed'));
        setCheckState('error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // --- Resolve via a manually typed code (no token in the URL). ----------------------
  function handleCodeSubmit(event: React.FormEvent) {
    event.preventDefault();
    const code = codeInput.trim();
    if (!code) return;
    setCheckState('checking');
    setCodeCheckError(null);
    studentApi
      .checkJoinCode(code)
      .then((res) => {
        setResolvedCode(code);
        setTestTitle(res.testTitle);
        setScheduledStartAt(res.startAt);
        setAllowGuests(res.allowGuests);
        setCheckState('valid');
      })
      .catch((err) => {
        setCodeCheckError(err instanceof ApiError ? err.message : t('join.checkFailed'));
        setCheckState('needsCode');
      });
  }

  const handleJoinResult = useCallback(
    (res: JoinSessionResponse) => {
      if (res.joined) {
        setWaitingStartAt(null);
        const destination =
          res.status === 'submitted' ? `/student/attempts/${res.attemptId}/result` : `/student/attempts/${res.attemptId}`;
        navigate(destination, { replace: true });
      } else {
        setWaitingStartAt(res.startAt);
      }
    },
    [navigate],
  );

  const attemptJoin = useCallback(() => {
    if (joinInFlightRef.current) return;
    joinInFlightRef.current = true;
    setIsJoining(true);
    setJoinError(null);

    const call = token ? studentApi.joinSession(token) : studentApi.joinSessionByCode(resolvedCode!);
    call
      .then((res) => {
        joinInFlightRef.current = false;
        setIsJoining(false);
        handleJoinResult(res);
      })
      .catch((err) => {
        joinInFlightRef.current = false;
        setIsJoining(false);
        setJoinError(err instanceof ApiError ? err.message : t('join.joinFailed'));
      });
  }, [token, resolvedCode, handleJoinResult, t]);

  // Auto-join once the token/code is confirmed valid and we know this is a logged-in student.
  useEffect(() => {
    if (checkState !== 'valid' || isLoading) return;
    if (user?.role === 'student') {
      attemptJoin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkState, isLoading, user]);

  // Ticks `now` once a second while this page shows a resolved session — drives both the
  // waiting-room countdown and the (render-pure, no direct `Date.now()` call) "still
  // scheduled" check below.
  useEffect(() => {
    if (checkState !== 'valid') return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [checkState]);

  useEffect(() => {
    if (!waitingStartAt) return;
    if (new Date(waitingStartAt).getTime() - now <= 0) {
      attemptJoin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingStartAt, now]);

  function handleGuestSubmit(event: React.FormEvent) {
    event.preventDefault();
    const name = guestName.trim();
    if (!name) return;
    setIsGuestJoining(true);
    setGuestError(null);

    const call = token ? studentApi.joinSessionAsGuest(token, name) : studentApi.joinSessionByCodeAsGuest(resolvedCode!, name);
    call
      .then((res) => {
        adoptSession(res.token, res.user);
        setIsGuestJoining(false);
        handleJoinResult(res.join);
      })
      .catch((err) => {
        setIsGuestJoining(false);
        setGuestError(err instanceof ApiError ? err.message : t('join.joinFailed'));
      });
  }

  if (checkState === 'needsCode') {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-primary-100 bg-primary-50 p-8 text-center">
        <h1 className="text-xl font-bold text-primary-700">{t('join.enterCodeHeading')}</h1>
        <form onSubmit={handleCodeSubmit} className="mt-4 flex flex-col items-stretch gap-3">
          <label className="text-left text-sm font-medium text-base-black">
            {t('join.enterCodeLabel')}
            <input
              type="text"
              value={codeInput}
              onChange={(event) => setCodeInput(event.target.value)}
              placeholder={t('join.enterCodePlaceholder')}
              autoFocus
              className="mt-1 w-full rounded-md border border-primary-200 px-3 py-2.5 text-center font-mono text-lg uppercase tracking-widest text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </label>
          {codeCheckError && (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {codeCheckError}
            </p>
          )}
          <button
            type="submit"
            disabled={!codeInput.trim()}
            className="rounded-md bg-primary-500 px-4 py-2.5 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('join.enterCodeSubmit')}
          </button>
        </form>
      </div>
    );
  }

  if (checkState === 'checking' || isLoading) {
    return <p className="text-center text-base-black/60">{t('join.checkingLink')}</p>;
  }

  if (checkState === 'error') {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-primary-100 bg-primary-50 p-8 text-center">
        <h1 className="text-xl font-bold text-primary-700">{t('join.cantJoinHeading')}</h1>
        <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {checkError}
        </p>
        <Link to="/" className="mt-4 inline-block text-sm font-medium text-primary-600 hover:underline">
          {t('join.goHome')}
        </Link>
      </div>
    );
  }

  const joinState = { from: { pathname: token ? `/join/${token}` : '/join' } };
  const stillScheduled = scheduledStartAt && new Date(scheduledStartAt).getTime() > now;

  if (waitingStartAt) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-primary-100 bg-primary-50 p-8 text-center">
        <h1 className="text-xl font-bold text-primary-700">{t('join.waitingHeading')}</h1>
        <p className="mt-3 text-sm text-base-black/70">
          {t('join.waitingBody', { time: new Date(waitingStartAt).toLocaleTimeString() })}
        </p>
        <p className="mt-4 font-mono text-3xl font-bold text-primary-700">
          {formatCountdown(new Date(waitingStartAt).getTime() - now)}
        </p>
        <button
          type="button"
          onClick={attemptJoin}
          disabled={isJoining}
          className="mt-5 rounded-md border border-primary-300 bg-base-white px-4 py-2.5 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isJoining ? t('join.joining') : t('join.waitingRetry')}
        </button>
        {joinError && (
          <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {joinError}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md rounded-xl border border-primary-100 bg-primary-50 p-8 text-center">
      <h1 className="text-xl font-bold text-primary-700">{t('join.heading', { title: testTitle })}</h1>
      {stillScheduled && (
        <p className="mt-2 text-sm font-medium text-primary-700">
          {t('join.startsAtNotice', { time: new Date(scheduledStartAt!).toLocaleTimeString() })}
        </p>
      )}

      {!user && (
        <>
          <p className="mt-3 text-sm text-base-black/70">{t('join.loginPrompt')}</p>
          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              to="/login"
              state={joinState}
              className="rounded-md bg-primary-500 px-4 py-2.5 sm:py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
            >
              {t('header.logIn')}
            </Link>
            <Link
              to="/register"
              state={joinState}
              className="rounded-md border border-primary-300 bg-base-white px-4 py-2.5 sm:py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100"
            >
              {t('home.createStudentAccount')}
            </Link>
          </div>

          {allowGuests && (
            <div className="mt-6 border-t border-primary-200 pt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-base-black/50">{t('join.guestDivider')}</p>
              <p className="mt-2 text-sm text-base-black/70">{t('join.guestPrompt')}</p>
              <form onSubmit={handleGuestSubmit} className="mt-3 flex flex-col items-stretch gap-3">
                <label className="text-left text-sm font-medium text-base-black">
                  {t('join.guestNameLabel')}
                  <input
                    type="text"
                    value={guestName}
                    onChange={(event) => setGuestName(event.target.value)}
                    placeholder={t('join.guestNamePlaceholder')}
                    className="mt-1 w-full rounded-md border border-primary-200 px-3 py-2.5 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
                  />
                </label>
                {guestError && (
                  <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {guestError}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={!guestName.trim() || isGuestJoining}
                  className="rounded-md border border-primary-300 bg-base-white px-4 py-2.5 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isGuestJoining ? t('join.guestJoining') : t('join.guestSubmit')}
                </button>
              </form>
            </div>
          )}
        </>
      )}

      {user?.role === 'teacher' && (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {t('join.teacherCannotJoin')}
        </p>
      )}

      {user?.role === 'student' && (
        <>
          {isJoining && <p className="mt-4 text-sm text-base-black/60">{t('join.joining')}</p>}
          {joinError && (
            <div className="mt-4">
              <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {joinError}
              </p>
              <button
                type="button"
                onClick={attemptJoin}
                className="mt-3 rounded-md bg-primary-500 px-4 py-2.5 sm:py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
              >
                {t('join.tryAgain')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default JoinPage;
