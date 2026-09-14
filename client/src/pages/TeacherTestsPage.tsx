import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { TestSummaryDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';

/**
 * Teacher's "my tests" list (T-008). Reachable from the teacher dashboard. Lets a
 * teacher see every test they've authored and create a new one, which immediately
 * navigates into the editor (`TeacherTestEditorPage`) for that new test.
 */
function TeacherTestsPage() {
  const navigate = useNavigate();
  const [tests, setTests] = useState<TestSummaryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  function loadTests() {
    teacherApi
      .listTests()
      .then(setTests)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load tests.'));
  }

  useEffect(loadTests, []);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title) return;

    setIsCreating(true);
    setError(null);
    try {
      const created = await teacherApi.createTest({ title });
      navigate(`/teacher/tests/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create test.');
      setIsCreating(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary-700">My tests</h1>
      <p className="mt-1 text-sm text-base-black/60">
        Create and edit your own tests. Students and sessions are added from a specific test's page.
      </p>

      <form onSubmit={handleCreate} className="mt-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          New test title
          <input
            type="text"
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="e.g. Unit 3 Grammar Quiz"
            className="w-72 rounded-md border border-primary-200 px-3 py-2 text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
        </label>
        <button
          type="submit"
          disabled={isCreating || !newTitle.trim()}
          className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isCreating ? 'Creating...' : 'Create test'}
        </button>
      </form>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <ul className="mt-8 flex flex-col gap-3">
        {tests === null && <p className="text-sm text-base-black/60">Loading...</p>}
        {tests?.length === 0 && (
          <p className="text-sm text-base-black/60">No tests yet — create your first one above.</p>
        )}
        {tests?.map((test) => (
          <li key={test.id}>
            <Link
              to={`/teacher/tests/${test.id}`}
              className="flex items-center justify-between rounded-xl border border-primary-100 bg-primary-50 px-5 py-4 transition-colors hover:border-primary-300"
            >
              <div>
                <p className="font-semibold text-primary-700">{test.title}</p>
                <p className="mt-1 text-xs text-base-black/60">
                  {test.sectionCount} section{test.sectionCount === 1 ? '' : 's'} ·{' '}
                  {test.questionCount} question
                  {test.questionCount === 1 ? '' : 's'} · updated{' '}
                  {new Date(test.updatedAt).toLocaleString()}
                  {test.unitName && (
                    <>
                      {' '}
                      ·{' '}
                      <span className="rounded-full bg-primary-100 px-2 py-0.5 font-medium text-primary-700">
                        {test.unitName}
                      </span>
                    </>
                  )}
                </p>
              </div>
              <span className="text-sm font-medium text-primary-600">Open editor →</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default TeacherTestsPage;
