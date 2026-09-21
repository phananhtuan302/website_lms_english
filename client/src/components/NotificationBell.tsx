import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { StudentNotificationDTO, StudentNotificationType } from '@platform/shared';
import { useAuth } from '../context/useAuth';
import { studentApi } from '../lib/studentApi';
import { formatAnnouncementTime } from '../lib/announcementTime';
import { readLastSeen, writeLastSeen, type LastSeenState } from '../lib/notificationReadState';

/**
 * Notification bell in the student header (T-109): a small list of what needs the student's
 * attention — a test closing soon, a new test, published scores, a class announcement — all
 * computed by `GET /api/student/notifications` (nothing is stored). Mounted by `Header` only
 * for the student role and only in its normal (not attempt-locked) state, so it is never shown
 * during an in-progress attempt.
 *
 * "Unread" = newer than the time the bell was last opened/closed, remembered per user in
 * `localStorage` (`lib/notificationReadState.ts`). Opening the panel clears the badge; the
 * items that were new stay marked while the panel is open. Without usable storage there is no
 * badge at all.
 *
 * Accessibility: the trigger is a `<button>` with `aria-label`/`aria-expanded`; Escape closes
 * the panel and puts focus back on the button; a click outside closes it; every item is a link.
 */

/** Fresh data even if the tab stays open for hours. */
const REFRESH_MS = 5 * 60 * 1000;

const TYPE_CHIP_CLASS: Record<StudentNotificationType, string> = {
  closingSoon: 'bg-amber-100 text-amber-800',
  newAssignment: 'bg-primary-100 text-primary-800',
  scoresPublished: 'bg-green-100 text-green-800',
  newAnnouncement: 'bg-sky-100 text-sky-800',
};

function BellIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-7 w-7"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function NotificationBell() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const panelId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const userId = user?.id ?? '';

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<StudentNotificationDTO[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [seen, setSeen] = useState<LastSeenState>(() => readLastSeen(userId));
  // The "last seen" value from BEFORE the panel was opened: items newer than it are marked
  // "Mới" while the panel is open. Infinity = nothing marked (storage unavailable).
  const [newSince, setNewSince] = useState(Infinity);
  // Distance from the top of the viewport to the panel, used on narrow screens where the panel
  // spans the screen width (the bell can sit anywhere in the wrapped header there).
  const [panelTop, setPanelTop] = useState(56);

  // For event handlers (opening the panel, "Thử lại"). The effect below fetches on its own so
  // no state is set synchronously from an effect body.
  const load = useCallback(async () => {
    try {
      const res = await studentApi.getNotifications();
      setItems(res.items);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      studentApi
        .getNotifications()
        .then((res) => {
          if (cancelled) return;
          setItems(res.items);
          setFailed(false);
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });
    };
    refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    window.addEventListener('focus', refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  /** Remember "everything up to now (and up to the newest item, in case the clocks differ) was seen". */
  const markSeen = useCallback(
    (list: StudentNotificationDTO[] | null) => {
      const newest = Math.max(Date.now(), ...(list ?? []).map((item) => Date.parse(item.at)));
      setSeen({ available: writeLastSeen(userId, newest), at: newest });
    },
    [userId],
  );

  const closePanel = useCallback(
    (returnFocus: boolean) => {
      setOpen(false);
      markSeen(items);
      if (returnFocus) buttonRef.current?.focus();
    },
    [items, markSeen],
  );

  // While open: Escape closes (focus back on the button), a press outside closes.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closePanel(true);
    }
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) closePanel(false);
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [open, closePanel]);

  // While open: keep the (narrow-screen) panel glued to the bell as the page moves.
  useEffect(() => {
    if (!open) return;
    function reposition() {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (rect) setPanelTop(rect.bottom + 8);
    }
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  function toggle() {
    if (open) {
      closePanel(false);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setPanelTop(rect.bottom + 8);
    setNewSince(seen.available ? seen.at : Infinity);
    markSeen(items);
    setOpen(true);
    void load();
  }

  const unread = seen.available && !open && items ? items.filter((item) => Date.parse(item.at) > seen.at).length : 0;
  const label =
    unread > 0
      ? t('studentNotifications.bellLabelUnread', { count: unread })
      : t('studentNotifications.bellLabel');

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-md text-base-black/85 transition-colors hover:bg-primary-50 hover:text-primary-700"
      >
        <BellIcon />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute right-0 top-0 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-none text-base-white"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="region"
          aria-label={t('studentNotifications.heading')}
          style={{ '--bell-top': `${panelTop}px` } as CSSProperties}
          className="fixed inset-x-4 top-[var(--bell-top)] z-40 overflow-hidden rounded-lg border border-primary-200 bg-base-white shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96"
        >
          <div className="border-b border-primary-100 px-4 py-3">
            <h2 className="text-base font-bold text-base-black">{t('studentNotifications.heading')}</h2>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {items === null && !failed && (
              <p className="px-4 py-6 text-center text-sm text-base-black/60">{t('common.loading')}</p>
            )}
            {failed && (
              <div role="alert" className="px-4 py-4 text-sm text-red-700">
                <p>{t('studentNotifications.loadFailed')}</p>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="mt-1 inline-flex min-h-10 items-center font-medium underline"
                >
                  {t('studentNotifications.retry')}
                </button>
              </div>
            )}
            {items !== null && !failed && items.length === 0 && (
              <div className="px-4 py-6 text-center">
                <p className="text-sm font-semibold text-base-black">{t('studentNotifications.emptyTitle')}</p>
                <p className="mt-1 text-sm text-base-black/60">{t('studentNotifications.emptyHint')}</p>
              </div>
            )}
            {items !== null && items.length > 0 && (
              <ul className="divide-y divide-primary-100">
                {items.map((item) => {
                  const isNew = Date.parse(item.at) > newSince;
                  const time = formatAnnouncementTime(item.at, t, i18n.language);
                  return (
                    <li key={item.id}>
                      <Link
                        to={item.link}
                        onClick={() => closePanel(false)}
                        className="flex min-h-11 gap-3 px-4 py-3 transition-colors hover:bg-primary-50"
                      >
                        <span
                          aria-hidden="true"
                          className={`mt-2 h-2 w-2 shrink-0 rounded-full ${isNew ? 'bg-primary-500' : 'bg-transparent'}`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-base-black/60">
                            <span className={`rounded-full px-2 py-0.5 font-medium ${TYPE_CHIP_CLASS[item.type]}`}>
                              {t(`studentNotifications.type.${item.type}`)}
                            </span>
                            {isNew && <span className="sr-only">{t('studentNotifications.newBadge')}</span>}
                            <time dateTime={item.at} title={time.full}>
                              {time.label}
                            </time>
                          </span>
                          <span className="mt-1 block break-words text-sm font-semibold text-base-black">
                            {item.title}
                          </span>
                          <span className="block break-words text-sm text-base-black/70">{item.message}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-primary-100 px-4 py-2">
            <Link
              to="/student/calendar"
              onClick={() => closePanel(false)}
              className="inline-flex min-h-10 items-center text-sm font-medium text-primary-600 hover:underline"
            >
              {t('studentNotifications.viewCalendar')}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
