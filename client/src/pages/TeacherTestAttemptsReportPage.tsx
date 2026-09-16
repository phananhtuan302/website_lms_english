import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TestAttemptReportResponseDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';
import { useTeacherClasses } from '../hooks/useTeacherClasses';
import ClassFilterControl, { ClassFilterEmptyState } from '../components/ClassFilterControl';

/**
 * Per-test attempt report (T-087), reached from `TeacherTestsPage`'s new "Report"
 * action. Shows EVERY submitted attempt of one test — across all of its live sessions
 * AND self-practice (`GET /api/teacher/tests/:testId/attempts`, queried directly by
 * `Attempt.testId`, unlike the single-session-scoped `TeacherSessionAttemptsPage`) —
 * ranked best score first. Each row drills into the EXISTING
 * `/teacher/attempts/:attemptId` page (`TeacherAttemptDetailPage`), reused unchanged
 * for the full per-question correct/incorrect breakdown.
 *
 * Class-scoped exactly like `UnitLeaderboardPage`/`TeacherReportsHubPage` (T-077-style,
 * Phase 12 "no shared data between classes" rule) — `useTeacherClasses`/
 * `ClassFilterControl` auto-hide the picker when the teacher owns exactly one class.
 * Teacher/admin only (`App.tsx`'s route wiring), so — unlike `UnitLeaderboardPage`,
 * which is visible to both roles — there is no student-view branch here.
 *
 * T-088: accepts an optional `?classId=` query param so the Reports hub's new "view
 * detailed report" link (from `TeacherReportsPage`/`TeacherSpeakingReportsPage`) can hand
 * off the class the teacher was already viewing there, instead of making them re-pick it
 * via `ClassFilterControl` below.
 */
/** Converts an ISO date-time string to the local `datetime-local` input value format
 * (`YYYY-MM-DDTHH:mm`), or `''` for `null` — the inverse of `toIsoOrNull` below. Plain
 * local-time formatting (not UTC) so the input shows the same wall-clock time the
 * teacher originally picked. */
function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Converts a `datetime-local` input value back to an ISO string, or `null` for an
 * empty/cleared input. */
