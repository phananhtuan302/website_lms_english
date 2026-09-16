import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { GrammarReportGroupBy, GrammarReportResponseDTO, GrammarTopicSummaryDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';
import { useTeacherClasses } from '../hooks/useTeacherClasses';
import ClassFilterControl, { ClassFilterEmptyState } from '../components/ClassFilterControl';

const GROUP_BY_OPTIONS: Array<{ value: GrammarReportGroupBy; labelKey: string }> = [
  { value: 'topic', labelKey: 'teacherGrammarReports.groupByOptions.topic' },
  { value: 'student', labelKey: 'teacherGrammarReports.groupByOptions.student' },
  { value: 'week', labelKey: 'teacherGrammarReports.groupByOptions.week' },
  { value: 'month', labelKey: 'teacherGrammarReports.groupByOptions.month' },
  { value: 'quarter', labelKey: 'teacherGrammarReports.groupByOptions.quarter' },
  { value: 'semester', labelKey: 'teacherGrammarReports.groupByOptions.semester' },
  { value: 'year', labelKey: 'teacherGrammarReports.groupByOptions.year' },
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
  const { t } = useTranslation();
  const [groupBy, setGroupBy] = useState<GrammarReportGroupBy>('topic');
  const [topicId, setTopicId] = useState('');
  // T-095: the new per-class workspace hub links here with `?classId=` — see
  // `TeacherReportsPage.tsx`'s identical pattern.
  const [searchParams] = useSearchParams();
  const initialClassId = searchParams.get('classId') ?? '';
  // T-077: required class dimension — see `TeacherReportsPage.tsx`'s identical pattern.
  const { classes, classId } = useTeacherClasses(true, initialClassId);
  const [selectedClassId, setSelectedClassId] = useState('');
  const effectiveClassId = selectedClassId || classId;

  const [topics, setTopics] = useState<GrammarTopicSummaryDTO[]>([]);
  const [report, setReport] = useState<GrammarReportResponseDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    teacherApi.listGrammarTopics().then(setTopics).catch(() => setTopics([]));
  }, []);

  useEffect(() => {
    // No synchronous `setReport(null)` here — see `useTeacherClasses.ts`'s doc comment on
    // the `react-hooks/set-state-in-effect` lint rule; `report` already starts `null`.
    if (!effectiveClassId) return;
    teacherApi
      .getGrammarReport({ groupBy, topicId: topicId || null, classId: effectiveClassId })
      .then((res) => {
        setReport(res);
        setError(null);
      })
      .catch((err) => {
        setReport(null);
        setError(err instanceof ApiError ? err.message : t('teacherGrammarReports.loadFailed'));
      });
  }, [groupBy, topicId, t, effectiveClassId]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-700">{t('teacherGrammarReports.heading')}</h1>
        <p className="mt-1 text-sm text-base-black/60">{t('teacherGrammarReports.subtitle')}</p>
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
        <ClassFilterControl classes={classes} classId={selectedClassId} onChange={setSelectedClassId} />
        <ClassFilterEmptyState classes={classes} />
        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          {t('teacherGrammarReports.groupByLabel')}
          <select
            value={groupBy}
            onChange={(event) => setGroupBy(event.target.value as GrammarReportGroupBy)}
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
          {t('teacherGrammarReports.topicFilterLabel')}
          <select
            value={topicId}
            onChange={(event) => setTopicId(event.target.value)}
            className="w-64 rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          >
            <option value="">{t('teacherGrammarReports.allTopics')}</option>
            {topics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.title}
              </option>
            ))}
          </select>
        </label>
      </section>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {!error && !report && effectiveClassId && (
        <p className="text-sm text-base-black/60">{t('teacherGrammarReports.loadingReport')}</p>
      )}

      {!error && report && (
        <section className="overflow-x-auto rounded-xl border border-primary-200">
          <table className="min-w-full divide-y divide-primary-100 text-sm">
            <thead className="bg-primary-50 text-left text-xs font-semibold uppercase tracking-wide text-primary-700">
              <tr>
                <th className="px-4 py-3">{t(GROUP_BY_OPTIONS.find((o) => o.value === groupBy)?.labelKey ?? '')}</th>
                <th className="px-4 py-3">{t('teacherGrammarReports.attempts')}</th>
                <th className="px-4 py-3">{t('teacherGrammarReports.accuracy')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-100">
              {report.buckets.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-4 text-center text-base-black/60">
                    {t('teacherGrammarReports.noData')}
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
