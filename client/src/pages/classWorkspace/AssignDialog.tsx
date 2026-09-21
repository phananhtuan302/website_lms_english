import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  TeacherContentItemDTO,
  TeacherContentResponseDTO,
  TeacherContentType,
  TestSummaryDTO,
} from '@platform/shared';
import DeadlineChips from '../../components/DeadlineChips';
import Modal from '../../components/Modal';
import { TEST_TYPE_LABEL_KEYS, datetimeLocalToIso, setClassAssignment } from '../../lib/classAssignments';
import { friendlyEditorError, rawErrorText } from '../../lib/editorErrors';
import { teacherApi } from '../../lib/teacherApi';

interface AssignDialogProps {
  classId: string;
  className: string;
  /** Closes the dialog. `assignedCount` = how many items were actually given to the class
   * while it was open (0 = nothing changed), so the caller knows whether to refresh + report. */
  onClose: (assignedCount: number) => void;
}

/** What the dialog offers: the teacher's library, minus what this class already has. */
interface Library {
  content: TeacherContentResponseDTO;
  /** Per-test details (type / unit / question count) from `GET /api/teacher/tests`. */
  testMeta: Map<string, TestSummaryDTO>;
}

interface PickedItem {
  key: string;
  type: TeacherContentType;
  id: string;
  title: string;
}

type ItemStatus = 'pending' | 'working' | 'done' | 'failed';
interface ItemResult {
  status: ItemStatus;
  message?: string;
  /** The server's original text, for a tooltip only. */
  detail?: string;
}

const TABS: Array<{ type: TeacherContentType; labelKey: string }> = [
  { type: 'test', labelKey: 'assignDialog.tabs.test' },
  { type: 'flashcardSet', labelKey: 'assignDialog.tabs.flashcardSet' },
  { type: 'grammarTopic', labelKey: 'assignDialog.tabs.grammarTopic' },
];

function itemKey(type: TeacherContentType, id: string): string {
  return `${type}:${id}`;
}

const inputClass =
  'rounded-md border border-primary-200 px-3 py-1.5 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200';

/**
 * "Giao bài mới" (T-103, Phase 13) — the ONE place a teacher gives content to a class:
 * pick library items (tabs by type + search, multi-select), optionally set a schedule that
 * applies to every selected test, confirm. Replaces the old three-screen dance (My Content
 * toggle → schedule panel → report page).
 *
 * Source list = `GET /api/teacher/content` (its `classIds` mean "assigned for that class's
 * CURRENT semester", so `!classIds.includes(thisClass)` = "not yet given to this class this
 * semester"), enriched by `GET /api/teacher/tests` for each test's type / unit / size. Vocabulary
 * Checks are left out: they are handed to individual students from their own page, never to
 * a whole class, so offering them here would only produce assignments students can't see.
 *
 * Saving is per item and sequential, with progress shown for each: for a test with a schedule
 * the schedule is written FIRST and the assignment second, so a test meant to open tomorrow is
 * never visible to students without its window even for an instant. Assignment is a
 * read-modify-write of the item's class set (see `setClassAssignment`). A failure on one item
 * never aborts the rest and is reported next to that item; the dialog then stays open with a
 * "retry failed" button instead of pretending everything worked.
 */
