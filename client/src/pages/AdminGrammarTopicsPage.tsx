import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { AdminGrammarTopicSummaryDTO } from '@platform/shared';
import { adminApi } from '../lib/adminApi';
import { ApiError } from '../lib/apiClient';
import { Alert, EmptyState, GrammarIcon, PageHeader } from '../components/ui';

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

/**
 * AdminGrammarTopicsPage (T-071) - Bảng phẳng (Flat Table) theo thiết kế mới:
 * - Khung bảng phẳng duy nhất bo góc mềm mại, hiển thị rõ ràng thông tin các chủ đề ngữ pháp.
 * - Các cột: Chủ đề ngữ pháp, Giáo viên, Số lượng bài tập, Cập nhật, Thao tác.
 * - Phân trang đồng bộ & tùy chọn số lượng hiển thị mỗi trang (5, 10, 20, 50).
 */
export default function AdminGrammarTopicsPage() {
  const { t } = useTranslation();
  const [topics, setTopics] = useState<AdminGrammarTopicSummaryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    adminApi
      .listAllGrammarTopics()
      .then(setTopics)
      .catch((err) => setError(err instanceof ApiError ? err.message : t('adminGrammarTopics.errors.loadFailed')));
  }, [t]);

  const allTopics = topics ?? [];
  const totalItems = allTopics.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedTopics = useMemo(() => {
    const startIndex = (validCurrentPage - 1) * pageSize;
    return allTopics.slice(startIndex, startIndex + pageSize);
  }, [allTopics, validCurrentPage, pageSize]);

  const startItem = totalItems === 0 ? 0 : (validCurrentPage - 1) * pageSize + 1;
  const endItem = Math.min(validCurrentPage * pageSize, totalItems);

  function handlePageSizeChange(newSize: number) {
    setPageSize(newSize);
    setCurrentPage(1);
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        title={t('adminGrammarTopics.heading')}
        subtitle={t('adminGrammarTopics.subtitle')}
        icon={<GrammarIcon className="h-5 w-5" />}
      />

      {error && <Alert tone="error">{error}</Alert>}

      {/* Card Chứa Bảng Danh Sách Duy Nhất */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs">
        {/* Tiêu đề & Subtitle của bảng */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">Danh sách chủ đề ngữ pháp</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Quản trị toàn bộ các chủ đề và bài tập ngữ pháp trong hệ thống của các giáo viên.
            </p>
          </div>
          {topics && (
            <span className="text-xs font-semibold text-slate-400">
              Tổng cộng: <strong className="text-slate-700">{allTopics.length}</strong> chủ đề
            </span>
          )}
        </div>

        {/* Loading / Empty state */}
        {topics === null && (
          <div className="py-12 text-center text-xs text-slate-400">{t('common.loading')}</div>
        )}

        {topics && totalItems === 0 && (
          <div className="py-12">
            <EmptyState title={t('adminGrammarTopics.empty')} />
          </div>
        )}

        {/* Bảng Dữ Liệu Phẳng (Flat Table) */}
        {topics && totalItems > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-semibold text-slate-400">
                  <th className="py-3 font-medium">Chủ đề ngữ pháp</th>
                  <th className="py-3 font-medium">Giáo viên</th>
                  <th className="py-3 font-medium">Số lượng bài tập</th>
                  <th className="py-3 font-medium">Cập nhật</th>
                  <th className="py-3 font-medium text-right pr-2">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedTopics.map((topic) => (
                  <tr key={topic.id} className="group hover:bg-slate-50/50">
                    {/* Cột 1: Tên chủ đề */}
                    <td className="py-3.5 pr-4">
                      <Link
                        to={`/teacher/grammar-topics/${topic.id}`}
                        className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors"
                      >
                        {topic.title}
                      </Link>
                      {topic.unitName && (
                        <p className="mt-0.5 text-[11px] text-slate-400">{topic.unitName}</p>
                      )}
                    </td>

                    {/* Cột 2: Giáo viên phụ trách */}
                    <td className="py-3.5 pr-4 text-slate-600 whitespace-nowrap">
                      <p className="font-semibold text-slate-800">{topic.teacherName}</p>
                      <p className="text-[11px] text-slate-400">{topic.teacherEmail}</p>
                    </td>

                    {/* Cột 3: Số lượng bài tập */}
                    <td className="py-3.5 pr-4 text-slate-600 whitespace-nowrap">
                      <span className="font-bold text-purple-600">{topic.exerciseCount}</span> bài tập
                    </td>

                    {/* Cột 4: Ngày giờ cập nhật */}
                    <td className="py-3.5 pr-4 text-slate-500 whitespace-nowrap text-[11px]">
                      {new Date(topic.updatedAt).toLocaleDateString('vi-VN')}
                    </td>

                    {/* Cột 5: Thao tác mở trình soạn thảo */}
                    <td className="py-3.5 pl-2 text-right whitespace-nowrap">
                      <Link
                        to={`/teacher/grammar-topics/${topic.id}`}
                        className="inline-flex items-center gap-1 font-bold text-blue-600 hover:text-blue-800"
                      >
                        <span>Mở trình soạn thảo</span>
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
