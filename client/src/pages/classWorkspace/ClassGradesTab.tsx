import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ClassGradebookDTO } from '@platform/shared';
import HorizontalScrollHint from '../../components/HorizontalScrollHint';
import { useClassWorkspace } from '../../hooks/useClassWorkspace';
import { classTabPath } from '../../lib/classWorkspace';
import { downloadGradebookXlsx, type GradebookExportLabels } from '../../lib/gradebookExcelExport';
import { formatScore10 } from '../../lib/scoreFormat';
import { teacherApi } from '../../lib/teacherApi';

/** How long the "Đã tải …" message stays under the export button. */
const DOWNLOAD_MESSAGE_MS = 8000;

/** Small "*" after a provisional score ("tạm tính"), readable by screen readers as well. */
function ProvisionalMark({ label }: { label: string }) {
  return (
    // `relative`: the screen-reader-only text is absolutely positioned, and without a positioned
    // parent inside the grid it would escape the scroll container and widen the whole page.
    <span className="relative ml-0.5">
      <span aria-hidden="true" className="font-bold text-amber-700">
        *
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * "Điểm số" tab (T-104): the class gradebook, Canvas/Moodle style — one row per student, one
 * column per test assigned to the class for its CURRENT semester, each cell the student's best
 * score on that test ("—" when they have not submitted), plus a per-student average column and
 * a per-test average row. Data: `GET /api/teacher/classes/:classId/gradebook`.
 *
 * - The header row and the student-name column are `sticky`, and the grid lives in its own
 *   scroll container, so a wide/tall grid scrolls inside the card, never the page.
 * - A column header links to that test's class results page (T-103's
 *   `/teacher/classes/:classId/tests/:testId/results`); a cell links to the attempt detail.
 * - A test whose scores are not published yet is marked in its header and its cells are muted,
 *   so the teacher sees what students currently see (nothing) without a second screen.
 * - "Xuất Excel" exports exactly what is on screen (see `lib/gradebookExcelExport.ts`).
 *
 * Refetched when the class's semester changes (the header's switch updates
 * `cls.currentPeriodId` via the workspace context).
 */
