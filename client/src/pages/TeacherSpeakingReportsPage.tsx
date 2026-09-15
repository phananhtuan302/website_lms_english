import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  SpeakingReportGroupBy,
  SpeakingReportResponseDTO,
  TestSummaryDTO,
  UnitDTO,
} from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';

const GROUP_BY_OPTIONS: Array<{ value: SpeakingReportGroupBy; labelKey: string }> = [
  { value: 'test', labelKey: 'teacherSpeakingReports.groupByOptions.test' },
  { value: 'unit', labelKey: 'teacherSpeakingReports.groupByOptions.unit' },
  { value: 'week', labelKey: 'teacherSpeakingReports.groupByOptions.week' },
  { value: 'month', labelKey: 'teacherSpeakingReports.groupByOptions.month' },
  { value: 'quarter', labelKey: 'teacherSpeakingReports.groupByOptions.quarter' },
  { value: 'semester', labelKey: 'teacherSpeakingReports.groupByOptions.semester' },
  { value: 'year', labelKey: 'teacherSpeakingReports.groupByOptions.year' },
];

/**
 * Teacher-facing Speaking reports view (T-057): same "filter selector + plain table"
 * shape as `TeacherReportsPage`/`TeacherGrammarReportsPage`, built on the new
 * `computeSpeakingReport` engine (`server/src/lib/reporting.ts`) added alongside
 * `computeReport`/`computeGrammarReport` for this task rather than a one-off query here.
 * "Average score" means the average effective Speaking score per graded answer (teacher
 * override when present, else the AI/mock grade); "average time taken" is always "—"
 * since a Speaking answer's response window is per-question, not a whole-attempt
 * duration (see the engine's doc comment for the full reasoning).
 */
function TeacherSpeakingReportsPage() {
  const { t } = useTranslation();
  const [groupBy, setGroupBy] = useState<SpeakingReportGroupBy>('month');
  const [testId, setTestId] = useState('');
  const [unitId, setUnitId] = useState('');

  const [tests, setTests] = useState<TestSummaryDTO[]>([]);
  const [units, setUnits] = useState<UnitDTO[]>([]);
  const [report, setReport] = useState<SpeakingReportResponseDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    teacherApi.listTests().then(setTests).catch(() => setTests([]));
    teacherApi.listUnits().then(setUnits).catch(() => setUnits([]));
  }, []);

  useEffect(() => {
    teacherApi
      .getSpeakingReport({ groupBy, testId: testId || null, unitId: unitId || null })
      .then((res) => {
        setReport(res);
        setError(null);
      })
      .catch((err) => {
        setReport(null);
        setError(err instanceof ApiError ? err.message : t('teacherSpeakingReports.loadFailed'));
      });
    // `t` is stable in practice (site-wide, admin-controlled language — PROJECT_PLAN
    // Guiding Principle 3/Assumption A13), safe to omit from this dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupBy, testId, unitId]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-700">{t('teacherSpeakingReports.heading')}</h1>
        <p className="mt-1 text-sm text-base-black/60">{t('teacherSpeakingReports.description')}</p>
      </div>

      <section className="flex flex-wrap items-end gap-4 rounded-xl border border-primary-200 p-4">
        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          {t('teacherSpeakingReports.groupByLabel')}
          <select
            value={groupBy}
            onChange={(event) => setGroupBy(event.target.value as SpeakingReportGroupBy)}
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
          {t('teacherSpeakingReports.testFilterLabel')}
          <select
            value={testId}
            onChange={(event) => setTestId(event.target.value)}
            className="w-64 rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          >
            <option value="">{t('teacherSpeakingReports.allTests')}</option>
            {tests.map((test) => (
              <option key={test.id} value={test.id}>
                {test.title}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          {t('teacherSpeakingReports.unitFilterLabel')}
          <select
            value={unitId}
            onChange={(event) => setUnitId(event.target.value)}
            className="w-64 rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          >
            <option value="">{t('teacherSpeakingReports.allUnits')}</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {!error && !report && (
        <p className="text-sm text-base-black/60">{t('teacherSpeakingReports.loadingReport')}</p>
      )}

      {!error && report && (
        <section className="overflow-x-auto rounded-xl border border-primary-200">
          <table className="min-w-full divide-y divide-primary-100 text-sm">
            <thead className="bg-primary-50 text-left text-xs font-semibold uppercase tracking-wide text-primary-700">
              <tr>
                <th className="px-4 py-3">
                  {t(GROUP_BY_OPTIONS.find((o) => o.value === groupBy)?.labelKey ?? '')}
                </th>
                <th className="px-4 py-3">{t('teacherSpeakingReports.gradedAnswersColumn')}</th>
                <th className="px-4 py-3">{t('teacherSpeakingReports.averageScoreColumn')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-100">
              {report.buckets.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-4 text-center text-base-black/60">
                    {t('teacherSpeakingReports.noData')}
                  </td>
                </tr>
              )}
              {report.buckets.map((bucket) => (
                <tr key={bucket.key}>
                  <td className="px-4 py-3 font-medium text-base-black">{bucket.label}</td>
                  <td className="px-4 py-3 text-base-black/80">{bucket.attemptCount}</td>
                  <td className="px-4 py-3 text-base-black/80">
                    {bucket.averageScorePercent === null ? '—' : bucket.averageScorePercent}
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

export default TeacherSpeakingReportsPage;
