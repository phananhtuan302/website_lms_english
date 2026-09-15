import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { AttemptSummaryDTO } from '@platform/shared';
import { useAuth } from '../context/useAuth';
import { studentApi } from '../lib/studentApi';
import { ApiError } from '../lib/apiClient';

/**
 * Student-only landing page (T-006), reachable only via the `/student/dashboard` route
 * guarded by `ProtectedRoute allowedRoles={['student']}`. Joining a test happens via a
 * QR/link (`/join/:token`, T-011), not from a form here — this page's own job (T-014)
 * is just to let a student find their way back to an in-progress or past attempt
 * without having to remember its URL. Flashcards/vocabulary land in later tasks.
 */
function StudentDashboardPage() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const [attempts, setAttempts] = useState<AttemptSummaryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    studentApi
      .listMyAttempts()
      .then(setAttempts)
      .catch((err) => setError(err instanceof ApiError ? err.message : t('studentDashboard.loadFailed')));
    // `t` is stable in practice (i18next only re-creates it on a real language change,
    // which never happens mid-session per PROJECT_PLAN Guiding Principle 3); re-running
    // this fetch on every `t` identity change would be pure noise, not a real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-primary-100 bg-primary-50 p-8">
        <h1 className="text-2xl font-bold text-primary-700">{t('studentDashboard.heading')}</h1>
        <p className="mt-2 text-base-black/70">
          {t('studentDashboard.welcome', { name: user?.name })}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/student/flashcard-sets"
            className="inline-block rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
          >
            {t('studentDashboard.studyVocabulary')}
          </Link>
          <Link
            to="/student/practice"
            className="inline-block rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100"
          >
            {t('studentDashboard.practiceAtHome')}
          </Link>
          <Link
            to="/student/vocab-progress"
            className="inline-block rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100"
          >
            {t('studentDashboard.myVocabProgress')}
          </Link>
          <Link
            to="/vocab-leaderboard"
            className="inline-block rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100"
          >
            {t('studentDashboard.vocabLeaderboard')}
          </Link>
          <Link
            to="/student/grammar-topics"
            className="inline-block rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100"
          >
            {t('studentDashboard.studyGrammar')}
          </Link>
          <Link
            to="/student/unit-tests"
            className="inline-block rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100"
          >
            {t('studentDashboard.unitTests')}
          </Link>
          <Link
            to="/student/vocabulary-checks"
            className="inline-block rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100"
          >
            {t('studentDashboard.vocabularyCheck')}
          </Link>
          <button
            type="button"
            onClick={logout}
            className="rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100"
          >
            {t('common.logOut')}
          </button>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold text-base-black">{t('studentDashboard.myAttemptsHeading')}</h2>
        {error && (
          <p role="alert" className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {attempts === null && !error && (
          <p className="mt-2 text-sm text-base-black/60">{t('common.loading')}</p>
        )}
        {attempts?.length === 0 && (
          <p className="mt-2 text-sm text-base-black/60">{t('studentDashboard.noAttempts')}</p>
        )}
        <ul className="mt-3 flex flex-col gap-2">
          {attempts?.map((attempt) => (
            <li
              key={attempt.attemptId}
              className="flex items-center justify-between rounded-lg border border-primary-100 px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium text-base-black">{attempt.testTitle}</p>
                <p className="text-xs text-base-black/50">
                  {attempt.status === 'submitted'
                    ? t('studentDashboard.scoreLine', {
                        percent: attempt.scorePercent,
                        correct: attempt.correctCount,
                        total: attempt.totalCount,
                      })
                    : t('studentDashboard.inProgress')}
                </p>
              </div>
              <Link
                to={
                  attempt.status === 'submitted'
                    ? `/student/attempts/${attempt.attemptId}/result`
                    : `/student/attempts/${attempt.attemptId}`
                }
                className="font-medium text-primary-600 hover:underline"
              >
                {attempt.status === 'submitted'
                  ? t('studentDashboard.viewResult')
                  : t('studentDashboard.resumeTest')}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default StudentDashboardPage;
