import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { StudentFlashcardSetSummaryDTO } from '@platform/shared';
import { flashcardApi } from '../lib/flashcardApi';
import { ApiError } from '../lib/apiClient';

/**
 * Student-facing flashcard set browser (T-023). Every set is visible to every student —
 * see `studentFlashcards.routes.ts`'s module doc comment for why there's no
 * enrollment/assignment filter yet.
 */
function StudentFlashcardsPage() {
  const { t } = useTranslation();
  const [sets, setSets] = useState<StudentFlashcardSetSummaryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    flashcardApi
      .listSets()
      .then(setSets)
      .catch((err) => setError(err instanceof ApiError ? err.message : t('studentFlashcards.loadError')));
  }, [t]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary-700">{t('studentFlashcards.heading')}</h1>
      <p className="mt-1 text-sm text-base-black/60">{t('studentFlashcards.subtitle')}</p>

      {error && (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <ul className="mt-6 flex flex-col gap-3">
        {sets === null && !error && <p className="text-sm text-base-black/60">{t('common.loading')}</p>}
        {sets?.length === 0 && (
          <p className="text-sm text-base-black/60">{t('studentFlashcards.emptyState')}</p>
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
                  {t('studentFlashcards.cardCount', { count: set.cardCount })}
                  {set.unitName && (
                    <>
                      {' '}
                      ·{' '}
                      <span className="rounded-full bg-primary-100 px-2 py-0.5 font-medium text-primary-700">
                        {set.unitName}
                      </span>
                    </>
                  )}
                  {' '}
                  ·{' '}
                  {/* T-089: this student's own permanent self-check point ledger for this
                      ONE set — see StudentFlashcardSetSummaryDTO.selfCheckScore's doc
                      comment for why it's per-set here but summed across every set on the
                      Vocabulary Leaderboard. */}
                  <span
                    className={`font-medium ${set.selfCheckScore < 0 ? 'text-red-600' : 'text-primary-700'}`}
                  >
                    {t('studentFlashcards.selfCheckScore', { score: set.selfCheckScore })}
                  </span>
                </p>
              </div>
              <span className="text-sm font-medium text-primary-600">{t('studentFlashcards.studyLink')}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default StudentFlashcardsPage;
