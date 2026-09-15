import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { AdminFlashcardSetSummaryDTO } from '@platform/shared';
import { adminApi } from '../lib/adminApi';
import { ApiError } from '../lib/apiClient';

/** Admin-only "browse everything" list for Flashcard sets (T-071) — same pattern as
 * `AdminTestsPage.tsx`: shows the owning teacher on every row, and opens the EXISTING
 * teacher-side editor (`/teacher/flashcard-sets/:id`), whose ownership check now also
 * accepts an admin caller. */
function AdminFlashcardSetsPage() {
  const { t } = useTranslation();
  const [sets, setSets] = useState<AdminFlashcardSetSummaryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .listAllFlashcardSets()
      .then(setSets)
      .catch((err) => setError(err instanceof ApiError ? err.message : t('adminFlashcardSets.errors.loadFailed')));
  }, [t]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary-700">{t('adminFlashcardSets.heading')}</h1>
      <p className="mt-1 text-sm text-base-black/60">{t('adminFlashcardSets.subtitle')}</p>

      {error && (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <ul className="mt-8 flex flex-col gap-3">
        {sets === null && <p className="text-sm text-base-black/60">{t('common.loading')}</p>}
        {sets?.length === 0 && <p className="text-sm text-base-black/60">{t('adminFlashcardSets.empty')}</p>}
        {sets?.map((set) => (
          <li key={set.id}>
            <Link
              to={`/teacher/flashcard-sets/${set.id}`}
              className="flex items-center justify-between rounded-xl border border-primary-100 bg-primary-50 px-5 py-4 transition-colors hover:border-primary-300"
            >
              <div>
                <p className="font-semibold text-primary-700">{set.name}</p>
                <p className="mt-1 text-xs text-base-black/60">
                  {t('adminFlashcardSets.owner', { name: set.teacherName, email: set.teacherEmail })}
                </p>
                <p className="mt-1 text-xs text-base-black/60">
                  {t('adminFlashcardSets.cardCount', { count: set.cardCount })} ·{' '}
                  {t('adminFlashcardSets.updatedAt', { date: new Date(set.updatedAt).toLocaleString() })}
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
              <span className="text-sm font-medium text-primary-600">{t('adminFlashcardSets.openEditor')}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default AdminFlashcardSetsPage;
