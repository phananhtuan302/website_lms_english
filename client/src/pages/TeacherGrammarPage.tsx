import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { GrammarTopicSummaryDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';

/**
 * Teacher's "my Grammar topics" list (T-046/T-047). Same shape as
 * `TeacherFlashcardsPage.tsx`: lists every topic this teacher owns and lets them create
 * a new one, immediately navigating into the editor for it.
 */
function TeacherGrammarPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [topics, setTopics] = useState<GrammarTopicSummaryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  function loadTopics() {
    teacherApi
      .listGrammarTopics()
      .then(setTopics)
      .catch((err) => setError(err instanceof ApiError ? err.message : t('teacherGrammar.loadFailed')));
  }

  // `t` is stable in practice (site-wide, admin-controlled language — PROJECT_PLAN
  // Guiding Principle 3/Assumption A13), safe to omit from this dependency list.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadTopics, []);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title) return;

    setIsCreating(true);
    setError(null);
    try {
      const created = await teacherApi.createGrammarTopic({
        title,
        theoryContent: t('teacherGrammar.defaultTheoryContent'),
      });
      navigate(`/teacher/grammar-topics/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('teacherGrammar.createFailed'));
      setIsCreating(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary-700">{t('teacherGrammar.heading')}</h1>
      <p className="mt-1 text-sm text-base-black/60">{t('teacherGrammar.subtitle')}</p>

      <form onSubmit={handleCreate} className="mt-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          {t('teacherGrammar.newTopicTitleLabel')}
          <input
            type="text"
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder={t('teacherGrammar.titlePlaceholder')}
            className="w-72 rounded-md border border-primary-200 px-3 py-2 text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
        </label>
        <button
          type="submit"
          disabled={isCreating || !newTitle.trim()}
          className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isCreating ? t('teacherGrammar.creating') : t('teacherGrammar.createTopic')}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <ul className="mt-8 flex flex-col gap-3">
        {topics === null && <p className="text-sm text-base-black/60">{t('common.loading')}</p>}
        {topics?.length === 0 && (
          <p className="text-sm text-base-black/60">{t('teacherGrammar.emptyState')}</p>
        )}
        {topics?.map((topic) => (
          <li key={topic.id}>
            <Link
              to={`/teacher/grammar-topics/${topic.id}`}
              className="flex items-center justify-between rounded-xl border border-primary-100 bg-primary-50 px-5 py-4 transition-colors hover:border-primary-300"
            >
              <div>
                <p className="font-semibold text-primary-700">{topic.title}</p>
                <p className="mt-1 text-xs text-base-black/60">
                  {t('teacherGrammar.exerciseCount', { count: topic.exerciseCount })}
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
              <span className="text-sm font-medium text-primary-600">{t('teacherGrammar.openEditor')}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default TeacherGrammarPage;
