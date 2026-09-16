import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TestClassScheduleDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';

interface TestClassSchedulePanelProps {
  testId: string;
  classId: string;
  className: string;
  onClose: () => void;
}

/** Converts an ISO date-time string to the local `datetime-local` input value format
 * (`YYYY-MM-DDTHH:mm`), or `''` for `null` — copied from `TeacherTestAttemptsReportPage`'s
 * identical helper (T-093) rather than shared, since it's a two-line pure function and
 * pulling it into a shared module isn't worth the indirection for T-098's one extra
 * caller. */
function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Converts a `datetime-local` input value back to an ISO string, or `null` for an
 * empty/cleared input — see `toDatetimeLocalValue` above. */
function toIsoOrNull(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * T-098: compact inline schedule panel opened from "My Content"'s (`TeacherContentPage`)
 * Tests section, on an ASSIGNED class chip's new settings button — a SECOND entry point
 * to the exact same `TestClassSchedule` row `TeacherTestAttemptsReportPage.tsx` (T-093)
 * already edits, reached without leaving My Content or opening the full test editor (this
 * page's own subtitle already promises that). Shows the same fields, in the same order,
 * as that page's schedule section: open time, close time, the "auto-publish on close"
 * checkbox, and the manual publish/unpublish toggle (T-092) — all scoped to this exact
 * (testId, classId) pair.
 *
 * Reads via the new lightweight `GET /api/teacher/tests/:testId/schedule?classId=` (T-098
 * — see that route's doc comment for why a new endpoint was added instead of reusing the
 * heavier attempts-report one) and writes via the EXISTING
 * `PUT /api/teacher/tests/:testId/schedule` (T-092/T-093, unchanged) — no new write logic.
 * Fetches fresh every time it opens (no caching layer of its own), so it can never show a
 * stale value left over from an edit made on the Report page in a different tab/session.
 */
function TestClassSchedulePanel({ testId, classId, className, onClose }: TestClassSchedulePanelProps) {
  const { t } = useTranslation();
  const [schedule, setSchedule] = useState<TestClassScheduleDTO | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openAtInput, setOpenAtInput] = useState('');
  const [closeAtInput, setCloseAtInput] = useState('');
  const [autoPublishInput, setAutoPublishInput] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  useEffect(() => {
    // No synchronous `setSchedule(null)`/`setLoadError(null)` here — see
    // `useTeacherClasses.ts`'s doc comment on the `react-hooks/set-state-in-effect` lint
    // rule; `schedule` already starts `null`, and a re-fetch (this component's `testId`/
    // `classId` props changing without unmounting, e.g. switching which class chip's
    // panel is open on the same test) simply overwrites it once the new fetch resolves,
    // same "let the new value land in its own `.then`" convention as
    // `TeacherTestAttemptsReportPage.tsx`'s own report-loading effect.
    let cancelled = false;
    teacherApi
      .getTestClassSchedule(testId, classId)
      .then((res) => {
        if (cancelled) return;
        setSchedule(res);
        setLoadError(null);
        setOpenAtInput(toDatetimeLocalValue(res.openAt));
        setCloseAtInput(toDatetimeLocalValue(res.closeAt));
        setAutoPublishInput(res.autoPublishScoresOnClose);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : t('teacherContent.scheduleLoadFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [testId, classId, t]);

  function handleSaveSchedule() {
    setSavingSchedule(true);
    setScheduleError(null);
    teacherApi
      .updateTestClassSchedule(testId, {
        classId,
        openAt: toIsoOrNull(openAtInput),
        closeAt: toIsoOrNull(closeAtInput),
        autoPublishScoresOnClose: autoPublishInput,
      })
      .then((res) => setSchedule(res))
      .catch((err) => {
        setScheduleError(err instanceof ApiError ? err.message : t('teacherTestReport.scheduleSaveFailed'));
      })
      .finally(() => setSavingSchedule(false));
  }

  function handleTogglePublish() {
    if (!schedule) return;
    setPublishing(true);
    setPublishError(null);
    teacherApi
      .updateTestClassSchedule(testId, { classId, published: !schedule.scoresPublishedManually })
      .then((res) => setSchedule(res))
      .catch((err) => {
        setPublishError(err instanceof ApiError ? err.message : t('teacherTestReport.publishFailed'));
      })
      .finally(() => setPublishing(false));
  }

  return (
    <div
      role="region"
      aria-label={t('teacherContent.schedulePanelHeading', { className })}
      className="flex flex-col gap-3 rounded-lg border border-primary-200 bg-base-white p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-primary-700">
          {t('teacherContent.schedulePanelHeading', { className })}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-medium text-primary-600 hover:underline"
        >
          {t('teacherContent.closeSchedulePanel')}
        </button>
      </div>

      {loadError && <p className="text-xs text-red-700">{loadError}</p>}
      {!loadError && !schedule && <p className="text-xs text-base-black/60">{t('common.loading')}</p>}

      {schedule && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-base-black/80">
              {t('teacherTestReport.openAtLabel')}
              <input
                type="datetime-local"
                value={openAtInput}
                onChange={(e) => setOpenAtInput(e.target.value)}
                className="rounded-md border border-primary-200 px-2 py-1 text-xs"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-base-black/80">
              {t('teacherTestReport.closeAtLabel')}
              <input
                type="datetime-local"
                value={closeAtInput}
                onChange={(e) => setCloseAtInput(e.target.value)}
                className="rounded-md border border-primary-200 px-2 py-1 text-xs"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-base-black/80">
              <input
                type="checkbox"
                checked={autoPublishInput}
                onChange={(e) => setAutoPublishInput(e.target.checked)}
              />
              {t('teacherTestReport.autoPublishLabel')}
            </label>
            <button
              type="button"
              onClick={handleSaveSchedule}
              disabled={savingSchedule}
              className="rounded-md border border-primary-300 bg-base-white px-3 py-1.5 text-xs font-semibold text-primary-700 transition-colors hover:bg-primary-100 disabled:opacity-60"
            >
              {t('teacherTestReport.saveScheduleButton')}
            </button>
          </div>
          {scheduleError && <p className="text-xs text-red-700">{scheduleError}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${
                schedule.scoresPublished ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {schedule.scoresPublished
                ? t('teacherTestReport.scoresPublished')
                : t('teacherTestReport.scoresNotPublished')}
            </span>
            <button
              type="button"
              onClick={handleTogglePublish}
              disabled={publishing}
              className="rounded-md bg-primary-500 px-3 py-1.5 text-xs font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:opacity-60"
            >
              {schedule.scoresPublishedManually
                ? t('teacherTestReport.unpublishButton')
                : t('teacherTestReport.publishButton')}
            </button>
          </div>
          {publishError && <p className="text-xs text-red-700">{publishError}</p>}
        </>
      )}
    </div>
  );
}

export default TestClassSchedulePanel;
