import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { StudentFlashcardSetSummaryDTO } from '@platform/shared';
import { flashcardApi } from '../lib/flashcardApi';
import { ApiError } from '../lib/apiClient';

/**
 * Student-facing flashcard set browser (T-023). Every set is visible to every student —
 * see `studentFlashcards.routes.ts`'s module doc comment for why there's no
 * enrollment/assignment filter yet.
 */
function StudentFlashcardsPage() {
  const [sets, setSets] = useState<StudentFlashcardSetSummaryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    flashcardApi
      .listSets()
      .then(setSets)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load flashcard sets.'));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary-700">Vocabulary</h1>
      <p className="mt-1 text-sm text-base-black/60">
        Study a flashcard set, then practice with fill-in-the-blank, unscramble, listen-and-type, or
        IPA-to-word exercises.
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <ul className="mt-6 flex flex-col gap-3">
        {sets === null && !error && <p className="text-sm text-base-black/60">Loading...</p>}
        {sets?.length === 0 && (
          <p className="text-sm text-base-black/60">No flashcard sets available yet.</p>
        )}
        {sets?.map((set) => (
          <li key={set.id}>
            <Link
              to={`/student/flashcard-sets/${set.id}`}
              className="flex items-center justify-between rounded-xl border border-primary-100 bg-primary-50 px-5 py-4 transition-colors hover:border-primary-300"
            >
              <div>
                <p className="font-semibold text-primary-700">{set.name}</p>
                <p className="mt-1 text-xs text-base-black/60">
                  {set.cardCount} card{set.cardCount === 1 ? '' : 's'}
                  {set.unitName && (
                    <>
                      {' '}
                      ·{' '}
                      <span className="rounded-full bg-primary-100 px-2 py-0.5 font-medium text-primary-700">
                        {set.unitName}
                      </span>
                    </>
                  )}
                </p>
              </div>
              <span className="text-sm font-medium text-primary-600">Study →</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default StudentFlashcardsPage;