function ClassGradesTab() {
  const { t } = useTranslation();
  const { cls } = useClassWorkspace();
  const periodKey = cls.currentPeriodId ?? '';

  // Tagged with the semester it was loaded for so a stale grid (previous semester) is never
  // shown as the new one while the refetch is in flight.
  const [loaded, setLoaded] = useState<{ key: string; gradebook: ClassGradebookDTO } | null>(null);
  const [failed, setFailed] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);
  // Confirms what the download did ("Đã tải …"): the browser gives no in-page sign of it.
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const downloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    teacherApi
      .getClassGradebook(cls.id)
      .then((gradebook) => {
        if (cancelled) return;
        setLoaded({ key: periodKey, gradebook });
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [cls.id, periodKey]);

  useEffect(
    () => () => {
      if (downloadTimer.current) clearTimeout(downloadTimer.current);
    },
    [],
  );

  const gradebook = loaded && loaded.key === periodKey ? loaded.gradebook : null;

  if (failed && !gradebook) {
    return (
      <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {t('classGrades.loadFailed')}
      </p>
    );
  }
  if (!gradebook) return <p className="text-sm text-base-black/60">{t('common.loading')}</p>;

  const hasGrid = gradebook.students.length > 0 && gradebook.tests.length > 0;
  const hasUnpublished = gradebook.tests.some((test) => !test.scoresPublished);
  // Every cell is a submitted attempt; none at all means the table below is just dashes.
  const hasAnySubmission = Object.values(gradebook.cells).some((row) =>
    Object.values(row ?? {}).some((cell) => cell),
  );

  // Phase 15: a cell is "tạm tính" while an essay of that attempt is ungraded; a row/column average
  // inherits the mark from the cells it is made of.
  const isProvisional = (studentId: string, testId: string) =>
    gradebook.cells[studentId]?.[testId]?.provisional === true;
  const hasProvisional = gradebook.students.some((student) =>
    gradebook.tests.some((test) => isProvisional(student.id, test.id)),
  );

  const handleExport = () => {
    setExportFailed(false);
    setDownloadMessage(null);
    if (downloadTimer.current) clearTimeout(downloadTimer.current);
    const now = new Date();
    const two = (n: number) => String(n).padStart(2, '0');
    const labels: GradebookExportLabels = {
      sheetName: t('classGrades.export.sheetName'),
      title: t('scoring.excel.title'),
      // "Lớp 9A" -> "9A": the sheet says "Lớp: 9A", not "Lớp: Lớp 9A".
      classLine: t('scoring.excel.classLine', { className: cls.name.replace(/^lớp\s+/i, '').trim() || cls.name }),
      semesterLine: t('scoring.excel.semesterLine', {
        semester: cls.currentPeriodName ?? t('scoring.excel.noSemester'),
      }),
      exportDateLine: t('scoring.excel.exportDate', {
        date: `${two(now.getDate())}/${two(now.getMonth() + 1)}/${now.getFullYear()}`,
      }),
      scaleLine: t('scoring.excel.scaleLine'),
      sttHeader: t('scoring.excel.stt'),
      studentHeader: t('scoring.excel.student'),
      averageHeader: t('scoring.excel.average'),
      noteHeader: t('scoring.excel.note'),
      notSubmitted: t('scoring.excel.notSubmitted'),
      provisionalNote: t('scoring.excel.provisionalNote'),
      statusRowLabel: t('scoring.excel.statusRow'),
      released: t('scoring.excel.released'),
      notReleased: t('scoring.excel.notReleased'),
      classAverageLabel: t('scoring.excel.classAverage'),
    };
    try {
      const fileName = downloadGradebookXlsx(gradebook, labels, t('classGrades.export.fileName', { className: cls.name }));
      setDownloadMessage(t('scoring.download.done', { fileName }));
      downloadTimer.current = setTimeout(() => setDownloadMessage(null), DOWNLOAD_MESSAGE_MS);
    } catch {
      setExportFailed(true);
    }
  };

  let emptyMessage: string | null = null;
  if (cls.currentPeriodId === null || gradebook.periodId === null) {
    emptyMessage = t('classGrades.noSemester');
  } else if (gradebook.students.length === 0) {
    emptyMessage = t('classGrades.noStudents');
  } else if (gradebook.tests.length === 0) {
    emptyMessage = t('classGrades.noTests');
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-primary-700">{t('classGrades.heading')}</h2>
          {cls.currentPeriodName && (
            <p className="mt-1 text-sm text-base-black/60">
              {t('classGrades.semesterLabel', { name: cls.currentPeriodName })}
            </p>
          )}
          {/* Phase 17 (T-118B): entry point into the teacher-level score-comparison screen. */}
          <Link to="/teacher/grades-overview" className="mt-1 inline-block text-sm text-primary-600 hover:underline">
            {t('classGrades.compareLink')}
          </Link>
        </div>
        {hasGrid && (
          <button
            type="button"
            onClick={handleExport}
            className="rounded-md border border-primary-300 bg-base-white px-4 py-2.5 sm:py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500"
          >
            {t('classGrades.exportButton')}
          </button>
        )}
      </div>

      <p
        role="status"
        aria-live="polite"
        className={
          downloadMessage
            ? 'rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-800'
            : 'sr-only'
        }
      >
        {downloadMessage ?? ''}
      </p>

      {exportFailed && (
        <p role="alert" className="text-sm text-red-700">
          {t('classGrades.exportFailed')}
        </p>
      )}

      {emptyMessage !== null && (
        <div className="rounded-2xl border border-dashed border-primary-300 bg-primary-50 p-6 text-center">
          <p className="text-sm text-base-black/70">{emptyMessage}</p>
          {cls.currentPeriodId !== null &&
            gradebook.students.length > 0 &&
            gradebook.tests.length === 0 && (
              <p className="mt-3">
                <Link
                  to={classTabPath(cls.id, 'assignments')}
                  className="text-sm font-medium text-primary-600 hover:underline"
                >
                  {t('classGrades.noTestsLink')} →
                </Link>
              </p>
            )}
        </div>
      )}

      {hasGrid && (
        <>
          {!hasAnySubmission && (
            <p
              role="status"
              className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm font-medium text-primary-800"
            >
              {t('classGrades.noSubmissions')}
            </p>
          )}
          <HorizontalScrollHint
            className="max-h-[70vh] overflow-auto rounded-xl border border-primary-200"
            role="region"
            aria-label={t('classGrades.gridAriaLabel')}
            tabIndex={0}
          >
            <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 top-0 z-30 min-w-[11rem] border-b border-r border-primary-200 bg-primary-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-primary-700"
                  >
                    {t('classGrades.studentColumn')}
                  </th>
                  {gradebook.tests.map((test) => (
                    <th
                      key={test.id}
                      scope="col"
                      className="sticky top-0 z-20 min-w-[9rem] max-w-[13rem] border-b border-r border-primary-200 bg-primary-50 px-3 py-2 text-left align-top"
                    >
                      <Link
                        to={classTabPath(cls.id, `tests/${test.id}/results`)}
                        title={t('classGrades.headerTitle')}
                        className="block break-words text-sm font-semibold text-primary-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500"
                      >
                        {test.title}
                      </Link>
                      {!test.scoresPublished && (
                        <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                          {t('classGrades.unpublishedBadge')}
                        </span>
                      )}
                    </th>
                  ))}
                  <th
                    scope="col"
                    className="sticky top-0 z-20 min-w-[7rem] border-b border-primary-200 bg-primary-100 px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-primary-800"
                  >
                    {t('classGrades.averageColumn')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {gradebook.students.map((student) => (
                  <tr key={student.id} className="group">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 border-b border-r border-primary-100 bg-base-white px-4 py-2.5 text-left font-medium text-base-black group-hover:bg-primary-50"
                    >
                      {student.name}
                    </th>
                    {gradebook.tests.map((test) => {
                      const cell = gradebook.cells[student.id]?.[test.id] ?? null;
                      const muted = !test.scoresPublished;
                      return (
                        <td
                          key={test.id}
                          data-muted={muted ? 'true' : undefined}
                          className={`border-b border-r border-primary-100 px-3 py-2.5 text-center tabular-nums group-hover:bg-primary-50 ${
                            muted ? 'bg-primary-50/40' : ''
                          }`}
                        >
                          {cell ? (
                            <Link
                              to={`/teacher/attempts/${cell.attemptId}`}
                              title={
                                cell.provisional
                                  ? t('scoring.gradebook.cellTitleProvisional', {
                                      correct: cell.correctCount,
                                      total: cell.totalCount,
                                      count: cell.ungradedCount,
                                    })
                                  : t('classGrades.cellTitle', {
                                      correct: cell.correctCount,
                                      total: cell.totalCount,
                                    })
                              }
                              className={`inline-block rounded px-1.5 py-0.5 font-semibold hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 ${
                                muted ? 'text-base-black/35' : 'text-base-black'
                              }`}
                            >
                              {formatScore10(cell.scorePercent)}
                              {cell.provisional && <ProvisionalMark label={t('scoring.provisional.short')} />}
                            </Link>
                          ) : (
                            <span
                              className="text-base-black/40"
                              title={t('classGrades.notSubmittedTitle')}
                            >
                              —
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="border-b border-primary-100 bg-primary-50/60 px-3 py-2.5 text-right font-semibold tabular-nums text-base-black group-hover:bg-primary-100">
                      {formatScore10(gradebook.studentAverages[student.id] ?? null)}
                      {gradebook.tests.some((test) => isProvisional(student.id, test.id)) && (
                        <ProvisionalMark label={t('scoring.provisional.short')} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th
                    scope="row"
                    className="sticky bottom-0 left-0 z-30 border-r border-t border-primary-200 bg-primary-100 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-primary-800"
                  >
                    {t('classGrades.averageRow')}
                  </th>
                  {gradebook.tests.map((test) => (
                    <td
                      key={test.id}
                      className="sticky bottom-0 z-20 border-r border-t border-primary-200 bg-primary-100 px-3 py-2.5 text-center font-semibold tabular-nums text-primary-800"
                    >
                      {formatScore10(gradebook.testAverages[test.id] ?? null)}
                      {gradebook.students.some((student) => isProvisional(student.id, test.id)) && (
                        <ProvisionalMark label={t('scoring.provisional.short')} />
                      )}
                    </td>
                  ))}
                  <td className="sticky bottom-0 z-20 border-t border-primary-200 bg-primary-100" />
                </tr>
              </tfoot>
            </table>
          </HorizontalScrollHint>

          <ul className="flex flex-col gap-1 text-sm text-base-black/60">
            <li>{t('classGrades.footnoteBest')}</li>
            <li>{t('classGrades.footnoteNotSubmitted')}</li>
            <li>{t('scoring.gradebook.scaleNote')}</li>
            {hasProvisional && <li>{t('scoring.gradebook.legend')}</li>}
            {hasUnpublished && <li>{t('classGrades.footnoteUnpublished')}</li>}
          </ul>
        </>
      )}
    </section>
  );
}

export default ClassGradesTab;