function toIsoOrNull(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function TeacherTestAttemptsReportPage() {
  const { testId } = useParams<{ testId: string }>();
  const { t } = useTranslation();
  const initialClassId = new URLSearchParams(window.location.search).get('classId') ?? '';
  // T-097: locks the picker to the class when arriving via `?classId=` — see
  // `TeacherReportsPage.tsx`'s identical pattern.
  const isClassLocked = initialClassId !== '';
  const { classes, classId, setClassId } = useTeacherClasses(true, initialClassId);
  const lockedClassName = classes?.find((c) => c.id === classId)?.name ?? null;
  const [data, setData] = useState<TestAttemptReportResponseDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  // T-092: separate from `error` above (which is for the report load itself) so a failed
  // publish/unpublish toggle doesn't wipe the already-loaded report off the page.
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  // T-093: the open/close/auto-publish schedule form, kept as separate editable state
  // (rather than reading straight off `data.schedule`) so the teacher can type into the
  // date fields without every keystroke re-rendering off a re-fetch. Synced from
  // `data.schedule` whenever a fresh report loads (new test/class), via the effect below.
  const [openAtInput, setOpenAtInput] = useState('');
  const [closeAtInput, setCloseAtInput] = useState('');
  const [autoPublishInput, setAutoPublishInput] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [savingSchedule, setSavingSchedule] = useState(false);

  useEffect(() => {
    if (!testId) return;
    // No synchronous `setData(null)` here — see `useTeacherClasses.ts`'s doc comment on
    // the `react-hooks/set-state-in-effect` lint rule; `data` already starts `null`.
    if (!classId) return;
    teacherApi
      .getTestAttemptReport(testId, classId)
      .then((res) => {
        setData(res);
        setError(null);
        setOpenAtInput(toDatetimeLocalValue(res.schedule.openAt));
        setCloseAtInput(toDatetimeLocalValue(res.schedule.closeAt));
        setAutoPublishInput(res.schedule.autoPublishScoresOnClose);
      })
      .catch((err) => {
        setData(null);
        setError(err instanceof ApiError ? err.message : t('teacherTestReport.loadFailed'));
      });
  }, [testId, t, classId]);

  /** T-092: toggles the per-(test, class) manual score-release flag for the class
   * currently being viewed. Reflects the new state directly from the response
   * (`setData`) rather than re-fetching the whole report — one round-trip either way. */
  function handleTogglePublish() {
    if (!testId || !data) return;
    setPublishing(true);
    setPublishError(null);
    teacherApi
      .updateTestClassSchedule(testId, { classId: data.classId, published: !data.schedule.scoresPublishedManually })
      .then((res) => {
        setData((prev) => (prev ? { ...prev, schedule: res } : prev));
      })
      .catch((err) => {
        setPublishError(err instanceof ApiError ? err.message : t('teacherTestReport.publishFailed'));
      })
      .finally(() => setPublishing(false));
  }

  /** T-093: saves the open/close window + auto-publish checkbox for the class currently
   * being viewed, independent of the manual publish toggle above (the PUT endpoint
   * treats every field as optional/independent — see `UpdateTestClassScheduleRequest`'s
   * doc comment). */
  function handleSaveSchedule() {
    if (!testId || !data) return;
    setSavingSchedule(true);
    setScheduleError(null);
    teacherApi
      .updateTestClassSchedule(testId, {
        classId: data.classId,
        openAt: toIsoOrNull(openAtInput),
        closeAt: toIsoOrNull(closeAtInput),
        autoPublishScoresOnClose: autoPublishInput,
      })
      .then((res) => {
        setData((prev) => (prev ? { ...prev, schedule: res } : prev));
      })
      .catch((err) => {
        setScheduleError(err instanceof ApiError ? err.message : t('teacherTestReport.scheduleSaveFailed'));
      })
      .finally(() => setSavingSchedule(false));
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/teacher/tests" className="text-sm text-primary-600 hover:underline">
          {t('teacherTestReport.backToTests')}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-primary-700">
          {data
            ? t('teacherTestReport.headingWithTitle', { testTitle: data.testTitle })
            : t('teacherTestReport.heading')}
        </h1>
        <p className="mt-1 text-sm text-base-black/60">{t('teacherTestReport.description')}</p>
        {data && (
          <p className="mt-1 text-sm text-primary-600">
            {t('classFilter.viewingLabel', { className: data.className })}
          </p>
        )}
      </div>

      <section className="flex flex-wrap items-end gap-4 rounded-xl border border-primary-200 p-4">
        {isClassLocked ? (
          <p className="text-sm font-medium text-base-black">
            {lockedClassName ? t('classFilter.lockedLabel', { className: lockedClassName }) : t('common.loading')}{' '}
            <Link to="/teacher/classes" className="font-medium text-primary-600 hover:underline">
              {t('classFilter.switchClass')}
            </Link>
          </p>
        ) : (
          <>
            <ClassFilterControl classes={classes} classId={classId} onChange={setClassId} />
            <ClassFilterEmptyState classes={classes} />
          </>
        )}
      </section>

      {/* T-092: manual publish/unpublish scores for THIS class. The badge reflects
          `data.schedule.scoresPublished` — the COMPUTED "effectively published" value
          (manual OR T-093's auto-publish-on-close having fired) — while the button
          itself toggles the raw `scoresPublishedManually` flag it actually controls. */}
      {data && (
        <section className="flex flex-wrap items-center gap-3 rounded-xl border border-primary-200 p-4">
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
              data.schedule.scoresPublished ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
            }`}
          >
            {data.schedule.scoresPublished
              ? t('teacherTestReport.scoresPublished')
              : t('teacherTestReport.scoresNotPublished')}
          </span>
          <button
            type="button"
            onClick={handleTogglePublish}
            disabled={publishing}
            className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:opacity-60"
          >
            {data.schedule.scoresPublishedManually
              ? t('teacherTestReport.unpublishButton')
              : t('teacherTestReport.publishButton')}
          </button>
          {publishError && <p className="text-sm text-red-700">{publishError}</p>}
        </section>
      )}

      {/* T-093: per-class availability window (open/close) + auto-publish-on-close
          checkbox, saved independently of the manual publish toggle above. */}
      {data && (
        <section className="flex flex-col gap-3 rounded-xl border border-primary-200 p-4">
          <h2 className="text-sm font-semibold text-primary-700">{t('teacherTestReport.scheduleHeading')}</h2>
          <p className="text-xs text-base-black/60">{t('teacherTestReport.scheduleDescription')}</p>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm text-base-black/80">
              {t('teacherTestReport.openAtLabel')}
              <input
                type="datetime-local"
                value={openAtInput}
                onChange={(e) => setOpenAtInput(e.target.value)}
                className="rounded-md border border-primary-200 px-3 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-base-black/80">
              {t('teacherTestReport.closeAtLabel')}
              <input
                type="datetime-local"
                value={closeAtInput}
                onChange={(e) => setCloseAtInput(e.target.value)}
                className="rounded-md border border-primary-200 px-3 py-1.5 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-base-black/80">
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
              className="rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100 disabled:opacity-60"
            >
              {t('teacherTestReport.saveScheduleButton')}
            </button>
          </div>
          {scheduleError && <p className="text-sm text-red-700">{scheduleError}</p>}
        </section>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}
      {!error && !data && classId && <p className="text-sm text-base-black/60">{t('common.loading')}</p>}

      {data && (
        <section className="overflow-x-auto rounded-xl border border-primary-200">
          <table className="min-w-full divide-y divide-primary-100 text-sm">
            <thead className="bg-primary-50 text-left text-xs font-semibold uppercase tracking-wide text-primary-700">
              <tr>
                <th className="px-4 py-3">{t('teacherTestReport.rankHeader')}</th>
                <th className="px-4 py-3">{t('teacherTestReport.studentHeader')}</th>
                <th className="px-4 py-3">{t('teacherTestReport.scoreHeader')}</th>
                <th className="px-4 py-3">{t('teacherTestReport.percentHeader')}</th>
                <th className="px-4 py-3">{t('teacherTestReport.submittedAtHeader')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-100">
              {data.entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-center text-base-black/60">
                    {t('teacherTestReport.noAttempts')}
                  </td>
                </tr>
              )}
              {data.entries.map((entry, index) => (
                <tr key={entry.attemptId} className="transition-colors hover:bg-primary-50">
                  <td className="px-4 py-3 text-base-black">#{index + 1}</td>
                  <td className="px-4 py-3 text-base-black">
                    <Link to={`/teacher/attempts/${entry.attemptId}`} className="text-primary-600 hover:underline">
                      {entry.studentName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-base-black/80">
                    {entry.correctCount}/{entry.totalCount}
                  </td>
                  <td className="px-4 py-3 font-semibold text-primary-700">{entry.scorePercent}%</td>
                  <td className="px-4 py-3 text-base-black/60">
                    {new Date(entry.submittedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

export default TeacherTestAttemptsReportPage;
