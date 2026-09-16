import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ReportGroupBy, ReportResponseDTO, TestSummaryDTO, TestType, UnitDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';
import { useTeacherClasses } from '../hooks/useTeacherClasses';
import ClassFilterControl, { ClassFilterEmptyState } from '../components/ClassFilterControl';

const GROUP_BY_OPTIONS: Array<{ value: ReportGroupBy; labelKey: string }> = [
  { value: 'test', labelKey: 'teacherReports.groupByOptions.test' },
  { value: 'unit', labelKey: 'teacherReports.groupByOptions.unit' },
  { value: 'week', labelKey: 'teacherReports.groupByOptions.week' },
  { value: 'month', labelKey: 'teacherReports.groupByOptions.month' },
  { value: 'quarter', labelKey: 'teacherReports.groupByOptions.quarter' },
  { value: 'semester', labelKey: 'teacherReports.groupByOptions.semester' },
  { value: 'year', labelKey: 'teacherReports.groupByOptions.year' },
];

const TEST_TYPE_OPTIONS: Array<{ value: TestType; labelKey: string }> = [
  { value: 'generic', labelKey: 'teacherReports.testTypeOptions.generic' },
  { value: 'unitTest', labelKey: 'teacherReports.testTypeOptions.unitTest' },
  { value: 'vocabularyCheck', labelKey: 'teacherReports.testTypeOptions.vocabularyCheck' },
  { value: 'listeningTest', labelKey: 'teacherReports.testTypeOptions.listeningTest' },
  { value: 'mockTest', labelKey: 'teacherReports.testTypeOptions.mockTest' },
];

interface TeacherReportsPageProps {
  /** T-057: when set, this instance is locked to one `Test.testType` (e.g. the "Unit
   * Test" module of the unified reports hub passes `'unitTest'`) — the test-type filter
   * below is hidden entirely rather than shown-but-disabled, since there is nothing left
   * for the teacher to choose. Omitted (the default, used by the standalone "Test"
   * module) leaves the filter open with an "All test types" option, so a Test-module
   * teacher can still narrow to one specific `testType` using the exact same
   * `computeReport` engine field (T-037) `TeacherReportsHubPage`'s Unit Test tab reuses
   * by fixing this prop instead. */
  fixedTestType?: TestType;
  heading?: string;
  description?: string;
}

/**
 * Teacher-facing reports view (T-019, extended by T-057): a filter selector
 * (granularity + optional test/unit/test-type narrowing) plus a plain table of results.
 * Deliberately no charts — per T-019's acceptance criteria "doesn't need to be fancy...
 * charts are NOT required, just correct numbers" — every row is a bucket from the shared
 * reporting engine (`server/src/lib/reporting.ts`), one row per test/unit/week/month/
 * quarter/semester/year actually present in the (optionally narrowed) data — see
 * PROJECT_PLAN.md Assumption A11 for why `groupBy` returns a breakdown table rather than
 * one single number.
 *
 * Reused as both the "Test" and "Unit Test" module of `TeacherReportsHubPage` (T-057) —
 * see `fixedTestType`'s doc comment above for how the two differ.
 */
