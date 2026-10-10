import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { StudentGrammarTopicSummaryDTO } from '@platform/shared';
import { grammarApi } from '../lib/grammarApi';
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
 * Student-facing Grammar topic browser (T-047) - Bảng phẳng (Flat Table UI):
 * - Đưa toàn bộ vào khung bảng phẳng đồng bộ với thiết kế mới
 * - Các cột: Chủ đề ngữ pháp (tiêu đề + unit), Số lượng bài tập, Thao tác (Học ngay ›)
 * - Thanh phân trang tích hợp cùng bộ chọn số dòng/trang (5, 10, 20, 50)
 */
export default function StudentGrammarPage() {
  const { t } = useTranslation();
  const [topics, setTopics] = useState<StudentGrammarTopicSummaryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Tìm kiếm và Phân trang
  const [searchQuery, setSearchQuery] = useState('');
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  useEffect(() => {
    grammarApi
      .listTopics()
      .then(setTopics)
      .catch((err) => setError(err instanceof ApiError ? err.message : t('studentGrammar.loadFailed')));
  }, [t]);

  // Lọc chủ đề ngữ pháp
  const filteredTopics = useMemo(() => {
    if (!topics) return [];
    const q = normalizeForSearch(searchQuery.trim());
    if (!q) return topics;
    return topics.filter(
      (topic) =>
        normalizeForSearch(topic.title).includes(q) ||
        (topic.unitName && normalizeForSearch(topic.unitName).includes(q)),
    );
  }, [topics, searchQuery]);

  // Reset trang về 1 khi thay đổi tìm kiếm hoặc pageSize
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // Phân trang
  const totalItems = filteredTopics.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedTopics = useMemo(() => {
    const start = (validCurrentPage - 1) * pageSize;
    return filteredTopics.slice(start, start + pageSize);
  }, [filteredTopics, validCurrentPage, pageSize]);

  const startItem = totalItems === 0 ? 0 : (validCurrentPage - 1) * pageSize + 1;
  const endItem = Math.min(validCurrentPage * pageSize, totalItems);

  function handlePageSizeChange(newSize: number) {
    setPageSize(newSize);
    setCurrentPage(1);
  }

  return (
    <div className="flex w-full flex-col gap-6">
      {/* 1. Header Banner */}
      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-900">{t('studentGrammar.heading')}</h1>
        <p className="mt-1 text-xs font-medium text-slate-500">{t('studentGrammar.subtitle')}</p>
      </div>

      {error && (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-700">
          {error}
        </div>
      )}

      {/* 2. Khung Bảng Phẳng Duy Nhất (Flat Table Card) */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs">
        {/* Toolbar Tìm Kiếm & Số lượng */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100">
          <div className="relative w-full sm:w-80">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo chủ đề, unit..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-8 text-xs text-slate-900 shadow-2xs placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
            <svg
              className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400"
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
                className="absolute right-2.5 top-2.5 text-xs text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>
              Tổng cộng: <strong className="font-semibold text-slate-800">{totalItems}</strong> chủ đề
            </span>
          </div>
        </div>

        {/* Loading / Trống */}
        {topics === null && !error && (
          <div className="py-12 text-center text-xs text-slate-400">{t('common.loading')}</div>
        )}

        {topics && topics.length === 0 && (
          <div className="py-12 text-center text-xs text-slate-400">{t('studentGrammar.emptyState')}</div>
        )}

        {topics && topics.length > 0 && paginatedTopics.length === 0 && (
          <div className="py-12 text-center text-xs text-slate-400">
            Không tìm thấy chủ đề nào phù hợp với &ldquo;{searchQuery}&rdquo;
          </div>
        )}

        {/* Bảng Dữ Liệu Phẳng */}
        {paginatedTopics.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold text-slate-400">
                  <th className="py-3.5 font-medium">Chủ đề ngữ pháp</th>
                  <th className="py-3.5 font-medium">Số lượng bài tập</th>
                  <th className="py-3.5 font-medium text-right pr-2">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedTopics.map((topic) => (
                  <tr key={topic.id} className="group hover:bg-slate-50/50">
                    {/* Cột 1: Tên chủ đề */}
                    <td className="py-4 pr-4">
                      <Link
                        to={`/student/grammar-topics/${topic.id}`}
                        className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors"
                      >
                        {topic.title}
                      </Link>
                      {topic.unitName && (
                        <p className="mt-0.5 text-xs text-slate-400">{topic.unitName}</p>
                      )}
                    </td>

                    {/* Cột 2: Số lượng bài tập */}
                    <td className="py-4 pr-4 text-slate-600 whitespace-nowrap">
                      <span className="font-bold text-purple-600">{topic.exerciseCount}</span> bài tập luyện tập
                    </td>

                    {/* Cột 3: Thao tác */}
                    <td className="py-4 pl-2 text-right whitespace-nowrap">
                      <Link
                        to={`/student/grammar-topics/${topic.id}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 border border-blue-200/70 hover:bg-blue-100 transition-colors"
                      >
                        <span>{t('studentGrammar.studyLink')}</span>
                        <span>›</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Chân trang bảng: Phân trang & Tùy chọn dòng */}
            <div className="mt-4 flex flex-col items-center justify-between gap-3 border-t border-slate-100 pt-3.5 text-xs text-slate-500 sm:flex-row">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[11px] font-semibold text-slate-400">
                  Hiển thị <strong className="font-bold text-slate-700">{startItem} - {endItem}</strong> trong số <strong className="font-bold text-slate-700">{totalItems}</strong> chủ đề
                </span>

                <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
                  <span className="text-[11px] text-slate-400">Số dòng/trang:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                    className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 shadow-2xs hover:border-slate-300 focus:outline-none"
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
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
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
                                ? 'bg-blue-600 text-white shadow-2xs'
                                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      }
                      if (pageNum === validCurrentPage - 2 || pageNum === validCurrentPage + 2) {
                        return (
                          <span key={pageNum} className="px-1 text-slate-300">
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
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ›
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
