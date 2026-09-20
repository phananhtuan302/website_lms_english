import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import type { TeacherContentItemDTO, TeacherContentResponseDTO, TeacherContentType } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';
import TestClassSchedulePanel from '../components/TestClassSchedulePanel';

/**
 * Consolidated "My Content" management page (T-075, Phase 12; REDESIGNED by T-100 around
 * T-099's semester dimension) — every Test/FlashcardSet/GrammarTopic a teacher has
 * authored (grouped by type, three sections), each with a compact per-item control to
 * assign/unassign it WITHOUT opening that item's full editor. Content is authored once in
 * its own editor as always (T-008/T-022/T-047); this page only manages the separate
 * many-to-many assignment (PROJECT_PLAN Phase 12's "critical design correction" —
 * assignment, not ownership).
 *
 * T-100: this page USED TO render one row per item with a whole GRID of per-class chips
 * (T-075's original design, when assignment was class-only). Now that a class can only be
 * on ONE current semester at a time (T-099), that grid's "assign to several classes at
 * once" bulk view no longer means anything coherent — each (class, period) is its own
 * isolated cycle (BACKLOG.md T-100's explicit design note). So this page is now entered
 * for exactly ONE (class, period) pair at a time, via `?classId=&periodId=` (handed off by
 * `TeacherClassWorkspacePage`'s "My Content" quick-link, already resolved to that class's
 * CURRENT period, T-097's "lock, don't just pre-select" philosophy) — and each item gets a
 * single ON/OFF toggle for that one class instead of a row of chips. A teacher managing
 * several classes assigns the same content to each one individually, once per class's
 * workspace.
 *
 * Reached without a usable class+period context (no `classId` at all, a foreign/typo'd
 * `classId`, or a class that hasn't picked a semester yet — see the `!hasContext`/
 * `classNotFound`/`noPeriod` branches below) shows a clear prompt instead of crashing or
 * guessing which class was meant, same "don't crash on a bad param" convention used
 * throughout this codebase.
 *
 * Deliberately does NOT gate on the `periodId` query param at all, and never trusts its
 * VALUE — the actual period toggled against is always `data.classes`' freshly fetched
 * `currentPeriodId`/`currentPeriodName` for this `classId`. Only `classId` is required to
 * attempt loading: `TeacherClassWorkspacePage`'s link omits `periodId` entirely when the
 * class has no current period yet (see that page's own doc comment), and a class whose
 * period changed since this link was generated/bookmarked should still show/act on its
 * REAL current period, not a stale one — there is no other (class, period) pair this page
 * could meaningfully toggle against once periods are current-only (T-099). A `classId`
 * with no resolvable current period (either because the URL never had `periodId`, or
 * because it's simply stale) shows the `noPeriod` prompt below instead of guessing.
 *
 * Each toggle flips immediately on click: local state updates optimistically (so the UI
 * feels instant, per T-075's original "should feel immediate" requirement) and the PUT
 * request fires in the background; a failure reverts that one item's state and shows an
 * inline error, rather than a full-page reload/save button. The PUT itself is the EXACT
 * SAME `.../classes` endpoint T-075/T-099 already built (`teacherApi.updateTestClasses` et
 * al., full-replace-of-classIds semantics) — only the target array element toggled is new
 * here; the server already resolves each classId to that class's own current period
 * (`contentClassAssignment.ts`), so no backend change was needed for this redesign.
 */
function TeacherContentPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const classId = searchParams.get('classId') ?? '';
  // `periodId` itself is intentionally never read here — see the module doc comment above
  // for why only `classId`'s PRESENCE gates this page; a class with a null current period
  // (so the workspace's link never even had a `periodId` to give) is handled below by
  // `noPeriod`, not folded into "no context at all".
  const hasContext = classId !== '';

  const [data, setData] = useState<TeacherContentResponseDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Keyed by `${type}:${id}` — which single item's toggle is currently mid-request, so
  // only THAT item is disabled while saving, not the whole page.
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  // T-098: which Test's inline schedule settings panel is currently open (Tests section
  // only, see `renderSection`'s `enableSchedule` param below) — just the testId now, since
  // the classId is fixed page-wide by context (T-100). `null` = none open.
  const [scheduleTarget, setScheduleTarget] = useState<string | null>(null);

  function load() {
    if (!hasContext) return;
    teacherApi
      .listMyContent()
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : t('teacherContent.loadFailed')));
  }

  // `t` is stable in practice (site-wide, admin-controlled language, resolved once at
  // startup — PROJECT_PLAN Guiding Principle 3/Assumption A13), so it's safe to omit here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [hasContext]);

  const cls = data?.classes.find((c) => c.id === classId) ?? null;
  const classNotFound = hasContext && data !== null && cls === null;
  const noPeriod = hasContext && cls !== null && !cls.currentPeriodId;
  const ready = hasContext && cls !== null && !!cls.currentPeriodId;

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

  async function toggleAssignment(item: TeacherContentItemDTO) {
    if (!data || pendingKey || !ready) return;

    const previousClassIds = item.classIds;
    const wasAssigned = previousClassIds.includes(classId);
    const nextClassIds = wasAssigned
      ? previousClassIds.filter((id) => id !== classId)
      : [...previousClassIds, classId];

    // T-098: unassigning closes that same item's open schedule panel, if any — an
    // unassigned item has nothing left to schedule.
    if (wasAssigned && scheduleTarget === item.id) {
      setScheduleTarget(null);
    }

    // Optimistic update first, so the toggle reflects the click immediately.
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
      const result = await updater(item.id, { classIds: nextClassIds });
      setData((prev) => (prev ? applyClassIds(prev, item.type, item.id, result.classIds) : prev));
    } catch (err) {
      // Revert this one item back to its last-known-good state on failure.
      setData((prev) => (prev ? applyClassIds(prev, item.type, item.id, previousClassIds) : prev));
      setError(err instanceof ApiError ? err.message : t('teacherContent.saveFailed'));
    } finally {
      setPendingKey(null);
    }
  }

  // T-098: `enableSchedule` gates the ENTIRE settings affordance (button + inline panel)
  // — passed `true` only for the Tests section below. FlashcardSets/GrammarTopics call
  // this with it omitted (defaults `false`): `TestClassSchedule` is a Test-only concept
  // (BACKLOG.md T-098 scope note), neither of those content types has a schedule/publish
  // concept at all.
  function renderSection(heading: string, emptyText: string, items: TeacherContentItemDTO[], enableSchedule = false) {
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
              const isAssigned = item.classIds.includes(classId);
              return (
                <li
                  key={key}
                  className="flex flex-col gap-2 rounded-lg border border-primary-100 bg-primary-50 px-4 py-3"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-medium text-base-black">{item.title}</span>
                    <div className="flex flex-wrap items-center gap-3">
                      {isSaving && <span className="text-xs text-base-black/50">{t('teacherContent.saving')}</span>}
                      {enableSchedule && isAssigned && (
                        // Separate sibling <button> from the toggle below (not nested), so
                        // a click on one can never bubble into the other's handler — same
                        // "clearly separate interactive targets" rule T-098 established.
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setScheduleTarget((prev) => (prev === item.id ? null : item.id));
                          }}
                          aria-label={t('teacherContent.scheduleButtonAriaLabel', { title: item.title })}
                          className="rounded-full border border-primary-300 bg-base-white px-2 py-1 text-[11px] font-medium text-primary-600 transition-colors hover:bg-primary-100"
                        >
                          {t('teacherContent.scheduleButton')}
                        </button>
                      )}
                      <span className="text-xs font-medium text-base-black/60">
                        {isAssigned ? t('teacherContent.assigned') : t('teacherContent.notAssigned')}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isAssigned}
                        aria-label={t('teacherContent.toggleAriaLabel', { title: item.title })}
                        disabled={isSaving}
                        onClick={() => toggleAssignment(item)}
                        className={
                          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ' +
                          (isAssigned ? 'bg-primary-500' : 'bg-base-black/20')
                        }
                      >
                        <span
                          className={
                            'inline-block h-4 w-4 transform rounded-full bg-base-white transition-transform ' +
                            (isAssigned ? 'translate-x-6' : 'translate-x-1')
                          }
                        />
                      </button>
                    </div>
                  </div>
                  {enableSchedule && scheduleTarget === item.id && cls && (
                    <TestClassSchedulePanel
                      testId={item.id}
                      classId={classId}
                      className={cls.name}
                      onClose={() => setScheduleTarget(null)}
                    />
                  )}
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
        {ready && cls && (
          <p className="mt-1 text-sm text-primary-600">
            {t('classFilter.lockedLabel', { className: cls.name })}
            {' — '}
            {t('teacherContent.periodLabel', { periodName: cls.currentPeriodName })}{' '}
            <Link to="/teacher/classes" className="font-medium underline">
              {t('classFilter.switchClass')}
            </Link>
          </p>
        )}
      </div>

      {!hasContext && (
        <div className="rounded-md border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-base-black/70">
          <p className="font-semibold text-primary-700">{t('teacherContent.noContextHeading')}</p>
          <p className="mt-1">{t('teacherContent.noContextMessage')}</p>
          <Link to="/teacher/classes" className="mt-2 inline-block font-medium text-primary-700 underline">
            {t('teacherContent.noContextLink')}
          </Link>
        </div>
      )}

      {hasContext && error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {hasContext && data === null && !error && <p className="text-sm text-base-black/60">{t('common.loading')}</p>}

      {classNotFound && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {t('teacherContent.classNotFound')}
        </p>
      )}

      {noPeriod && cls && (
        <div className="rounded-md border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-base-black/70">
          <p>{t('teacherContent.noPeriodMessage')}</p>
          <Link to={`/teacher/classes/${encodeURIComponent(cls.id)}`} className="mt-2 inline-block font-medium text-primary-700 underline">
            {t('teacherContent.noPeriodLink')}
          </Link>
        </div>
      )}

      {ready && data && (
        <div className="flex flex-col gap-6">
          {renderSection(t('teacherContent.testsHeading'), t('teacherContent.testsEmpty'), data.tests, true)}
          {renderSection(t('teacherContent.flashcardSetsHeading'), t('teacherContent.flashcardSetsEmpty'), data.flashcardSets)}
          {renderSection(t('teacherContent.grammarTopicsHeading'), t('teacherContent.grammarTopicsEmpty'), data.grammarTopics)}
        </div>
      )}
    </div>
  );
}

export default TeacherContentPage;
