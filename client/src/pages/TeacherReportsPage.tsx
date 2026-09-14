import { useEffect, useState } from 'react';
import type { ReportGroupBy, ReportResponseDTO, TestSummaryDTO, UnitDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';

const GROUP_BY_OPTIONS: Array<{ value: ReportGroupBy; label: string }> = [
  { value: 'test', label: 'Test' },
  { value: 'unit', label: 'Unit' },
  { value: 'week', label: 'Week (ISO, Mon–Sun)' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'semester', label: 'Academic period (semester)' },
  { value: 'year', label: 'Year' },
];

/**
 * Minimal teacher-facing reports page (T-019): a filter selector (granularity + optional
 * test/unit narrowing) plus a plain table of results. Deliberately no charts — per the
 * task's acceptance criteria "doesn't need to be fancy... charts are NOT required, just
 * correct numbers" — every row is a bucket from the shared reporting engine
 * (`server/src/lib/reporting.ts`), one row per test/unit/week/month/quarter/semester/year
 * actually present in the (optionally narrowed) data — see PROJECT_PLAN.md Assumption
 * A11 for why `groupBy` returns a breakdown table rather than one single number.
 */
function TeacherReportsPage() {
  const [groupBy, setGroupBy] = useState<ReportGroupBy>('month');
  const [testId, setTestId] = useState('');
  const [unitId, setUnitId] = useState('');

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
    teacherApi
      .getReport({ groupBy, testId: testId || null, unitId: unitId || null })
      .then((res) => {
        setReport(res);
        setError(null);
      })
      .catch((err) => {
        setReport(null);
        setError(err instanceof ApiError ? err.message : 'Failed to load report.');
      });
  }, [groupBy, testId, unitId]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-700">Reports</h1>
        <p className="mt-1 text-sm text-base-black/60">
          Average score, average time taken, and attempt count across your tests, counting only
          submitted attempts. Choose a granularity below; optionally narrow to one test and/or one
          unit.
        </p>
      </div>

      <section className="flex flex-wrap items-end gap-4 rounded-xl border border-primary-200 p-4">
        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          Group by
          <select
            value={groupBy}
            onChange={(event) => setGroupBy(event.target.value as ReportGroupBy)}
            className="w-64 rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          >
            {GROUP_BY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          Test (optional filter)
          <select
            value={testId}
            onChange={(event) => setTestId(event.target.value)}
            className="w-64 rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          >
            <option value="">All tests</option>
            {tests.map((test) => (
              <option key={test.id} value={test.id}>
                {test.title}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          Unit (optional filter)
          <select
            value={unitId}
            onChange={(event) => setUnitId(event.target.value)}
            className="w-64 rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          >
            <option value="">All units</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {!error && !report && <p className="text-sm text-base-black/60">Loading report...</p>}

      {!error && report && (
        <section className="overflow-x-auto rounded-xl border border-primary-200">
          <table className="min-w-full divide-y divide-primary-100 text-sm">
            <thead className="bg-primary-50 text-left text-xs font-semibold uppercase tracking-wide text-primary-700">
              <tr>
                <th className="px-4 py-3">{GROUP_BY_OPTIONS.find((o) => o.value === groupBy)?.label}</th>
                <th className="px-4 py-3">Attempts</th>
                <th className="px-4 py-3">Average score</th>
                <th className="px-4 py-3">Average time taken</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-100">
              {report.buckets.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-4 text-center text-base-black/60">
                    No data for this selection yet.
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
