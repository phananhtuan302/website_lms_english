import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { StudentUnitTestsResponseDTO } from '@platform/shared';
import { studentApi } from '../lib/studentApi';
import { ApiError } from '../lib/apiClient';

/**
 * Student's "Unit Tests I can take" view (T-036): every PUBLISHED `unitTest`-type test,
 * grouped by Unit. "Take"/"Resume"/"View result" all reuse the exact same self-practice
 * start endpoint (`POST /api/tests/:testId/practice`, `studentApi.startPractice`) as
 * every other standalone attempt — no separate start-attempt flow exists for Unit Tests.
 */
function StudentUnitTestsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [data, setData] = useState<StudentUnitTestsResponseDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startingTestId, setStartingTestId] = useState<string | null>(null);

  useEffect(() => {
    studentApi
      .listUnitTests()
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : t('studentUnitTests.loadFailed')));
  }, [t]);

  async function handleStart(testId: string) {
    setStartingTestId(testId);
    setError(null);
    try {
      const res = await studentApi.startPractice(testId);
      navigate(
        res.status === 'submitted'
          ? `/student/attempts/${res.attemptId}/result`
          : `/student/attempts/${res.attemptId}`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('studentUnitTests.startFailed'));
      setStartingTestId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/student/dashboard" className="text-sm text-primary-600 hover:underline">
          {t('studentUnitTests.backToDashboard')}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-primary-700">{t('studentUnitTests.heading')}</h1>
        <p className="mt-1 text-sm text-base-black/60">{t('studentUnitTests.description')}</p>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {!error && !data && <p className="text-sm text-base-black/60">{t('common.loading')}</p>}
      {data?.groups.length === 0 && (
        <p className="text-sm text-base-black/60">{t('studentUnitTests.empty')}</p>
      )}

      {data?.groups.map((group) => (
        <section key={group.unitId ?? 'untagged'} className="rounded-xl border border-primary-200 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-base-black">
              {group.unitName ?? t('studentUnitTests.untaggedGroup')}
            </h2>
            {group.unitId && (
              <Link
                to={`/units/${group.unitId}/leaderboard`}
                className="text-sm font-medium text-primary-600 hover:underline"
              >
                {t('studentUnitTests.viewLeaderboard')}
              </Link>
            )}
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {group.tests.map((test) => (
              <li
                key={test.id}
                className="flex items-center justify-between rounded-lg border border-primary-100 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-base-black">{test.title}</p>
                  {test.myAttempt?.status === 'submitted' && (
                    <p className="text-xs text-base-black/50">
                      {t('studentUnitTests.scorePercent', { percent: test.myAttempt.scorePercent })}
                    </p>
                  )}
                  {test.myAttempt?.status === 'inProgress' && (
                    <p className="text-xs text-base-black/50">{t('studentUnitTests.inProgress')}</p>
                  )}
                </div>
                {test.myAttempt?.status === 'submitted' ? (
                  <Link
                    to={`/student/attempts/${test.myAttempt.attemptId}/result`}
                    className="font-medium text-primary-600 hover:underline"
                  >
                    {t('studentUnitTests.viewResult')}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleStart(test.id)}
                    disabled={startingTestId === test.id}
                    className="rounded-md bg-primary-500 px-4 py-1.5 text-xs font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {startingTestId === test.id
                      ? t('studentUnitTests.starting')
                      : test.myAttempt?.status === 'inProgress'
                        ? t('studentUnitTests.resume')
                        : t('studentUnitTests.takeTest')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default StudentUnitTestsPage;
