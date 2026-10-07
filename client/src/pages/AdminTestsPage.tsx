import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TEST_TYPE_LABELS, type AdminTestSummaryDTO } from '@platform/shared';
import { adminApi } from '../lib/adminApi';
import { ApiError } from '../lib/apiClient';
import { Alert, Badge, cardClassName, EmptyState, PageHeader, TestsIcon } from '../components/ui';

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
      <PageHeader
        title={t('adminTests.heading')}
        subtitle={t('adminTests.subtitle')}
        icon={<TestsIcon className="h-5 w-5" />}
      />

      {error && <Alert>{error}</Alert>}

      <ul className="flex flex-col gap-3">
        {tests === null && <p className="text-sm text-base-black/60">{t('common.loading')}</p>}
        {tests?.length === 0 && <EmptyState title={t('adminTests.empty')} />}
        {tests?.map((test) => (
          <li key={test.id}>
            <Link
              to={`/teacher/tests/${test.id}`}
              className={cardClassName(
                { variant: 'glass', hoverable: true },
                'flex items-center justify-between px-5 py-4',
              )}
            >
              <div>
                <p className="font-semibold text-primary-700">{test.title}</p>
                <p className="mt-1 text-xs text-base-black/60">
                  {t('adminTests.owner', { name: test.teacherName, email: test.teacherEmail })}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-base-black/60">
                  <span>
                    {t('adminTests.sectionCount', { count: test.sectionCount })} ·{' '}
                    {t('adminTests.questionCount', { count: test.questionCount })} ·{' '}
                    {t('adminTests.updatedAt', { date: new Date(test.updatedAt).toLocaleString() })}
                  </span>
                  {test.unitName && <Badge>{test.unitName}</Badge>}
                  {test.testType !== 'generic' && <Badge tone="neutral">{TEST_TYPE_LABELS[test.testType]}</Badge>}
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
