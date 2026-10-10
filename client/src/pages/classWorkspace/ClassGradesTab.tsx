import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ClassGradebookDTO } from '@platform/shared';
import HorizontalScrollHint from '../../components/HorizontalScrollHint';
import { useClassWorkspace } from '../../hooks/useClassWorkspace';
import { classTabPath } from '../../lib/classWorkspace';
import { downloadGradebookXlsx, type GradebookExportLabels } from '../../lib/gradebookExcelExport';
import { formatScore10, percentToScore10 } from '../../lib/scoreFormat';
import { teacherApi } from '../../lib/teacherApi';

/** How long the "Đã tải …" message stays under the export button. */
const DOWNLOAD_MESSAGE_MS = 8000;

/** Small "*" after a provisional score ("tạm tính"), readable by screen readers as well. */
function ProvisionalMark({ label }: { label: string }) {
  return (
    <span className="relative ml-0.5">
      <span aria-hidden="true" className="font-bold text-amber-600">
        *
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Chuẩn hóa chuỗi tiếng Việt để tìm kiếm không dấu */
function normalizeForSearch(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd');
}

/** Tạo màu avatar ngẫu nhiên nhưng ổn định dựa trên tên */
const AVATAR_GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-violet-500 to-purple-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-cyan-500 to-blue-600',
];

function getAvatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[index];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return 'HS';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Render điểm số với badge màu trực quan theo thang điểm 10 */
function ScoreBadge({
  percent,
  isProvisional = false,
  muted = false,
  isAverage = false,
  provisionalLabel,
}: {
  percent: number | null | undefined;
  isProvisional?: boolean;
  muted?: boolean;
  isAverage?: boolean;
  provisionalLabel: string;
}) {
  if (percent === null || percent === undefined || Number.isNaN(percent)) {
    return <span className="font-medium text-slate-300 select-none">—</span>;
  }

  const score10 = percentToScore10(percent);
  const formatted = formatScore10(percent);

  let colorClasses = '';
  if (muted) {
    colorClasses = 'bg-slate-100 text-slate-400 border border-slate-200/60';
  } else if (score10 >= 8.0) {
    colorClasses = isAverage
      ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold'
      : 'bg-emerald-50/80 text-emerald-700 border border-emerald-200/80';
  } else if (score10 >= 5.0) {
    colorClasses = isAverage
      ? 'bg-amber-50 text-amber-800 border border-amber-300 font-bold'
      : 'bg-amber-50/80 text-amber-700 border border-amber-200/80';
  } else {
    colorClasses = isAverage
      ? 'bg-rose-50 text-rose-800 border border-rose-300 font-bold'
      : 'bg-rose-50/80 text-rose-700 border border-rose-200/80';
  }

  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg px-2.5 py-1 text-xs font-bold tabular-nums transition-transform duration-100 hover:scale-105 ${colorClasses}`}
    >
      <span>{formatted}</span>
      {isProvisional && <ProvisionalMark label={provisionalLabel} />}
    </span>
  );
}

/**
 * Tab "Điểm số" - Bảng điểm lớp học phong cách hiện đại, trực quan, hỗ trợ tìm kiếm học sinh,
 * phân loại màu sắc theo thang điểm, thẻ tóm tắt nhanh và xuất file Excel.
 */
function ClassGradesTab() {
  const { t } = useTranslation();
  const { cls } = useClassWorkspace();
  const periodKey = cls.currentPeriodId ?? '';

  const [loaded, setLoaded] = useState<{ key: string; gradebook: ClassGradebookDTO } | null>(null);
  const [failed, setFailed] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const downloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    teacherApi
      .getClassGradebook(cls.id)
      .then((gradebook) => {
        if (cancelled) return;
        setLoaded({ key: periodKey, gradebook });
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [cls.id, periodKey]);

  useEffect(
    () => () => {
      if (downloadTimer.current) clearTimeout(downloadTimer.current);
    },
    [],
  );

  const gradebook = loaded && loaded.key === periodKey ? loaded.gradebook : null;

  // Lọc học sinh theo từ khóa tìm kiếm
  const filteredStudents = useMemo(() => {
    if (!gradebook) return [];
    const query = normalizeForSearch(searchQuery.trim());
    if (!query) return gradebook.students;
    return gradebook.students.filter((student) => normalizeForSearch(student.name).includes(query));
  }, [gradebook, searchQuery]);

  // Thống kê nhanh toàn lớp
  const quickStats = useMemo(() => {
    if (!gradebook || gradebook.students.length === 0) return null;
    const avgValues = Object.values(gradebook.studentAverages).filter(
      (v): v is number => v !== null && v !== undefined && !Number.isNaN(v),
    );
    if (avgValues.length === 0) return null;
    const totalAvgPercent = avgValues.reduce((sum, v) => sum + v, 0) / avgValues.length;
    const avgScore10 = percentToScore10(totalAvgPercent);
    const goodCount = avgValues.filter((v) => percentToScore10(v) >= 8.0).length;
    const passCount = avgValues.filter((v) => {
      const s = percentToScore10(v);
      return s >= 5.0 && s < 8.0;
    }).length;
    const belowCount = avgValues.filter((v) => percentToScore10(v) < 5.0).length;

    return {
      classAvg: formatScore10(totalAvgPercent),
      avgScore10,
      goodCount,
      passCount,
      belowCount,
      gradedCount: avgValues.length,
    };
  }, [gradebook]);

  if (failed && !gradebook) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        <p className="font-semibold">{t('classGrades.loadFailed')}</p>
      </div>
    );
  }

  if (!gradebook) {
    return (
      <div className="flex items-center gap-3 py-12 text-sm font-medium text-slate-500">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
        <span>{t('common.loading')}</span>
      </div>
    );
  }

  const hasGrid = gradebook.students.length > 0 && gradebook.tests.length > 0;
  const hasUnpublished = gradebook.tests.some((test) => !test.scoresPublished);
  const hasAnySubmission = Object.values(gradebook.cells).some((row) =>
    Object.values(row ?? {}).some((cell) => cell),
  );

  const isProvisional = (studentId: string, testId: string) =>
    gradebook.cells[studentId]?.[testId]?.provisional === true;
  const hasProvisional = gradebook.students.some((student) =>
    gradebook.tests.some((test) => isProvisional(student.id, test.id)),
  );

  const handleExport = () => {
    setExportFailed(false);
    setDownloadMessage(null);
    if (downloadTimer.current) clearTimeout(downloadTimer.current);
    const now = new Date();
    const two = (n: number) => String(n).padStart(2, '0');
    const labels: GradebookExportLabels = {
      sheetName: t('classGrades.export.sheetName'),
      title: t('scoring.excel.title'),
      classLine: t('scoring.excel.classLine', { className: cls.name.replace(/^lớp\s+/i, '').trim() || cls.name }),
      semesterLine: t('scoring.excel.semesterLine', {
        semester: cls.currentPeriodName ?? t('scoring.excel.noSemester'),
      }),
      exportDateLine: t('scoring.excel.exportDate', {
        date: `${two(now.getDate())}/${two(now.getMonth() + 1)}/${now.getFullYear()}`,
      }),
      scaleLine: t('scoring.excel.scaleLine'),
      sttHeader: t('scoring.excel.stt'),
      studentHeader: t('scoring.excel.student'),
      averageHeader: t('scoring.excel.average'),
      noteHeader: t('scoring.excel.note'),
      notSubmitted: t('scoring.excel.notSubmitted'),
      provisionalNote: t('scoring.excel.provisionalNote'),
      statusRowLabel: t('scoring.excel.statusRow'),
      released: t('scoring.excel.released'),
      notReleased: t('scoring.excel.notReleased'),
      classAverageLabel: t('scoring.excel.classAverage'),
    };
    try {
      const fileName = downloadGradebookXlsx(gradebook, labels, t('classGrades.export.fileName', { className: cls.name }));
      setDownloadMessage(t('scoring.download.done', { fileName }));
      downloadTimer.current = setTimeout(() => setDownloadMessage(null), DOWNLOAD_MESSAGE_MS);
    } catch {
      setExportFailed(true);
    }
  };

  let emptyMessage: string | null = null;
  if (cls.currentPeriodId === null || gradebook.periodId === null) {
    emptyMessage = t('classGrades.noSemester');
  } else if (gradebook.students.length === 0) {
    emptyMessage = t('classGrades.noStudents');
  } else if (gradebook.tests.length === 0) {
    emptyMessage = t('classGrades.noTests');
  }

  return (
    <section className="flex flex-col gap-5">
      {/* 1. Header Toolbar & Export Button */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">{t('classGrades.heading')}</h2>
            {cls.currentPeriodName && (
              <span className="rounded-lg bg-primary-50 px-2.5 py-0.5 text-xs font-semibold text-primary-700 border border-primary-200/60">
                {cls.currentPeriodName}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-3">
            <Link
              to="/teacher/grades-overview"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 hover:underline"
            >
              <span>{t('classGrades.compareLink')}</span>
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>
          </div>
        </div>

        {hasGrid && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-600/30 bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM6 20V4h7v5h5v11H6z" />
                <path d="M8.5 12.5l2 3.5-2 3.5h1.8l1.1-2.1 1.1 2.1h1.8l-2-3.5 2-3.5h-1.8l-1.1 2.1-1.1-2.1H8.5z" />
              </svg>
              <span>{t('classGrades.exportButton')}</span>
            </button>
          </div>
        )}
      </div>

      {/* Thông báo tải file thành công / lỗi */}
      {downloadMessage && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-800"
        >
          <svg className="h-4 w-4 shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          <span>{downloadMessage}</span>
        </div>
      )}

      {exportFailed && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">
          {t('classGrades.exportFailed')}
        </p>
      )}

      {/* 2. Thẻ Thống Kê Tổng Quan Điểm Số Lớp Học */}
      {hasGrid && quickStats && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {/* Card 1: Điểm TB Lớp */}
          <div className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border-2 border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md">
            <div className="pointer-events-none absolute -right-4 -bottom-4 h-24 w-24 rounded-full bg-slate-100/70" />
            <div className="relative flex items-start justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Điểm TB Lớp</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-slate-700 to-slate-900 text-white shadow-md shadow-slate-900/20">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
            </div>
            <div className="relative mt-3">
              <div className="flex items-baseline gap-1.5">
                <span
                  className={`text-3xl font-black tracking-tight tabular-nums ${
                    quickStats.avgScore10 >= 8.0
                      ? 'text-emerald-600'
                      : quickStats.avgScore10 >= 5.0
                      ? 'text-amber-600'
                      : 'text-rose-600'
                  }`}
                >
                  {quickStats.classAvg}
                </span>
                <span className="text-xs font-bold text-slate-400">/ 10</span>
              </div>
              <p className="mt-1 text-xs font-medium text-slate-500">
                Đã tính trên {quickStats.gradedCount} học sinh có điểm
              </p>
            </div>
          </div>

          {/* Card 2: Giỏi */}
          <div className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border-2 border-emerald-300 bg-white p-5 shadow-sm transition-all duration-200 hover:border-emerald-500 hover:shadow-md">
            <div className="pointer-events-none absolute -right-4 -bottom-4 h-24 w-24 rounded-full bg-emerald-50 transition-transform group-hover:scale-125" />
            <div className="relative flex items-start justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">Giỏi (≥ 8.0)</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/30">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <div className="relative mt-3">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black tracking-tight text-emerald-700">{quickStats.goodCount}</span>
                <span className="text-xs font-semibold text-emerald-800">học sinh</span>
              </div>
              <p className="mt-1 text-xs font-medium text-emerald-700/80">
                {Math.round((quickStats.goodCount / gradebook.students.length) * 100)}% tổng số học sinh
              </p>
            </div>
          </div>

          {/* Card 3: Đạt */}
          <div className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border-2 border-amber-300 bg-white p-5 shadow-sm transition-all duration-200 hover:border-amber-500 hover:shadow-md">
            <div className="pointer-events-none absolute -right-4 -bottom-4 h-24 w-24 rounded-full bg-amber-50 transition-transform group-hover:scale-125" />
            <div className="relative flex items-start justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-800">Đạt (5.0 - 7.9)</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/30">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
            </div>
            <div className="relative mt-3">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black tracking-tight text-amber-700">{quickStats.passCount}</span>
                <span className="text-xs font-semibold text-amber-800">học sinh</span>
              </div>
              <p className="mt-1 text-xs font-medium text-amber-700/80">
                {Math.round((quickStats.passCount / gradebook.students.length) * 100)}% tổng số học sinh
              </p>
            </div>
          </div>

          {/* Card 4: Cần cố gắng */}
          <div className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border-2 border-rose-300 bg-white p-5 shadow-sm transition-all duration-200 hover:border-rose-500 hover:shadow-md">
            <div className="pointer-events-none absolute -right-4 -bottom-4 h-24 w-24 rounded-full bg-rose-50 transition-transform group-hover:scale-125" />
            <div className="relative flex items-start justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-800">Cần cố gắng (&lt; 5.0)</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-rose-500 to-red-600 text-white shadow-md shadow-rose-500/30">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>
            <div className="relative mt-3">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black tracking-tight text-rose-700">{quickStats.belowCount}</span>
                <span className="text-xs font-semibold text-rose-800">học sinh</span>
              </div>
              <p className="mt-1 text-xs font-medium text-rose-700/80">
                {Math.round((quickStats.belowCount / gradebook.students.length) * 100)}% tổng số học sinh
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Trường hợp trống dữ liệu */}
      {emptyMessage !== null && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-xs">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="mt-3 text-sm font-medium text-slate-600">{emptyMessage}</p>
          {cls.currentPeriodId !== null &&
            gradebook.students.length > 0 &&
            gradebook.tests.length === 0 && (
              <p className="mt-3">
                <Link
                  to={classTabPath(cls.id, 'assignments')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-primary-200 bg-primary-50 px-3.5 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-100"
                >
                  <span>{t('classGrades.noTestsLink')}</span>
                  <span>→</span>
                </Link>
              </p>
            )}
        </div>
      )}

      {/* 3. Bảng Điểm Chính (Grid) */}
      {hasGrid && (
        <div className="flex flex-col gap-3">
          {/* Toolbar tìm kiếm & ghi chú trên thanh bảng */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:w-72">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm tên học sinh trong bảng..."
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
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>≥ 8.0 Giỏi</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <span>5.0 - 7.9 Đạt</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                <span>&lt; 5.0 Yếu</span>
              </span>
            </div>
          </div>

          {!hasAnySubmission && (
            <p
              role="status"
              className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800"
            >
              {t('classGrades.noSubmissions')}
            </p>
          )}

          {/* Bảng điểm với viền và shadow cao cấp */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <HorizontalScrollHint
              className="max-h-[68vh] overflow-auto"
              role="region"
              aria-label={t('classGrades.gridAriaLabel')}
              tabIndex={0}
            >
              <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    {/* Cột Học Sinh (Sticky Trái) */}
                    <th
                      scope="col"
                      className="sticky left-0 top-0 z-30 min-w-[13rem] border-b border-r border-slate-200 bg-slate-50/95 backdrop-blur-xs px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-slate-600 shadow-[1px_0_0_0_#e2e8f0]"
                    >
                      {t('classGrades.studentColumn')}
                    </th>

                    {/* Danh sách các bài kiểm tra */}
                    {gradebook.tests.map((test) => (
                      <th
                        key={test.id}
                        scope="col"
                        className="sticky top-0 z-20 min-w-[11rem] max-w-[14rem] border-b border-r border-slate-200 bg-slate-50/95 backdrop-blur-xs px-3.5 py-3 text-left align-top"
                      >
                        <Link
                          to={classTabPath(cls.id, `tests/${test.id}/results`)}
                          title={t('classGrades.headerTitle')}
                          className="group block text-xs font-bold text-slate-800 transition hover:text-primary-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500"
                        >
                          <span className="line-clamp-2 leading-relaxed group-hover:underline">
                            {test.title}
                          </span>
                        </Link>
                        {!test.scoresPublished && (
                          <span className="mt-1.5 inline-block rounded-md bg-amber-100/80 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                            {t('classGrades.unpublishedBadge')}
                          </span>
                        )}
                      </th>
                    ))}

                    {/* Cột Trung Bình (Sticky Phải) */}
                    <th
                      scope="col"
                      className="sticky top-0 z-20 min-w-[7.5rem] border-b border-slate-200 bg-slate-100/90 backdrop-blur-xs px-4 py-3.5 text-center text-xs font-bold uppercase tracking-wider text-slate-700"
                    >
                      {t('classGrades.averageColumn')}
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td
                        colSpan={gradebook.tests.length + 2}
                        className="p-8 text-center text-xs text-slate-400"
                      >
                        Không tìm thấy học sinh nào phù hợp với từ khóa &ldquo;{searchQuery}&rdquo;
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((student) => (
                      <tr key={student.id} className="group transition-colors hover:bg-slate-50/70">
                        {/* Học sinh cell: Avatar gradient + Tên */}
                        <th
                          scope="row"
                          className="sticky left-0 z-10 border-b border-r border-slate-100 bg-white px-4 py-3 text-left font-medium text-slate-900 shadow-[1px_0_0_0_#f1f5f9] group-hover:bg-slate-50"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${getAvatarGradient(
                                student.name,
                              )} text-xs font-bold text-white shadow-2xs`}
                            >
                              {getInitials(student.name)}
                            </div>
                            <span className="text-xs font-semibold text-slate-800 group-hover:text-primary-700">
                              {student.name}
                            </span>
                          </div>
                        </th>

                        {/* Điểm từng bài kiểm tra */}
                        {gradebook.tests.map((test) => {
                          const cell = gradebook.cells[student.id]?.[test.id] ?? null;
                          const muted = !test.scoresPublished;
                          return (
                            <td
                              key={test.id}
                              data-muted={muted ? 'true' : undefined}
                              className={`border-b border-r border-slate-100 px-3 py-3 text-center ${
                                muted ? 'bg-slate-50/30' : ''
                              }`}
                            >
                              {cell ? (
                                <Link
                                  to={`/teacher/attempts/${cell.attemptId}`}
                                  title={
                                    cell.provisional
                                      ? t('scoring.gradebook.cellTitleProvisional', {
                                          correct: cell.correctCount,
                                          total: cell.totalCount,
                                          count: cell.ungradedCount,
                                        })
                                      : t('classGrades.cellTitle', {
                                          correct: cell.correctCount,
                                          total: cell.totalCount,
                                        })
                                  }
                                  className="inline-block focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500"
                                >
                                  <ScoreBadge
                                    percent={cell.scorePercent}
                                    isProvisional={cell.provisional}
                                    muted={muted}
                                    provisionalLabel={t('scoring.provisional.short')}
                                  />
                                </Link>
                              ) : (
                                <span
                                  className="text-xs font-semibold text-slate-300 select-none"
                                  title={t('classGrades.notSubmittedTitle')}
                                >
                                  —
                                </span>
                              )}
                            </td>
                          );
                        })}

                        {/* Điểm trung bình của học sinh */}
                        <td className="border-b border-slate-100 bg-slate-50/50 px-3.5 py-3 text-center">
                          <ScoreBadge
                            percent={gradebook.studentAverages[student.id] ?? null}
                            isProvisional={gradebook.tests.some((test) => isProvisional(student.id, test.id))}
                            isAverage
                            provisionalLabel={t('scoring.provisional.short')}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>

                {/* Hàng Trung Bình Cả Lớp (Footer) */}
                <tfoot>
                  <tr className="bg-slate-100/90 font-semibold">
                    <th
                      scope="row"
                      className="sticky bottom-0 left-0 z-30 border-r border-t-2 border-slate-300 bg-slate-100 px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-700 shadow-[1px_0_0_0_#cbd5e1]"
                    >
                      {t('classGrades.averageRow')}
                    </th>
                    {gradebook.tests.map((test) => (
                      <td
                        key={test.id}
                        className="sticky bottom-0 z-20 border-r border-t-2 border-slate-300 bg-slate-100 px-3 py-3 text-center"
                      >
                        <ScoreBadge
                          percent={gradebook.testAverages[test.id] ?? null}
                          isProvisional={gradebook.students.some((student) => isProvisional(student.id, test.id))}
                          isAverage
                          provisionalLabel={t('scoring.provisional.short')}
                        />
                      </td>
                    ))}
                    <td className="sticky bottom-0 z-20 border-t-2 border-slate-300 bg-slate-100 text-center" />
                  </tr>
                </tfoot>
              </table>
            </HorizontalScrollHint>
          </div>

          {/* Ghi chú chân trang phong cách badge / alert tinh tế */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200/80 bg-slate-50/60 px-4 py-3 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">Ghi chú:</span>
            <span>• {t('classGrades.footnoteBest')}</span>
            <span>• {t('classGrades.footnoteNotSubmitted')}</span>
            <span>• {t('scoring.gradebook.scaleNote')}</span>
            {hasProvisional && (
              <span className="text-amber-700 font-medium">
                • {t('scoring.gradebook.legend')}
              </span>
            )}
            {hasUnpublished && (
              <span className="text-amber-700 font-medium">
                • {t('classGrades.footnoteUnpublished')}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default ClassGradesTab;

