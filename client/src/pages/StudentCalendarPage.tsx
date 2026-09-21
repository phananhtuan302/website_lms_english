import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { StudentCalendarEventDTO, StudentCalendarResponseDTO } from '@platform/shared';
import { studentApi } from '../lib/studentApi';
import { ApiError } from '../lib/apiClient';
import { closingSoonRemaining } from '../lib/closingSoon';

/**
 * Student "Lịch bài tập" (T-109, Phase 14) at `/student/calendar`, behind
 * `ProtectedRoute allowedRoles={['student']}`: an agenda (no month grid) of when each of my
 * tests opens and closes — what is coming up, grouped by day, and what happened in the last two
 * weeks, with missed deadlines marked.
 *
 * The data is `GET /api/student/calendar` (`server/src/routes/studentNotifications.routes.ts`):
 * each event already carries the server's verdict on whether it is in the past and my current
 * standing on that test, so this page only groups and labels — it makes no schedule decisions.
 */

const KIND_BADGE_CLASS: Record<StudentCalendarEventDTO['kind'], string> = {
  test: 'bg-primary-100 text-primary-800',
  unitTest: 'bg-amber-100 text-amber-800',
};

/** Local-calendar-day key (YYYY-MM-DD) of an instant. */
function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

interface DayGroup {
  key: string;
  date: Date;
  events: StudentCalendarEventDTO[];
}

/** Groups events (already sorted oldest first) by local day; `newestFirst` reverses both levels. */
function groupByDay(events: StudentCalendarEventDTO[], newestFirst: boolean): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const event of events) {
    const date = new Date(event.at);
    const key = dayKey(date);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.events.push(event);
    else groups.push({ key, date, events: [event] });
  }
  if (newestFirst) {
    groups.reverse();
    for (const group of groups) group.events.reverse();
  }
  return groups;
}

function EventRow({ event, language }: { event: StudentCalendarEventDTO; language: string }) {
  const { t } = useTranslation();
  const time = new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(event.at));

  const isClose = event.event === 'closes';
  // One standing badge per row; missed / closing-soon only make sense on the "closes" row.
  let standing: { text: string; className: string; missed?: boolean } | null = null;
  if (event.status === 'submitted') {
    standing = { text: t('studentCalendar.standing.submitted'), className: 'bg-green-100 text-green-800' };
  } else if (event.status === 'inProgress') {
    standing = { text: t('studentCalendar.standing.inProgress'), className: 'bg-sky-100 text-sky-800' };
  } else if (isClose && event.status === 'closed') {
    standing = { text: t('studentCalendar.standing.missed'), className: 'bg-red-100 text-red-800', missed: true };
  } else if (isClose && event.status === 'open' && !event.isPast && closingSoonRemaining(event.at)) {
    standing = { text: t('studentCalendar.standing.closingSoon'), className: 'bg-amber-100 text-amber-800' };
  }

  const verb = isClose
    ? event.isPast
      ? t('studentCalendar.event.closed', { time })
      : t('studentCalendar.event.closes', { time })
    : event.isPast
      ? t('studentCalendar.event.opened', { time })
      : t('studentCalendar.event.opens', { time });

  return (
    <li>
      <Link
        to={event.link}
        className={`flex min-h-14 flex-col gap-1 rounded-lg border px-4 py-3 transition-colors hover:bg-primary-50 sm:flex-row sm:items-center sm:justify-between sm:gap-3 ${
          standing?.missed ? 'border-red-200 bg-red-50/40' : 'border-primary-100 bg-base-white'
        } ${event.isPast && !standing?.missed ? 'opacity-80' : ''}`}
      >
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                isClose ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'
              }`}
            >
              {isClose ? t('studentCalendar.event.closeTag') : t('studentCalendar.event.openTag')}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${KIND_BADGE_CLASS[event.kind]}`}>
              {t(`studentHome.kind.${event.kind}`)}
            </span>
          </span>
          <span className="mt-1 block break-words text-base font-semibold text-base-black">{event.title}</span>
          <span className="block text-sm text-base-black/60">{verb}</span>
        </span>
        {standing && (
          <span className={`shrink-0 self-start rounded-full px-2.5 py-1 text-xs font-semibold sm:self-center ${standing.className}`}>
            {standing.text}
          </span>
        )}
      </Link>
    </li>
  );
}

