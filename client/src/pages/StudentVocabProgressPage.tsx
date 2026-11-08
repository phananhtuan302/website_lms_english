import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { StudentVocabProgressDTO } from '@platform/shared';
import { flashcardApi } from '../lib/flashcardApi';
import { ApiError } from '../lib/apiClient';

/**
 * Student's own vocabulary progress view (T-030): per-set known/learning/new card
 * counts, plus overall per-exercise-type accuracy across every set. See
 * `studentFlashcards.routes.ts`'s `GET /progress` doc comment for exactly which sets
 * appear here (only ones with at least some recorded progress).
 */
function StudentVocabProgressPage() {
  const { t } = useTranslation();
  const [progress, setProgress] = useState<StudentVocabProgressDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    flashcardApi
      .getMyProgress()
      .then(setProgress)
      .catch((err) => setError(err instanceof ApiError ? err.message : t('studentVocabProgress.loadError')));
  }, [t]);

  return (
    <div className="vocab-zone vocab-canvas -m-4 flex flex-col gap-6 rounded-3xl p-4 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8">
      <div>
        <h1 className="vocab-display text-3xl font-bold text-primary-900">{t('studentVocabProgress.heading')}</h1>
        <p className="mt-1 text-sm text-base-black/60">{t('studentVocabProgress.subtitle')}</p>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {!error && !progress && <p className="text-sm text-base-black/60">{t('common.loading')}</p>}

      {progress && (
        <>
          <section>
            <h2 className="vocab-display text-lg font-bold text-primary-900">{t('studentVocabProgress.bySetHeading')}</h2>
            {progress.sets.length === 0 && (
              <p className="mt-2 text-sm text-base-black/60">
                {t('studentVocabProgress.noSetsStarted')}{' '}
                <Link to="/student/flashcard-sets" className="font-semibold text-primary-700 hover:underline">
                  {t('studentVocabProgress.browseSetsLink')}
                </Link>
              </p>
            )}
            <ul className="mt-3 flex flex-col gap-3">
              {progress.sets.map((set) => {
                const pct = set.cardCount > 0 ? Math.round((set.knownCount / set.cardCount) * 100) : 0;
                return (
                  <li key={set.setId} className="rounded-2xl border-2 border-primary-100 bg-base-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        to={`/student/flashcard-sets/${set.setId}`}
                        className="font-bold text-primary-800 hover:text-primary-600"
                      >
                        {set.setName}
                        {set.unitName && <span className="ml-2 text-xs font-normal text-base-black/50">({set.unitName})</span>}
                      </Link>
                      <span className="vocab-display text-sm font-bold text-primary-700">{pct}%</span>
                    </div>
                    <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-primary-100">
                      <div
                        className="h-full rounded-full bg-green-500 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-base-black/70">
                      <span>{t('studentVocabProgress.knownLabel')} <strong className="text-green-700">{set.knownCount}</strong></span>
                      <span>{t('studentVocabProgress.learningLabel')} <strong className="text-amber-700">{set.learningCount}</strong></span>
                      <span>{t('studentVocabProgress.newLabel')} <strong className="text-base-black">{set.newCount}</strong></span>
                      <span>{t('studentVocabProgress.totalLabel')} {set.cardCount}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <h2 className="vocab-display text-lg font-bold text-primary-900">{t('studentVocabProgress.byExerciseHeading')}</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {progress.activityStats.map((stat) => (
                <div key={stat.type} className="rounded-2xl border-2 border-primary-100 bg-base-white p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-primary-900/50">
                    {t(`studentVocabProgress.activity.${stat.type}`, { defaultValue: stat.type })}
                  </p>
                  <p className="vocab-display mt-1 text-2xl font-bold text-primary-800">
                    {stat.accuracyPercent === null ? '—' : `${stat.accuracyPercent}%`}
                  </p>
                  <p className="mt-0.5 text-xs text-base-black/50">
                    {t('studentVocabProgress.colCorrect')} {stat.correct}/{stat.attempted}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default StudentVocabProgressPage;
