import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { StudentVocabProgressDTO } from '@platform/shared';
import { flashcardApi } from '../lib/flashcardApi';
import { ApiError } from '../lib/apiClient';

const ACTIVITY_LABELS: Record<string, string> = {
  fillBlank: 'Fill in the blank',
  unscramble: 'Unscramble',
  listenAndType: 'Listen and type',
  ipaToWord: 'IPA to word',
  matching: 'Matching',
  sentence: 'Use in a sentence',
  spaceShooter: 'Space shooter game',
  runner: 'Runner game',
};

/**
 * Student's own vocabulary progress view (T-030): per-set known/learning/new card
 * counts, plus overall per-exercise-type accuracy across every set. See
 * `studentFlashcards.routes.ts`'s `GET /progress` doc comment for exactly which sets
 * appear here (only ones with at least some recorded progress).
 */
function StudentVocabProgressPage() {
  const [progress, setProgress] = useState<StudentVocabProgressDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    flashcardApi
      .getMyProgress()
      .then(setProgress)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load your progress.'));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-700">My vocabulary progress</h1>
        <p className="mt-1 text-sm text-base-black/60">
          How many cards you know per set, and your accuracy on each exercise type.
        </p>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {!error && !progress && <p className="text-sm text-base-black/60">Loading...</p>}

      {progress && (
        <>
          <section>
            <h2 className="text-lg font-bold text-base-black">By flashcard set</h2>
            {progress.sets.length === 0 && (
              <p className="mt-2 text-sm text-base-black/60">
                You haven&apos;t started studying any set yet.{' '}
                <Link to="/student/flashcard-sets" className="text-primary-600 hover:underline">
                  Browse flashcard sets →
                </Link>
              </p>
            )}
            <ul className="mt-3 flex flex-col gap-2">
              {progress.sets.map((set) => (
                <li
                  key={set.setId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary-100 px-4 py-3 text-sm"
                >
                  <div>
                    <Link
                      to={`/student/flashcard-sets/${set.setId}`}
                      className="font-medium text-primary-700 hover:underline"
                    >
                      {set.setName}
                    </Link>
                    {set.unitName && <span className="ml-2 text-xs text-base-black/50">({set.unitName})</span>}
                  </div>
                  <div className="flex gap-4 text-xs text-base-black/70">
                    <span>Known: <strong className="text-base-black">{set.knownCount}</strong></span>
                    <span>Learning: <strong className="text-base-black">{set.learningCount}</strong></span>
                    <span>New: <strong className="text-base-black">{set.newCount}</strong></span>
                    <span>Total: {set.cardCount}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-base-black">By exercise type (all sets)</h2>
            <div className="mt-3 overflow-x-auto rounded-xl border border-primary-200">
              <table className="min-w-full divide-y divide-primary-100 text-sm">
                <thead className="bg-primary-50 text-left text-xs font-semibold uppercase tracking-wide text-primary-700">
                  <tr>
                    <th className="px-4 py-3">Exercise type</th>
                    <th className="px-4 py-3">Attempted</th>
                    <th className="px-4 py-3">Correct</th>
                    <th className="px-4 py-3">Accuracy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary-100">
                  {progress.activityStats.map((stat) => (
                    <tr key={stat.type}>
                      <td className="px-4 py-3 font-medium text-base-black">
                        {ACTIVITY_LABELS[stat.type] ?? stat.type}
                      </td>
                      <td className="px-4 py-3 text-base-black/80">{stat.attempted}</td>
                      <td className="px-4 py-3 text-base-black/80">{stat.correct}</td>
                      <td className="px-4 py-3 text-base-black/80">
                        {stat.accuracyPercent === null ? '—' : `${stat.accuracyPercent}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default StudentVocabProgressPage;
