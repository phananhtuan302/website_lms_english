import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/useAuth';
import { studentApi } from '../lib/studentApi';
import { ApiError } from '../lib/apiClient';

/**
 * QR/link join-gate page (T-011), reachable at `/join/:token` — deliberately NOT
 * wrapped in `ProtectedRoute`, since the whole point is to work for a logged-out
 * visitor too (that's the "login gate" half of the task).
 *
 * Flow:
 * 1. Always checks the token first via the public `GET /api/sessions/join/:token`
 *    (works logged-out) so an invalid/expired link shows a clear message before asking
 *    anyone to log in.
 * 2. Logged out -> shows "you're about to join <test>" plus Log in / Register links,
 *    each carrying `state: { from: <this page> }` so `LoginPage`/`RegisterPage` send
 *    the student straight back here afterward to finish joining (existing convention,
 *    see `ProtectedRoute` / `LoginPage`).
 * 3. Logged in as a teacher -> clear rejection (this is a student-only flow); no call
 *    to the join endpoint is even attempted (though the server would also 403 it).
 * 4. Logged in as a student -> immediately calls `POST /api/sessions/join/:token` and
 *    navigates into the take-test runtime (or straight to the result page, if this
 *    student had already submitted this session's attempt before).
 */
function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [checkState, setCheckState] = useState<'checking' | 'valid' | 'error'>('checking');
  const [testTitle, setTestTitle] = useState('');
  const [checkError, setCheckError] = useState<string | null>(null);

  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const hasJoinedRef = useRef(false);

  useEffect(() => {
    if (!token) return;
    studentApi
      .checkJoinToken(token)
      .then((res) => {
        setTestTitle(res.testTitle);
        setCheckState('valid');
      })
      .catch((err) => {
        setCheckError(
          err instanceof ApiError ? err.message : t('join.checkFailed'),
        );
        setCheckState('error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const attemptJoin = useCallback(() => {
    if (!token || hasJoinedRef.current) return;
    hasJoinedRef.current = true;
    setIsJoining(true);
    setJoinError(null);

    studentApi
      .joinSession(token)
      .then((res) => {
        const destination =
          res.status === 'submitted'
            ? `/student/attempts/${res.attemptId}/result`
            : `/student/attempts/${res.attemptId}`;
        navigate(destination, { replace: true });
      })
      .catch((err) => {
        hasJoinedRef.current = false;
        setIsJoining(false);
        setJoinError(err instanceof ApiError ? err.message : t('join.joinFailed'));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, navigate]);

  // Auto-join once the token is confirmed valid and we know this is a logged-in student.
  useEffect(() => {
    if (checkState !== 'valid' || isLoading) return;
    if (user?.role === 'student') {
      attemptJoin();
    }
  }, [checkState, isLoading, user, attemptJoin]);

  if (!token) return null;

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

  const joinState = { from: { pathname: `/join/${token}` } };

  return (
    <div className="mx-auto max-w-md rounded-xl border border-primary-100 bg-primary-50 p-8 text-center">
      <h1 className="text-xl font-bold text-primary-700">{t('join.heading', { title: testTitle })}</h1>

      {!user && (
        <>
          <p className="mt-3 text-sm text-base-black/70">
            {t('join.loginPrompt')}
          </p>
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
