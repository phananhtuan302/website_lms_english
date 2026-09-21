/**
 * "Sắp đóng — còn X giờ" (T-109): how a home-list item that closes within 48 hours is tagged.
 * Kept in a plain module so `Date.now()` is not read during a component's render, and so the
 * 48-hour rule sits in one place (the notification bell's server side uses the same window).
 */

const HOUR_MS = 60 * 60 * 1000;
const CLOSING_SOON_MS = 48 * HOUR_MS;

export type ClosingSoonRemaining = { lessThanHour: true } | { lessThanHour: false; hours: number };

/** `null` when `closeAt` is missing, already past, or more than 48 hours away. */
export function closingSoonRemaining(closeAt: string | null): ClosingSoonRemaining | null {
  if (!closeAt) return null;
  const left = new Date(closeAt).getTime() - Date.now();
  if (!(left > 0) || left > CLOSING_SOON_MS) return null;
  if (left < HOUR_MS) return { lessThanHour: true };
  return { lessThanHour: false, hours: Math.ceil(left / HOUR_MS) };
}
