import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { UnitLeaderboardResponseDTO } from '@platform/shared';
import { apiRequest, ApiError } from '../lib/apiClient';
import { useAuth } from '../context/useAuth';
import { useTeacherClasses } from '../hooks/useTeacherClasses';
import ClassFilterControl, { ClassFilterEmptyState } from '../components/ClassFilterControl';
import { classAssignmentsPath } from '../lib/classAssignments';
import { CLASSES_HOME_PATH } from '../lib/classWorkspace';
import { dashboardPathForRole } from '../lib/roles';
import { formatScore10WithUnit } from '../lib/scoreFormat';

/**
 * Unit Test report & leaderboard (T-037) — visible to BOTH roles (see `App.tsx`'s route
 * wiring), reached from either the teacher's Unit Tests page or the student's Unit Tests
 * page for a specific Unit. Calls `GET /api/units/:unitId/leaderboard` directly (not
 * through `teacherApi`/`studentApi`) since the endpoint itself requires no particular
 * role — see `unitLeaderboard.routes.ts`'s module doc comment.
 *
 * Ranked scores + the unit-wide average are both computed by T-019's shared
 * `computeReport` engine server-side (`groupBy: 'student'` / `groupBy: 'unit'`, both
 * narrowed to `testType: 'unitTest'`) — this page just renders the result.
 *
 * Class scoping (T-077, Phase 12): same both-roles pattern as `VocabLeaderboardPage` — a
 * student's own class is used automatically server-side; a teacher/admin picks via
 * `useTeacherClasses`/`ClassFilterControl` (hidden when they own exactly one class).
 */
function UnitLeaderboardPage() {
  const { unitId } = useParams<{ unitId: string }>();
  const { user } = useAuth();
  const { t } = useTranslation();
  const isTeacherView = user?.role === 'teacher' || user?.role === 'admin';
  const { classes, classId, setClassId } = useTeacherClasses(isTeacherView);
  const [data, setData] = useState<UnitLeaderboardResponseDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!unitId) return;
    // No synchronous `setData(null)` here — see `useTeacherClasses.ts`'s doc comment on
    // the `react-hooks/set-state-in-effect` lint rule; `data` already starts `null`.
    if (isTeacherView && !classId) return;
    const query = isTeacherView && classId ? `?classId=${encodeURIComponent(classId)}` : '';
    apiRequest<UnitLeaderboardResponseDTO>(`/api/units/${unitId}/leaderboard${query}`)
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => {
        setData(null);
        setError(err instanceof ApiError ? err.message : t('unitLeaderboard.loadFailed'));
      });
  }, [unitId, t, isTeacherView, classId]);

  // T-106: the old Unit Tests pages are gone — a Unit test is just a row of the class's Bài tập
  // tab (teacher, back to the class being viewed) or of the student's "Bài cần làm" home.
  const backPath = isTeacherView
    ? classId
      ? classAssignmentsPath(classId)
      : CLASSES_HOME_PATH
    : dashboardPathForRole(user?.role ?? 'student');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to={backPath} className="text-sm text-primary-600 hover:underline">
          {/* T-113: a student's home is called "Bài cần làm"; only teachers have a "Bài tập" tab. */}
          {t(isTeacherView ? 'unitLeaderboard.backToAssignments' : 'unitLeaderboard.backToTodo')}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-primary-700">
          {data
            ? t('unitLeaderboard.headingWithUnit', { unitName: data.unitName })
            : t('unitLeaderboard.heading')}
        </h1>
        <p className="mt-1 text-sm text-base-black/60">{t('unitLeaderboard.description')}</p>
        {data && <p className="mt-1 text-sm text-primary-600">{t('classFilter.viewingLabel', { className: data.className })}</p>}
      </div>

      {isTeacherView && (
        <section className="flex flex-wrap items-end gap-4 rounded-xl border border-primary-200 p-4">
          <ClassFilterControl classes={classes} classId={classId} onChange={setClassId} />
          <ClassFilterEmptyState classes={classes} />
        </section>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}
      {!error && !data && (!isTeacherView || classId) && (
        <p className="text-sm text-base-black/60">{t('common.loading')}</p>
      )}

      {data && (
        <>
          <div className="rounded-xl border border-primary-200 bg-primary-50 p-4">
            <p className="text-sm text-base-black/70">
              {t('unitLeaderboard.classAverageLabel')}{' '}
              <span className="font-semibold text-primary-700">
                {formatScore10WithUnit(data.averageScorePercent)}
              </span>{' '}
              {t('unitLeaderboard.attemptsSuffix', { count: data.attemptCount })}
            </p>
          </div>

          <section className="overflow-x-auto rounded-xl border border-primary-200">
            <table className="min-w-full divide-y divide-primary-100 text-sm">
              <thead className="bg-primary-50 text-left text-xs font-semibold uppercase tracking-wide text-primary-700">
                <tr>
                  <th className="px-4 py-3">{t('unitLeaderboard.rankHeader')}</th>
                  <th className="px-4 py-3">{t('unitLeaderboard.studentHeader')}</th>
                  <th className="px-4 py-3">{t('unitLeaderboard.attemptsHeader')}</th>
                  <th className="px-4 py-3">{t('unitLeaderboard.averageScoreHeader')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-100">
                {data.entries.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-4 text-center text-base-black/60">
                      {t('unitLeaderboard.noStudents')}
                    </td>
                  </tr>
                )}
                {data.entries.map((entry) => (
                  <tr
                    key={entry.studentId}
                    className={entry.studentId === user?.id ? 'bg-primary-50 font-semibold' : ''}
                  >
                    <td className="px-4 py-3 text-base-black">#{entry.rank}</td>
                    <td className="px-4 py-3 text-base-black">
                      {entry.studentName}
                      {entry.studentId === user?.id && (
                        <span className="ml-2 text-xs text-primary-600">
                          {t('unitLeaderboard.youSuffix')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-base-black/80">{entry.attemptCount}</td>
                    <td className="px-4 py-3 font-semibold text-primary-700">
                      {formatScore10WithUnit(entry.averageScorePercent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

export default UnitLeaderboardPage;
