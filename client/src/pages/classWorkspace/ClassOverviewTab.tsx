import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ClassOverviewDTO } from '@platform/shared';
import { useClassWorkspace } from '../../hooks/useClassWorkspace';
import { classAssignmentsPath, classTestResultsPath, formatDateTime } from '../../lib/classAssignments';
import { classTabPath } from '../../lib/classWorkspace';
import { teacherApi } from '../../lib/teacherApi';

const statCardClass = 'flex flex-col gap-1 rounded-2xl border border-primary-200 p-4 sm:p-5';
const statLabelClass = 'text-xs font-semibold uppercase tracking-wide text-base-black/60';
const statValueClass = 'break-words text-3xl font-bold text-primary-700';
const statHintClass = 'text-sm text-base-black/60';
const itemLinkClass =
  'break-words font-semibold text-primary-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500';
const actionLinkClass =
  'inline-flex min-h-10 shrink-0 items-center rounded-md border border-primary-300 bg-base-white px-3 py-1.5 text-xs font-semibold text-primary-700 transition-colors hover:bg-primary-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500';

/** One "Cần chú ý" card: a heading, a one-line explanation and its content / empty state. */
function AttentionCard({
  title,
  description,
  badge,
  children,
}: {
  title: string;
  description: string;
  badge?: number;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-2xl border border-primary-200 p-4 sm:p-5">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold text-base-black">
          {title}
          {badge !== undefined && badge > 0 && (
            <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
              {badge}
            </span>
          )}
        </h2>
        <p className="text-sm text-base-black/60">{description}</p>
      </div>
      {children}
    </section>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg bg-primary-50 px-3 py-3 text-sm text-base-black/70">{children}</p>
  );
}

/**
 * "Tổng quan" tab — index route of the class workspace. From T-107 it is a "Cần chú ý"
 * dashboard: four stat cards (students, current semester, open tests, tests waiting for a grade)
 * and four lists — closing soon, needs grading, not submitted, recent activity — each with a
 * plain-language empty state and a link into the page where the teacher acts on it. Data:
 * `GET /api/teacher/classes/:classId/overview`. The students / semester cards come straight from
 * the layout's context (`useClassWorkspace`), so they render before the request returns.
 * A class with no assignments yet gets the two "Bước tiếp theo" onboarding shortcuts as well.
 *
 * Refetched when the class or its semester changes (the header's semester switch updates
 * `cls.currentPeriodId`); data loaded for another class/semester is never shown as current.
 */
