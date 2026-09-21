import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ClassDTO } from '@platform/shared';
import DeadlineChips from './DeadlineChips';
import Modal from './Modal';
import { classAssignmentsPath, datetimeLocalToIso, setClassAssignment } from '../lib/classAssignments';
import { withClassPrefix } from '../lib/classLabel';
import { friendlyEditorError, rawErrorText } from '../lib/editorErrors';
import { teacherApi } from '../lib/teacherApi';

interface AssignTestToClassesDialogProps {
  testId: string;
  testTitle: string;
  /** How many questions the test has now — a test with none cannot be taken, so it is not given out. */
  questionCount: number;
  onClose: () => void;
}

type ClassStatus = 'pending' | 'working' | 'done' | 'failed';
interface ClassResult {
  status: ClassStatus;
  message?: string;
  detail?: string;
}

const inputClass =
  'rounded-md border border-primary-200 px-3 py-1.5 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200';

/**
 * "Giao bài này cho lớp…" — hands ONE test to one or more of the teacher's classes straight from
 * the test editor, with an optional deadline. It uses exactly the helpers of the class page's
 * "Giao bài mới" dialog: per class the schedule is written FIRST (so a test meant to open later is
 * never visible without its window) and the assignment second (`setClassAssignment`), one class
 * at a time with per-class progress, a plain-language message when one fails, and a retry for
 * just the failed ones. It ends with a success message and a link into each class.
 */
