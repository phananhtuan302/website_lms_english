import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
  const [attempts, setAttempts] = useState<AttemptSummaryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    studentApi
      .listMyAttempts()
      .then(setAttempts)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load your attempts.'));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-primary-100 bg-primary-50 p-8">
        <h1 className="text-2xl font-bold text-primary-700">Student dashboard</h1>
        <p className="mt-2 text-base-black/70">
          Welcome, {user?.name}. Scan or open a teacher&apos;s join link to start a test — it will
          appear below once you&apos;ve joined.
        </p>
        <button
          type="button"
          onClick={logout}
          className="mt-6 rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
        >
          Log out
        </button>
      </div>

      <div>
        <h2 className="text-lg font-bold text-base-black">My test attempts</h2>
        {error && (
          <p role="alert" className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {attempts === null && !error && <p className="mt-2 text-sm text-base-black/60">Loading...</p>}
        {attempts?.length === 0 && (
          <p className="mt-2 text-sm text-base-black/60">You haven&apos;t joined any tests yet.</p>
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
                    ? `Score: ${attempt.scorePercent}% (${attempt.correctCount}/${attempt.totalCount})`
                    : 'In progress'}
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
                {attempt.status === 'submitted' ? 'View result →' : 'Resume test →'}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default StudentDashboardPage;
