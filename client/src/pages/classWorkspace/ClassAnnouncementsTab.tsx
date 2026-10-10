import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CLASS_ANNOUNCEMENT_MAX_LENGTH, type ClassAnnouncementDTO } from '@platform/shared';
import { useClassWorkspace } from '../../hooks/useClassWorkspace';
import { formatAnnouncementTime } from '../../lib/announcementTime';
import { teacherApi } from '../../lib/teacherApi';

/** Order priority: pinned first, then custom order (or newest first) */
function sortAnnouncements(items: ClassAnnouncementDTO[]): ClassAnnouncementDTO[] {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

const ITEMS_PER_PAGE_OPTIONS = [5, 10, 20];

interface ItemProps {
  item: ClassAnnouncementDTO;
  classId: string;
  onChanged: (updated: ClassAnnouncementDTO) => void;
  onDeleted: (id: string) => void;
}

/** One announcement card with Priority badge, Edit, Delete */
function AnnouncementItem({
  item,
  classId,
  onChanged,
  onDeleted,
}: ItemProps) {
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
    } catch {
      setError(t(failedKey));
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
      className={`group relative flex flex-col gap-3 rounded-2xl border-2 p-5 shadow-xs transition-all duration-200 hover:shadow-md ${
        item.pinned
          ? 'border-amber-300 bg-amber-50/70 hover:border-amber-400'
          : 'border-slate-200/90 bg-white hover:border-slate-300'
      }`}
    >
      {/* Header dòng thông báo */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {/* Badge Ưu tiên */}
          {item.pinned && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900 shadow-2xs">
              <span>★</span>
              <span>Ưu tiên</span>
            </span>
          )}

          <div className="flex items-center gap-2 text-xs">
            <span className="font-bold text-slate-900">{item.authorName}</span>
            <span className="text-slate-300">•</span>
            <time dateTime={item.createdAt} title={time.full} className="font-medium text-slate-500">
              {time.label}
            </time>
          </div>
        </div>

        {/* Nút thao tác nhanh góc phải */}
        {!editing && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={togglePin}
              disabled={busy}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-2xs transition ${
                item.pinned
                  ? 'border-amber-300 bg-white text-amber-800 hover:bg-amber-100/60'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {item.pinned ? 'Bỏ ưu tiên' : 'Ưu tiên'}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(item.body);
                setEditing(true);
              }}
              disabled={busy}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-slate-900"
            >
              {t('classAnnouncements.edit')}
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="rounded-xl border border-rose-200 bg-rose-50/60 px-3 py-1.5 text-xs font-semibold text-rose-700 shadow-2xs transition hover:bg-rose-100 hover:text-rose-800"
            >
              {t('classAnnouncements.delete')}
            </button>
          </div>
        )}
      </div>

      {/* Nội dung thông báo hoặc form chỉnh sửa */}
      {editing ? (
        <div className="mt-1 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <label htmlFor={editId} className="sr-only">
            {t('classAnnouncements.editLabel')}
          </label>
          <textarea
            id={editId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            className="w-full rounded-xl border border-slate-200 p-3 text-sm font-medium text-slate-800 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
            data-autofocus
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={`text-xs ${draftTooLong ? 'font-bold text-red-600' : 'text-slate-400'}`}>
              {draft.trim().length} / {CLASS_ANNOUNCEMENT_MAX_LENGTH} ký tự
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
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
              >
                {t('classAnnouncements.cancel')}
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={busy || draftEmpty || draftTooLong}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
              >
                {busy ? t('classAnnouncements.saving') : t('classAnnouncements.save')}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm font-medium leading-relaxed text-slate-800">
          {item.body}
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          {error}
        </p>
      )}
    </li>
  );
}

