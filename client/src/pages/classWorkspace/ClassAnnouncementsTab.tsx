import { useEffect, useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CLASS_ANNOUNCEMENT_MAX_LENGTH, type ClassAnnouncementDTO } from '@platform/shared';
import { useClassWorkspace } from '../../hooks/useClassWorkspace';
import { ApiError } from '../../lib/apiClient';
import { formatAnnouncementTime } from '../../lib/announcementTime';
import { teacherApi } from '../../lib/teacherApi';

/** Same order the server returns: pinned first, then newest first. */
function sortAnnouncements(items: ClassAnnouncementDTO[]): ClassAnnouncementDTO[] {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

const secondaryButton =
  'inline-flex min-h-10 items-center justify-center rounded-md border border-primary-300 bg-base-white px-3 py-1.5 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-60';
const primaryButton =
  'inline-flex min-h-10 items-center justify-center rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60';
const textareaClass =
  'w-full rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200';

interface ItemProps {
  item: ClassAnnouncementDTO;
  classId: string;
  onChanged: (updated: ClassAnnouncementDTO) => void;
  onDeleted: (id: string) => void;
}

/** One announcement in the list: the text (plain, line breaks kept) plus pin / edit / delete. */
function AnnouncementItem({ item, classId, onChanged, onDeleted }: ItemProps) {
  const { t, i18n } = useTranslation();
  const editId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const time = formatAnnouncementTime(item.createdAt, t, i18n.language);

  const draftTooLong = draft.trim().length > CLASS_ANNOUNCEMENT_MAX_LENGTH;
  const draftEmpty = draft.trim() === '';

  async function run(action: () => Promise<void>, failedKey: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : t(failedKey));
    } finally {
      setBusy(false);
    }
  }

  function togglePin() {
    return run(async () => {
      onChanged(await teacherApi.updateClassAnnouncement(classId, item.id, { pinned: !item.pinned }));
    }, 'classAnnouncements.pinFailed');
  }

  function saveEdit() {
    return run(async () => {
      onChanged(await teacherApi.updateClassAnnouncement(classId, item.id, { body: draft }));
      setEditing(false);
    }, 'classAnnouncements.saveFailed');
  }

  async function remove() {
    if (!window.confirm(t('classAnnouncements.confirmDelete'))) return;
    await run(async () => {
      await teacherApi.deleteClassAnnouncement(classId, item.id);
      onDeleted(item.id);
    }, 'classAnnouncements.deleteFailed');
  }

  return (
    <li
      className={`rounded-xl border px-4 py-3 ${
        item.pinned ? 'border-amber-300 bg-amber-50' : 'border-primary-100 bg-base-white'
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-base-black/60">
        {item.pinned && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
            {t('classAnnouncements.pinnedBadge')}
          </span>
        )}
        <span className="font-medium text-base-black/80">{item.authorName}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={item.createdAt} title={time.full}>
          {time.label}
        </time>
        {item.edited && <span className="text-xs italic">({t('classAnnouncements.editedMark')})</span>}
      </div>

      {editing ? (
        <div className="mt-2 flex flex-col gap-2">
          <label htmlFor={editId} className="sr-only">
            {t('classAnnouncements.editLabel')}
          </label>
          <textarea
            id={editId}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={4}
            className={textareaClass}
            data-autofocus
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={`text-xs ${draftTooLong ? 'font-semibold text-red-600' : 'text-base-black/50'}`}>
              {t('classAnnouncements.charCount', {
                count: draft.trim().length,
                max: CLASS_ANNOUNCEMENT_MAX_LENGTH,
              })}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setDraft(item.body);
                  setError(null);
                }}
                disabled={busy}
                className={secondaryButton}
              >
                {t('classAnnouncements.cancel')}
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={busy || draftEmpty || draftTooLong}
                className={primaryButton}
              >
                {busy ? t('classAnnouncements.saving') : t('classAnnouncements.save')}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-2 whitespace-pre-wrap break-words text-base text-base-black">{item.body}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={togglePin} disabled={busy} className={secondaryButton}>
              {item.pinned ? t('classAnnouncements.unpin') : t('classAnnouncements.pin')}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(item.body);
                setEditing(true);
              }}
              disabled={busy}
              className={secondaryButton}
            >
              {t('classAnnouncements.edit')}
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-red-200 bg-base-white px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t('classAnnouncements.delete')}
            </button>
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </li>
  );
}

/**
 * "Thông báo" tab (T-108): the teacher writes a notice for the whole class and manages the
 * ones already posted (pin to the top, edit, delete). Announcements belong to the class, not
 * to a semester. The text is plain text — rendered with `whitespace-pre-wrap` so line breaks
 * survive, never as HTML.
 *
 * The layout remounts every tab when the class changes (`<Outlet key={cls.id}>`), so the
 * list and the composer never carry over from one class to another.
 */
function ClassAnnouncementsTab() {
  const { t } = useTranslation();
  const { cls } = useClassWorkspace();
  const composerId = useId();

  const [items, setItems] = useState<ClassAnnouncementDTO[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [text, setText] = useState('');
  const [pinOnPost, setPinOnPost] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    teacherApi
      .listClassAnnouncements(cls.id)
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [cls.id]);

  const trimmedLength = text.trim().length;
  const tooLong = trimmedLength > CLASS_ANNOUNCEMENT_MAX_LENGTH;

  async function handlePost(event: FormEvent) {
    event.preventDefault();
    if (trimmedLength === 0) {
      setPostError(t('classAnnouncements.bodyRequired'));
      return;
    }
    if (tooLong) {
      setPostError(t('classAnnouncements.bodyTooLong', { max: CLASS_ANNOUNCEMENT_MAX_LENGTH }));
      return;
    }
    setPosting(true);
    setPostError(null);
    try {
      const created = await teacherApi.createClassAnnouncement(cls.id, { body: text, pinned: pinOnPost });
      setItems((current) => sortAnnouncements([created, ...(current ?? [])]));
      setText('');
      setPinOnPost(false);
    } catch (err) {
      setPostError(err instanceof ApiError && err.status < 500 ? err.message : t('classAnnouncements.postFailed'));
    } finally {
      setPosting(false);
    }
  }

  function replaceItem(updated: ClassAnnouncementDTO) {
    setItems((current) => sortAnnouncements((current ?? []).map((i) => (i.id === updated.id ? updated : i))));
  }

  function removeItem(id: string) {
    setItems((current) => (current ?? []).filter((i) => i.id !== id));
  }

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-bold text-primary-700">{t('classAnnouncements.heading')}</h2>
        <p className="mt-1 text-sm text-base-black/60">{t('classAnnouncements.intro')}</p>
      </div>

      <form onSubmit={handlePost} className="flex flex-col gap-2 rounded-xl border border-primary-200 bg-primary-50 p-4">
        <label htmlFor={composerId} className="text-sm font-medium text-base-black">
          {t('classAnnouncements.composerLabel')}
        </label>
        <textarea
          id={composerId}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setPostError(null);
          }}
          rows={4}
          placeholder={t('classAnnouncements.composerPlaceholder')}
          className={textareaClass}
        />
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <label className="inline-flex min-h-10 items-center gap-2 text-sm text-base-black">
            <input
              type="checkbox"
              checked={pinOnPost}
              onChange={(event) => setPinOnPost(event.target.checked)}
              className="h-4 w-4 rounded border-primary-300 text-primary-600 focus:ring-primary-300"
            />
            {t('classAnnouncements.pinOnPost')}
          </label>
          <span className={`text-xs ${tooLong ? 'font-semibold text-red-600' : 'text-base-black/50'}`}>
            {t('classAnnouncements.charCount', { count: trimmedLength, max: CLASS_ANNOUNCEMENT_MAX_LENGTH })}
          </span>
        </div>
        {postError && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {postError}
          </p>
        )}
        <div>
          <button type="submit" disabled={posting || trimmedLength === 0 || tooLong} className={primaryButton}>
            {posting ? t('classAnnouncements.posting') : t('classAnnouncements.post')}
          </button>
        </div>
      </form>

      {loadFailed && !items ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {t('classAnnouncements.loadFailed')}
        </p>
      ) : !items ? (
        <p className="text-sm text-base-black/60">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-primary-300 bg-primary-50 p-6 text-center">
          <p className="text-base font-semibold text-primary-700">{t('classAnnouncements.empty')}</p>
          <p className="mt-1 text-sm text-base-black/60">{t('classAnnouncements.emptyHint')}</p>
        </div>
      ) : (
        <div>
          <h3 className="text-lg font-bold text-base-black">{t('classAnnouncements.listHeading')}</h3>
          <ul className="mt-3 flex flex-col gap-3">
            {items.map((item) => (
              <AnnouncementItem
                key={item.id}
                item={item}
                classId={cls.id}
                onChanged={replaceItem}
                onDeleted={removeItem}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default ClassAnnouncementsTab;
