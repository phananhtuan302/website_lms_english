import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ClassRosterStudentDTO } from '@platform/shared';
import HorizontalScrollHint from '../../components/HorizontalScrollHint';
import { useClassWorkspace } from '../../hooks/useClassWorkspace';
import { classTabPath } from '../../lib/classWorkspace';
import { formatScore10 } from '../../lib/scoreFormat';
import { teacherApi } from '../../lib/teacherApi';
import AddStudentsModal from './AddStudentsModal';
import ResetStudentPasswordModal from './ResetStudentPasswordModal';
import TransferStudentModal from './TransferStudentModal';

/** Lower-cases and strips Vietnamese diacritics so "nguyen" finds "Nguyễn" */
function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase();
}

function formatAverage(value: number | null): string {
  return formatScore10(value);
}

const ITEMS_PER_PAGE_OPTIONS = [10, 20, 50];

function ClassStudentsTab() {
  const { t } = useTranslation();
  const { cls, reload: reloadClasses } = useClassWorkspace();
  const periodKey = cls.currentPeriodId ?? '';

  const [loaded, setLoaded] = useState<{ key: string; roster: ClassRosterStudentDTO[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const [showAdd, setShowAdd] = useState(false);
  const [resetTarget, setResetTarget] = useState<ClassRosterStudentDTO | null>(null);
  const [transferTarget, setTransferTarget] = useState<ClassRosterStudentDTO | null>(null);
  const [transferMessage, setTransferMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!transferMessage) return;
    const timer = setTimeout(() => setTransferMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [transferMessage]);

  useEffect(() => {
    let cancelled = false;
    teacherApi
      .getClassRoster(cls.id)
      .then((roster) => {
        if (cancelled) return;
        setLoaded({ key: periodKey, roster });
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [cls.id, periodKey, reloadToken]);

  function handleStudentsAdded() {
    setReloadToken((n) => n + 1);
    void reloadClasses().catch(() => undefined);
  }

  function handleStudentTransferred(name: string, destinationClassName: string) {
    setTransferTarget(null);
    setTransferMessage(t('classStudents.transfer.success', { name, className: destinationClassName }));
    handleStudentsAdded();
  }

  const roster = loaded && loaded.key === periodKey ? loaded.roster : null;

  // Filter students based on search term
  const filteredStudents = useMemo(() => {
    if (!roster) return [];
    const needle = normalizeForSearch(query.trim());
    if (needle === '') return roster;
    return roster.filter((student) =>
      normalizeForSearch(`${student.name} ${student.email}`).includes(needle),
    );
  }, [roster, query]);

  // Reset to page 1 whenever search query or pageSize changes
  useEffect(() => {
    setCurrentPage(1);
  }, [query, pageSize]);

  // Pagination calculation
  const totalItems = filteredStudents.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedStudents = useMemo(() => {
    const startIndex = (validCurrentPage - 1) * pageSize;
    return filteredStudents.slice(startIndex, startIndex + pageSize);
  }, [filteredStudents, validCurrentPage, pageSize]);

  if (failed && !roster) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        <p className="font-semibold">{t('classStudents.loadFailed')}</p>
      </div>
    );
  }

  if (!roster) {
    return (
      <div className="flex items-center gap-3 py-10 text-sm font-medium text-slate-500">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
        <span>{t('common.loading')}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 1. Header Toolbar & Action Card */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-black tracking-tight text-slate-900">{t('classStudents.heading')}</h2>
            <span className="rounded-full bg-blue-50 px-3 py-0.5 text-xs font-bold text-blue-700 border border-blue-200/60">
              {roster.length} học sinh
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Quản lý danh sách thành viên lớp, chuyển lớp và cấp lại mật khẩu cho học sinh
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Ô tìm kiếm hiện đại */}
          <div className="relative min-w-[240px] flex-1 sm:w-72">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm theo tên hoặc email..."
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-9 pr-3 text-xs font-medium text-slate-800 placeholder-slate-400 transition focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>

          {/* Nút Thêm học sinh */}
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 active:scale-95"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            <span>{t('classRoster.addButton')}</span>
          </button>
        </div>
      </div>

      {transferMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800 shadow-xs">
          <span>✓</span>
          <span>{transferMessage}</span>
        </div>
      )}

      {/* 2. Bảng Danh sách Học sinh & Phân trang */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs">
        {roster.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
            <h3 className="mt-3 text-base font-bold text-slate-800">{t('classStudents.empty')}</h3>
            <p className="mt-1 text-xs text-slate-500">{t('classStudents.emptyHint')}</p>
            <div className="mt-5">
              <button
                type="button"
                onClick={() => setShowAdd(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
              >
                {t('classRoster.addButton')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <HorizontalScrollHint className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-left text-xs">
                <thead>
                  <tr className="bg-slate-50/80 font-bold uppercase tracking-wider text-slate-600 border-b border-slate-100">
                    <th scope="col" className="px-5 py-3.5">
                      {t('classStudents.columns.name')}
                    </th>
                    <th scope="col" className="px-5 py-3.5">
                      {t('classStudents.columns.email')}
                    </th>
                    <th scope="col" className="px-5 py-3.5 text-center">
                      {t('classStudents.columns.submitted')}
                    </th>
                    <th scope="col" className="px-5 py-3.5 text-right">
                      {t('classStudents.columns.average')}
                    </th>
                    <th scope="col" className="px-5 py-3.5 text-right">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedStudents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-xs text-slate-500">
                        {t('classStudents.noMatch', { query: query.trim() })}
                      </td>
                    </tr>
                  ) : (
                    paginatedStudents.map((student) => (
                      <tr key={student.id} className="transition-colors hover:bg-slate-50/70">
                        {/* Cột Họ & Tên */}
                        <td className="px-5 py-3.5 font-bold text-slate-900">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-500 to-indigo-600 text-xs font-bold text-white shadow-xs">
                              {student.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-sm font-semibold text-slate-900">{student.name}</span>
                          </div>
                        </td>

                        {/* Cột Email / Tài khoản */}
                        <td className="px-5 py-3.5 font-mono text-xs text-slate-600">
                          {student.email}
                        </td>

                        {/* Cột Số bài đã nộp */}
                        <td className="px-5 py-3.5 text-center">
                          <span className="inline-flex min-w-[28px] items-center justify-center rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-800">
                            {student.submittedCount}
                          </span>
                        </td>

                        {/* Cột Điểm trung bình */}
                        <td className="px-5 py-3.5 text-right">
                          <span
                            className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-black tabular-nums ${
                              student.averageScorePercent === null
                                ? 'text-slate-400'
                                : (student.averageScorePercent / 10) >= 8
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                                : (student.averageScorePercent / 10) >= 5
                                ? 'bg-amber-50 text-amber-700 border border-amber-200/60'
                                : 'bg-rose-50 text-rose-700 border border-rose-200/60'
                            }`}
                          >
                            {formatAverage(student.averageScorePercent)}
                          </span>
                        </td>

                        {/* Cột Thao tác */}
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setResetTarget(student)}
                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                            >
                              Đặt lại MK
                            </button>
                            <button
                              type="button"
                              onClick={() => setTransferTarget(student)}
                              className="rounded-lg border border-blue-200 bg-blue-50/60 px-2.5 py-1 text-xs font-semibold text-blue-700 shadow-2xs transition hover:bg-blue-100/80"
                            >
                              Chuyển lớp
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </HorizontalScrollHint>

            {/* Thanh điều khiển Phân Trang (Pagination Controls) */}
            <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-5 py-3.5 sm:flex-row">
              {/* Thông tin số lượng hiển thị */}
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span>
                  Hiển thị{' '}
                  <strong className="text-slate-900 font-semibold">
                    {totalItems === 0 ? 0 : (validCurrentPage - 1) * pageSize + 1}-
                    {Math.min(validCurrentPage * pageSize, totalItems)}
                  </strong>{' '}
                  trong số <strong className="text-slate-900 font-semibold">{totalItems}</strong> học sinh
                </span>

                <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
                  <span>Số dòng:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 shadow-2xs focus:border-primary-500 focus:outline-none"
                  >
                    {ITEMS_PER_PAGE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Các nút bấm trang */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={validCurrentPage === 1}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ‹
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((page) => {
                    return (
                      page === 1 ||
                      page === totalPages ||
                      Math.abs(page - validCurrentPage) <= 1
                    );
                  })
                  .map((page, idx, arr) => {
                    const prevPage = arr[idx - 1];
                    const isJump = prevPage && page - prevPage > 1;

                    return (
                      <span key={page} className="flex items-center">
                        {isJump && <span className="px-1 text-xs text-slate-400">...</span>}
                        <button
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
                      </span>
                    );
                  })}

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
          </>
        )}
      </div>

      {/* Footer Notes & Navigation */}
      <div className="flex flex-col gap-1 text-xs text-slate-500">
        {cls.currentPeriodId === null ? (
          <p>{t('classStudents.noSemesterNote')}</p>
        ) : (
          <p>{t('classStudents.scoreNote')}</p>
        )}
        <p>{t('classStudents.adminHint')}</p>
        {roster.length > 0 && cls.currentPeriodId !== null && (
          <p className="mt-1">
            <Link
              to={classTabPath(cls.id, 'grades')}
              className="font-bold text-primary-600 hover:underline"
            >
              {t('classStudents.viewGrades')} →
            </Link>
          </p>
        )}
      </div>

      {/* Modals */}
      {resetTarget && (
        <ResetStudentPasswordModal
          classId={cls.id}
          student={resetTarget}
          onClose={() => setResetTarget(null)}
        />
      )}

      {transferTarget && (
        <TransferStudentModal
          classId={cls.id}
          student={transferTarget}
          onClose={() => setTransferTarget(null)}
          onTransferred={(destinationClassName) =>
            handleStudentTransferred(transferTarget.name, destinationClassName)
          }
        />
      )}

      {showAdd && (
        <AddStudentsModal
          classId={cls.id}
          className={cls.name}
          onClose={() => setShowAdd(false)}
          onChanged={handleStudentsAdded}
        />
      )}
    </div>
  );
}

export default ClassStudentsTab;
