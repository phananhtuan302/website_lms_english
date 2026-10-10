import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ClassGradesOverviewRowDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';
import { CLASSES_HOME_PATH, classTabPath } from '../lib/classWorkspace';
import { formatScore10, percentToScore10 } from '../lib/scoreFormat';

/** Chuẩn hóa chuỗi tiếng Việt để tìm kiếm không dấu */
function normalizeForSearch(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd');
}

/** Màu avatar gradient ngẫu nhiên nhưng đồng nhất theo tên lớp */
const CLASS_GRADIENTS = [
  'from-blue-600 to-indigo-600',
  'from-indigo-600 to-purple-600',
  'from-emerald-600 to-teal-600',
  'from-cyan-600 to-blue-600',
  'from-violet-600 to-pink-600',
  'from-amber-600 to-orange-600',
];

function getClassGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % CLASS_GRADIENTS.length;
  return CLASS_GRADIENTS[index];
}

function getClassInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return 'CL';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Teacher-level "Tổng quan điểm số" (Phase 17, T-118B):
 * Giao diện so sánh điểm trung bình giữa các lớp với thẻ chỉ số KPI đậm nét, bảng xếp hạng
 * trực quan, badge màu phân loại rõ ràng và ô tìm kiếm nhanh.
 */
function TeacherGradesOverviewPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ClassGradesOverviewRowDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    teacherApi
      .getClassesGradesOverview()
      .then((data) => {
        if (cancelled) return;
        setRows(data.classes);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : t('gradesOverview.loadFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  // Sắp xếp giảm dần theo điểm trung bình
  const sorted = useMemo(() => {
    if (!rows) return [];
    return [...rows].sort((a, b) => {
      if (a.averageScorePercent === null && b.averageScorePercent === null) return 0;
      if (a.averageScorePercent === null) return 1;
      if (b.averageScorePercent === null) return -1;
      return b.averageScorePercent - a.averageScorePercent;
    });
  }, [rows]);

  const scored = useMemo(() => sorted.filter((row) => row.averageScorePercent !== null), [sorted]);
  const highestClassId = scored.length > 0 ? scored[0].classId : null;
  const lowestClassId = scored.length > 1 ? scored[scored.length - 1].classId : null;

  // Lọc theo tìm kiếm
  const filtered = useMemo(() => {
    const needle = normalizeForSearch(query.trim());
    if (!needle) return sorted;
    return sorted.filter((row) => normalizeForSearch(row.name).includes(needle));
  }, [sorted, query]);

  return (
    <div className="flex w-full flex-col gap-6">
      {/* 1. Header Toolbar & Điều hướng quay lại */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            to={CLASSES_HOME_PATH}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-slate-900"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>{t('gradesOverview.back')}</span>
          </Link>
          <div className="mt-3">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">{t('gradesOverview.heading')}</h1>
            <p className="mt-1 text-xs font-medium text-slate-500">{t('gradesOverview.description')}</p>
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-700">
          {error}
        </div>
      )}

      {!error && !rows && (
        <div className="flex items-center gap-3 py-12 text-sm font-medium text-slate-500">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
          <span>{t('common.loading')}</span>
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-medium text-slate-600 shadow-xs">
          {t('gradesOverview.noClasses')}
        </div>
      )}

      {/* 2. Bảng Xếp Hạng So Sánh Điểm Số Các Lớp */}
      {rows && rows.length > 0 && (
        <div className="flex flex-col gap-3">
          {/* Thanh công cụ tìm kiếm */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:w-80">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm kiếm lớp học theo tên..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 shadow-2xs placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
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
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>Đang hiển thị <strong>{filtered.length}</strong> / <strong>{rows.length}</strong> lớp</span>
            </div>
          </div>

          {/* Bảng Dữ Liệu */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/90 text-xs font-bold uppercase tracking-wider text-slate-600">
                    <th scope="col" className="px-5 py-3.5">
                      Thứ Hạng / Lớp
                    </th>
                    <th scope="col" className="px-5 py-3.5 text-center">
                      {t('gradesOverview.studentsHeader')}
                    </th>
                    <th scope="col" className="px-5 py-3.5">
                      {t('gradesOverview.semesterHeader')}
                    </th>
                    <th scope="col" className="px-5 py-3.5 text-center">
                      {t('gradesOverview.testsHeader')}
                    </th>
                    <th scope="col" className="px-5 py-3.5 text-right">
                      {t('gradesOverview.averageHeader')}
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-xs text-slate-400">
                        Không tìm thấy lớp học nào phù hợp với &ldquo;{query}&rdquo;
                      </td>
                    </tr>
                  ) : (
                    filtered.map((row, index) => {
                      const score10 = row.averageScorePercent !== null ? percentToScore10(row.averageScorePercent) : null;
                      const isHighest = row.classId === highestClassId;
                      const isLowest = row.classId === lowestClassId;

                      return (
                        <tr
                          key={row.classId}
                          className="group transition-colors hover:bg-slate-50/70"
                        >
                          {/* Cột Tên Lớp & Avatar */}
                          <td className="px-5 py-4 font-medium text-slate-900">
                            <div className="flex items-center gap-3.5">
                              {/* Huy hiệu thứ hạng */}
                              <div
                                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black ${
                                  index === 0 && row.averageScorePercent !== null
                                    ? 'bg-amber-100 text-amber-800'
                                    : index === 1 && row.averageScorePercent !== null
                                    ? 'bg-slate-200 text-slate-700'
                                    : index === 2 && row.averageScorePercent !== null
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                    : 'bg-slate-100 text-slate-400'
                                }`}
                              >
                                #{index + 1}
                              </div>

                              {/* Avatar lớp */}
                              <div
                                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${getClassGradient(
                                  row.name,
                                )} text-xs font-bold text-white shadow-2xs`}
                              >
                                {getClassInitials(row.name)}
                              </div>

                              <div className="flex flex-col">
                                <Link
                                  to={classTabPath(row.classId, 'grades')}
                                  className="text-sm font-bold text-slate-800 transition hover:text-primary-600 hover:underline"
                                >
                                  {row.name}
                                </Link>
                                <span className="text-[11px] text-slate-400">
                                  Bấm để mở chi tiết bảng điểm
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Sĩ số */}
                          <td className="px-5 py-4 text-center">
                            <span className="inline-flex min-w-[32px] items-center justify-center rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                              {row.studentCount}
                            </span>
                          </td>

                          {/* Học kỳ */}
                          <td className="px-5 py-4">
                            <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                              {row.currentPeriodName ?? t('gradesOverview.noSemester')}
                            </span>
                          </td>

                          {/* Số bài kiểm tra */}
                          <td className="px-5 py-4 text-center">
                            <span className="inline-flex min-w-[32px] items-center justify-center rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 border border-blue-200/60">
                              {row.assignedTestCount} bài
                            </span>
                          </td>

                          {/* Điểm trung bình */}
                          <td className="px-5 py-4 text-right">
                            {row.averageScorePercent === null ? (
                              <span className="text-xs font-medium text-slate-400">
                                {t('gradesOverview.noData')}
                              </span>
                            ) : (
                              <div className="flex items-center justify-end gap-2">
                                <span
                                  className={`inline-flex items-center rounded-xl px-3 py-1 text-xs font-black tabular-nums shadow-2xs ${
                                    (score10 ?? 0) >= 8.0
                                      ? 'bg-emerald-50 text-emerald-800 border-2 border-emerald-300'
                                      : (score10 ?? 0) >= 5.0
                                      ? 'bg-amber-50 text-amber-800 border-2 border-amber-300'
                                      : 'bg-rose-50 text-rose-800 border-2 border-rose-300'
                                  }`}
                                >
                                  {formatScore10(row.averageScorePercent)}
                                  <span className="ml-1 text-[10px] font-bold text-slate-400">/ 10</span>
                                </span>

                                {isHighest && (
                                  <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 border border-emerald-300 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-800 shadow-2xs">
                                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                                    </svg>
                                    {t('gradesOverview.highest')}
                                  </span>
                                )}

                                {isLowest && (
                                  <span className="inline-flex items-center gap-1 rounded-lg bg-rose-100 border border-rose-300 px-2.5 py-1 text-[10px] font-black uppercase text-rose-800 shadow-2xs">
                                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                                    </svg>
                                    {t('gradesOverview.lowest')}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TeacherGradesOverviewPage;
