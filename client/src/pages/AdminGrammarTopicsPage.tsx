import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminGrammarTopicSummaryDTO } from '@platform/shared';
import { adminApi } from '../lib/adminApi';
import { ApiError } from '../lib/apiClient';

/** Admin-only "browse everything" list for Grammar topics (T-071) — same pattern as
 * `AdminTestsPage.tsx`/`AdminFlashcardSetsPage.tsx`: shows the owning teacher on every
 * row, and opens the EXISTING teacher-side editor (`/teacher/grammar-topics/:id`), whose
 * ownership check now also accepts an admin caller. */
function AdminGrammarTopicsPage() {
  const [topics, setTopics] = useState<AdminGrammarTopicSummaryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .listAllGrammarTopics()
      .then(setTopics)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load Grammar topics.'));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary-700">All Grammar topics</h1>
      <p className="mt-1 text-sm text-base-black/60">
        Every Grammar topic in the system, across every teacher. Open one to edit or delete it using
        the same editor a teacher uses.
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <ul className="mt-8 flex flex-col gap-3">
        {topics === null && <p className="text-sm text-base-black/60">Loading...</p>}
        {topics?.length === 0 && <p className="text-sm text-base-black/60">No Grammar topics exist yet.</p>}
        {topics?.map((topic) => (
          <li key={topic.id}>
            <Link
              to={`/teacher/grammar-topics/${topic.id}`}
              className="flex items-center justify-between rounded-xl border border-primary-100 bg-primary-50 px-5 py-4 transition-colors hover:border-primary-300"
            >
              <div>
                <p className="font-semibold text-primary-700">{topic.title}</p>
                <p className="mt-1 text-xs text-base-black/60">
                  Owner: {topic.teacherName} ({topic.teacherEmail})
                </p>
                <p className="mt-1 text-xs text-base-black/60">
                  {topic.exerciseCount} exercise{topic.exerciseCount === 1 ? '' : 's'} · updated{' '}
                  {new Date(topic.updatedAt).toLocaleString()}
                  {topic.unitName && (
                    <>
                      {' '}
                      ·{' '}
                      <span className="rounded-full bg-primary-100 px-2 py-0.5 font-medium text-primary-700">
                        {topic.unitName}
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

export default AdminGrammarTopicsPage;
