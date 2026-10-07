import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { AdminFlashcardSetSummaryDTO } from '@platform/shared';
import { adminApi } from '../lib/adminApi';
import { ApiError } from '../lib/apiClient';
import { Alert, Badge, cardClassName, EmptyState, FlashcardsIcon, PageHeader } from '../components/ui';

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
      <PageHeader
        title={t('adminFlashcardSets.heading')}
        subtitle={t('adminFlashcardSets.subtitle')}
        icon={<FlashcardsIcon className="h-5 w-5" />}
      />

      {error && <Alert>{error}</Alert>}

      <ul className="flex flex-col gap-3">
        {sets === null && <p className="text-sm text-base-black/60">{t('common.loading')}</p>}
        {sets?.length === 0 && <EmptyState title={t('adminFlashcardSets.empty')} />}
        {sets?.map((set) => (
          <li key={set.id}>
            <Link
              to={`/teacher/flashcard-sets/${set.id}`}
              className={cardClassName(
                { variant: 'glass', hoverable: true },
                'flex items-center justify-between px-5 py-4',
              )}
            >
              <div>
                <p className="font-semibold text-primary-700">{set.name}</p>
                <p className="mt-1 text-xs text-base-black/60">
                  {t('adminFlashcardSets.owner', { name: set.teacherName, email: set.teacherEmail })}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-base-black/60">
                  <span>
                    {t('adminFlashcardSets.cardCount', { count: set.cardCount })} ·{' '}
                    {t('adminFlashcardSets.updatedAt', { date: new Date(set.updatedAt).toLocaleString() })}
                  </span>
                  {set.unitName && <Badge>{set.unitName}</Badge>}
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
