import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { FlashcardSetSummaryDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';
import LibraryBreadcrumb from '../components/LibraryBreadcrumb';

/**
 * Teacher's "my flashcard sets" list (T-022). Same shape as `TeacherTestsPage.tsx`:
 * lists every set this teacher owns and lets them create a new one, immediately
 * navigating into the editor for it.
 */
function TeacherFlashcardsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [sets, setSets] = useState<FlashcardSetSummaryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  function loadSets() {
    teacherApi
      .listFlashcardSets()
      .then(setSets)
      .catch((err) => setError(err instanceof ApiError ? err.message : t('teacherFlashcards.loadError')));
  }

  // `t` is stable in practice (site-wide, admin-controlled language — PROJECT_PLAN
  // Guiding Principle 3/Assumption A13), safe to omit from this dependency list.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadSets, []);

  // Phase 16 "Nhân bản" (T-118): duplicates the set's cards into a new, unassigned draft, then
  // jumps straight into that new set's editor — no confirmation needed, duplicating only ever
  // creates something new.
  async function handleDuplicate(setId: string) {
    setDuplicatingId(setId);
    setError(null);
    try {
      const created = await teacherApi.duplicateFlashcardSet(setId);
      navigate(`/teacher/flashcard-sets/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('teacherFlashcards.duplicateError'));
      setDuplicatingId(null);
    }
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;

    setIsCreating(true);
    setError(null);
    try {
      const created = await teacherApi.createFlashcardSet({ name });
      navigate(`/teacher/flashcard-sets/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('teacherFlashcards.createError'));
      setIsCreating(false);
    }
  }

  return (
    <div>
      <LibraryBreadcrumb section="flashcards" />
      <h1 className="mt-2 text-2xl font-bold text-primary-700">{t('teacherFlashcards.heading')}</h1>
      <p className="mt-1 text-sm text-base-black/60">{t('teacherFlashcards.subtitle')}</p>

      <form onSubmit={handleCreate} className="mt-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          {t('teacherFlashcards.newSetNameLabel')}
          <input
            type="text"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder={t('teacherFlashcards.newSetNamePlaceholder')}
            className="w-72 rounded-md border border-primary-200 px-3 py-2 text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
        </label>
        <button
          type="submit"
          disabled={isCreating || !newName.trim()}
          className="rounded-md bg-primary-500 px-4 py-2.5 sm:py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isCreating ? t('teacherFlashcards.creating') : t('teacherFlashcards.createSet')}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <ul className="mt-8 flex flex-col gap-3">
        {sets === null && <p className="text-sm text-base-black/60">{t('common.loading')}</p>}
        {sets?.length === 0 && (
          <p className="text-sm text-base-black/60">{t('teacherFlashcards.emptyState')}</p>
        )}
        {sets?.map((set) => (
          <li
            key={set.id}
            className="flex flex-col gap-3 rounded-xl border border-primary-100 bg-primary-50 px-5 py-4 transition-colors hover:border-primary-300 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <Link to={`/teacher/flashcard-sets/${set.id}`} className="min-w-0 flex-1">
              <p className="font-semibold text-primary-700">{set.name}</p>
              <p className="mt-1 text-xs text-base-black/60">
                {t('teacherFlashcards.cardCount', { count: set.cardCount })}
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
            </Link>
            <div className="flex shrink-0 items-center gap-x-4">
              <Link
                to={`/teacher/flashcard-sets/${set.id}`}
                className="text-sm font-medium text-primary-600 hover:underline"
              >
                {t('teacherFlashcards.openEditor')}
              </Link>
              <button
                type="button"
                onClick={() => handleDuplicate(set.id)}
                disabled={duplicatingId === set.id}
                aria-label={t('teacherFlashcards.duplicateAriaLabel', { name: set.name })}
                className="text-sm font-medium text-primary-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
              >
                {duplicatingId === set.id
                  ? t('teacherFlashcards.duplicating')
                  : t('teacherFlashcards.duplicateButton')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default TeacherFlashcardsPage;
