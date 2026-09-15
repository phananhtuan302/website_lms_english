import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { AttemptSummaryDTO } from '@platform/shared';
import { adminApi } from '../lib/adminApi';
import { ApiError } from '../lib/apiClient';

const PAGE_SIZE = 20;

/** `null` (never submitted, T-017) renders as an em dash — same convention as
 * `TeacherSessionAttemptsPage.tsx`'s `formatDuration`. */
function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

/**
 * Admin-only "every attempt in the system" list (T-072a) — unlike the teacher-only
 * per-session list (`TeacherSessionAttemptsPage.tsx`), this is NOT scoped to any one
 * test/session: any student's attempt at any test shows up here. Searchable by student
 * name/email or test title, paginated since this can grow unbounded.
 *
 * Clicking a row opens the EXISTING attempt-detail page (`/teacher/attempts/:id`,
 * `TeacherAttemptDetailPage.tsx`) — that route's ownership check already accepts an
 * admin caller (T-071's `isAdminOrOwner`), so editing an essay/Speaking manual grade
 * there works for ANY attempt without a parallel admin-only scoring UI, per T-072's
 * acceptance criteria ("extend the existing endpoint, don't build a parallel system").
 * Deleting an attempt (no existing UI anywhere else in the product) is the one genuinely
 * new capability this page adds.
 */
function AdminAttemptsPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<{ attempts: AttemptSummaryDTO[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  function load() {
    adminApi
      .listAttempts({ search: search || undefined, page, pageSize: PAGE_SIZE })
      .then((res) => setData({ attempts: res.attempts, total: res.total }))
      .catch((err) => setError(err instanceof ApiError ? err.message : t('adminAttempts.errors.loadFailed')));
  }

  // `t` is stable in practice — same reasoning as every other admin page (site language
  // is an admin-controlled setting resolved once at startup, not a live runtime switch).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [search, page]);

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  async function handleDelete(attemptId: string) {
    if (!window.confirm(t('adminAttempts.confirmDelete'))) {
      return;
    }
    try {
      await adminApi.deleteAttempt(attemptId);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('adminAttempts.errors.deleteFailed'));
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary-700">{t('adminAttempts.heading')}</h1>
      <p className="mt-1 text-sm text-base-black/60">{t('adminAttempts.subtitle')}</p>

      <form onSubmit={handleSearchSubmit} className="mt-6 flex items-end gap-2">
        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          {t('adminAttempts.searchLabel')}
          <input
            type="text"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="w-72 rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
        </label>
        <button
          type="submit"
          className="rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100"
        >
          {t('adminAttempts.searchSubmit')}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {data === null && !error && <p className="mt-4 text-sm text-base-black/60">{t('common.loading')}</p>}
      {data?.attempts.length === 0 && (
        <p className="mt-4 text-sm text-base-black/60">{t('adminAttempts.noResults')}</p>
      )}

      {data && data.attempts.length > 0 && (
        <>
          <div className="mt-6 overflow-x-auto rounded-xl border border-primary-200">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-primary-50 text-xs font-semibold uppercase text-primary-700">
                <tr>
                  <th className="px-4 py-3">{t('adminAttempts.columns.student')}</th>
                  <th className="px-4 py-3">{t('adminAttempts.columns.test')}</th>
                  <th className="px-4 py-3">{t('adminAttempts.columns.status')}</th>
                  <th className="px-4 py-3">{t('adminAttempts.columns.score')}</th>
                  <th className="px-4 py-3">{t('adminAttempts.columns.timeTaken')}</th>
                  <th className="px-4 py-3">{t('adminAttempts.columns.started')}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.attempts.map((attempt) => (
                  <tr key={attempt.attemptId} className="border-t border-primary-100">
                    <td className="px-4 py-3">
                      <p className="font-medium text-base-black">{attempt.studentName}</p>
                      <p className="text-xs text-base-black/50">{attempt.studentEmail}</p>
                    </td>
                    <td className="px-4 py-3 text-base-black/80">{attempt.testTitle}</td>
                    <td className="px-4 py-3">
                      <span className={attempt.status === 'submitted' ? 'text-green-700' : 'text-primary-600'}>
                        {attempt.status === 'submitted'
                          ? t('adminAttempts.status.submitted')
                          : t('adminAttempts.status.inProgress')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {attempt.scorePercent !== null
                        ? `${attempt.scorePercent}% (${attempt.correctCount}/${attempt.totalCount})`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-base-black/70">{formatDuration(attempt.timeTakenSeconds)}</td>
                    <td className="px-4 py-3 text-base-black/70">{new Date(attempt.startedAt).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Link
                          to={`/teacher/attempts/${attempt.attemptId}`}
                          className="font-medium text-primary-600 hover:underline"
                        >
                          {t('adminAttempts.viewDetail')}
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDelete(attempt.attemptId)}
                          className="font-medium text-red-600 hover:underline"
                        >
                          {t('adminAttempts.delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-base-black/70">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-md border border-primary-200 px-3 py-1.5 font-medium text-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('adminAttempts.previousPage')}
            </button>
            <span>{t('adminAttempts.pageOf', { page, totalPages })}</span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-md border border-primary-200 px-3 py-1.5 font-medium text-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('adminAttempts.nextPage')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default AdminAttemptsPage;