function TeacherReportsPage({ fixedTestType, heading, description }: TeacherReportsPageProps) {
  const { t } = useTranslation();
  const [groupBy, setGroupBy] = useState<ReportGroupBy>('month');
  const [testId, setTestId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [testType, setTestType] = useState<TestType | ''>('');
  // T-095: the new per-class workspace hub links here with `?classId=`, same T-088
  // hand-off pattern as `TeacherTestAttemptsReportPage` — read once on mount and fed
  // straight into `useTeacherClasses` below as the starting class.
  const [searchParams] = useSearchParams();
  const initialClassId = searchParams.get('classId') ?? '';
  // T-097: arriving WITH a `?classId=` LOCKS the page to that class — the picker below is
  // hidden entirely rather than merely pre-filled, mirroring Google Classroom's own model
  // (no in-page course switcher, go back to the courses list instead). This also closes
  // T-096 as a side effect: with no dropdown rendered, `selectedClassId` can never be set
  // to anything, so `effectiveClassId` below can never fall through to an ambiguous
  // half-cleared state.
  const isClassLocked = initialClassId !== '';
  // T-077: required class dimension — `useTeacherClasses` auto-selects the sole class
  // when the teacher only has one, otherwise starts empty until they pick via
  // `ClassFilterControl` below.
  const { classes, classId } = useTeacherClasses(true, initialClassId);
  const [selectedClassId, setSelectedClassId] = useState('');
  const effectiveClassId = selectedClassId || classId;
  const lockedClassName = classes?.find((c) => c.id === classId)?.name ?? null;

  const [tests, setTests] = useState<TestSummaryDTO[]>([]);
  const [units, setUnits] = useState<UnitDTO[]>([]);
  // `null` means "no successful response yet" (initial load, or the request currently
  // in flight after a filter change failed) — same "null sentinel, no separate loading
  // boolean" convention as `TeacherSessionAttemptsPage.tsx`'s `attempts` state, which
  // keeps every `setState` call here inside an async `.then`/`.catch` callback rather
  // than synchronously in the effect body (the latter trips the
  // `react-hooks/set-state-in-effect` lint rule).
  const [report, setReport] = useState<ReportResponseDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    teacherApi.listTests().then(setTests).catch(() => setTests([]));
    teacherApi.listUnits().then(setUnits).catch(() => setUnits([]));
  }, []);

  useEffect(() => {
    // No synchronous `setReport(null)` here — see `useTeacherClasses.ts`'s doc comment on
    // the `react-hooks/set-state-in-effect` lint rule; `report` already starts `null`.
    if (!effectiveClassId) return;
    teacherApi
      .getReport({
        groupBy,
        testId: testId || null,
        unitId: unitId || null,
        testType: fixedTestType ?? (testType || null),
        classId: effectiveClassId,
      })
      .then((res) => {
        setReport(res);
        setError(null);
      })
      .catch((err) => {
        setReport(null);
        setError(err instanceof ApiError ? err.message : t('teacherReports.loadFailed'));
      });
    // `t` is stable in practice (site-wide, admin-controlled language — PROJECT_PLAN
    // Guiding Principle 3/Assumption A13), safe to omit from this dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupBy, testId, unitId, testType, fixedTestType, effectiveClassId]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-700">{heading ?? t('teacherReports.heading')}</h1>
        <p className="mt-1 text-sm text-base-black/60">
          {description ?? t('teacherReports.description')}
        </p>
        {report && (
          <p className="mt-1 text-sm text-primary-600">
            {t('classFilter.viewingLabel', { className: report.className })}{' '}
            <Link to="/teacher/classes" className="font-medium underline">
              {t('classFilter.switchClass')}
            </Link>
          </p>
        )}
      </div>

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
            <ClassFilterControl classes={classes} classId={selectedClassId} onChange={setSelectedClassId} />
            <ClassFilterEmptyState classes={classes} />
          </>
        )}
        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          {t('teacherReports.groupByLabel')}
          <select
            value={groupBy}
            onChange={(event) => setGroupBy(event.target.value as ReportGroupBy)}
            className="w-64 rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          >
            {GROUP_BY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          {t('teacherReports.testFilterLabel')}
          <select
            value={testId}
            onChange={(event) => setTestId(event.target.value)}
            className="w-64 rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          >
            <option value="">{t('teacherReports.allTests')}</option>
            {tests.map((test) => (
              <option key={test.id} value={test.id}>
                {test.title}
              </option>
            ))}
          </select>
        </label>

        {/* T-088: hand off to T-087's per-test attempt report, pre-scoped to the class
            currently being viewed here — only shown once a specific test is picked, since
            "all tests" has nothing coherent to link to. */}
        {testId !== '' && (
          <Link
            to={`/teacher/tests/${testId}/report?classId=${encodeURIComponent(effectiveClassId)}`}
            className="text-sm font-medium text-primary-600 hover:underline"
          >
            {t('teacherReports.viewDetailedReport')}
          </Link>
        )}

        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          {t('teacherReports.unitFilterLabel')}
          <select
            value={unitId}
            onChange={(event) => setUnitId(event.target.value)}
            className="w-64 rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          >
            <option value="">{t('teacherReports.allUnits')}</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
        </label>

        {!fixedTestType && (
          <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
            {t('teacherReports.testTypeFilterLabel')}
            <select
              value={testType}
              onChange={(event) => setTestType(event.target.value as TestType | '')}
              className="w-52 rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            >
              <option value="">{t('teacherReports.allTestTypes')}</option>
              {TEST_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {!error && !report && effectiveClassId && (
        <p className="text-sm text-base-black/60">{t('teacherReports.loadingReport')}</p>
      )}

      {!error && report && (
        <section className="overflow-x-auto rounded-xl border border-primary-200">
          <table className="min-w-full divide-y divide-primary-100 text-sm">
            <thead className="bg-primary-50 text-left text-xs font-semibold uppercase tracking-wide text-primary-700">
              <tr>
                <th className="px-4 py-3">
                  {t(GROUP_BY_OPTIONS.find((o) => o.value === groupBy)?.labelKey ?? '')}
                </th>
                <th className="px-4 py-3">{t('teacherReports.attemptsColumn')}</th>
                <th className="px-4 py-3">{t('teacherReports.averageScoreColumn')}</th>
                <th className="px-4 py-3">{t('teacherReports.averageTimeTakenColumn')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-100">
              {report.buckets.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-4 text-center text-base-black/60">
                    {t('teacherReports.noData')}
                  </td>
                </tr>
              )}
              {report.buckets.map((bucket) => (
                <tr key={bucket.key}>
                  <td className="px-4 py-3 font-medium text-base-black">{bucket.label}</td>
                  <td className="px-4 py-3 text-base-black/80">{bucket.attemptCount}</td>
                  <td className="px-4 py-3 text-base-black/80">
                    {bucket.averageScorePercent === null ? '—' : `${bucket.averageScorePercent}%`}
                  </td>
                  <td className="px-4 py-3 text-base-black/80">
                    {bucket.averageTimeTakenSeconds === null
                      ? '—'
                      : `${bucket.averageTimeTakenSeconds}s`}
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

export default TeacherReportsPage;