function ClassOverviewTab() {
  const { t, i18n } = useTranslation();
  const { cls } = useClassWorkspace();
  const periodId = cls.currentPeriodId;
  const viewKey = `${cls.id}:${periodId ?? ''}`;

  const [loaded, setLoaded] = useState<{ key: string; data: ClassOverviewDTO; at: number } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!periodId) return;
    let cancelled = false;
    const key = `${cls.id}:${periodId}`;
    teacherApi
      .getClassOverview(cls.id)
      .then((data) => {
        if (!cancelled) setLoaded({ key, data, at: Date.now() });
      })
      .catch(() => {
        if (!cancelled) setFailedKey(key);
      });
    return () => {
      cancelled = true;
    };
  }, [cls.id, periodId]);

  const data = loaded && loaded.key === viewKey ? loaded.data : null;
  const failed = failedKey === viewKey && !data;

  /** "còn 5 giờ" / "còn 2 ngày" — how long from when the data was loaded until `iso`. */
  function remainingText(iso: string, since: number): string {
    const hours = Math.ceil((new Date(iso).getTime() - since) / 3_600_000);
    if (hours <= 1) return t('classOverview.remaining.lessThanHour');
    if (hours < 48) return t('classOverview.remaining.hours', { count: hours });
    return t('classOverview.remaining.days', { count: Math.floor(hours / 24) });
  }

  const openValue = data ? String(data.openCount) : '—';
  const gradingCount = data ? data.needsGrading.count : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Link
          to={classTabPath(cls.id, 'students')}
          className={`${statCardClass} transition-colors hover:border-primary-400 hover:bg-primary-50`}
        >
          <span className={statLabelClass}>{t('classWorkspace.overview.studentsLabel')}</span>
          <span className={statValueClass}>{cls.studentCount}</span>
          <span className={statHintClass}>
            {cls.studentCount === 0
              ? t('classWorkspace.overview.noStudentsHint')
              : t('classWorkspace.overview.viewStudents')}
          </span>
        </Link>

        <div className={statCardClass}>
          <span className={statLabelClass}>{t('classWorkspace.overview.semesterLabel')}</span>
          {cls.currentPeriodName ? (
            <span className="break-words text-2xl font-bold text-primary-700 sm:text-3xl">
              {cls.currentPeriodName}
            </span>
          ) : (
            <span className="mt-1 inline-flex self-start rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
              {t('classWorkspace.overview.noSemester')}
            </span>
          )}
          <span className={statHintClass}>
            {cls.currentPeriodName
              ? t('classWorkspace.overview.semesterHint')
              : t('classWorkspace.overview.noSemesterHint')}
          </span>
        </div>

        <Link
          to={classAssignmentsPath(cls.id)}
          className={`${statCardClass} transition-colors hover:border-primary-400 hover:bg-primary-50`}
        >
          <span className={statLabelClass}>{t('classOverview.stats.openLabel')}</span>
          <span className={statValueClass}>{openValue}</span>
          <span className={statHintClass}>{t('classOverview.stats.openHint')}</span>
        </Link>

        <div className={`${statCardClass} ${gradingCount > 0 ? 'border-amber-300 bg-amber-50' : ''}`}>
          <span className={statLabelClass}>{t('classOverview.stats.gradingLabel')}</span>
          <span className={`${statValueClass} ${gradingCount > 0 ? 'text-amber-800' : ''}`}>
            {data ? gradingCount : '—'}
          </span>
          <span className={statHintClass}>
            {gradingCount > 0
              ? t('classOverview.stats.gradingHint')
              : t('classOverview.stats.gradingHintNone')}
          </span>
        </div>
      </div>

      {!periodId ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-lg font-bold text-amber-900">{t('classOverview.noSemester.heading')}</h2>
          <p className="mt-1 text-sm text-amber-900/80">{t('classOverview.noSemester.message')}</p>
        </div>
      ) : failed ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {t('classOverview.loadFailed')}
        </p>
      ) : !data ? (
        <p className="text-sm text-base-black/60">{t('common.loading')}</p>
      ) : (
        <>
          {data.assignmentCount === 0 && (
            <section>
              <h2 className="text-lg font-bold text-base-black">
                {t('classWorkspace.overview.nextStepsHeading')}
              </h2>
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Link
                  to={classTabPath(cls.id, 'assignments')}
                  className="flex flex-col gap-1 rounded-2xl bg-primary-500 p-5 text-base-white transition-colors hover:bg-primary-600"
                >
                  <span className="text-lg font-bold">{t('classWorkspace.overview.assignTitle')}</span>
                  <span className="text-sm text-base-white/90">
                    {t('classWorkspace.overview.assignDescription')}
                  </span>
                </Link>
                <Link
                  to={classTabPath(cls.id, 'grades')}
                  className="flex flex-col gap-1 rounded-2xl border border-primary-300 p-5 transition-colors hover:border-primary-500 hover:bg-primary-50"
                >
                  <span className="text-lg font-bold text-primary-700">
                    {t('classWorkspace.overview.gradesTitle')}
                  </span>
                  <span className="text-sm text-base-black/60">
                    {t('classWorkspace.overview.gradesDescription')}
                  </span>
                </Link>
              </div>
            </section>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <AttentionCard
              title={t('classOverview.closingSoon.heading')}
              description={t('classOverview.closingSoon.description')}
              badge={data.closingSoon.length}
            >
              {data.closingSoon.length === 0 ? (
                <EmptyState>{t('classOverview.closingSoon.empty')}</EmptyState>
              ) : (
                <ul className="flex flex-col divide-y divide-primary-100">
                  {data.closingSoon.map((item) => (
                    <li key={item.testId} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
                      <Link to={classTestResultsPath(cls.id, item.testId)} className={itemLinkClass}>
                        {item.title}
                      </Link>
                      <span className="text-sm text-base-black/70">
                        {t('classOverview.closingSoon.closesAt', {
                          time: formatDateTime(item.closeAt, i18n.language),
                          remaining: remainingText(item.closeAt, loaded?.at ?? 0),
                        })}
                      </span>
                      <span className="text-sm text-base-black/60">
                        {t('classOverview.closingSoon.submitted', {
                          submitted: item.submittedCount,
                          total: item.studentCount,
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </AttentionCard>

            <AttentionCard
              title={t('classOverview.needsGrading.heading')}
              description={t('classOverview.needsGrading.description')}
              badge={data.needsGrading.count}
            >
              {data.needsGrading.items.length === 0 ? (
                <EmptyState>{t('classOverview.needsGrading.empty')}</EmptyState>
              ) : (
                <>
                  <ul className="flex flex-col divide-y divide-primary-100">
                    {data.needsGrading.items.map((item) => (
                      <li
                        key={item.attemptId}
                        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2 first:pt-0 last:pb-0"
                      >
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="break-words font-semibold text-base-black">{item.studentName}</span>
                          <span className="break-words text-sm text-base-black/70">{item.testTitle}</span>
                          <span className="text-xs text-base-black/60">
                            {t('classOverview.needsGrading.submittedAt', {
                              time: formatDateTime(item.submittedAt, i18n.language),
                            })}
                            {' · '}
                            {t('classOverview.needsGrading.ungraded', { count: item.ungradedCount })}
                          </span>
                        </div>
                        <Link
                          to={`/teacher/attempts/${encodeURIComponent(item.attemptId)}`}
                          aria-label={t('classOverview.needsGrading.gradeAria', {
                            student: item.studentName,
                            test: item.testTitle,
                          })}
                          className={actionLinkClass}
                        >
                          {t('classOverview.needsGrading.grade')}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {data.needsGrading.count > data.needsGrading.items.length && (
                    <p className="text-sm font-semibold text-base-black/70">
                      {t('classOverview.needsGrading.more', {
                        count: data.needsGrading.count - data.needsGrading.items.length,
                      })}
                    </p>
                  )}
                </>
              )}
            </AttentionCard>

            <AttentionCard
              title={t('classOverview.notSubmitted.heading')}
              description={t('classOverview.notSubmitted.description')}
            >
              {data.notSubmitted.tests.length === 0 ? (
                <EmptyState>{t('classOverview.notSubmitted.empty')}</EmptyState>
              ) : (
                <>
                  <ul className="flex flex-col divide-y divide-primary-100">
                    {data.notSubmitted.tests.map((item) => (
                      <li key={item.testId} className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link to={classTestResultsPath(cls.id, item.testId)} className={itemLinkClass}>
                            {item.title}
                          </Link>
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              item.closed ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {item.closed
                              ? t('classOverview.notSubmitted.statusClosed')
                              : t('classOverview.notSubmitted.statusClosing')}
                          </span>
                        </div>
                        <span className="text-sm text-base-black/60">
                          {t('classOverview.notSubmitted.missing', { count: item.missingCount })}
                          {' · '}
                          {t('classOverview.notSubmitted.closeAt', {
                            time: formatDateTime(item.closeAt, i18n.language),
                          })}
                        </span>
                        <p className="break-words text-sm text-base-black/80">
                          {item.students.map((student) => student.name).join(', ')}
                          {item.moreCount > 0 && (
                            <span className="font-semibold text-base-black/60">
                              {' '}
                              {t('classOverview.notSubmitted.moreStudents', { count: item.moreCount })}
                            </span>
                          )}
                        </p>
                      </li>
                    ))}
                  </ul>
                  {data.notSubmitted.moreTestCount > 0 && (
                    <p className="text-sm font-semibold text-base-black/70">
                      {t('classOverview.notSubmitted.moreTests', { count: data.notSubmitted.moreTestCount })}{' '}
                      <Link to={classTabPath(cls.id, 'grades')} className={itemLinkClass}>
                        {t('classOverview.notSubmitted.viewGrades')}
                      </Link>
                    </p>
                  )}
                </>
              )}
            </AttentionCard>

            <AttentionCard
              title={t('classOverview.recent.heading')}
              description={t('classOverview.recent.description')}
            >
              {data.recentActivity.length === 0 ? (
                <EmptyState>{t('classOverview.recent.empty')}</EmptyState>
              ) : (
                <ul className="flex flex-col divide-y divide-primary-100">
                  {data.recentActivity.map((item) => (
                    <li
                      key={item.attemptId}
                      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0"
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <Link
                          to={`/teacher/attempts/${encodeURIComponent(item.attemptId)}`}
                          aria-label={t('classOverview.recent.viewAria', {
                            student: item.studentName,
                            test: item.testTitle,
                          })}
                          className={itemLinkClass}
                        >
                          {item.studentName}
                        </Link>
                        <span className="break-words text-sm text-base-black/70">{item.testTitle}</span>
                        <span className="text-xs text-base-black/60">
                          {formatDateTime(item.submittedAt, i18n.language)}
                        </span>
                      </div>
                      {item.scorePercent !== null ? (
                        <span className="shrink-0 rounded-full bg-primary-200 px-3 py-1 text-xs font-bold text-primary-800">
                          {item.scorePercent}%
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-base-black/5 px-3 py-1 text-xs font-semibold text-base-black/60">
                          {t('classOverview.recent.scoreHidden')}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </AttentionCard>
          </div>
        </>
      )}
    </div>
  );
}

export default ClassOverviewTab;
