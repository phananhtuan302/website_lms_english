import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { StudentGrammarTopicSummaryDTO } from '@platform/shared';
import { grammarApi } from '../lib/grammarApi';
import { ApiError } from '../lib/apiClient';

/**
 * Student-facing Grammar topic browser (T-047). Every topic is visible to every
 * student — same "no enrollment concept" convention as `StudentFlashcardsPage.tsx`.
 */
function StudentGrammarPage() {
  const { t } = useTranslation();
  const [topics, setTopics] = useState<StudentGrammarTopicSummaryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    grammarApi
      .listTopics()
      .then(setTopics)
      .catch((err) => setError(err instanceof ApiError ? err.message : t('studentGrammar.loadFailed')));
  }, [t]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary-700">{t('studentGrammar.heading')}</h1>
      <p className="mt-1 text-sm text-base-black/60">{t('studentGrammar.subtitle')}</p>

      {error && (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <ul className="mt-6 flex flex-col gap-3">
        {topics === null && !error && <p className="text-sm text-base-black/60">{t('common.loading')}</p>}
        {topics?.length === 0 && (
          <p className="text-sm text-base-black/60">{t('studentGrammar.emptyState')}</p>
        )}
        {topics?.map((topic) => (
          <li key={topic.id}>
            <Link
              to={`/student/grammar-topics/${topic.id}`}
              className="flex items-center justify-between rounded-xl border border-primary-100 bg-primary-50 px-5 py-4 transition-colors hover:border-primary-300"
            >
              <div>
                <p className="font-semibold text-primary-700">{topic.title}</p>
                <p className="mt-1 text-xs text-base-black/60">
                  {t('studentGrammar.exerciseCount', { count: topic.exerciseCount })}
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
              <span className="text-sm font-medium text-primary-600">{t('studentGrammar.read')}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default StudentGrammarPage;
