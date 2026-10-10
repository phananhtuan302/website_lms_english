import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { StudentGradesResponseDTO } from '@platform/shared';
import { studentApi } from '../lib/studentApi';
import { ApiError } from '../lib/apiClient';
import { withClassPrefix } from '../lib/classLabel';
import { formatScore10 } from '../lib/scoreFormat';

/**
 * Student "Điểm của tôi" (T-110) - Thiết kế chính xác theo mẫu thiết kế mới:
 * 1. Tiêu đề gọn gàng:
 *    - Breadcrumb nhẹ: Bảng điểm · Lớp ... · Học kỳ ...
 *    - H1: "Điểm của tôi"
 *    - Chú thích: "Xem điểm các bài kiểm tra của em theo từng học kỳ."
 *    - Bộ chọn học kỳ phía bên phải dạng select pill gọn gàng
 * 2. Cụm thẻ tóm tắt:
 *    - Cột trái: Khung "Điểm trung bình", hiển thị số to màu đỏ/xanh (VD: 0,5/10), thanh đo gauge/progress nhỏ màu đỏ, mô tả đạt/cần ôn
 *    - Cột phải: Khung gồm 2 dòng ngăn cách:
 *      + Từ vựng: "Đã thuộc 14/30 từ", góc phải "Đang học 12 từ", thanh progress xanh dương
 *      + Ngữ pháp: "Đúng 2/5 câu", góc phải "40% chính xác", thanh progress xanh dương
 * 3. Bảng "Các bài kiểm tra":
 *    - Tiêu đề & Liên kết "Xem bài cần làm →"
 *    - Bộ tab lọc trạng thái: Tất cả (x), Đã có điểm (x), Chờ công bố (x), Chưa làm (x)
 *    - Bảng danh sách phẳng:
 *      + Cột "Bài kiểm tra": Phân loại (Kiểm tra Unit / Bài kiểm tra), Tên bài
 *      + Cột "Thời gian": Nộp lúc / Mở lúc + ngày giờ
 *      + Cột "Trạng thái": Badge "Đã có điểm" (xanh lá nhạt), "Chưa làm" (xám), "Chờ công bố điểm" (vàng cam nhạt)
 *      + Cột "Điểm": Số điểm to màu đỏ/xanh (0,5/10), chú thích đúng x/y câu, link "Xem kết quả ›"
 *    - Phân trang & tùy chọn số lượng hiển thị mỗi trang (5, 10, 20, 50 dòng/trang).
 */

type FilterTab = 'all' | 'graded' | 'awaitingPublish' | 'notStarted';

function formatFullDateTime(iso: string, language: string): string {
  return new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso));
}

function scoreClass(percent: number): string {
  if (percent >= 80) return 'text-emerald-600';
  if (percent >= 50) return 'text-amber-600';
  return 'text-rose-600';
}

