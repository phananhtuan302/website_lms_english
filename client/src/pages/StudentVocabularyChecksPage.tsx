import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { StudentVocabularyCheckSummaryDTO } from '@platform/shared';
import { studentApi } from '../lib/studentApi';
import { ApiError } from '../lib/apiClient';

/**
 * Student: Vocabulary Checks assigned to me (T-038). Same start/resume/result flow as
 * `StudentUnitTestsPage.tsx` — "Start" reuses `studentApi.startPractice` (`POST
 * /api/tests/:testId/practice`), the identical self-practice endpoint every other
 * standalone attempt uses, which is what plays through the real take-test runtime
 * (T-012) and auto-grading (T-013), including the fixed 15-minute timer/auto-submit
 * already built into `TakeTestPage.tsx`.
 */
function StudentVocabularyChecksPage() {
  const navigate = useNavigate();
  const [checks, setChecks] = useState<StudentVocabularyCheckSummaryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);

  useEffect(() => {
    studentApi
      .listVocabularyChecks()
      .then(setChecks)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load Vocabulary Checks.'));
  }, []);

  async function handleStart(testId: string) {
    setStartingId(testId);
    setError(null);
    try {
      const res = await studentApi.startPractice(testId);
      navigate(
        res.status === 'submitted'
          ? `/student/attempts/${res.attemptId}/result`
          : `/student/attempts/${res.attemptId}`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to start this Vocabulary Check.');
      setStartingId(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <Link to="/student/dashboard" className="text-sm text-primary-600 hover:underline">
          ← Back to dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-primary-700">Vocabulary Check</h1>
        <p className="mt-1 text-sm text-base-black/60">
          A fixed 15-minute check built from vocabulary you&apos;ve already studied. The timer
          auto-submits at 15 minutes.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {!error && !checks && <p className="text-sm text-base-black/60">Loading...</p>}
      {checks?.length === 0 && (
        <p className="text-sm text-base-black/60">
          No Vocabulary Check has been assigned to you yet.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {checks?.map((check) => (
          <li
            key={check.id}
            className="flex items-center justify-between rounded-lg border border-primary-100 px-4 py-3 text-sm"
          >
            <div>
              <p className="font-medium text-base-black">{check.title}</p>
              <p className="text-xs text-base-black/50">
                {check.timeLimitMinutes} min · {check.questionCount} question
                {check.questionCount === 1 ? '' : 's'}
                {check.myAttempt?.status === 'submitted' && ` · Score: ${check.myAttempt.scorePercent}%`}
                {check.myAttempt?.status === 'inProgress' && ' · In progress'}
              </p>
            </div>
            {check.myAttempt?.status === 'submitted' ? (
              <Link
                to={`/student/attempts/${check.myAttempt.attemptId}/result`}
                className="font-medium text-primary-600 hover:underline"
              >
                View result →
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => handleStart(check.id)}
                disabled={startingId === check.id}
                className="rounded-md bg-primary-500 px-4 py-1.5 text-xs font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {startingId === check.id
                  ? 'Starting...'
                  : check.myAttempt?.status === 'inProgress'
                    ? 'Resume →'
                    : 'Start →'}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default StudentVocabularyChecksPage;
