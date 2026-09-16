import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { VocabLeaderboardResponseDTO } from '@platform/shared';
import { vocabLeaderboardApi } from '../lib/vocabLeaderboardApi';
import { ApiError } from '../lib/apiClient';
import { useAuth } from '../context/useAuth';
import { useTeacherClasses } from '../hooks/useTeacherClasses';
import ClassFilterControl, { ClassFilterEmptyState } from '../components/ClassFilterControl';

/**
 * Vocabulary leaderboard (T-031) — visible to both roles (see `App.tsx`'s route
 * wiring, which mounts this same page under a `ProtectedRoute` allowing BOTH
 * `teacher` and `student`). Score formula REPLACED by T-089, documented in
 * `server/src/lib/vocabLeaderboard.ts`: the sum of the student's "Tự kiểm tra"
 * self-check point-values (+10 correct / -20 incorrect per attempt), across every
 * flashcard set they can access.
 *
 * Class scoping (T-077, Phase 12): the leaderboard is always ONE class's students. A
 * student's own class is used automatically by the server (`resolveViewerClassId`) — no
 * picker rendered for that role. A teacher/admin gets `useTeacherClasses`'s picker (hidden
 * entirely when they own exactly one class, per that hook's doc comment) and the data
 * fetch is gated on having a resolved `classId` first.
 */
function VocabLeaderboardPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const isTeacherView = user?.role === 'teacher' || user?.role === 'admin';
  // T-095: the new per-class workspace hub links here with `?classId=`, same T-088
  // hand-off pattern as `TeacherTestAttemptsReportPage` — only meaningful for the
  // teacher/admin view above, but harmless to read unconditionally.
  const [searchParams] = useSearchParams();
  const initialClassId = searchParams.get('classId') ?? '';
  // T-097: locks the picker to the class when arriving via `?classId=` — see
  // `TeacherReportsPage.tsx`'s identical pattern.
  const isClassLocked = initialClassId !== '';
  const { classes, classId, setClassId } = useTeacherClasses(isTeacherView, initialClassId);
  const lockedClassName = classes?.find((c) => c.id === classId)?.name ?? null;
  const [data, setData] = useState<VocabLeaderboardResponseDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // No synchronous `setData(null)` here — see `useTeacherClasses.ts`'s doc comment on
    // the same `react-hooks/set-state-in-effect` lint rule; `data` already starts `null`.
    if (isTeacherView && !classId) return;
    vocabLeaderboardApi
      .getLeaderboard(isTeacherView ? classId : undefined)
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => {
        setData(null);
        setError(err instanceof ApiError ? err.message : t('vocabLeaderboard.loadError'));
      });
  }, [t, isTeacherView, classId]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-700">{t('vocabLeaderboard.heading')}</h1>
        <p className="mt-1 text-sm text-base-black/60">{t('vocabLeaderboard.subtitle')}</p>
        {data && isTeacherView && (
          <p className="mt-1 text-sm text-primary-600">
            {t('classFilter.viewingLabel', { className: data.className })}{' '}
            <Link to="/teacher/classes" className="font-medium underline">
              {t('classFilter.switchClass')}
            </Link>
          </p>
        )}
        {data && !isTeacherView && (
          <p className="mt-1 text-sm text-primary-600">{t('classFilter.viewingLabel', { className: data.className })}</p>
        )}
      </div>

      {isTeacherView && (
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
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}
      {!error && !data && (!isTeacherView || classId) && (
        <p className="text-sm text-base-black/60">{t('common.loading')}</p>
      )}

      {data && (
        <section className="overflow-x-auto rounded-xl border border-primary-200">
          <table className="min-w-full divide-y divide-primary-100 text-sm">
            <thead className="bg-primary-50 text-left text-xs font-semibold uppercase tracking-wide text-primary-700">
              <tr>
                <th className="px-4 py-3">{t('vocabLeaderboard.colRank')}</th>
                <th className="px-4 py-3">{t('vocabLeaderboard.colStudent')}</th>
                <th className="px-4 py-3">{t('vocabLeaderboard.colCardsKnown')}</th>
                <th className="px-4 py-3">{t('vocabLeaderboard.colAttempts')}</th>
                <th className="px-4 py-3">{t('vocabLeaderboard.colAccuracy')}</th>
                <th className="px-4 py-3">{t('vocabLeaderboard.colScore')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-100">
              {data.entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-4 text-center text-base-black/60">
                    {t('vocabLeaderboard.emptyState')}
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
                      <span className="ml-2 text-xs text-primary-600">{t('vocabLeaderboard.youLabel')}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-base-black/80">{entry.knownCardCount}</td>
                  <td className="px-4 py-3 text-base-black/80">
                    {entry.correctAttempts}/{entry.totalAttempts}
                  </td>
                  <td className="px-4 py-3 text-base-black/80">
                    {entry.accuracyPercent === null ? '—' : `${entry.accuracyPercent}%`}
                  </td>
                  <td className="px-4 py-3 font-semibold text-primary-700">{entry.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

export default VocabLeaderboardPage;