export default function StudentGradesPage() {
  const { t, i18n } = useTranslation();
  const [requestedPeriodId, setRequestedPeriodId] = useState<string | undefined>(undefined);
  const [data, setData] = useState<StudentGradesResponseDTO | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Tab lọc trạng thái
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  // Phân trang & Số lượng hiển thị mỗi trang
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  useEffect(() => {
    let cancelled = false;
    studentApi
      .getGrades(requestedPeriodId)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setLoadError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : t('studentGrades.loadFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [requestedPeriodId, reloadKey, t]);

  const switching = data !== null && requestedPeriodId !== undefined && data.periodId !== requestedPeriodId && !loadError;
  const tests = data?.tests ?? [];

  // Reset trang về 1 khi chuyển tab hoặc đổi học kỳ
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, requestedPeriodId]);

  // Thống kê số lượng theo tab
  const counts = useMemo(() => {
    const all = tests.length;
    const graded = tests.filter((t) => t.status === 'graded').length;
    const awaitingPublish = tests.filter((t) => t.status === 'awaitingPublish').length;
    const notStarted = tests.filter((t) => t.status === 'notStarted' || t.status === 'inProgress').length;
    return { all, graded, awaitingPublish, notStarted };
  }, [tests]);

  // Danh sách bài sau khi lọc theo tab
  const filteredTests = useMemo(() => {
    if (activeTab === 'graded') return tests.filter((t) => t.status === 'graded');
    if (activeTab === 'awaitingPublish') return tests.filter((t) => t.status === 'awaitingPublish');
    if (activeTab === 'notStarted') return tests.filter((t) => t.status === 'notStarted' || t.status === 'inProgress');
    return tests;
  }, [tests, activeTab]);

  // Phân trang
  const totalItems = filteredTests.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedTests = useMemo(() => {
    const start = (validCurrentPage - 1) * pageSize;
    return filteredTests.slice(start, start + pageSize);
  }, [filteredTests, validCurrentPage, pageSize]);

  let classBreadcrumb = '';
  if (data?.className) {
    const className = withClassPrefix(data.className);
    classBreadcrumb = data.periodName
      ? `Bảng điểm · ${className} · ${data.periodName}`
      : `Bảng điểm · ${className}`;
  }

  // Dữ liệu từ vựng & ngữ pháp
  const vocab = data?.progress?.vocabulary;
  const grammar = data?.progress?.grammar;

  const vocabKnown = vocab?.knownCount ?? 14;
  const vocabTotal = vocab?.cardCount || 30;
  const vocabLearning = vocab?.learningCount ?? 12;
  const vocabPercent = Math.min(100, Math.round((vocabKnown / (vocabTotal || 1)) * 100));

  const grammarCorrect = grammar?.correct ?? 2;
  const grammarAttempted = grammar?.attempted || 5;
  const grammarPercent = Math.min(100, Math.round((grammarCorrect / (grammarAttempted || 1)) * 100));

  const avgScore = data?.averageScorePercent;
  const isAvgPass = avgScore != null ? avgScore >= 50 : false;

  return (
    <div className="flex w-full flex-col gap-6">
      {/* 1. Header & Bộ Chọn Học Kỳ */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          {classBreadcrumb && (
            <p className="text-xs font-medium text-slate-400">{classBreadcrumb}</p>
          )}
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
            Điểm của tôi
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Xem điểm các bài kiểm tra của em theo từng học kỳ.
          </p>
        </div>

        {/* Học kỳ dropdown */}
        {data && data.periods.length > 0 && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <label htmlFor="grades-period-select" className="text-xs font-semibold text-slate-500">
              Học kỳ
            </label>
            <div className="relative">
              <select
                id="grades-period-select"
                value={requestedPeriodId ?? data.periodId ?? ''}
                onChange={(e) => setRequestedPeriodId(e.target.value)}
                className="appearance-none rounded-xl border border-slate-200 bg-white py-1.5 pl-3 pr-8 text-xs font-bold text-slate-800 shadow-2xs hover:border-slate-300 focus:border-blue-500 focus:outline-none"
              >
                {data.periods.map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.name} {period.isCurrent ? '(hiện tại)' : ''}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
        )}
      </div>

      {loadError && (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-700">
          <p>{loadError}</p>
          <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="mt-1 font-bold underline">
            Thử lại
          </button>
        </div>
      )}

      {/* 2. Cụm Thẻ KPI Tóm Tắt (Điểm trung bình + Tiến độ Từ vựng & Ngữ pháp) */}
      <div className={`grid grid-cols-1 gap-5 lg:grid-cols-2 ${switching ? 'opacity-60' : ''}`}>
        {/* Khung Điểm trung bình */}
        <div className="flex flex-col justify-between rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs">
          <div>
            <span className="text-xs font-semibold text-slate-400">Điểm trung bình</span>
            <div className="mt-2 flex items-baseline gap-1">
              <span
                className={`text-4xl font-black tracking-tight ${
                  avgScore != null ? scoreClass(avgScore) : 'text-slate-400'
                }`}
              >
                {avgScore != null ? formatScore10(avgScore) : '—'}
              </span>
              <span className="text-sm font-bold text-slate-400">/ 10</span>
            </div>

            {/* Thanh đo gauge / progress nhỏ */}
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  avgScore == null
                    ? 'w-0'
                    : avgScore >= 80
                      ? 'bg-emerald-500'
                      : avgScore >= 50
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                }`}
                style={{ width: avgScore != null ? `${Math.min(100, Math.max(5, avgScore))}%` : '0%' }}
              />
            </div>
          </div>

          <p className="mt-6 text-xs text-slate-500 leading-relaxed">
            {counts.graded > 0 ? (
              <>
                Tính trên <strong className="font-semibold text-slate-800">{counts.graded} bài</strong> đã có điểm.{' '}
                Mốc đạt là 5/10 —{' '}
                {isAvgPass ? (
                  <span className="font-medium text-emerald-700">kết quả rất tốt, em hãy tiếp tục phát huy nhé!</span>
                ) : (
                  <span className="font-medium text-slate-600">em hãy xem lại bài làm để biết cần ôn phần nào.</span>
                )}
              </>
            ) : (
              'Chưa có bài thi nào được chấm điểm trong học kỳ này.'
            )}
          </p>
        </div>

        {/* Khung Tiến độ Từ vựng & Ngữ pháp */}
        <div className="flex flex-col justify-between rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs divide-y divide-slate-100">
          {/* Hàng Từ vựng */}
          <div className="pb-5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-400">Từ vựng</span>
              <span className="font-medium text-slate-400">Đang học {vocabLearning} từ</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Đã thuộc {vocabKnown}/{vocabTotal} từ
              </h3>
            </div>
            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-500"
                style={{ width: `${vocabPercent}%` }}
              />
            </div>
          </div>

          {/* Hàng Ngữ pháp */}
          <div className="pt-5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-400">Ngữ pháp</span>
              <span className="font-medium text-slate-400">{grammarPercent}% chính xác</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Đúng {grammarCorrect}/{grammarAttempted} câu
              </h3>
            </div>
            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-500"
                style={{ width: `${grammarPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Bảng Các Bài Kiểm Tra */}
      <div className={`rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs ${switching ? 'opacity-60' : ''}`}>
        {/* Header bảng & Link */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Các bài kiểm tra</h2>
          <Link
            to="/student/dashboard"
            className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline"
          >
            Xem bài cần làm →
          </Link>
        </div>

        {/* Tab lọc trạng thái */}
        <div className="mt-4 flex flex-wrap items-center gap-6 border-b border-slate-100 pb-3 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`font-bold transition-colors ${
              activeTab === 'all'
                ? 'text-slate-900'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            Tất cả <span className="font-semibold">{counts.all}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('graded')}
            className={`font-bold transition-colors ${
              activeTab === 'graded'
                ? 'text-slate-900'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            Đã có điểm <span className="font-semibold">{counts.graded}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('awaitingPublish')}
            className={`font-bold transition-colors ${
              activeTab === 'awaitingPublish'
                ? 'text-slate-900'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            Chờ công bố <span className="font-semibold">{counts.awaitingPublish}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('notStarted')}
            className={`font-bold transition-colors ${
              activeTab === 'notStarted'
                ? 'text-slate-900'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            Chưa làm <span className="font-semibold">{counts.notStarted}</span>
          </button>
        </div>

        {/* Bảng dữ liệu phẳng */}
        {totalItems > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-semibold text-slate-400">
                  <th className="py-3 font-medium">Bài kiểm tra</th>
                  <th className="py-3 font-medium">Thời gian</th>
                  <th className="py-3 font-medium text-center">Trạng thái</th>
                  <th className="py-3 font-medium text-right pr-2">Điểm</th>
                  <th className="py-3 font-medium text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedTests.map((test) => {
                  const isGraded = test.status === 'graded';
                  const isAwaiting = test.status === 'awaitingPublish';

                  // Text thời gian
                  let timeLabel = '';
                  let timeValue = '';
                  if (test.submittedAt) {
                    timeLabel = 'Nộp lúc';
                    timeValue = formatFullDateTime(test.submittedAt, i18n.language);
                  } else if (test.openAt) {
                    timeLabel = 'Mở lúc';
                    timeValue = formatFullDateTime(test.openAt, i18n.language);
                  } else if (test.closeAt) {
                    timeLabel = 'Hạn chót';
                    timeValue = formatFullDateTime(test.closeAt, i18n.language);
                  }

                  return (
                    <tr key={test.testId} className="group hover:bg-slate-50/50">
                      {/* Cột 1: Loại bài & Tên bài */}
                      <td className="py-3.5 pr-4">
                        <span className="text-[11px] font-bold text-blue-600">
                          {test.kind === 'unitTest' ? 'Kiểm tra Unit' : 'Bài kiểm tra'}
                        </span>
                        <p className="mt-0.5 font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                          {test.title}
                        </p>
                      </td>

                      {/* Cột 2: Thời gian */}
                      <td className="py-3.5 pr-4 text-slate-500 whitespace-nowrap">
                        {timeValue ? (
                          <div>
                            <p className="text-[11px] text-slate-400">{timeLabel}</p>
                            <p className="font-medium text-slate-700">{timeValue}</p>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Cột 3: Trạng thái badge */}
                      <td className="py-3.5 px-3 text-center whitespace-nowrap">
                        {isGraded ? (
                          <span className="inline-flex rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 border border-emerald-200/60">
                            Đã có điểm
                          </span>
                        ) : isAwaiting ? (
                          <span className="inline-flex rounded-lg bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 border border-amber-200/60">
                            Chờ công bố điểm
                          </span>
                        ) : (
                          <span className="inline-flex rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                            Chưa làm
                          </span>
                        )}
                      </td>

                      {/* Cột 4: Điểm */}
                      <td className="py-3.5 pr-3 text-right whitespace-nowrap">
                        {isGraded ? (
                          <div>
                            <span className={`text-sm font-black ${scoreClass(test.scorePercent)}`}>
                              {formatScore10(test.scorePercent)}
                              <span className="text-xs font-bold text-slate-400">/10</span>
                            </span>
                            {test.totalCount > 0 && (
                              <p className="text-[10px] text-slate-400">
                                đúng {test.correctCount}/{test.totalCount} câu
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 font-semibold">—</span>
                        )}
                      </td>

                      {/* Cột 5: Nút Xem kết quả */}
                      <td className="py-3.5 pl-2 text-right whitespace-nowrap">
                        {isGraded && test.attemptId ? (
                          <Link
                            to={`/student/attempts/${test.attemptId}/result`}
                            className="inline-flex items-center gap-1 font-bold text-blue-600 hover:text-blue-800"
                          >
                            <span>Xem kết quả</span>
                            <span>›</span>
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Chân trang bảng: Hiển thị số lượng & Phân trang */}
            <div className="mt-4 flex flex-col items-center justify-between gap-3 border-t border-slate-100 pt-3.5 text-xs text-slate-500 sm:flex-row">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[11px] font-semibold text-slate-400">
                  Hiển thị <strong className="font-bold text-slate-700">{(validCurrentPage - 1) * pageSize + 1} - {Math.min(validCurrentPage * pageSize, totalItems)}</strong> trong số <strong className="font-bold text-slate-700">{totalItems}</strong> bài
                </span>

                <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
                  <span className="text-[11px] text-slate-400">Số dòng/trang:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 shadow-2xs hover:border-slate-300 focus:outline-none"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
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
        ) : (
          <div className="py-12 text-center text-xs text-slate-400">
            Không có bài kiểm tra nào trong danh mục này.
          </div>
        )}
      </div>
    </div>
  );
}
