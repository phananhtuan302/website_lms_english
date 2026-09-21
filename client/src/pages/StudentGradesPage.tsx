import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { StudentGradeStatus, StudentGradeTestDTO, StudentGradesResponseDTO } from '@platform/shared';
import { studentApi } from '../lib/studentApi';
import { ApiError } from '../lib/apiClient';
import { withClassPrefix } from '../lib/classLabel';
import { formatScore10 } from '../lib/scoreFormat';

/**
 * Student "Điểm của tôi" (T-110, Phase 14) at `/student/grades`, behind
 * `ProtectedRoute allowedRoles={['student']}`: my grades for one semester of my class — one row
 * per test with its status first (T-113: that is what a student came to see), then an average
 * card and a small learning-progress strip.
 *
 * Everything is decided on the server (`GET /api/student/grades`,
 * `server/src/routes/studentGrades.routes.ts`): a score only exists on a row whose status is
 * `graded` (the teacher has published scores for my class), so this page has nothing to hide
 * — for any other status there is simply no score in the data to render.
 */

const STATUS_BADGE_CLASS: Record<StudentGradeStatus, string> = {
  notStarted: 'bg-base-black/5 text-base-black/60',
  inProgress: 'bg-sky-100 text-sky-800',
  awaitingPublish: 'bg-amber-100 text-amber-800',
  graded: 'bg-green-100 text-green-800',
};

function formatTime(iso: string, language: string): string {
  return new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso));
}

function scoreClass(percent: number): string {
  if (percent >= 80) return 'text-green-700';
  if (percent >= 50) return 'text-amber-700';
  return 'text-red-700';
}

function TestRow({ test }: { test: StudentGradeTestDTO }) {
  const { t, i18n } = useTranslation();

  let meta: string | null = null;
  if (test.status === 'graded') {
    meta =
      test.attemptCount > 1
        ? t('studentGrades.meta.bestOf', { count: test.attemptCount, time: formatTime(test.submittedAt, i18n.language) })
        : t('studentGrades.meta.submittedAt', { time: formatTime(test.submittedAt, i18n.language) });
  } else if (test.status === 'awaitingPublish') {
    meta = test.submittedAt ? t('studentGrades.meta.submittedAt', { time: formatTime(test.submittedAt, i18n.language) }) : null;
  } else if (test.status === 'inProgress') {
    meta = t('studentGrades.meta.inProgress');
  } else if (test.closeAt && new Date(test.closeAt) < new Date()) {
    meta = t('studentGrades.meta.closedNotDone');
  } else if (test.openAt && new Date(test.openAt) > new Date()) {
    meta = t('studentGrades.meta.opensAt', { time: formatTime(test.openAt, i18n.language) });
  } else if (test.closeAt) {
    meta = t('studentGrades.meta.closesAt', { time: formatTime(test.closeAt, i18n.language) });
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-primary-100 bg-base-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              test.kind === 'unitTest' ? 'bg-amber-100 text-amber-800' : 'bg-primary-100 text-primary-800'
            }`}
          >
            {t(`studentGrades.kind.${test.kind}`)}
          </span>
        </div>
        <p className="mt-1 break-words text-base font-semibold text-base-black">{test.title}</p>
        {meta && <p className="mt-0.5 text-sm text-base-black/60">{meta}</p>}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3 sm:justify-end">
        {test.status === 'graded' && (
          <div className="text-right">
            <p className={`text-xl font-bold ${scoreClass(test.scorePercent)}`}>
              {formatScore10(test.scorePercent)}
              <span className="text-sm font-semibold text-base-black/60">/10</span>
            </p>
            {test.provisional && (
              <p className="mt-0.5 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                {t('scoring.provisional.studentChip')}
              </p>
            )}
            <p className="text-xs text-base-black/50">
              {t('studentGrades.correctOf', { correct: test.correctCount, total: test.totalCount })}
            </p>
          </div>
        )}
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_BADGE_CLASS[test.status]}`}>
          {t(`studentGrades.status.${test.status}`)}
        </span>
        {test.status === 'graded' && test.attemptId && (
          <Link
            to={`/student/attempts/${test.attemptId}/result`}
            className="inline-flex items-center justify-center rounded-md border border-primary-300 bg-base-white px-4 py-2.5 sm:py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-50"
          >
            {t('studentGrades.viewResult')}
          </Link>
        )}
      </div>
    </li>
  );
}

