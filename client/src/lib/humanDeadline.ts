/**
 * How a deadline is said to a child (T-113): "Hạn: 5:49 chiều mai (Thứ Ba)" instead of
 * "Đóng lúc 22/09/2026, 17:49". A 12-hour clock with "sáng / trưa / chiều / tối / đêm", and
 * "hôm nay" / "mai" for the next two days, then the weekday plus the date. It reads the
 * browser's local time (the same clock the student's wall/phone shows) and never changes what
 * the server decides — it only re-words an existing `closeAt`.
 *
 * Kept in a plain module (like `closingSoon.ts` / `announcementTime.ts`) so `Date.now()` is not
 * read during a component's render, and so the home list, the summary line and the calendar
 * page all word a deadline identically.
 */

import type { TFunction } from 'i18next';

const DAY_MS = 24 * 60 * 60 * 1000;

type Period = 'night' | 'morning' | 'noon' | 'afternoon' | 'evening';

/** Vietnamese day-parts: đêm 22–3h, sáng 4–10h, trưa 11–12h, chiều 13–17h, tối 18–21h. */
function periodOfHour(hour: number): Period {
  if (hour < 4) return 'night';
  if (hour < 11) return 'morning';
  if (hour < 13) return 'noon';
  if (hour < 18) return 'afternoon';
  if (hour < 22) return 'evening';
  return 'night';
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

/**
 * "5:49 chiều mai (Thứ Ba)" — the deadline without the leading "Hạn: ". `now` is only a test
 * hook; callers leave it out.
 */
export function formatDeadlineWhen(iso: string, t: TFunction, language: string, now: number = Date.now()): string {
  const date = new Date(iso);
  const hour = date.getHours();
  const clock = `${hour % 12 === 0 ? 12 : hour % 12}:${String(date.getMinutes()).padStart(2, '0')}`;
  const time = t('deadline.time', { clock, period: t(`deadline.period.${periodOfHour(hour)}`) });

  const daysAway = Math.round((startOfDay(date) - startOfDay(new Date(now))) / DAY_MS);
  if (daysAway <= 0) return t('deadline.whenToday', { time });

  const weekday = capitalize(
    new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-GB', { weekday: 'long' }).format(date),
  );
  if (daysAway === 1) return t('deadline.whenTomorrow', { time, weekday });

  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  const dayMonth = `${date.getDate()}/${date.getMonth() + 1}`;
  return t('deadline.whenLater', { time, weekday, date: sameYear ? dayMonth : `${dayMonth}/${date.getFullYear()}` });
}

/** "Hạn: 5:49 chiều mai (Thứ Ba)". */
export function formatDeadlineLine(iso: string, t: TFunction, language: string, now: number = Date.now()): string {
  return t('deadline.line', { when: formatDeadlineWhen(iso, t, language, now) });
}
