import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TEST_TYPE_LABELS, type AdminTestSummaryDTO } from '@platform/shared';
import { adminApi } from '../lib/adminApi';
import { ApiError } from '../lib/apiClient';

/** Admin-only "browse everything" list for Tests (T-071). Unlike the teacher-only "my
 * tests" list (`TeacherTestsPage.tsx`), every row shows which teacher owns it, since an
 * admin browsing here has no implicit "these are all mine" assumption. Clicking a row
 * opens the EXISTING teacher-side editor (`/teacher/tests/:id`) — that route's ownership
 * check now also accepts an admin caller (see `server/src/lib/ownedTest.ts`), so no
 * separate admin editor UI exists here. */
function AdminTestsPage() {
  const { t } = useTranslation();
  const [tests, setTests] = useState<AdminTestSummaryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .listAllTests()
      .then(setTests)
      .catch((err) => setError(err instanceof ApiError ? err.message : t('adminTests.errors.loadFailed')));
  }, [t]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary-700">{t('adminTests.heading')}</h1>
      <p className="mt-1 text-sm text-base-black/60">{t('adminTests.subtitle')}</p>

      {error && (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <ul className="mt-8 flex flex-col gap-3">
        {tests === null && <p className="text-sm text-base-black/60">{t('common.loading')}</p>}
        {tests?.length === 0 && <p className="text-sm text-base-black/60">{t('adminTests.empty')}</p>}
        {tests?.map((test) => (
          <li key={test.id}>
            <Link
              to={`/teacher/tests/${test.id}`}
              className="flex items-center justify-between rounded-xl border border-primary-100 bg-primary-50 px-5 py-4 transition-colors hover:border-primary-300"
            >
              <div>
                <p className="font-semibold text-primary-700">{test.title}</p>
                <p className="mt-1 text-xs text-base-black/60">
                  {t('adminTests.owner', { name: test.teacherName, email: test.teacherEmail })}
                </p>
                <p className="mt-1 text-xs text-base-black/60">
                  {t('adminTests.sectionCount', { count: test.sectionCount })} ·{' '}
                  {t('adminTests.questionCount', { count: test.questionCount })} ·{' '}
                  {t('adminTests.updatedAt', { date: new Date(test.updatedAt).toLocaleString() })}
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
                        {TEST_TYPE_LABELS[test.testType]}
                      </span>
                    </>
                  )}
                </p>
              </div>
              <span className="text-sm font-medium text-primary-600">{t('adminTests.openEditor')}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default AdminTestsPage;
