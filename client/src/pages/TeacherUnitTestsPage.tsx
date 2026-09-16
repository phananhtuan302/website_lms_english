import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ClassDTO, TeacherUnitTestsResponseDTO, UnitTestGroupDTO, TestSummaryDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';

/**
 * Teacher's "Unit Tests" view (T-036): every `testType: 'unitTest'` test this teacher
 * owns, grouped by curriculum Unit. Tagging a test as a Unit Test (and flipping
 * `published`) happens in the regular test editor (`TeacherTestEditorPage.tsx`) — this
 * page is purely the grouped read-side view, plus a link into each unit's leaderboard
 * (T-037).
 *
 * T-097: reached with `?classId=` (from `TeacherClassWorkspacePage`'s hub), the list is
 * filtered client-side to only tests already assigned to that class (`TestSummaryDTO`'s
 * new optional `classIds`, populated by `GET /api/teacher/unit-tests` — T-075's existing
 * `Test.classes` assignment data, no new authorization logic). Reached without `?classId=`
 * (e.g. a directly-typed URL), every Unit Test the teacher owns is shown, unchanged. A
 * small "Đang thao tác: Lớp X" line + "Đổi lớp" link (same wording/pattern as every other
 * page this task locks) gives the same personalized-to-this-class feedback here too, even
 * though this page never had a dropdown of its own to hide.
 */
function TeacherUnitTestsPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<TeacherUnitTestsResponseDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const scopeClassId = searchParams.get('classId') ?? '';
  const [classes, setClasses] = useState<ClassDTO[] | null>(null);

  useEffect(() => {
    teacherApi
      .listUnitTests()
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : t('teacherUnitTests.loadFailed')));
  }, [t]);

  useEffect(() => {
    if (!scopeClassId) return;
    teacherApi
      .listClasses()
      .then(setClasses)
      .catch(() => setClasses([]));
  }, [scopeClassId]);

  const scopedClassName = classes?.find((c) => c.id === scopeClassId)?.name ?? null;

  const groups: UnitTestGroupDTO<TestSummaryDTO>[] | undefined = scopeClassId
    ? data?.groups
        .map((group) => ({ ...group, tests: group.tests.filter((test) => test.classIds?.includes(scopeClassId)) }))
        .filter((group) => group.tests.length > 0)
    : data?.groups;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/teacher/dashboard" className="text-sm text-primary-600 hover:underline">
          {t('teacherUnitTests.backToDashboard')}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-primary-700">{t('teacherUnitTests.heading')}</h1>
        <p className="mt-1 text-sm text-base-black/60">
          {t('teacherUnitTests.description.taggedBefore')} <code>testType: unitTest</code>
          {t('teacherUnitTests.description.taggedAfter')}{' '}
          <Link to="/teacher/tests" className="text-primary-600 hover:underline">
            {t('teacherUnitTests.description.myTestsLink')}
          </Link>{' '}
          {t('teacherUnitTests.description.toOpenOne')}
        </p>
        {scopeClassId && (
          <p className="mt-1 text-sm text-primary-600">
            {scopedClassName ? t('classFilter.lockedLabel', { className: scopedClassName }) : t('common.loading')}{' '}
            <Link to="/teacher/classes" className="font-medium underline">
              {t('classFilter.switchClass')}
            </Link>
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {!error && !data && <p className="text-sm text-base-black/60">{t('common.loading')}</p>}
      {data && groups?.length === 0 && (
        <p className="text-sm text-base-black/60">
          {scopeClassId && data.groups.length > 0
            ? t('teacherUnitTests.emptyForClass')
            : t('teacherUnitTests.empty')}
        </p>
      )}

      {groups?.map((group) => (
        <section key={group.unitId ?? 'untagged'} className="rounded-xl border border-primary-200 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-base-black">
              {group.unitName ?? t('teacherUnitTests.untaggedGroup')}
            </h2>
            {group.unitId && (
              <Link
                to={`/units/${group.unitId}/leaderboard`}
                className="text-sm font-medium text-primary-600 hover:underline"
              >
                {t('teacherUnitTests.viewLeaderboard')}
              </Link>
            )}
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {group.tests.map((test) => (
              <li key={test.id}>
                <Link
                  to={`/teacher/tests/${test.id}`}
                  className="flex items-center justify-between rounded-lg border border-primary-100 bg-primary-50 px-4 py-3 text-sm transition-colors hover:border-primary-300"
                >
                  <span className="font-medium text-base-black">{test.title}</span>
                  <span
                    className={
                      test.published
                        ? 'rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700'
                        : 'rounded-full bg-base-black/10 px-2 py-0.5 text-xs font-semibold text-base-black/60'
                    }
                  >
                    {test.published ? t('teacherUnitTests.published') : t('teacherUnitTests.notPublished')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default TeacherUnitTestsPage;