function DayList({
  groups,
  today,
  language,
}: {
  groups: DayGroup[];
  today: Date;
  language: string;
}) {
  const { t } = useTranslation();
  const todayKey = dayKey(today);
  const dayMs = 24 * 60 * 60 * 1000;
  const tomorrowKey = dayKey(new Date(today.getTime() + dayMs));
  const yesterdayKey = dayKey(new Date(today.getTime() - dayMs));
  const dateFormat = new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-GB', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  });

  return (
    <div className="mt-3 flex flex-col gap-4">
      {groups.map((group) => {
        const prefix =
          group.key === todayKey
            ? t('studentCalendar.day.today')
            : group.key === tomorrowKey
              ? t('studentCalendar.day.tomorrow')
              : group.key === yesterdayKey
                ? t('studentCalendar.day.yesterday')
                : null;
        return (
          <div key={group.key}>
            <h3 className="text-sm font-bold text-primary-700">
              {prefix ? `${prefix} · ` : ''}
              {dateFormat.format(group.date)}
            </h3>
            <ul className="mt-2 flex flex-col gap-2">
              {group.events.map((event) => (
                <EventRow key={event.id} event={event} language={language} />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function StudentCalendarPage() {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<StudentCalendarResponseDTO | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    studentApi
      .getCalendar()
      .then((res) => {
        setData(res);
        setLoadError(null);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : t('studentCalendar.loadFailed')));
    // `t` is stable in practice (see StudentDashboardPage for the same note).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  const upcoming = data ? data.events.filter((event) => !event.isPast) : [];
  const past = data ? data.events.filter((event) => event.isPast) : [];
  const today = data ? new Date(data.now) : new Date();

  let classLine: string | null = null;
  if (data?.className) {
    classLine = data.periodName
      ? t('studentCalendar.classLine', { className: data.className, periodName: data.periodName })
      : t('studentCalendar.classOnly', { className: data.className });
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="rounded-xl border border-primary-100 bg-primary-50 px-6 py-5">
        <Link
          to="/student/dashboard"
          className="inline-flex min-h-10 items-center text-sm font-medium text-primary-600 hover:underline"
        >
          {t('studentCalendar.backToHome')}
        </Link>
        <h1 className="text-2xl font-bold text-primary-700">{t('studentCalendar.heading')}</h1>
        <p className="mt-1 text-sm text-base-black/70">{t('studentCalendar.subtitle')}</p>
        {classLine && <p className="mt-1 text-sm font-medium text-primary-700">{classLine}</p>}
      </div>

      {loadError && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <p>{loadError}</p>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="mt-1 inline-flex min-h-10 items-center font-medium underline"
          >
            {t('studentCalendar.retry')}
          </button>
        </div>
      )}
      {!data && !loadError && <p className="text-sm text-base-black/60">{t('common.loading')}</p>}

      {data && !data.className && (
        <p className="rounded-lg border border-primary-100 px-4 py-6 text-center text-sm text-base-black/70">
          {t('studentCalendar.noClassHelp')}
        </p>
      )}
      {data && data.className && !data.periodName && (
        <p className="rounded-lg border border-primary-100 px-4 py-6 text-center text-sm text-base-black/70">
          {t('studentCalendar.noPeriodHelp')}
        </p>
      )}

      {data && data.className && data.periodName && data.events.length === 0 && (
        <div className="rounded-lg border border-primary-100 px-4 py-8 text-center">
          <p className="text-base font-semibold text-base-black">{t('studentCalendar.emptyTitle')}</p>
          <p className="mt-1 text-sm text-base-black/60">{t('studentCalendar.emptyHint')}</p>
        </div>
      )}

      {data && data.events.length > 0 && (
        <>
          <section aria-labelledby="calendar-upcoming">
            <h2 id="calendar-upcoming" className="text-lg font-bold text-base-black">
              {t('studentCalendar.upcoming.heading')}
            </h2>
            <p className="mt-0.5 text-sm text-base-black/50">{t('studentCalendar.upcoming.hint')}</p>
            {upcoming.length === 0 ? (
              <p className="mt-3 rounded-lg border border-primary-100 px-4 py-4 text-sm text-base-black/60">
                {t('studentCalendar.upcoming.empty')}
              </p>
            ) : (
              <DayList groups={groupByDay(upcoming, false)} today={today} language={i18n.language} />
            )}
          </section>

          {past.length > 0 && (
            <section aria-labelledby="calendar-past">
              <h2 id="calendar-past" className="text-lg font-bold text-base-black">
                {t('studentCalendar.past.heading')}
              </h2>
              <p className="mt-0.5 text-sm text-base-black/50">{t('studentCalendar.past.hint')}</p>
              <DayList groups={groupByDay(past, true)} today={today} language={i18n.language} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default StudentCalendarPage;
