import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { VocabPeriodLeaderboardResponseDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';

const MONTH_KEYS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/**
 * Teacher-only vocabulary monthly (T-032) / yearly (T-033) ranking report: a period
 * selector (mode + year, plus month when mode is "month") and a ranked table for
 * exactly that period — never all-time. Uses the same `Asia/Ho_Chi_Minh` fixed-offset
 * month/year boundaries as T-019's reporting engine (`server/src/lib/reporting.ts`'s
 * `hcmMonthRange`/`hcmYearRange`), surfaced here via `periodStart`/`periodEnd` for
 * transparency about exactly which window was queried.
 */
function TeacherVocabRankingPage() {
  const { t } = useTranslation();
  const now = new Date();
  const [mode, setMode] = useState<'month' | 'year'>('month');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<VocabPeriodLeaderboardResponseDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const request =
      mode === 'month' ? teacherApi.getMonthlyVocabRanking(year, month) : teacherApi.getYearlyVocabRanking(year);
    request
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => {
        setData(null);
        setError(err instanceof ApiError ? err.message : t('teacherVocabRanking.loadError'));
      });
  }, [mode, year, month, t]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-700">{t('teacherVocabRanking.heading')}</h1>
        <p className="mt-1 text-sm text-base-black/60">
          {t('teacherVocabRanking.descriptionBeforeCode')}
          <code>server/src/lib/vocabLeaderboard.ts</code>
          {t('teacherVocabRanking.descriptionAfterCode')}
        </p>
      </div>

      <section className="flex flex-wrap items-end gap-4 rounded-xl border border-primary-200 p-4">
        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          {t('teacherVocabRanking.periodLabel')}
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value as 'month' | 'year')}
            className="w-40 rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          >
            <option value="month">{t('teacherVocabRanking.monthWord')}</option>
            <option value="year">{t('teacherVocabRanking.yearWord')}</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          {t('teacherVocabRanking.yearWord')}
          <input
            type="number"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            className="w-28 rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
        </label>

        {mode === 'month' && (
          <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
            {t('teacherVocabRanking.monthWord')}
            <select
              value={month}
              onChange={(event) => setMonth(Number(event.target.value))}
              className="w-44 rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            >
              {MONTH_KEYS.map((key, index) => (
                <option key={key} value={index + 1}>
                  {t(`teacherVocabRanking.months.${key}`)}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {!error && !data && <p className="text-sm text-base-black/60">{t('common.loading')}</p>}

      {data && (
        <>
          <p className="text-xs text-base-black/50">
            {t('teacherVocabRanking.periodWindow', {
              start: new Date(data.periodStart).toLocaleString(),
              end: new Date(data.periodEnd).toLocaleString(),
            })}
          </p>
          <section className="overflow-x-auto rounded-xl border border-primary-200">
            <table className="min-w-full divide-y divide-primary-100 text-sm">
              <thead className="bg-primary-50 text-left text-xs font-semibold uppercase tracking-wide text-primary-700">
                <tr>
                  <th className="px-4 py-3">{t('teacherVocabRanking.colRank')}</th>
                  <th className="px-4 py-3">{t('teacherVocabRanking.colStudent')}</th>
                  <th className="px-4 py-3">{t('teacherVocabRanking.colAttemptsInPeriod')}</th>
                  <th className="px-4 py-3">{t('teacherVocabRanking.colAccuracy')}</th>
                  <th className="px-4 py-3">{t('teacherVocabRanking.colScore')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-100">
                {data.entries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-4 text-center text-base-black/60">
                      {t('teacherVocabRanking.emptyState')}
                    </td>
                  </tr>
                )}
                {data.entries.map((entry) => (
                  <tr key={entry.studentId}>
                    <td className="px-4 py-3 text-base-black">#{entry.rank}</td>
                    <td className="px-4 py-3 text-base-black">{entry.studentName}</td>
                    <td className="px-4 py-3 text-base-black/80">
                      {entry.correctAttempts}/{entry.totalAttempts}
                    </td>
                    <td className="px-4 py-3 text-base-black/80">
                      {entry.accuracyPercent === null ? '—' : `${entry.accuracyPercent}%`}
                    </td>
                    <td className="px-4 py-3 font-semibold text-primary-700">{entry.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

export default TeacherVocabRankingPage;
