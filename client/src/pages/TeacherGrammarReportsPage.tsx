import { useEffect, useState } from 'react';
import type { GrammarReportGroupBy, GrammarReportResponseDTO, GrammarTopicSummaryDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';

const GROUP_BY_OPTIONS: Array<{ value: GrammarReportGroupBy; label: string }> = [
  { value: 'topic', label: 'Topic' },
  { value: 'student', label: 'Student' },
  { value: 'week', label: 'Week (ISO, Mon–Sun)' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'semester', label: 'Academic period (semester)' },
  { value: 'year', label: 'Year' },
];

/**
 * Teacher-facing Grammar reports page (T-050): a filter selector (granularity + optional
 * topic narrowing) plus a plain table of results, reusing T-019's engine additively
 * (`computeGrammarReport` in `server/src/lib/reporting.ts`) — same "no charts required,
 * just correct numbers" spirit as `TeacherReportsPage.tsx`. "Average score" here means
 * accuracy (percent of Grammar exercise submissions answered correctly); "average time
 * taken" is always "—" since Grammar practice exercises aren't timed.
 */
function TeacherGrammarReportsPage() {
  const [groupBy, setGroupBy] = useState<GrammarReportGroupBy>('topic');
  const [topicId, setTopicId] = useState('');

  const [topics, setTopics] = useState<GrammarTopicSummaryDTO[]>([]);
  const [report, setReport] = useState<GrammarReportResponseDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    teacherApi.listGrammarTopics().then(setTopics).catch(() => setTopics([]));
  }, []);

  useEffect(() => {
    teacherApi
      .getGrammarReport({ groupBy, topicId: topicId || null })
      .then((res) => {
        setReport(res);
        setError(null);
      })
      .catch((err) => {
        setReport(null);
        setError(err instanceof ApiError ? err.message : 'Failed to load report.');
      });
  }, [groupBy, topicId]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-700">Grammar reports</h1>
        <p className="mt-1 text-sm text-base-black/60">
          Accuracy and attempt count on Grammar practice exercises, per topic or per student. Choose a
          granularity below; optionally narrow to one topic.
        </p>
      </div>

      <section className="flex flex-wrap items-end gap-4 rounded-xl border border-primary-200 p-4">
        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          Group by
          <select
            value={groupBy}
            onChange={(event) => setGroupBy(event.target.value as GrammarReportGroupBy)}
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
          Topic (optional filter)
          <select
            value={topicId}
            onChange={(event) => setTopicId(event.target.value)}
            className="w-64 rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          >
            <option value="">All topics</option>
            {topics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.title}
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
                <th className="px-4 py-3">Accuracy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-100">
              {report.buckets.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-4 text-center text-base-black/60">
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
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

export default TeacherGrammarReportsPage;
