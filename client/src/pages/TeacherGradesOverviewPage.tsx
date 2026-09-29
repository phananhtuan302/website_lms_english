import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ClassGradesOverviewRowDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';
import { CLASSES_HOME_PATH, classTabPath } from '../lib/classWorkspace';
import { formatScore10WithUnit } from '../lib/scoreFormat';

/**
 * Teacher-level "Tổng quan điểm số" (Phase 17, T-118B — BACKLOG's "no cross-class score
 * comparison" finding): one row per class the teacher owns, so a teacher with several classes
 * can see at a glance which is ahead/behind without opening each class's own "Điểm số" tab one
 * at a time. Reached from that tab's "Xem so sánh với các lớp khác →" link
 * (`ClassGradesTab.tsx`).
 *
 * Data: `GET /api/teacher/classes-grades-overview`, which reuses the class gradebook's own
 * average computation (`loadClassGrades`) server-side — never a second scoring formula, so
 * this screen's numbers always agree with each class's own "Điểm số" tab. Sorted descending by
 * average for display (the server returns no particular order); a class with no current
 * period, or with one but nothing submitted anywhere yet, shows "Chưa có dữ liệu" instead of a
 * score and is excluded from the "Cao nhất" / "Thấp nhất" marking — marking a highest/lowest
 * among classes with nothing to compare would be meaningless.
 */
function TeacherGradesOverviewPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ClassGradesOverviewRowDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    teacherApi
      .getClassesGradesOverview()
      .then((data) => {
        if (cancelled) return;
        setRows(data.classes);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : t('gradesOverview.loadFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  // Descending by average; classes with no score sort to the bottom (order among themselves
  // doesn't matter — none of them get a "Cao nhất"/"Thấp nhất" mark).
  const sorted = rows
    ? [...rows].sort((a, b) => {
        if (a.averageScorePercent === null && b.averageScorePercent === null) return 0;
        if (a.averageScorePercent === null) return 1;
        if (b.averageScorePercent === null) return -1;
        return b.averageScorePercent - a.averageScorePercent;
      })
    : [];

  const scored = sorted.filter((row) => row.averageScorePercent !== null);
  const highestClassId = scored.length > 0 ? scored[0].classId : null;
  // Only mark a separate "lowest" when there are at least 2 scored classes — otherwise the one
  // scored row would get both tags, which reads as confusing rather than informative.
  const lowestClassId = scored.length > 1 ? scored[scored.length - 1].classId : null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <Link to={CLASSES_HOME_PATH} className="text-sm text-primary-600 hover:underline">
          {t('gradesOverview.back')}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-primary-700">{t('gradesOverview.heading')}</h1>
        <p className="mt-1 text-sm text-base-black/60">{t('gradesOverview.description')}</p>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {!error && !rows && <p className="text-sm text-base-black/60">{t('common.loading')}</p>}

      {rows && rows.length === 0 && (
        <p className="rounded-xl border border-dashed border-primary-300 bg-primary-50 p-6 text-center text-sm text-base-black/70">
          {t('gradesOverview.noClasses')}
        </p>
      )}

      {rows && rows.length > 0 && (
        <section className="overflow-x-auto rounded-xl border border-primary-200">
          <table className="min-w-full divide-y divide-primary-100 text-sm">
            <thead className="bg-primary-50 text-left text-xs font-semibold uppercase tracking-wide text-primary-700">
              <tr>
                <th className="px-4 py-3">{t('gradesOverview.classHeader')}</th>
                <th className="px-4 py-3">{t('gradesOverview.studentsHeader')}</th>
                <th className="px-4 py-3">{t('gradesOverview.semesterHeader')}</th>
                <th className="px-4 py-3">{t('gradesOverview.testsHeader')}</th>
                <th className="px-4 py-3">{t('gradesOverview.averageHeader')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-100">
              {sorted.map((row) => (
                <tr key={row.classId}>
                  <td className="px-4 py-3 font-medium text-base-black">
                    <Link to={classTabPath(row.classId, 'grades')} className="hover:underline">
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-base-black/80">{row.studentCount}</td>
                  <td className="px-4 py-3 text-base-black/80">
                    {row.currentPeriodName ?? t('gradesOverview.noSemester')}
                  </td>
                  <td className="px-4 py-3 text-base-black/80">{row.assignedTestCount}</td>
                  <td className="px-4 py-3">
                    {row.averageScorePercent === null ? (
                      <span className="text-base-black/50">{t('gradesOverview.noData')}</span>
                    ) : (
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-primary-700">
                          {formatScore10WithUnit(row.averageScorePercent)}
                        </span>
                        {row.classId === highestClassId && (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold uppercase text-green-800">
                            {t('gradesOverview.highest')}
                          </span>
                        )}
                        {row.classId === lowestClassId && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase text-amber-900">
                            {t('gradesOverview.lowest')}
                          </span>
                        )}
                      </span>
                    )}
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

export default TeacherGradesOverviewPage;
