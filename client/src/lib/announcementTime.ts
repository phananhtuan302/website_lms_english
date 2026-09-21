/**
 * How an announcement's time is shown (T-108): recent ones read as "5 phút trước", anything
 * a week or older as a plain date + time. The full date + time is always available as the
 * `title` of the `<time>` element. Kept in a plain module (not inside a component) so the
 * teacher tab and the student card show times identically, and so `Date.now()` is not read
 * during a component's render.
 */

import type { TFunction } from 'i18next';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function absolute(iso: string, language: string): string {
  return new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso));
}

export interface AnnouncementTime {
  /** Short label to show ("Vừa xong", "3 giờ trước", "12/09/2026, 08:30"). */
  label: string;
  /** Full date + time, for a tooltip. */
  full: string;
}

export function formatAnnouncementTime(iso: string, t: TFunction, language: string): AnnouncementTime {
  const full = absolute(iso, language);
  const age = Date.now() - new Date(iso).getTime();
  if (age < MINUTE_MS) return { label: t('classAnnouncements.time.justNow'), full };
  if (age < HOUR_MS) {
    return { label: t('classAnnouncements.time.minutesAgo', { count: Math.floor(age / MINUTE_MS) }), full };
  }
  if (age < DAY_MS) {
    return { label: t('classAnnouncements.time.hoursAgo', { count: Math.floor(age / HOUR_MS) }), full };
  }
  if (age < 7 * DAY_MS) {
    return { label: t('classAnnouncements.time.daysAgo', { count: Math.floor(age / DAY_MS) }), full };
  }
  return { label: full, full };
}
