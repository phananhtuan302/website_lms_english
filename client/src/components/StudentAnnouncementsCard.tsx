import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClassAnnouncementDTO } from '@platform/shared';
import { formatAnnouncementTime } from '../lib/announcementTime';
import { studentApi } from '../lib/studentApi';

/** How many announcements the card shows before "Xem tất cả". */
const PREVIEW_COUNT = 3;

/**
 * "Thông báo từ giáo viên" card on the student home (T-108): the latest few announcements
 * from the student's own class (pinned first), with "Xem tất cả" to expand to the whole list
 * the server returns (at most 30). Renders NOTHING while loading, when the student has no
 * announcements, or if the request fails — the home page is never held up or cluttered by it.
 * Text is shown as plain text with line breaks kept (`whitespace-pre-wrap`), never as HTML.
 */
function StudentAnnouncementsCard() {
  const { t, i18n } = useTranslation();
  const listId = useId();
  const [items, setItems] = useState<ClassAnnouncementDTO[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    studentApi
      .listAnnouncements()
      .then((res) => {
        if (!cancelled) setItems(res.items);
      })
      .catch(() => {
        // Nothing to show is a fine outcome for this card.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (items.length === 0) return null;

  const visible = expanded ? items : items.slice(0, PREVIEW_COUNT);
  const hasMore = items.length > PREVIEW_COUNT;

  return (
    <section
      aria-labelledby={`${listId}-heading`}
      className="rounded-xl border border-primary-200 bg-base-white px-4 py-4"
    >
      <h2 id={`${listId}-heading`} className="text-lg font-bold text-base-black">
        {t('classAnnouncements.student.heading')}
      </h2>
      <ul id={listId} className="mt-3 flex flex-col gap-3">
        {visible.map((item) => {
          const time = formatAnnouncementTime(item.createdAt, t, i18n.language);
          return (
            <li
              key={item.id}
              className={`rounded-lg border px-3 py-2 ${
                item.pinned ? 'border-amber-300 bg-amber-50' : 'border-primary-100 bg-primary-50'
              }`}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-base-black/60">
                {item.pinned && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
                    {t('classAnnouncements.pinnedBadge')}
                  </span>
                )}
                <span className="font-medium text-base-black/80">{item.authorName}</span>
                <span aria-hidden="true">·</span>
                <time dateTime={item.createdAt} title={time.full}>
                  {time.label}
                </time>
                {item.edited && <span className="italic">({t('classAnnouncements.editedMark')})</span>}
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-base-black">{item.body}</p>
            </li>
          );
        })}
      </ul>
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={listId}
          className="mt-3 inline-flex min-h-10 items-center rounded-md px-1 text-sm font-medium text-primary-600 hover:underline"
        >
          {expanded
            ? t('classAnnouncements.student.showLess')
            : t('classAnnouncements.student.viewAll', { count: items.length })}
        </button>
      )}
    </section>
  );
}

export default StudentAnnouncementsCard;