function AssignDialog({ classId, className, onClose }: AssignDialogProps) {
  const { t } = useTranslation();
  const [library, setLibrary] = useState<Library | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [tab, setTab] = useState<TeacherContentType>('test');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [openAt, setOpenAt] = useState('');
  const [closeAt, setCloseAt] = useState('');
  const [autoPublish, setAutoPublish] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Record<string, ItemResult> | null>(null);
  const [assignedCount, setAssignedCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([teacherApi.listMyContent(), teacherApi.listTests()])
      .then(([content, tests]) => {
        if (cancelled) return;
        setLibrary({ content, testMeta: new Map(tests.map((test) => [test.id, test])) });
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('[assign] could not load the library:', rawErrorText(err));
        setLoadError(t('assignDialog.loadFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken, t]);

  // Library items this class does NOT have yet, per type.
  const available = useMemo<Record<TeacherContentType, TeacherContentItemDTO[]>>(() => {
    if (!library) return { test: [], flashcardSet: [], grammarTopic: [] };
    const notYetAssigned = (item: TeacherContentItemDTO) => !item.classIds.includes(classId);
    return {
      test: library.content.tests.filter(
        (item) => notYetAssigned(item) && library.testMeta.get(item.id)?.testType !== 'vocabularyCheck',
      ),
      flashcardSet: library.content.flashcardSets.filter(notYetAssigned),
      grammarTopic: library.content.grammarTopics.filter(notYetAssigned),
    };
  }, [library, classId]);

  const totalAvailable = available.test.length + available.flashcardSet.length + available.grammarTopic.length;
  const libraryIsEmpty =
    library !== null &&
    library.content.tests.length + library.content.flashcardSets.length + library.content.grammarTopics.length === 0;

  const query = search.trim().toLowerCase();
  const visibleItems = available[tab].filter((item) => item.title.toLowerCase().includes(query));

  const pickedItems = useMemo<PickedItem[]>(() => {
    const picked: PickedItem[] = [];
    for (const type of ['test', 'flashcardSet', 'grammarTopic'] as const) {
      for (const item of available[type]) {
        if (selected.has(itemKey(type, item.id))) {
          picked.push({ key: itemKey(type, item.id), type, id: item.id, title: item.title });
        }
      }
    }
    return picked;
  }, [available, selected]);
  const selectedTests = pickedItems.filter((item) => item.type === 'test');

  // The schedule only means something for tests, and auto-publish only with a close time.
  const openAtIso = datetimeLocalToIso(openAt);
  const closeAtIso = datetimeLocalToIso(closeAt);
  const effectiveAutoPublish = autoPublish && closeAtIso !== null;
  const hasSchedule = openAtIso !== null || closeAtIso !== null || effectiveAutoPublish;
  const scheduleOrderError =
    openAtIso !== null && closeAtIso !== null && new Date(closeAtIso) <= new Date(openAtIso);
  const scheduleApplies = selectedTests.length > 0 && hasSchedule;

  function toggleItem(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const allVisibleSelected =
    visibleItems.length > 0 && visibleItems.every((item) => selected.has(itemKey(tab, item.id)));

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const item of visibleItems) {
        const key = itemKey(tab, item.id);
        if (allVisibleSelected) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  }

  async function run(items: PickedItem[]) {
    setRunning(true);
    let succeeded = 0;
    let failed = 0;
    setResults((prev) => {
      const next = { ...prev };
      for (const item of items) next[item.key] = { status: 'pending' };
      return next;
    });

    for (const item of items) {
      setResults((prev) => ({ ...prev, [item.key]: { status: 'working' } }));
      let step: 'schedule' | 'assign' = 'assign';
      try {
        if (item.type === 'test' && scheduleApplies) {
          step = 'schedule';
          await teacherApi.updateTestClassSchedule(item.id, {
            classId,
            openAt: openAtIso,
            closeAt: closeAtIso,
            autoPublishScoresOnClose: effectiveAutoPublish,
          });
          step = 'assign';
        }
        await setClassAssignment(item.type, item.id, classId, true);
        succeeded += 1;
        setResults((prev) => ({ ...prev, [item.key]: { status: 'done' } }));
      } catch (err) {
        failed += 1;
        const reason = friendlyEditorError(err, t);
        setResults((prev) => ({
          ...prev,
          [item.key]: {
            status: 'failed',
            message: t(step === 'schedule' ? 'assignDialog.scheduleStepFailed' : 'assignDialog.assignStepFailed', {
              reason,
            }),
            detail: rawErrorText(err),
          },
        }));
      }
    }

    const totalAssigned = assignedCount + succeeded;
    setAssignedCount(totalAssigned);
    setRunning(false);
    // Everything went through: nothing left to look at, close and let the list refresh.
    if (failed === 0) onClose(totalAssigned);
  }

  function handleConfirm() {
    if (running || pickedItems.length === 0 || scheduleOrderError) return;
    void run(pickedItems);
  }

  function handleRetryFailed() {
    if (running || !results) return;
    const failedItems = pickedItems.filter((item) => results[item.key]?.status === 'failed');
    if (failedItems.length === 0) return;
    void run(failedItems);
  }

  function handleRetryLoad() {
    setLoadError(null);
    setLibrary(null);
    setReloadToken((token) => token + 1);
  }

  const inProgressView = results !== null;

  // The library loads AFTER the dialog opens, so the search box does not exist yet when `Modal`
  // moves focus in on mount (it lands on the ✕ button). Once the picker is actually on screen,
  // put the cursor in the search box so the teacher can start typing immediately.
  const pickerVisible = library !== null && totalAvailable > 0 && !inProgressView;
  useEffect(() => {
    if (pickerVisible) searchRef.current?.focus();
  }, [pickerVisible]);
  const failedCount = results ? Object.values(results).filter((result) => result.status === 'failed').length : 0;

  const footer = inProgressView ? (
    <>
      {failedCount > 0 && !running && (
        <button
          type="button"
          onClick={handleRetryFailed}
          className="rounded-md bg-primary-500 px-4 py-2.5 sm:py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
        >
          {t('assignDialog.retryFailed')}
        </button>
      )}
      <button
        type="button"
        onClick={() => onClose(assignedCount)}
        disabled={running}
        className="rounded-md border border-primary-300 bg-base-white px-4 py-2.5 sm:py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {t('assignDialog.close')}
      </button>
    </>
  ) : (
    <>
      <span className="mr-auto text-sm text-base-black/60" aria-live="polite">
        {pickedItems.length === 0
          ? t('assignDialog.nothingSelected')
          : t('assignDialog.selectedCount', { count: pickedItems.length })}
      </span>
      <button
        type="button"
        onClick={() => onClose(0)}
        className="rounded-md border border-primary-300 bg-base-white px-4 py-2.5 sm:py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100"
      >
        {t('assignDialog.cancel')}
      </button>
      <button
        type="button"
        onClick={handleConfirm}
        disabled={pickedItems.length === 0 || scheduleOrderError}
        className="rounded-md bg-primary-500 px-4 py-2.5 sm:py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {t('assignDialog.confirm', { count: pickedItems.length })}
      </button>
    </>
  );

  return (
    <Modal
      title={t('assignDialog.title', { className })}
      onClose={() => onClose(assignedCount)}
      busy={running}
      closeLabel={t('assignDialog.close')}
      footer={library && !libraryIsEmpty && totalAvailable > 0 ? footer : undefined}
    >
      {loadError && (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {loadError}
          </p>
          <button
            type="button"
            onClick={handleRetryLoad}
            className="rounded-md border border-primary-300 bg-base-white px-3 py-2.5 sm:py-1.5 text-sm font-semibold text-primary-700 hover:bg-primary-100"
          >
            {t('assignDialog.retryLoad')}
          </button>
        </div>
      )}

      {!loadError && !library && <p className="text-sm text-base-black/60">{t('common.loading')}</p>}

      {library && totalAvailable === 0 && (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-primary-200 bg-primary-50 p-5">
          <p className="font-semibold text-primary-700">
            {libraryIsEmpty ? t('assignDialog.emptyLibraryHeading') : t('assignDialog.allAssignedHeading')}
          </p>
          <p className="text-sm text-base-black/70">
            {libraryIsEmpty ? t('assignDialog.emptyLibraryMessage') : t('assignDialog.allAssignedMessage')}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/teacher/library"
              className="rounded-md bg-primary-500 px-4 py-2.5 sm:py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
            >
              {t('assignDialog.goToLibrary')}
            </Link>
            <button
              type="button"
              onClick={() => onClose(assignedCount)}
              className="rounded-md border border-primary-300 bg-base-white px-4 py-2.5 sm:py-2 text-sm font-semibold text-primary-700 hover:bg-primary-100"
            >
              {t('assignDialog.close')}
            </button>
          </div>
        </div>
      )}

      {library && totalAvailable > 0 && inProgressView && results && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-base-black/70" aria-live="polite">
            {running
              ? t('assignDialog.progressRunning')
              : failedCount > 0
                ? t('assignDialog.progressPartial', { failed: failedCount })
                : t('assignDialog.progressDone')}
          </p>
          <ul className="flex flex-col gap-2">
            {pickedItems
              .filter((item) => results[item.key])
              .map((item) => {
                const result = results[item.key];
                return (
                  <li
                    key={item.key}
                    className="flex flex-col gap-1 rounded-lg border border-primary-100 bg-base-white px-3 py-2 text-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-base-black">{item.title}</span>
                      <span
                        className={
                          'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ' +
                          (result.status === 'done'
                            ? 'bg-green-100 text-green-800'
                            : result.status === 'failed'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-base-black/5 text-base-black/70')
                        }
                      >
                        {t(`assignDialog.itemStatus.${result.status}`)}
                      </span>
                    </div>
                    {result.message && (
                      <p role="alert" title={result.detail} className="text-xs text-red-700">
                        {result.message}
                      </p>
                    )}
                  </li>
                );
              })}
          </ul>
        </div>
      )}

      {library && totalAvailable > 0 && !inProgressView && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-base-black/70">{t('assignDialog.description')}</p>

          <div role="tablist" aria-label={t('assignDialog.tabsAriaLabel')} className="flex flex-wrap gap-2">
            {TABS.map(({ type, labelKey }) => {
              const active = tab === type;
              return (
                <button
                  key={type}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(type)}
                  className={
                    'rounded-full border px-4 py-2.5 sm:py-1.5 text-sm font-medium transition-colors ' +
                    (active
                      ? 'border-primary-500 bg-primary-500 text-base-white'
                      : 'border-primary-200 bg-base-white text-primary-700 hover:bg-primary-50')
                  }
                >
                  {t(labelKey)} ({available[type].length})
                </button>
              );
            })}
          </div>

          <input
            type="search"
            ref={searchRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('assignDialog.searchPlaceholder')}
            aria-label={t('assignDialog.searchPlaceholder')}
            className={inputClass + ' w-full'}
          />

          {visibleItems.length === 0 ? (
            <p className="rounded-md border border-dashed border-primary-200 px-3 py-4 text-center text-sm text-base-black/60">
              {available[tab].length === 0 ? t('assignDialog.emptyTab') : t('assignDialog.noSearchResults')}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm font-medium text-base-black">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  className="h-4 w-4 rounded border-primary-300 text-primary-600 focus:ring-primary-200"
                />
                {t('assignDialog.selectAllVisible', { count: visibleItems.length })}
              </label>
              <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
                {visibleItems.map((item) => {
                  const key = itemKey(tab, item.id);
                  const meta = tab === 'test' ? library.testMeta.get(item.id) : undefined;
                  const checked = selected.has(key);
                  return (
                    <li key={key}>
                      <label
                        className={
                          'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ' +
                          (checked
                            ? 'border-primary-400 bg-primary-50'
                            : 'border-primary-100 bg-base-white hover:bg-primary-50')
                        }
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleItem(key)}
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-primary-300 text-primary-600 focus:ring-primary-200"
                        />
                        <span className="min-w-0">
                          <span className="block break-words font-medium text-base-black">{item.title}</span>
                          {meta && (
                            <span className="block text-xs text-base-black/60">
                              {t(TEST_TYPE_LABEL_KEYS[meta.testType])}
                              {meta.unitName ? ` · ${meta.unitName}` : ''}
                              {' · '}
                              {meta.questionCount === 0
                                ? t('assignDialog.noQuestionsYet')
                                : t('classAssignments.questionCount', { count: meta.questionCount })}
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {selectedTests.length > 0 && (
            <section className="rounded-xl border border-primary-200">
              <button
                type="button"
                onClick={() => setScheduleOpen((open) => !open)}
                aria-expanded={scheduleOpen}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-primary-700"
              >
                <span>
                  {t('assignDialog.scheduleToggle')}
                  {hasSchedule && (
                    <span className="ml-2 rounded-full bg-primary-100 px-2 py-0.5 text-xs font-semibold text-primary-800">
                      {t('assignDialog.scheduleSet')}
                    </span>
                  )}
                </span>
                <span aria-hidden="true">{scheduleOpen ? '▲' : '▼'}</span>
              </button>
              {scheduleOpen && (
                <div className="flex flex-col gap-3 border-t border-primary-100 px-4 py-3">
                  <p className="text-xs text-base-black/60">
                    {t('assignDialog.scheduleHint', { count: selectedTests.length })}
                  </p>
                  <DeadlineChips
                    openAt={openAt}
                    closeAt={closeAt}
                    onChange={(next) => {
                      setOpenAt(next.openAt);
                      setCloseAt(next.closeAt);
                    }}
                  />
                  <div className="flex flex-wrap items-end gap-4">
                    <label className="flex flex-col gap-1 text-sm text-base-black/80">
                      {t('assignDialog.openAtLabel')}
                      <input
                        type="datetime-local"
                        value={openAt}
                        onChange={(event) => setOpenAt(event.target.value)}
                        className={inputClass}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm text-base-black/80">
                      {t('assignDialog.closeAtLabel')}
                      <input
                        type="datetime-local"
                        value={closeAt}
                        onChange={(event) => setCloseAt(event.target.value)}
                        className={inputClass}
                      />
                    </label>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-base-black/80">
                    <input
                      type="checkbox"
                      checked={autoPublish}
                      disabled={closeAtIso === null}
                      onChange={(event) => setAutoPublish(event.target.checked)}
                      className="h-4 w-4 rounded border-primary-300 text-primary-600 focus:ring-primary-200 disabled:opacity-50"
                    />
                    {t('assignDialog.autoPublishLabel')}
                  </label>
                  {closeAtIso === null && (
                    <p className="text-xs text-base-black/50">{t('assignDialog.autoPublishNeedsClose')}</p>
                  )}
                  {scheduleOrderError && (
                    <p role="alert" className="text-sm text-red-700">
                      {t('assignDialog.closeBeforeOpen')}
                    </p>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}

export default AssignDialog;