function StudentGradesPage() {
  const { t } = useTranslation();
  // `undefined` = "whatever the server defaults to" (the class's current semester).
  const [requestedPeriodId, setRequestedPeriodId] = useState<string | undefined>(undefined);
  const [data, setData] = useState<StudentGradesResponseDTO | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Bumped by the "Thử lại" button to re-run the fetch effect.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    studentApi
      .getGrades(requestedPeriodId)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setLoadError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : t('studentGrades.loadFailed'));
      });
    return () => {
      cancelled = true;
    };
    // `t` is stable in practice (see StudentDashboardPage).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedPeriodId, reloadKey]);

  // True while switching semester (the previous semester's data stays on screen, dimmed).
  const switching = data !== null && requestedPeriodId !== undefined && data.periodId !== requestedPeriodId && !loadError;

  const gradedCount = data?.tests.filter((test) => test.status === 'graded').length ?? 0;
  const showingOldPeriod = data !== null && data.periodId !== null && data.periodId !== data.currentPeriodId;

  let classLine: string | null = null;
  if (data?.className) {
    const className = withClassPrefix(data.className);
    classLine = data.periodName
      ? t('studentGrades.classLine', { className, periodName: data.periodName })
      : t('studentGrades.classOnly', { className });
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="rounded-xl border border-primary-100 bg-primary-50 px-6 py-5">
        <h1 className="text-2xl font-bold text-primary-700">{t('studentGrades.heading')}</h1>
        <p className="mt-1 text-sm text-base-black/70">{t('studentGrades.subtitle')}</p>
        {classLine && <p className="mt-1 text-sm font-medium text-primary-700">{classLine}</p>}
      </div>

      {loadError && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <p>{loadError}</p>
          <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="mt-1 font-medium underline">
            {t('studentGrades.retry')}
          </button>
        </div>
      )}
      {!data && !loadError && <p className="text-sm text-base-black/60">{t('common.loading')}</p>}

      {data && !data.classId && (
        <p className="rounded-lg border border-primary-100 px-4 py-6 text-center text-sm text-base-black/70">
          {t('studentGrades.noClassHelp')}
        </p>
      )}

      {data && data.classId && (
        <>
          {/* T-113: a lone semester needs no chooser — unless there is no current semester, where
              choosing the one old semester is the only way to see anything. */}
          {(data.periods.length > 1 || (data.periods.length > 0 && data.periodId === null)) && (
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="grades-period" className="text-sm font-medium text-base-black">
                {t('studentGrades.periodLabel')}
              </label>
              <select
                id="grades-period"
                value={requestedPeriodId ?? data.periodId ?? ''}
                onChange={(e) => setRequestedPeriodId(e.target.value)}
                className="min-w-0 max-w-full rounded-md border border-primary-300 bg-base-white px-3 py-2 text-sm text-base-black"
              >
                {data.periodId === null && (
                  <option value="" disabled>
                    {t('studentGrades.periodPlaceholder')}
                  </option>
                )}
                {data.periods.map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.isCurrent ? t('studentGrades.periodCurrent', { name: period.name }) : period.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {data.periodId === null && (
            <p className="rounded-lg border border-primary-100 px-4 py-6 text-center text-sm text-base-black/70">
              {t('studentGrades.noPeriodHelp')}
            </p>
          )}

          {data.periodId !== null && (
            <div className={`flex flex-col gap-6 ${switching ? 'opacity-60' : ''}`} aria-busy={switching}>
              <section aria-labelledby="grades-tests">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id="grades-tests" className="text-lg font-bold text-base-black">
                    {t('studentGrades.tests.heading')}
                  </h2>
                  <Link to="/student/dashboard" className="text-sm font-medium text-primary-600 hover:underline">
                    {t('studentGrades.tests.goAssignments')}
                  </Link>
                </div>

                {data.tests.length === 0 ? (
                  <div className="mt-3 rounded-lg border border-primary-100 px-4 py-8 text-center">
                    <p className="text-base font-semibold text-base-black">{t('studentGrades.tests.emptyTitle')}</p>
                    <p className="mt-1 text-sm text-base-black/60">{t('studentGrades.tests.emptyHint')}</p>
                  </div>
                ) : (
                  <ul className="mt-3 flex flex-col gap-2">
                    {data.tests.map((test) => (
                      <TestRow key={test.testId} test={test} />
                    ))}
                  </ul>
                )}

                <p className="mt-3 text-xs text-base-black/50">{t('studentGrades.footnote')}</p>
                {showingOldPeriod && gradedCount > 0 && (
                  <p className="mt-1 text-xs text-base-black/50">{t('studentGrades.oldPeriodNote')}</p>
                )}
              </section>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-primary-200 bg-base-white px-4 py-3 sm:col-span-1">
                  <p className="text-sm font-medium text-base-black/60">{t('studentGrades.average.title')}</p>
                  {data.averageScorePercent !== null ? (
                    <>
                      <p className={`mt-1 text-3xl font-bold ${scoreClass(data.averageScorePercent)}`}>
                        {formatScore10(data.averageScorePercent)}
                        <span className="text-lg font-semibold text-base-black/60">/10</span>
                      </p>
                      {data.tests.some((test) => test.status === 'graded' && test.provisional) && (
                        <p className="mt-0.5 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                          {t('scoring.provisional.studentChip')}
                        </p>
                      )}
                      <p className="mt-0.5 text-xs text-base-black/50">
                        {t('studentGrades.average.basis', { count: gradedCount })}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-base-black/60">{t('studentGrades.average.none')}</p>
                  )}
                </div>

                {data.progress && (
                  <>
                    <div className="rounded-lg border border-primary-200 bg-base-white px-4 py-3">
                      <p className="text-sm font-medium text-base-black/60">{t('studentGrades.progress.vocabulary')}</p>
                      {data.progress.vocabulary.cardCount > 0 ? (
                        <>
                          <p className="mt-1 text-lg font-bold text-base-black">
                            {t('studentGrades.progress.vocabularyValue', {
                              known: data.progress.vocabulary.knownCount,
                              total: data.progress.vocabulary.cardCount,
                            })}
                          </p>
                          <p className="mt-0.5 text-xs text-base-black/50">
                            {t('studentGrades.progress.vocabularyLearning', {
                              count: data.progress.vocabulary.learningCount,
                            })}
                          </p>
                        </>
                      ) : (
                        <p className="mt-1 text-sm text-base-black/60">{t('studentGrades.progress.vocabularyNone')}</p>
                      )}
                    </div>
                    <div className="rounded-lg border border-primary-200 bg-base-white px-4 py-3">
                      <p className="text-sm font-medium text-base-black/60">{t('studentGrades.progress.grammar')}</p>
                      {data.progress.grammar.attempted > 0 ? (
                        <p className="mt-1 text-lg font-bold text-base-black">
                          {t('studentGrades.progress.grammarValue', {
                            correct: data.progress.grammar.correct,
                            attempted: data.progress.grammar.attempted,
                          })}
                        </p>
                      ) : (
                        <p className="mt-1 text-sm text-base-black/60">{t('studentGrades.progress.grammarNone')}</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default StudentGradesPage;
