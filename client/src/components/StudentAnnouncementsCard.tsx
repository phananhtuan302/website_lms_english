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
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
    >
      <div className="flex items-center justify-between">
        <h2 id={`${listId}-heading`} className="text-base font-bold text-slate-900">
          {t('classAnnouncements.student.heading')}
        </h2>
        <span className="text-xs font-semibold text-slate-400">{items.length} tin</span>
      </div>
      <ul id={listId} className="mt-3.5 flex flex-col gap-3">
        {visible.map((item) => {
          const time = formatAnnouncementTime(item.createdAt, t, i18n.language);
          return (
            <li
              key={item.id}
              className={`rounded-2xl border p-3.5 transition-shadow hover:shadow-2xs ${
                item.pinned ? 'border-amber-300/90 bg-amber-50/60' : 'border-slate-200/90 bg-slate-50/50'
              }`}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                {item.pinned && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                    <span>📌 Ghim</span>
                  </span>
                )}
                <span className="font-bold text-slate-800">{item.authorName}</span>
                <span aria-hidden="true" className="text-slate-300">·</span>
                <time dateTime={item.createdAt} title={time.full} className="italic text-slate-500">
                  {time.label}
                </time>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700">
                {item.body}
              </p>
            </li>
          );
        })}
      </ul>
      {hasMore && (
        <div className="mt-3.5 pt-2 text-center border-t border-slate-100">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            aria-controls={listId}
            className="inline-flex items-center text-xs font-bold text-primary-600 hover:underline"
          >
            {expanded
              ? t('classAnnouncements.student.showLess')
              : `Xem thêm ${items.length - PREVIEW_COUNT} thông báo`}
          </button>
        </div>
      )}
    </section>
  );
}

export default StudentAnnouncementsCard;
