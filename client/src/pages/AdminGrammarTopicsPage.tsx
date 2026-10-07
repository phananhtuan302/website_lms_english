import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { AdminGrammarTopicSummaryDTO } from '@platform/shared';
import { adminApi } from '../lib/adminApi';
import { ApiError } from '../lib/apiClient';
import { Alert, Badge, cardClassName, EmptyState, GrammarIcon, PageHeader } from '../components/ui';

/** Admin-only "browse everything" list for Grammar topics (T-071) — same pattern as
 * `AdminTestsPage.tsx`/`AdminFlashcardSetsPage.tsx`: shows the owning teacher on every
 * row, and opens the EXISTING teacher-side editor (`/teacher/grammar-topics/:id`), whose
 * ownership check now also accepts an admin caller. */
function AdminGrammarTopicsPage() {
  const { t } = useTranslation();
  const [topics, setTopics] = useState<AdminGrammarTopicSummaryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .listAllGrammarTopics()
      .then(setTopics)
      .catch((err) => setError(err instanceof ApiError ? err.message : t('adminGrammarTopics.errors.loadFailed')));
  }, [t]);

  return (
    <div>
      <PageHeader
        title={t('adminGrammarTopics.heading')}
        subtitle={t('adminGrammarTopics.subtitle')}
        icon={<GrammarIcon className="h-5 w-5" />}
      />

      {error && <Alert>{error}</Alert>}

      <ul className="flex flex-col gap-3">
        {topics === null && <p className="text-sm text-base-black/60">{t('common.loading')}</p>}
        {topics?.length === 0 && <EmptyState title={t('adminGrammarTopics.empty')} />}
        {topics?.map((topic) => (
          <li key={topic.id}>
            <Link
              to={`/teacher/grammar-topics/${topic.id}`}
              className={cardClassName(
                { variant: 'glass', hoverable: true },
                'flex items-center justify-between px-5 py-4',
              )}
            >
              <div>
                <p className="font-semibold text-primary-700">{topic.title}</p>
                <p className="mt-1 text-xs text-base-black/60">
                  {t('adminGrammarTopics.owner', { name: topic.teacherName, email: topic.teacherEmail })}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-base-black/60">
                  <span>
                    {t('adminGrammarTopics.exerciseCount', { count: topic.exerciseCount })} ·{' '}
                    {t('adminGrammarTopics.updatedAt', { date: new Date(topic.updatedAt).toLocaleString() })}
                  </span>
                  {topic.unitName && <Badge>{topic.unitName}</Badge>}
                </p>
              </div>
              <span className="text-sm font-medium text-primary-600">{t('adminGrammarTopics.openEditor')}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default AdminGrammarTopicsPage;
