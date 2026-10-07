import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { AttemptSummaryDTO } from '@platform/shared';
import { adminApi } from '../lib/adminApi';
import { ApiError } from '../lib/apiClient';
import { Alert, AttemptsIcon, Badge, Button, Input, LinkButton, PageHeader, Table } from '../components/ui';

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
      <PageHeader
        title={t('adminAttempts.heading')}
        subtitle={t('adminAttempts.subtitle')}
        icon={<AttemptsIcon className="h-5 w-5" />}
      />

      <form onSubmit={handleSearchSubmit} className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          {t('adminAttempts.searchLabel')}
          <Input
            type="text"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="w-72"
          />
        </label>
        <Button type="submit" variant="outline">
          {t('adminAttempts.searchSubmit')}
        </Button>
      </form>

      {error && <Alert className="mt-4">{error}</Alert>}

      {data === null && !error && <p className="mt-4 text-sm text-base-black/60">{t('common.loading')}</p>}
      {data?.attempts.length === 0 && (
        <p className="mt-4 text-sm text-base-black/60">{t('adminAttempts.noResults')}</p>
      )}

      {data && data.attempts.length > 0 && (
        <>
          <Table className="mt-6">
            <Table.Head>
              <tr>
                <Table.HeaderCell>{t('adminAttempts.columns.student')}</Table.HeaderCell>
                <Table.HeaderCell>{t('adminAttempts.columns.test')}</Table.HeaderCell>
                <Table.HeaderCell>{t('adminAttempts.columns.status')}</Table.HeaderCell>
                <Table.HeaderCell>{t('adminAttempts.columns.score')}</Table.HeaderCell>
                <Table.HeaderCell>{t('adminAttempts.columns.timeTaken')}</Table.HeaderCell>
                <Table.HeaderCell>{t('adminAttempts.columns.started')}</Table.HeaderCell>
                <Table.HeaderCell />
              </tr>
            </Table.Head>
            <tbody>
              {data.attempts.map((attempt) => (
                <Table.Row key={attempt.attemptId}>
                  <Table.Cell>
                    <p className="font-medium text-base-black">{attempt.studentName}</p>
                    <p className="text-xs text-base-black/50">{attempt.studentEmail}</p>
                  </Table.Cell>
                  <Table.Cell className="text-base-black/80">{attempt.testTitle}</Table.Cell>
                  <Table.Cell>
                    <Badge tone={attempt.status === 'submitted' ? 'green' : 'amber'}>
                      {attempt.status === 'submitted'
                        ? t('adminAttempts.status.submitted')
                        : t('adminAttempts.status.inProgress')}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    {attempt.scorePercent !== null
                      ? `${attempt.scorePercent}% (${attempt.correctCount}/${attempt.totalCount})`
                      : '—'}
                  </Table.Cell>
                  <Table.Cell className="text-base-black/70">{formatDuration(attempt.timeTakenSeconds)}</Table.Cell>
                  <Table.Cell className="text-base-black/70">{new Date(attempt.startedAt).toLocaleString()}</Table.Cell>
                  <Table.Cell>
                    <div className="flex items-center gap-2">
                      <LinkButton to={`/teacher/attempts/${attempt.attemptId}`} variant="ghost" size="sm">
                        {t('adminAttempts.viewDetail')}
                      </LinkButton>
                      <Button variant="ghost" tone="danger" size="sm" onClick={() => handleDelete(attempt.attemptId)}>
                        {t('adminAttempts.delete')}
                      </Button>
                    </div>
                  </Table.Cell>
                </Table.Row>
              ))}
            </tbody>
          </Table>

          <div className="mt-4 flex items-center justify-between text-sm text-base-black/70">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              {t('adminAttempts.previousPage')}
            </Button>
            <span>{t('adminAttempts.pageOf', { page, totalPages })}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              {t('adminAttempts.nextPage')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export default AdminAttemptsPage;
