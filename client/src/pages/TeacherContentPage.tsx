import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type {
  ClassDTO,
  ContentClassAssignmentDTO,
  TeacherContentItemDTO,
  TeacherContentResponseDTO,
  TeacherContentType,
} from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';

/**
 * Consolidated "My Content" management page (T-075, Phase 12) — the customer's explicit
 * request for ONE page listing every Test/FlashcardSet/GrammarTopic a teacher has
 * authored (grouped by type, three sections) with a compact per-item control to toggle
 * which of the teacher's classes it's assigned to, WITHOUT opening that item's full
 * editor. Content is authored once in its own editor as always (T-008/T-022/T-047);
 * this page only manages the separate many-to-many assignment (PROJECT_PLAN Phase 12's
 * "critical design correction" — assignment, not ownership).
 *
 * Each class chip toggles immediately on click: local state updates optimistically (so
 * the UI feels instant, per T-075's "should feel immediate" requirement) and the PUT
 * request fires in the background; a failure reverts that one item's chip state and
 * shows an inline error, rather than a full-page reload/save button.
 */
function TeacherContentPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<TeacherContentResponseDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Keyed by `${type}:${id}` — which single item's chip row is currently mid-request, so
  // only THAT row's chips are disabled while saving, not the whole page.
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  function load() {
    teacherApi
      .listMyContent()
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : t('teacherContent.loadFailed')));
  }

  // `t` is stable in practice (site-wide, admin-controlled language, resolved once at
  // startup — PROJECT_PLAN Guiding Principle 3/Assumption A13), so it's safe to omit here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  function itemKey(type: TeacherContentType, id: string): string {
    return `${type}:${id}`;
  }

  function applyClassIds(
    prev: TeacherContentResponseDTO,
    type: TeacherContentType,
    id: string,
    classIds: string[],
  ): TeacherContentResponseDTO {
    const listKey = type === 'test' ? 'tests' : type === 'flashcardSet' ? 'flashcardSets' : 'grammarTopics';
    return {
      ...prev,
      [listKey]: prev[listKey].map((item) => (item.id === id ? { ...item, classIds } : item)),
    };
  }

  async function toggleClass(item: TeacherContentItemDTO, classId: string) {
    if (!data || pendingKey) return;

    const previousClassIds = item.classIds;
    const nextClassIds = previousClassIds.includes(classId)
      ? previousClassIds.filter((id) => id !== classId)
      : [...previousClassIds, classId];

    // Optimistic update first, so the chip reflects the click immediately.
    setData((prev) => (prev ? applyClassIds(prev, item.type, item.id, nextClassIds) : prev));
    setPendingKey(itemKey(item.type, item.id));
    setError(null);

    try {
      const updater =
        item.type === 'test'
          ? teacherApi.updateTestClasses
          : item.type === 'flashcardSet'
            ? teacherApi.updateFlashcardSetClasses
            : teacherApi.updateGrammarTopicClasses;
      const result: ContentClassAssignmentDTO = await updater(item.id, { classIds: nextClassIds });
      setData((prev) => (prev ? applyClassIds(prev, item.type, item.id, result.classIds) : prev));
    } catch (err) {
      // Revert this one item back to its last-known-good state on failure.
      setData((prev) => (prev ? applyClassIds(prev, item.type, item.id, previousClassIds) : prev));
      setError(err instanceof ApiError ? err.message : t('teacherContent.saveFailed'));
    } finally {
      setPendingKey(null);
    }
  }

  function renderSection(heading: string, emptyText: string, items: TeacherContentItemDTO[], classes: ClassDTO[]) {
    return (
      <section className="rounded-xl border border-primary-200 p-4">
        <h2 className="text-lg font-semibold text-primary-700">{heading}</h2>
        {items.length === 0 ? (
          <p className="mt-3 text-sm text-base-black/60">{emptyText}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {items.map((item) => {
              const key = itemKey(item.type, item.id);
              const isSaving = pendingKey === key;
              return (
                <li
                  key={key}
                  className="flex flex-col gap-2 rounded-lg border border-primary-100 bg-primary-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="font-medium text-base-black">{item.title}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {classes.map((cls) => {
                      const isAssigned = item.classIds.includes(cls.id);
                      return (
                        <button
                          key={cls.id}
                          type="button"
                          disabled={isSaving}
                          aria-pressed={isAssigned}
                          onClick={() => toggleClass(item, cls.id)}
                          className={
                            'rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ' +
                            (isAssigned
                              ? 'border-primary-500 bg-primary-500 text-base-white hover:bg-primary-600'
                              : 'border-primary-300 bg-base-white text-primary-700 hover:bg-primary-100')
                          }
                        >
                          {cls.name}
                        </button>
                      );
                    })}
                    {isSaving && (
                      <span className="text-xs text-base-black/50">{t('teacherContent.saving')}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-700">{t('teacherContent.heading')}</h1>
        <p className="mt-1 text-sm text-base-black/60">{t('teacherContent.description')}</p>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {data === null && <p className="text-sm text-base-black/60">{t('common.loading')}</p>}

      {data && data.classes.length === 0 && (
        <p className="rounded-md border border-primary-200 bg-primary-50 px-3 py-2 text-sm text-base-black/70">
          {t('teacherContent.noClasses')}{' '}
          <Link to="/teacher/classes" className="font-medium text-primary-700 underline">
            {t('teacherContent.noClassesLink')}
          </Link>
        </p>
      )}

      {data && (
        <div className="flex flex-col gap-6">
          {renderSection(
            t('teacherContent.testsHeading'),
            t('teacherContent.testsEmpty'),
            data.tests,
            data.classes,
          )}
          {renderSection(
            t('teacherContent.flashcardSetsHeading'),
            t('teacherContent.flashcardSetsEmpty'),
            data.flashcardSets,
            data.classes,
          )}
          {renderSection(
            t('teacherContent.grammarTopicsHeading'),
            t('teacherContent.grammarTopicsEmpty'),
            data.grammarTopics,
            data.classes,
          )}
        </div>
      )}
    </div>
  );
}

export default TeacherContentPage;
