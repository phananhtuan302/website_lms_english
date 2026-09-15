import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { UnitLeaderboardResponseDTO } from '@platform/shared';
import { apiRequest, ApiError } from '../lib/apiClient';
import { useAuth } from '../context/useAuth';

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
 */
function UnitLeaderboardPage() {
  const { unitId } = useParams<{ unitId: string }>();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [data, setData] = useState<UnitLeaderboardResponseDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!unitId) return;
    apiRequest<UnitLeaderboardResponseDTO>(`/api/units/${unitId}/leaderboard`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : t('unitLeaderboard.loadFailed')));
  }, [unitId, t]);

  const backPath = user?.role === 'teacher' ? '/teacher/unit-tests' : '/student/unit-tests';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to={backPath} className="text-sm text-primary-600 hover:underline">
          {t('unitLeaderboard.backToUnitTests')}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-primary-700">
          {data
            ? t('unitLeaderboard.headingWithUnit', { unitName: data.unitName })
            : t('unitLeaderboard.heading')}
        </h1>
        <p className="mt-1 text-sm text-base-black/60">{t('unitLeaderboard.description')}</p>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {!error && !data && <p className="text-sm text-base-black/60">{t('common.loading')}</p>}

      {data && (
        <>
          <div className="rounded-xl border border-primary-200 bg-primary-50 p-4">
            <p className="text-sm text-base-black/70">
              {t('unitLeaderboard.classAverageLabel')}{' '}
              <span className="font-semibold text-primary-700">
                {data.averageScorePercent === null ? '—' : `${data.averageScorePercent}%`}
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
                      {entry.averageScorePercent === null ? '—' : `${entry.averageScorePercent}%`}
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
