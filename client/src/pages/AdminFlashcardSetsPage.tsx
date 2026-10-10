import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { AdminFlashcardSetSummaryDTO } from '@platform/shared';
import { adminApi } from '../lib/adminApi';
import { ApiError } from '../lib/apiClient';
import { Alert, EmptyState, FlashcardsIcon, PageHeader } from '../components/ui';

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

/**
 * AdminFlashcardSetsPage (T-071) - Bảng phẳng (Flat Table) theo thiết kế mới:
 * - Khung bảng phẳng duy nhất bo góc mềm mại, hiển thị rõ ràng thông tin các bộ từ vựng.
 * - Các cột: Bộ thẻ từ vựng, Giáo viên, Số lượng thẻ, Cập nhật, Thao tác.
 * - Phân trang đồng bộ & tùy chọn số lượng hiển thị mỗi trang (5, 10, 20, 50).
 */
export default function AdminFlashcardSetsPage() {
  const { t } = useTranslation();
  const [sets, setSets] = useState<AdminFlashcardSetSummaryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    adminApi
      .listAllFlashcardSets()
      .then(setSets)
      .catch((err) => setError(err instanceof ApiError ? err.message : t('adminFlashcardSets.errors.loadFailed')));
  }, [t]);

  const allSets = sets ?? [];
  const totalItems = allSets.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedSets = useMemo(() => {
    const startIndex = (validCurrentPage - 1) * pageSize;
    return allSets.slice(startIndex, startIndex + pageSize);
  }, [allSets, validCurrentPage, pageSize]);

  const startItem = totalItems === 0 ? 0 : (validCurrentPage - 1) * pageSize + 1;
  const endItem = Math.min(validCurrentPage * pageSize, totalItems);

  function handlePageSizeChange(newSize: number) {
    setPageSize(newSize);
    setCurrentPage(1);
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        title={t('adminFlashcardSets.heading')}
        subtitle={t('adminFlashcardSets.subtitle')}
        icon={<FlashcardsIcon className="h-5 w-5" />}
      />

      {error && <Alert tone="error">{error}</Alert>}

      {/* Card Chứa Bảng Danh Sách Duy Nhất */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs">
        {/* Tiêu đề & Subtitle của bảng */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">Danh sách bộ thẻ từ vựng</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Quản trị toàn bộ các bộ từ vựng trong hệ thống của các giáo viên.
            </p>
          </div>
          {sets && (
            <span className="text-xs font-semibold text-slate-400">
              Tổng cộng: <strong className="text-slate-700">{allSets.length}</strong> bộ thẻ
            </span>
          )}
        </div>

        {/* Loading / Empty state */}
        {sets === null && (
          <div className="py-12 text-center text-xs text-slate-400">{t('common.loading')}</div>
        )}

        {sets && totalItems === 0 && (
          <div className="py-12">
            <EmptyState title={t('adminFlashcardSets.empty')} />
          </div>
        )}

        {/* Bảng Dữ Liệu Phẳng (Flat Table) */}
        {sets && totalItems > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-semibold text-slate-400">
                  <th className="py-3 font-medium">Bộ thẻ từ vựng</th>
                  <th className="py-3 font-medium">Giáo viên</th>
                  <th className="py-3 font-medium">Số lượng thẻ</th>
                  <th className="py-3 font-medium">Cập nhật</th>
                  <th className="py-3 font-medium text-right pr-2">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedSets.map((set) => (
                  <tr key={set.id} className="group hover:bg-slate-50/50">
                    {/* Cột 1: Tên bộ thẻ */}
                    <td className="py-3.5 pr-4">
                      <Link
                        to={`/teacher/flashcard-sets/${set.id}`}
                        className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors"
                      >
                        {set.name}
                      </Link>
                      {set.unitName && (
                        <p className="mt-0.5 text-[11px] text-slate-400">{set.unitName}</p>
                      )}
                    </td>

                    {/* Cột 2: Giáo viên phụ trách */}
                    <td className="py-3.5 pr-4 text-slate-600 whitespace-nowrap">
                      <p className="font-semibold text-slate-800">{set.teacherName}</p>
                      <p className="text-[11px] text-slate-400">{set.teacherEmail}</p>
                    </td>

                    {/* Cột 3: Số lượng thẻ */}
                    <td className="py-3.5 pr-4 text-slate-600 whitespace-nowrap">
                      <span className="font-bold text-blue-600">{set.cardCount}</span> thẻ từ vựng
                    </td>

                    {/* Cột 4: Ngày giờ cập nhật */}
                    <td className="py-3.5 pr-4 text-slate-500 whitespace-nowrap text-[11px]">
                      {new Date(set.updatedAt).toLocaleDateString('vi-VN')}
                    </td>

                    {/* Cột 5: Thao tác mở trình soạn thảo */}
                    <td className="py-3.5 pl-2 text-right whitespace-nowrap">
                      <Link
                        to={`/teacher/flashcard-sets/${set.id}`}
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
                  Hiển thị <strong className="font-bold text-slate-700">{startItem} - {endItem}</strong> trong số <strong className="font-bold text-slate-700">{totalItems}</strong> bộ thẻ
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