/** Redesigned ClassAnnouncementsTab */
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

  // Phân trang
  const [pageSize, setPageSize] = useState(5);
  const [currentPage, setCurrentPage] = useState(1);

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
      setItems((current) => [created, ...(current ?? [])]);
      setText('');
      setPinOnPost(false);
      setCurrentPage(1);
    } catch {
      setPostError(t('classAnnouncements.postFailed'));
    } finally {
      setPosting(false);
    }
  }

  function replaceItem(updated: ClassAnnouncementDTO) {
    setItems((current) =>
      sortAnnouncements((current ?? []).map((i) => (i.id === updated.id ? updated : i))),
    );
  }

  function removeItem(id: string) {
    setItems((current) => (current ?? []).filter((i) => i.id !== id));
  }

  // Phân trang calculation
  const totalItems = items?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedItems = useMemo(() => {
    if (!items) return [];
    const startIndex = (validCurrentPage - 1) * pageSize;
    return items.slice(startIndex, startIndex + pageSize);
  }, [items, validCurrentPage, pageSize]);

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Header & Giới thiệu */}
      <div>
        <div className="flex items-center gap-2.5">
          <h2 className="text-xl font-black tracking-tight text-slate-900">{t('classAnnouncements.heading')}</h2>
          <span className="rounded-full border border-blue-200/60 bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700">
            {totalItems} tin
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Đăng lời nhắn và thông báo quan trọng cho cả lớp. Học sinh sẽ thấy thông báo này ngay trên trang chủ của mình.
        </p>
      </div>

      {/* 2. Khung soạn thông báo mới */}
      <form
        onSubmit={handlePost}
        className="flex flex-col gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs sm:p-6"
      >
        <div className="flex items-center justify-between">
          <label htmlFor={composerId} className="text-sm font-bold text-slate-900">
            Nội dung thông báo
          </label>
          <span className={`text-xs ${tooLong ? 'font-bold text-red-600' : 'text-slate-400'}`}>
            {trimmedLength} / {CLASS_ANNOUNCEMENT_MAX_LENGTH} ký tự
          </span>
        </div>

        <textarea
          id={composerId}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPostError(null);
          }}
          rows={4}
          placeholder="Ví dụ: Cả lớp nhớ nộp bài kiểm tra trước 20h tối thứ Sáu nhé."
          className="w-full rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-sm font-medium text-slate-800 placeholder-slate-400 transition focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100"
        />

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-3">
          {/* Checkbox Đổi thành "Ưu tiên" */}
          <label className="flex cursor-pointer select-none items-center gap-2 text-xs font-bold text-slate-700">
            <input
              type="checkbox"
              checked={pinOnPost}
              onChange={(e) => setPinOnPost(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Ưu tiên</span>
          </label>

          <button
            type="submit"
            disabled={posting || trimmedLength === 0 || tooLong}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
            <span>{posting ? t('classAnnouncements.posting') : 'Đăng thông báo'}</span>
          </button>
        </div>

        {postError && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
            {postError}
          </p>
        )}
      </form>

      {/* 3. Danh sách thông báo đã đăng & Phân trang */}
      {loadFailed && !items ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">
          {t('classAnnouncements.loadFailed')}
        </p>
      ) : !items ? (
        <div className="flex items-center gap-3 py-8 text-sm font-medium text-slate-500">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
          <span>{t('common.loading')}</span>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-10 text-center">
          <p className="text-base font-bold text-slate-800">{t('classAnnouncements.empty')}</p>
          <p className="mt-1 text-xs text-slate-500">{t('classAnnouncements.emptyHint')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">Các thông báo đã đăng</h3>
          </div>

          <ul className="flex flex-col gap-3">
            {paginatedItems.map((item) => (
              <AnnouncementItem
                key={item.id}
                item={item}
                classId={cls.id}
                onChanged={replaceItem}
                onDeleted={removeItem}
              />
            ))}
          </ul>

          {/* Thanh phân trang thông báo */}
          <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs sm:flex-row">
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>
                Hiển thị{' '}
                <strong className="font-semibold text-slate-900">
                  {totalItems === 0 ? 0 : (validCurrentPage - 1) * pageSize + 1}-
                  {Math.min(validCurrentPage * pageSize, totalItems)}
                </strong>{' '}
                trong số <strong className="font-semibold text-slate-900">{totalItems}</strong> thông báo
              </span>

              <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
                <span>Số tin:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 shadow-2xs focus:outline-none"
                >
                  {ITEMS_PER_PAGE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={validCurrentPage === 1}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ‹
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => setCurrentPage(page)}
                  className={`inline-flex h-8 min-w-[32px] items-center justify-center rounded-lg px-2 text-xs font-bold transition shadow-2xs ${
                    validCurrentPage === page
                      ? 'bg-blue-600 text-white'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {page}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={validCurrentPage === totalPages}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ›
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ClassAnnouncementsTab;
