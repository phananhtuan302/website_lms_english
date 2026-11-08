import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { StudentFlashcardSetSummaryDTO } from '@platform/shared';
import { flashcardApi } from '../lib/flashcardApi';
import { ApiError } from '../lib/apiClient';

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

/** Chuẩn hóa chuỗi tiếng Việt để tìm kiếm không dấu */
function normalizeForSearch(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd');
}

/**
 * Student-facing flashcard set browser (T-023) - Bảng phẳng (Flat Table UI):
 * - Đưa toàn bộ vào khung bảng phẳng đồng bộ với thiết kế mới
 * - Các cột: Bộ thẻ từ vựng (tên + unit), Số lượng thẻ, Điểm tự kiểm tra, Thao tác (Học thẻ ›)
 * - Thanh phân trang tích hợp cùng bộ chọn số dòng/trang (5, 10, 20, 50)
 */
export default function StudentFlashcardsPage() {
  const { t } = useTranslation();
  const [sets, setSets] = useState<StudentFlashcardSetSummaryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Tìm kiếm và Phân trang
  const [searchQuery, setSearchQuery] = useState('');
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  useEffect(() => {
    flashcardApi
      .listSets()
      .then(setSets)
      .catch((err) => setError(err instanceof ApiError ? err.message : t('studentFlashcards.loadError')));
  }, [t]);

  // Lọc bộ từ vựng
  const filteredSets = useMemo(() => {
    if (!sets) return [];
    const q = normalizeForSearch(searchQuery.trim());
    if (!q) return sets;
    return sets.filter(
      (set) =>
        normalizeForSearch(set.name).includes(q) ||
        (set.unitName && normalizeForSearch(set.unitName).includes(q)),
    );
  }, [sets, searchQuery]);

  // Reset trang về 1 khi thay đổi tìm kiếm hoặc pageSize
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // Phân trang
  const totalItems = filteredSets.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedSets = useMemo(() => {
    const start = (validCurrentPage - 1) * pageSize;
    return filteredSets.slice(start, start + pageSize);
  }, [filteredSets, validCurrentPage, pageSize]);

  const startItem = totalItems === 0 ? 0 : (validCurrentPage - 1) * pageSize + 1;
  const endItem = Math.min(validCurrentPage * pageSize, totalItems);

  function handlePageSizeChange(newSize: number) {
    setPageSize(newSize);
    setCurrentPage(1);
  }

  return (
    <div className="vocab-zone vocab-canvas -m-4 flex w-full flex-col gap-6 rounded-3xl p-4 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8">
      {/* 1. Header Banner */}
      <div>
        <h1 className="vocab-display text-3xl font-bold text-primary-900">{t('studentFlashcards.heading')}</h1>
        <p className="mt-1 text-sm font-medium text-primary-900/60">{t('studentFlashcards.subtitle')}</p>
      </div>

      {error && (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-700">
          {error}
        </div>
      )}

      {/* Toolbar Tìm Kiếm & Số lượng */}
      <div className="flex flex-col gap-3 rounded-3xl border-2 border-primary-100 bg-base-white/80 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên bộ thẻ, unit..."
            className="w-full rounded-2xl border-2 border-primary-200 bg-base-white py-2.5 pl-9 pr-8 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />
          <svg
            className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2.5 text-sm text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm text-primary-900/60">
          <span>
            Tổng cộng: <strong className="font-bold text-primary-900">{totalItems}</strong> bộ thẻ
          </span>
        </div>
      </div>

      {/* Loading / Trống */}
      {sets === null && !error && (
        <div className="py-16 text-center text-sm text-primary-900/40">{t('common.loading')}</div>
      )}

      {sets && sets.length === 0 && (
        <div className="py-16 text-center text-sm text-primary-900/40">{t('studentFlashcards.emptyState')}</div>
      )}

      {sets && sets.length > 0 && paginatedSets.length === 0 && (
        <div className="py-16 text-center text-sm text-primary-900/40">
          Không tìm thấy bộ từ vựng nào phù hợp với &ldquo;{searchQuery}&rdquo;
        </div>
      )}

      {/* Lưới thẻ bộ từ vựng — mỗi bộ là một "thẻ game" bắt mắt thay vì một hàng bảng. */}
      {paginatedSets.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {paginatedSets.map((set) => (
              <Link
                key={set.id}
                to={`/student/flashcard-sets/${set.id}`}
                className="vocab-tile group flex flex-col gap-3 border-2 border-primary-200 bg-base-white p-5 shadow-[0_6px_0_0_rgb(var(--color-primary-200))]"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-100 text-xl">
                    📚
                  </span>
                  <span
                    className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                      set.selfCheckScore === 0
                        ? 'bg-slate-100 text-slate-600'
                        : set.selfCheckScore < 0
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {set.selfCheckScore === 0
                      ? t('studentFlashcards.selfCheckNone')
                      : t('studentFlashcards.selfCheckScore', { score: set.selfCheckScore })}
                  </span>
                </div>
                <div>
                  <p className="vocab-display text-lg font-bold text-primary-900 group-hover:text-primary-700">
                    {set.name}
                  </p>
                  {set.unitName && <p className="mt-0.5 text-xs text-primary-900/50">{set.unitName}</p>}
                </div>
                <div className="mt-auto flex items-center justify-between pt-2">
                  <span className="text-sm font-bold text-primary-700">{set.cardCount} thẻ từ vựng</span>
                  <span className="inline-flex items-center gap-1 text-sm font-bold text-primary-600 group-hover:gap-1.5">
                    {t('studentFlashcards.studyLink')} <span aria-hidden="true">→</span>
                  </span>
                </div>
              </Link>
            ))}
          </div>

          {/* Chân trang: Phân trang & Tùy chọn số thẻ/trang */}
          <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border-2 border-primary-100 bg-base-white/80 px-4 py-3 text-xs text-primary-900/60 sm:flex-row">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold">
                Hiển thị <strong className="font-bold text-primary-900">{startItem} - {endItem}</strong> trong số{' '}
                <strong className="font-bold text-primary-900">{totalItems}</strong> bộ thẻ
              </span>

              <div className="flex items-center gap-1.5 border-l border-primary-100 pl-3">
                <span>Số thẻ/trang:</span>
                <select
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  className="h-7 rounded-lg border border-primary-200 bg-base-white px-2 text-xs font-bold text-primary-700 hover:border-primary-300 focus:outline-none"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Bộ điều hướng trang */}
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={validCurrentPage === 1}
                  aria-label="Trang trước"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-primary-200 bg-base-white text-xs font-bold text-primary-700 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ‹
                </button>

                <div className="flex items-center gap-1 px-1">
                  {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pageNum) => {
                    if (
                      pageNum === 1 ||
                      pageNum === totalPages ||
                      (pageNum >= validCurrentPage - 1 && pageNum <= validCurrentPage + 1)
                    ) {
                      return (
                        <button
                          key={pageNum}
                          type="button"
                          onClick={() => setCurrentPage(pageNum)}
                          className={`inline-flex h-7 min-w-[28px] items-center justify-center rounded-lg px-1.5 text-xs font-bold transition ${
                            pageNum === validCurrentPage
                              ? 'bg-primary-600 text-base-white'
                              : 'border border-primary-200 bg-base-white text-primary-700 hover:bg-primary-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    }
                    if (pageNum === validCurrentPage - 2 || pageNum === validCurrentPage + 2) {
                      return (
                        <span key={pageNum} className="px-1 text-primary-200">
                          …
                        </span>
                      );
                    }
                    return null;
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={validCurrentPage === totalPages}
                  aria-label="Trang sau"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-primary-200 bg-base-white text-xs font-bold text-primary-700 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ›
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