function AssignTestToClassesDialog({ testId, testTitle, questionCount, onClose }: AssignTestToClassesDialogProps) {
  const { t } = useTranslation();
  const [classes, setClasses] = useState<ClassDTO[] | null>(null);
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [openAt, setOpenAt] = useState('');
  const [closeAt, setCloseAt] = useState('');
  const [autoPublish, setAutoPublish] = useState(false);

  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Record<string, ClassResult> | null>(null);
  const [doneClassIds, setDoneClassIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([teacherApi.listClasses(), teacherApi.getTestClasses(testId)])
      .then(([list, assigned]) => {
        if (cancelled) return;
        const alreadyAssigned = new Set(assigned.classIds);
        setClasses(list);
        setAssignedIds(alreadyAssigned);
        // One class that can take the test: pick it for the teacher.
        const eligible = list.filter((c) => c.currentPeriodId && !alreadyAssigned.has(c.id));
        if (eligible.length === 1) setSelected(new Set([eligible[0].id]));
      })
      .catch((err) => {
        console.warn('[assign] could not load classes:', rawErrorText(err));
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [testId, reloadToken]);

  const openAtIso = datetimeLocalToIso(openAt);
  const closeAtIso = datetimeLocalToIso(closeAt);
  const effectiveAutoPublish = autoPublish && closeAtIso !== null;
  const hasSchedule = openAtIso !== null || closeAtIso !== null || effectiveAutoPublish;
  const scheduleOrderError = openAtIso !== null && closeAtIso !== null && new Date(closeAtIso) <= new Date(openAtIso);

  const pickedClasses = useMemo(
    () => (classes ?? []).filter((c) => selected.has(c.id)),
    [classes, selected],
  );
  const classById = useMemo(() => new Map((classes ?? []).map((c) => [c.id, c])), [classes]);

  function toggle(classId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(classId)) next.delete(classId);
      else next.add(classId);
      return next;
    });
  }

  async function run(targets: ClassDTO[]) {
    setRunning(true);
    setResults((prev) => {
      const next = { ...prev };
      for (const cls of targets) next[cls.id] = { status: 'pending' };
      return next;
    });
    const succeeded: string[] = [];
    for (const cls of targets) {
      setResults((prev) => ({ ...prev, [cls.id]: { status: 'working' } }));
      let step: 'schedule' | 'assign' = 'assign';
      try {
        if (hasSchedule) {
          step = 'schedule';
          await teacherApi.updateTestClassSchedule(testId, {
            classId: cls.id,
            openAt: openAtIso,
            closeAt: closeAtIso,
            autoPublishScoresOnClose: effectiveAutoPublish,
          });
          step = 'assign';
        }
        await setClassAssignment('test', testId, cls.id, true);
        succeeded.push(cls.id);
        setResults((prev) => ({ ...prev, [cls.id]: { status: 'done' } }));
      } catch (err) {
        setResults((prev) => ({
          ...prev,
          [cls.id]: {
            status: 'failed',
            message: t(step === 'schedule' ? 'assignDialog.scheduleStepFailed' : 'assignDialog.assignStepFailed', {
              reason: friendlyEditorError(err, t),
            }),
            detail: rawErrorText(err),
          },
        }));
      }
    }
    setDoneClassIds((prev) => [...prev, ...succeeded]);
    setRunning(false);
  }

  function handleConfirm() {
    if (running || pickedClasses.length === 0 || scheduleOrderError || questionCount === 0) return;
    void run(pickedClasses);
  }

  function handleRetryFailed() {
    if (running || !results) return;
    const failed = pickedClasses.filter((c) => results[c.id]?.status === 'failed');
    if (failed.length > 0) void run(failed);
  }

  const failedCount = results ? Object.values(results).filter((r) => r.status === 'failed').length : 0;
  const allDone = results !== null && !running && failedCount === 0 && doneClassIds.length > 0;

  let footer;
  if (allDone) {
    footer = (
      <button
        type="button"
        onClick={onClose}
        className="rounded-md bg-primary-500 px-4 py-2.5 sm:py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
      >
        {t('assignDialog.close')}
      </button>
    );
  } else if (results !== null) {
    footer = (
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
          onClick={onClose}
          disabled={running}
          className="rounded-md border border-primary-300 bg-base-white px-4 py-2.5 sm:py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t('assignDialog.close')}
        </button>
      </>
    );
  } else {
    footer = (
      <>
        <span className="mr-auto text-sm text-base-black/60" aria-live="polite">
          {pickedClasses.length === 0
            ? t('assignTestDialog.nothingSelected')
            : t('assignTestDialog.selectedCount', { count: pickedClasses.length })}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-primary-300 bg-base-white px-4 py-2.5 sm:py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100"
        >
          {t('assignDialog.cancel')}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={pickedClasses.length === 0 || scheduleOrderError || questionCount === 0}
          className="rounded-md bg-primary-500 px-4 py-2.5 sm:py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t('assignTestDialog.confirm', { count: pickedClasses.length })}
        </button>
      </>
    );
  }

  return (
    <Modal
      title={t('assignTestDialog.title', { title: testTitle })}
      onClose={onClose}
      busy={running}
      closeLabel={t('assignDialog.close')}
      footer={classes && classes.length > 0 ? footer : undefined}
    >
      {loadFailed && (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {t('assignTestDialog.loadFailed')}
          </p>
          <button
            type="button"
            onClick={() => {
              setLoadFailed(false);
              setClasses(null);
              setReloadToken((token) => token + 1);
            }}
            className="rounded-md border border-primary-300 bg-base-white px-3 py-2.5 sm:py-1.5 text-sm font-semibold text-primary-700 hover:bg-primary-100"
          >
            {t('assignDialog.retryLoad')}
          </button>
        </div>
      )}
      {!loadFailed && !classes && <p className="text-sm text-base-black/60">{t('common.loading')}</p>}

      {classes && classes.length === 0 && (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-primary-200 bg-primary-50 p-5">
          <p className="font-semibold text-primary-700">{t('assignTestDialog.noClassesHeading')}</p>
          <p className="text-sm text-base-black/70">{t('assignTestDialog.noClassesMessage')}</p>
          <Link
            to="/teacher/classes"
            className="rounded-md bg-primary-500 px-4 py-2.5 sm:py-2 text-sm font-semibold text-base-white hover:bg-primary-600"
          >
            {t('assignTestDialog.goToClasses')}
          </Link>
        </div>
      )}

      {classes && classes.length > 0 && results === null && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-base-black/70">{t('assignTestDialog.intro')}</p>
          {questionCount === 0 && (
            <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {t('assignTestDialog.noQuestions')}
            </p>
          )}

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold text-base-black">{t('assignTestDialog.classesHeading')}</legend>
            <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
              {classes.map((cls) => {
                const noSemester = !cls.currentPeriodId;
                const already = assignedIds.has(cls.id);
                const disabled = noSemester || already;
                const checked = selected.has(cls.id) && !disabled;
                return (
                  <li key={cls.id}>
                    <label
                      className={
                        'flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ' +
                        (disabled
                          ? 'cursor-not-allowed border-primary-100 bg-base-black/5 text-base-black/60'
                          : checked
                            ? 'cursor-pointer border-primary-400 bg-primary-50'
                            : 'cursor-pointer border-primary-100 bg-base-white hover:bg-primary-50')
                      }
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggle(cls.id)}
                        className="mt-0.5 h-5 w-5 shrink-0 rounded border-primary-300 text-primary-600 focus:ring-primary-200"
                      />
                      <span className="min-w-0">
                        <span className="block break-words font-medium text-base-black">
                          {withClassPrefix(cls.name)}
                        </span>
                        <span className="block text-xs text-base-black/60">
                          {noSemester
                            ? t('assignTestDialog.noSemester')
                            : already
                              ? t('assignTestDialog.alreadyAssigned', { semester: cls.currentPeriodName })
                              : cls.currentPeriodName}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>

          <section className="flex flex-col gap-3 rounded-xl border border-primary-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-primary-700">{t('assignTestDialog.deadlineHeading')}</h3>
            <p className="text-xs text-base-black/60">{t('assignTestDialog.deadlineHint')}</p>
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
          </section>
        </div>
      )}

      {classes && results !== null && (
        <div className="flex flex-col gap-3">
          <p
            className={`text-sm ${allDone ? 'font-semibold text-green-800' : 'text-base-black/70'}`}
            aria-live="polite"
            data-testid="assign-progress"
          >
            {running
              ? t('assignDialog.progressRunning')
              : allDone
                ? t('assignTestDialog.successHeading', { count: doneClassIds.length })
                : t('assignDialog.progressPartial', { failed: failedCount })}
          </p>
          <ul className="flex flex-col gap-2">
            {Object.entries(results).map(([classId, result]) => {
              const cls = classById.get(classId);
              return (
                <li
                  key={classId}
                  className="flex flex-col gap-1 rounded-lg border border-primary-100 bg-base-white px-3 py-2 text-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-base-black">{cls ? withClassPrefix(cls.name) : classId}</span>
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
                  {result.status === 'done' && (
                    <Link
                      to={classAssignmentsPath(classId)}
                      className="self-start py-1 text-sm font-medium text-primary-600 hover:underline"
                    >
                      {t('assignTestDialog.viewInClass')} →
                    </Link>
                  )}
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
    </Modal>
  );
}

export default AssignTestToClassesDialog;
