import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TestSummaryDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import LibraryBreadcrumb from '../components/LibraryBreadcrumb';
import { REPORTS_ENABLED } from '../lib/featureFlags';

/** `null` average (zero completed attempts yet, T-017) renders as nothing rather than
 * "0:00" — see `TestSummaryDTO.averageTimeTakenSeconds`'s doc comment for why an
 * abandoned (never-submitted) attempt is excluded rather than counted as zero time. */
function formatAverageDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

/**
 * Teacher's "my tests" list (T-008). Reachable from the teacher dashboard. Lets a
 * teacher see every test they've authored and create a new one, which immediately
 * navigates into the editor (`TeacherTestEditorPage`) for that new test.
 *
 * Also shows the average time-taken across completed attempts per test (T-017) — the
 * documented "your call" placement for this stat, since it's the one view a teacher
 * already visits to get a bird's-eye read on all of their tests at once.
 */
function TeacherTestsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [tests, setTests] = useState<TestSummaryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  function loadTests() {
    teacherApi
      .listTests()
      .then(setTests)
      .catch((err) => {
        console.warn('[tests] could not load the list:', err);
        setError(t('teacherTests.loadFailed'));
      });
  }

  // `t` is stable in practice (site-wide, admin-controlled language — PROJECT_PLAN
  // Guiding Principle 3/Assumption A13), safe to omit from this dependency list.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadTests, []);

  // T-087: delete a test outright, after a `window.confirm` prompt — same exact
  // convention as `AdminUsersPage.handleDelete`/`AdminAttemptsPage`'s delete action.
  // `teacherApi.deleteTest` already existed (wired to a real, working `DELETE`
  // endpoint) but had never been exposed in any UI before this task. On success the
  // deleted test is filtered out of the local list in place, rather than a full
  // re-fetch — same "trust the local mutation" pattern used nowhere else on this page
  // yet, but consistent with how e.g. `AdminUsersPage` avoids a redundant round-trip.
  async function handleDelete(testId: string) {
    if (!window.confirm(t('teacherTests.confirmDelete'))) {
      return;
    }
    try {
      await teacherApi.deleteTest(testId);
      setTests((prev) => (prev ? prev.filter((test) => test.id !== testId) : prev));
      setError(null);
    } catch (err) {
      console.warn('[tests] delete failed:', err);
      setError(t('teacherTests.deleteFailed'));
    }
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title) return;

    setIsCreating(true);
    setError(null);
    try {
      const created = await teacherApi.createTest({ title });
      navigate(`/teacher/tests/${created.id}`);
    } catch (err) {
      console.warn('[tests] create failed:', err);
      setError(t('teacherTests.createFailed'));
      setIsCreating(false);
    }
  }

  return (
    <div>
      <LibraryBreadcrumb section="tests" />
      <h1 className="mt-2 text-2xl font-bold text-primary-700">{t('teacherTests.heading')}</h1>
      <p className="mt-1 text-sm text-base-black/60">{t('teacherTests.subtitle')}</p>

      <form onSubmit={handleCreate} className="mt-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          {t('teacherTests.newTestTitleLabel')}
          <input
            type="text"
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder={t('teacherTests.newTestTitlePlaceholder')}
            className="w-72 rounded-md border border-primary-200 px-3 py-2 text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
        </label>
        <button
          type="submit"
          disabled={isCreating || !newTitle.trim()}
          className="rounded-md bg-primary-500 px-4 py-2.5 sm:py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isCreating ? t('teacherTests.creating') : t('teacherTests.createButton')}
        </button>
      </form>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <ul className="mt-8 flex flex-col gap-3">
        {tests === null && <p className="text-sm text-base-black/60">{t('common.loading')}</p>}
        {tests?.length === 0 && (
          <p className="text-sm text-base-black/60">{t('teacherTests.emptyState')}</p>
        )}
        {tests?.map((test) => (
          <li
            key={test.id}
            className="flex flex-col gap-3 rounded-xl border border-primary-100 bg-primary-50 px-5 py-4 transition-colors hover:border-primary-300 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <div className="min-w-0">
              <p className="font-semibold text-primary-700">{test.title}</p>
              <p className="mt-1 text-xs text-base-black/60">
                {t('teacherTests.sectionCount', { count: test.sectionCount })} ·{' '}
                {t('teacherTests.questionCount', { count: test.questionCount })} ·{' '}
                {t('teacherTests.updatedAt', {
                  date: new Date(test.updatedAt).toLocaleString(),
                })}
                {test.unitName && (
                  <>
                    {' '}
                    ·{' '}
                    <span className="rounded-full bg-primary-100 px-2 py-0.5 font-medium text-primary-700">
                      {test.unitName}
                    </span>
                  </>
                )}
                {test.testType !== 'generic' && (
                  <>
                    {' '}
                    ·{' '}
                    <span className="rounded-full bg-primary-200 px-2 py-0.5 font-medium text-primary-800">
                      {t(`teacherTestEditor.testTypes.${test.testType}`)}
                    </span>
                  </>
                )}
              </p>
              <p className="mt-1 text-xs text-base-black/60">
                {test.averageTimeTakenSeconds !== null
                  ? t('teacherTests.averageTimeTaken', {
                      duration: formatAverageDuration(test.averageTimeTakenSeconds),
                      count: test.completedAttemptCount,
                    })
                  : t('teacherTests.averageTimeTakenNone')}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3">
              {/* T-087: ranked per-student report, all sessions + self-practice. */}
              {REPORTS_ENABLED && (
                <Link
                  to={`/teacher/tests/${test.id}/report`}
                  className="py-2.5 text-sm font-medium text-primary-600 hover:underline sm:py-0"
                >
                  {t('teacherTests.viewReport')}
                </Link>
              )}
              <Link
                to={`/teacher/tests/${test.id}`}
                className="py-2.5 text-sm font-medium text-primary-600 hover:underline sm:py-0"
              >
                {t('teacherTests.openEditor')}
              </Link>
              {/* Kept well away from "open the editor" (a wide gap on wide screens, its own line on a
                  phone) and drawn as an outlined red button so it cannot be hit by mistake. */}
              <div className="w-full border-t border-primary-100 pt-3 sm:ml-8 sm:w-auto sm:border-0 sm:pt-0">
                <button
                  type="button"
                  onClick={() => handleDelete(test.id)}
                  className="rounded-md border border-red-300 bg-base-white px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
                >
                  {t('teacherTests.deleteButton')}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default TeacherTestsPage;
