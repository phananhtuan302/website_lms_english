import { type ReactNode } from 'react';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

export function Pagination({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  className = '',
}: PaginationProps) {
  if (totalItems === 0) return null;

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  // Generate pagination page numbers with smart ellipsis
  function getPageNumbers(): (number | 'ellipsis')[] {
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }

    pages.push(1);
    if (currentPage > 3) {
      pages.push('ellipsis');
    }

    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (currentPage < totalPages - 2) {
      pages.push('ellipsis');
    }
    pages.push(totalPages);

    return pages;
  }

  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-2xs sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      {/* Thông tin số mục hiển thị & chọn pageSize */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
        <span>
          Hiển thị <span className="font-semibold text-slate-900">{startItem}</span> -{' '}
          <span className="font-semibold text-slate-900">{endItem}</span> trên{' '}
          <span className="font-semibold text-slate-900">{totalItems}</span> mục
        </span>

        <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
          <label htmlFor="page-size-select" className="text-slate-500">
            Số mục/trang:
          </label>
          <select
            id="page-size-select"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-8 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:border-slate-300 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Nút phân trang */}
      <div className="flex items-center gap-1 self-end sm:self-auto">
        {/* Nút Trước */}
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Trang trước"
        >
          ‹ Trước
        </button>

        {/* Các số trang */}
        <div className="flex items-center gap-1">
          {getPageNumbers().map((p, idx) => {
            if (p === 'ellipsis') {
              return (
                <span key={`ell-${idx}`} className="px-1.5 text-xs text-slate-400">
                  …
                </span>
              );
            }

            const isActive = p === currentPage;
            return (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg text-xs font-semibold transition ${
                  isActive
                    ? 'bg-primary-600 text-white shadow-2xs'
                    : 'border border-slate-200 bg-white text-slate-700 shadow-2xs hover:bg-slate-50'
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>

        {/* Nút Sau */}
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Trang sau"
        >
          Sau ›
        </button>
      </div>
    </div>
  );
}

export default Pagination;
