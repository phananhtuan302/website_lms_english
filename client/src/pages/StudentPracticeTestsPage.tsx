import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TEST_TYPE_LABELS, type PracticeTestSummaryDTO } from '@platform/shared';
import { studentApi } from '../lib/studentApi';
import { ApiError } from '../lib/apiClient';

/**
 * Student home self-practice picker (T-040), reachable at `/student/practice`. Every
 * test is listed (same "no class/enrollment concept" convention already used for
 * flashcard sets) — picking one starts/resumes a `selfPractice` `TestSession` (see
 * `SessionMode`'s doc comment in schema.prisma) via `POST /api/tests/:testId/practice`,
 * then drops the student straight into the same take-test runtime
 * (`TakeTestPage.tsx`) used for a live QR-joined attempt. The only behavioral
 * difference the student will notice is Listening playback: standalone here means an
 * enabled, student-controlled Play button (T-040), whereas the exact same test taken via
 * a teacher's live session hides it in favor of teacher-broadcast playback (T-041).
 */
function StudentPracticeTestsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [tests, setTests] = useState<PracticeTestSummaryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startingTestId, setStartingTestId] = useState<string | null>(null);

  useEffect(() => {
    studentApi
      .listPracticeTests()
      .then(setTests)
      .catch((err) => setError(err instanceof ApiError ? err.message : t('studentPracticeTests.loadTestsFailed')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleStartPractice(testId: string) {
    setStartingTestId(testId);
    setError(null);
    try {
      const res = await studentApi.startPractice(testId);
      const destination =
        res.status === 'submitted'
          ? `/student/attempts/${res.attemptId}/result`
          : `/student/attempts/${res.attemptId}`;
      navigate(destination);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('studentPracticeTests.startPracticeFailed'));
      setStartingTestId(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <Link to="/student/dashboard" className="text-sm text-primary-600 hover:underline">
          {t('studentPracticeTests.backToDashboard')}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-primary-700">{t('studentPracticeTests.heading')}</h1>
        <p className="mt-1 text-sm text-base-black/60">
          {t('studentPracticeTests.description')}
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {tests === null && !error && <p className="text-sm text-base-black/60">{t('common.loading')}</p>}
      {tests?.length === 0 && <p className="text-sm text-base-black/60">{t('studentPracticeTests.noTests')}</p>}

      <ul className="flex flex-col gap-2">
        {tests?.map((test) => (
          <li
            key={test.id}
            className="flex items-center justify-between rounded-lg border border-primary-100 px-4 py-3 text-sm"
          >
            <span className="font-medium text-base-black">
              {test.title}
              {test.testType !== 'generic' && (
                <span className="ml-2 rounded-full bg-primary-200 px-2 py-0.5 text-xs font-medium text-primary-800">
                  {TEST_TYPE_LABELS[test.testType]}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => handleStartPractice(test.id)}
              disabled={startingTestId === test.id}
              className="rounded-md bg-primary-500 px-4 py-1.5 text-xs font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {startingTestId === test.id ? t('studentPracticeTests.starting') : t('studentPracticeTests.practice')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default StudentPracticeTestsPage;
