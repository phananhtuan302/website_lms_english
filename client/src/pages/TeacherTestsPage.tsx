import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TEST_TYPE_LABELS, type TestSummaryDTO, type TestType } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';
import { Button, PageHeader, TestsIcon } from '../components/ui';

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];
const REPORTS_ENABLED = true;

function formatAverageDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs} giây`;
  if (secs === 0) return `${mins} phút`;
  return `${mins} phút ${secs} giây`;
}

/**
 * TeacherTestsPage (T-043) - Bảng phẳng (Flat Table) theo thiết kế mới:
 * - Thay thế danh sách card khối lặp lại bằng bảng phẳng duy nhất tinh gọn.
 * - Các cột: Bài kiểm tra (tên + unit), Chi tiết (phần/câu), Thời gian TB, Phân loại, Cập nhật, Thao tác.
 * - Phân trang đồng bộ & tùy chọn số lượng hiển thị mỗi trang (5, 10, 20, 50).
 */
export default function TeacherTestsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tests, setTests] = useState<TestSummaryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  // Phân trang
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  function loadTests() {
    teacherApi
      .listTests()
      .then(setTests)
      .catch((err) => setError(err instanceof ApiError ? err.message : t('teacherTests.errors.loadFailed')));
  }

  useEffect(() => {
    loadTests();
  }, [t]);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const created = await teacherApi.createTest({ title: t('teacherTests.newTestDefaultTitle') });
      navigate(`/teacher/tests/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('teacherTests.errors.createFailed'));
      setCreating(false);
    }
  }

  async function handleDuplicate(testId: string) {
    setDuplicatingId(testId);
    setError(null);
    try {
      await teacherApi.duplicateTest(testId);
      loadTests();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('teacherTests.errors.duplicateFailed'));
    } finally {
      setDuplicatingId(null);
    }
  }

  const filteredTests = useMemo(() => {
    if (!tests) return [];
    if (!searchQuery.trim()) return tests;
    const query = searchQuery.toLowerCase().trim();
    return tests.filter(
      (test) =>
        test.title.toLowerCase().includes(query) ||
        (test.unitName && test.unitName.toLowerCase().includes(query)),
    );
  }, [tests, searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const totalItems = filteredTests.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedTests = useMemo(() => {
    const startIndex = (validCurrentPage - 1) * pageSize;
    return filteredTests.slice(startIndex, startIndex + pageSize);
  }, [filteredTests, validCurrentPage, pageSize]);

  const startItem = totalItems === 0 ? 0 : (validCurrentPage - 1) * pageSize + 1;
  const endItem = Math.min(validCurrentPage * pageSize, totalItems);

  function handlePageSizeChange(newSize: number) {
    setPageSize(newSize);
    setCurrentPage(1);
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title={t('teacherTests.heading')}
          subtitle={t('teacherTests.subtitle')}
          icon={<TestsIcon className="h-5 w-5" />}
        />
        <Button onClick={handleCreate} disabled={creating} className="self-start sm:self-auto">
          {creating ? t('teacherTests.creating') : t('teacherTests.createButton')}
        </Button>
      </div>

      {error && (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-700">
          {error}
        </div>
      )}

      {/* Bảng Dữ Liệu Phẳng Duy Nhất */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs">
        {/* Thanh tìm kiếm & thống kê */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100">
          <div className="relative w-full sm:w-80">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm theo tên bài kiểm tra, unit..."
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
              Tổng cộng: <strong className="font-semibold text-slate-800">{totalItems}</strong> bài kiểm tra
            </span>
          </div>
        </div>

        {/* Loading / Empty state */}
        {tests === null && (
          <div className="py-12 text-center text-xs text-slate-400">{t('common.loading')}</div>
        )}

        {tests && tests.length === 0 && (
          <div className="py-12 text-center text-xs text-slate-400">{t('teacherTests.emptyState')}</div>
        )}

        {tests && tests.length > 0 && paginatedTests.length === 0 && (
          <div className="py-12 text-center text-xs text-slate-400">
            Không tìm thấy bài kiểm tra nào phù hợp với &ldquo;{searchQuery}&rdquo;
          </div>
        )}

        {/* Bảng Dữ Liệu Phẳng */}
        {paginatedTests.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold text-slate-400">
                  <th className="py-3.5 font-medium">Bài kiểm tra</th>
                  <th className="py-3.5 font-medium">Chi tiết</th>
                  <th className="py-3.5 font-medium">Thời gian trung bình</th>
                  <th className="py-3.5 font-medium text-center">Phân loại</th>
                  <th className="py-3.5 font-medium">Cập nhật</th>
                  <th className="py-3.5 font-medium text-right pr-2">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedTests.map((test) => (
                  <tr key={test.id} className="group hover:bg-slate-50/50">
                    {/* Cột 1: Tên bài kiểm tra */}
                    <td className="py-4 pr-4">
                      <Link
                        to={`/teacher/tests/${test.id}`}
                        className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors"
                      >
                        {test.title}
                      </Link>
                      {test.unitName && (
                        <p className="mt-0.5 text-xs text-slate-400">{test.unitName}</p>
                      )}
                    </td>

                    {/* Cột 2: Chi tiết phần & câu hỏi */}
                    <td className="py-4 pr-4 text-slate-600 whitespace-nowrap">
                      <span>{t('teacherTests.sectionCount', { count: test.sectionCount })}</span> ·{' '}
                      <span className="font-medium text-slate-800">
                        {t('teacherTests.questionCount', { count: test.questionCount })}
                      </span>
                    </td>

                    {/* Cột 3: Thời gian làm bài TB */}
                    <td className="py-4 pr-4 whitespace-nowrap">
                      {test.averageTimeTakenSeconds !== null ? (
                        <div>
                          <span className="font-semibold text-emerald-700">
                            {formatAverageDuration(test.averageTimeTakenSeconds)}
                          </span>
                          <span className="text-xs text-slate-400 block">
                            ({test.completedAttemptCount} lượt hoàn thành)
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    {/* Cột 4: Phân loại Badge */}
                    <td className="py-4 px-3 text-center whitespace-nowrap">
                      <span
                        className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-bold border ${
                          test.testType === 'unitTest'
                            ? 'bg-blue-50 text-blue-700 border-blue-200/70'
                            : test.testType === 'mockTest'
                              ? 'bg-purple-50 text-purple-700 border-purple-200/70'
                              : test.testType === 'vocabularyCheck'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200/70'
                                : 'bg-slate-50 text-slate-700 border-slate-200/70'
                        }`}
                      >
                        {TEST_TYPE_LABELS[test.testType as TestType] ?? test.testType}
                      </span>
                    </td>

                    {/* Cột 5: Cập nhật */}
                    <td className="py-4 pr-4 text-slate-500 whitespace-nowrap text-xs">
                      {new Date(test.updatedAt).toLocaleDateString('vi-VN')}
                    </td>

                    {/* Cột 6: Thao tác */}
                    <td className="py-4 pl-2 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        {REPORTS_ENABLED && (
                          <Link
                            to={`/teacher/tests/${test.id}/report`}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
                          >
                            <span>Báo cáo</span>
                          </Link>
                        )}
                        <Link
                          to={`/teacher/tests/${test.id}`}
                          className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 border border-blue-200/70 hover:bg-blue-100"
                        >
                          <span>Sửa</span>
                          <span>›</span>
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDuplicate(test.id)}
                          disabled={duplicatingId === test.id}
                          className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                          title="Nhân bản bài kiểm tra"
                        >
                          {duplicatingId === test.id ? '...' : 'Nhân bản'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Chân trang bảng: Phân trang & Tùy chọn dòng */}
            <div className="mt-4 flex flex-col items-center justify-between gap-3 border-t border-slate-100 pt-3.5 text-xs text-slate-500 sm:flex-row">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[11px] font-semibold text-slate-400">
                  Hiển thị <strong className="font-bold text-slate-700">{startItem} - {endItem}</strong> trong số <strong className="font-bold text-slate-700">{totalItems}</strong> bài kiểm tra
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
