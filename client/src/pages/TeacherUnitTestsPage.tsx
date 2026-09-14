import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { TeacherUnitTestsResponseDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';

/**
 * Teacher's "Unit Tests" view (T-036): every `testType: 'unitTest'` test this teacher
 * owns, grouped by curriculum Unit. Tagging a test as a Unit Test (and flipping
 * `published`) happens in the regular test editor (`TeacherTestEditorPage.tsx`) — this
 * page is purely the grouped read-side view, plus a link into each unit's leaderboard
 * (T-037).
 */
function TeacherUnitTestsPage() {
  const [data, setData] = useState<TeacherUnitTestsResponseDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    teacherApi
      .listUnitTests()
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load Unit Tests.'));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/teacher/dashboard" className="text-sm text-primary-600 hover:underline">
          ← Back to dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-primary-700">Unit Tests</h1>
        <p className="mt-1 text-sm text-base-black/60">
          Every test tagged <code>testType: unitTest</code>, grouped by curriculum Unit. Tag a test
          this way (and publish it) from that test&apos;s own editor page — go to{' '}
          <Link to="/teacher/tests" className="text-primary-600 hover:underline">
            My tests
          </Link>{' '}
          to open one.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {!error && !data && <p className="text-sm text-base-black/60">Loading...</p>}
      {data?.groups.length === 0 && (
        <p className="text-sm text-base-black/60">
          No Unit Tests yet — open a test and set its type to "Unit Test".
        </p>
      )}

      {data?.groups.map((group) => (
        <section key={group.unitId ?? 'untagged'} className="rounded-xl border border-primary-200 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-base-black">{group.unitName ?? 'Untagged'}</h2>
            {group.unitId && (
              <Link
                to={`/units/${group.unitId}/leaderboard`}
                className="text-sm font-medium text-primary-600 hover:underline"
              >
                View leaderboard →
              </Link>
            )}
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {group.tests.map((test) => (
              <li key={test.id}>
                <Link
                  to={`/teacher/tests/${test.id}`}
                  className="flex items-center justify-between rounded-lg border border-primary-100 bg-primary-50 px-4 py-3 text-sm transition-colors hover:border-primary-300"
                >
                  <span className="font-medium text-base-black">{test.title}</span>
                  <span
                    className={
                      test.published
                        ? 'rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700'
                        : 'rounded-full bg-base-black/10 px-2 py-0.5 text-xs font-semibold text-base-black/60'
                    }
                  >
                    {test.published ? 'Published' : 'Not published'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default TeacherUnitTestsPage;
