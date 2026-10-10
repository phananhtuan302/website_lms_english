import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ClassOverviewDTO } from '@platform/shared';
import { useClassWorkspace } from '../../hooks/useClassWorkspace';
import { classAssignmentsPath, classTestResultsPath, formatDateTime } from '../../lib/classAssignments';
import { classTabPath } from '../../lib/classWorkspace';
import { formatScore10WithUnit } from '../../lib/scoreFormat';
import { teacherApi } from '../../lib/teacherApi';

/**
 * Custom High-End SVG Icons (Thiết kế độc quyền, trực quan & hiện đại)
 */
function StudentsIcon() {
  return (
    <svg className="h-5 w-5 sm:h-6 sm:w-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M16 19v-1.5c0-1.657-1.343-3-3-3H7c-1.657 0-3 1.343-3 3V19"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="10" cy="7.5" r="3.5" stroke="currentColor" strokeWidth="2" />
      <path
        d="M17 14.5c1.38 0 2.5 1.12 2.5 2.5V19M14 4.5a3.5 3.5 0 010 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SemesterIcon() {
  return (
    <svg className="h-5 w-5 sm:h-6 sm:w-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="4.5" width="18" height="16" rx="3.5" stroke="currentColor" strokeWidth="2" />
      <path d="M3 9.5h18" stroke="currentColor" strokeWidth="2" />
      <path d="M8 2.5v4M16 2.5v4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="8" cy="14" r="1.25" fill="currentColor" />
      <circle cx="12" cy="14" r="1.25" fill="currentColor" />
      <circle cx="16" cy="14" r="1.25" fill="currentColor" />
    </svg>
  );
}

function OpenTestsIcon() {
  return (
    <svg className="h-5 w-5 sm:h-6 sm:w-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M14 2.5H6a2.5 2.5 0 00-2.5 2.5v14A2.5 2.5 0 006 21.5h12a2.5 2.5 0 002.5-2.5V8.5L14 2.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M14 2.5v6h6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 13.5l2.5 2.5 5.5-5.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GradingPenIcon() {
  return (
    <svg className="h-5 w-5 sm:h-6 sm:w-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M17.5 3.5a2.121 2.121 0 013 3L8.5 18.5 4 20l1.5-4.5L17.5 3.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M15 6l3 3M11 16l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ClockAlertIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SubmissionListIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function ActivityPulseIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M3 12h4l3-7 4 14 3-7h4"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type ModalType = 'closingSoon' | 'needsGrading' | 'notSubmitted' | 'recentActivity' | null;

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-6 text-center text-xs font-medium text-slate-500">
      {children}
    </div>
  );
}

/**
 * Redesigned ClassOverviewTab - Thẻ Clickable mở Popup Modal chi tiết
 */
function ClassOverviewTab() {
  const { t, i18n } = useTranslation();
  const { cls } = useClassWorkspace();
  const periodId = cls.currentPeriodId;
  const viewKey = `${cls.id}:${periodId ?? ''}`;

  const [loaded, setLoaded] = useState<{ key: string; data: ClassOverviewDTO; at: number } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<ModalType>(null);

  useEffect(() => {
    if (!periodId) return;
    let cancelled = false;
    const key = `${cls.id}:${periodId}`;
    teacherApi
      .getClassOverview(cls.id)
      .then((data) => {
        if (!cancelled) setLoaded({ key, data, at: Date.now() });
      })
      .catch(() => {
        if (!cancelled) setFailedKey(key);
      });
    return () => {
      cancelled = true;
    };
  }, [cls.id, periodId]);

  const data = loaded && loaded.key === viewKey ? loaded.data : null;
  const failed = failedKey === viewKey && !data;

  function remainingText(iso: string, since: number): string {
    const hours = Math.ceil((new Date(iso).getTime() - since) / 3_600_000);
    if (hours <= 1) return t('classOverview.remaining.lessThanHour');
    if (hours < 48) return t('classOverview.remaining.hours', { count: hours });
    return t('classOverview.remaining.days', { count: Math.floor(hours / 24) });
  }

  const openValue = data ? String(data.openCount) : '—';
  const gradingCount = data ? data.needsGrading.count : 0;
  const closingSoonCount = data ? data.closingSoon.length : 0;
  const notSubmittedCount = data ? data.notSubmitted.tests.reduce((acc, curr) => acc + curr.missingCount, 0) : 0;
  const recentCount = data ? data.recentActivity.length : 0;

  return (
    <div className="flex flex-col gap-6">
      {/* 1. HÀNG 4 THẺ CHỈ SỐ KPI CHÍNH */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {/* Card 1: Học sinh */}
        <Link
          to={classTabPath(cls.id, 'students')}
          className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border-2 border-blue-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-blue-500 hover:shadow-xl"
        >
          <div className="pointer-events-none absolute -right-4 -bottom-4 h-24 w-24 rounded-full bg-blue-50 transition-transform group-hover:scale-125" />
          <div className="relative flex items-start justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
              {t('classWorkspace.overview.studentsLabel')}
            </span>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/30 transition-transform group-hover:scale-105">
              <StudentsIcon />
            </div>
          </div>
          <div className="relative mt-3">
            <span className="text-3xl font-black tracking-tight text-slate-900">{cls.studentCount}</span>
            <p className="mt-1 text-xs font-medium text-slate-500">
              {cls.studentCount === 0
                ? t('classWorkspace.overview.noStudentsHint')
                : t('classWorkspace.overview.viewStudents')}
            </p>
          </div>
        </Link>

        {/* Card 2: Học kỳ hiện tại */}
        <div className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border-2 border-indigo-200 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md">
          <div className="pointer-events-none absolute -right-4 -bottom-4 h-24 w-24 rounded-full bg-indigo-50" />
          <div className="relative flex items-start justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
              {t('classWorkspace.overview.semesterLabel')}
            </span>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/30">
              <SemesterIcon />
            </div>
          </div>
          <div className="relative mt-3">
            <p className="truncate text-lg font-black tracking-tight text-indigo-950 sm:text-xl">
              {cls.currentPeriodName || 'Chưa thiết lập'}
            </p>
            <p className="mt-1 text-xs font-medium text-slate-500">
              {cls.currentPeriodName ? 'Học kỳ đang áp dụng' : 'Vui lòng chọn học kỳ'}
            </p>
          </div>
        </div>

        {/* Card 3: Bài thi đang mở */}
        <Link
          to={classAssignmentsPath(cls.id)}
          className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border-2 border-emerald-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-emerald-500 hover:shadow-xl"
        >
          <div className="pointer-events-none absolute -right-4 -bottom-4 h-24 w-24 rounded-full bg-emerald-50 transition-transform group-hover:scale-125" />
          <div className="relative flex items-start justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
              {t('classOverview.stats.openLabel')}
            </span>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/30 transition-transform group-hover:scale-105">
              <OpenTestsIcon />
            </div>
          </div>
          <div className="relative mt-3">
            <span className="text-3xl font-black tracking-tight text-slate-900">{openValue}</span>
            <p className="mt-1 text-xs font-medium text-slate-500">{t('classOverview.stats.openHint')}</p>
          </div>
        </Link>

        {/* Card 4: Bài cần chấm */}
        <button
          type="button"
          onClick={() => setActiveModal('needsGrading')}
          className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border-2 p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 ${
            gradingCount > 0
              ? 'border-amber-400 bg-amber-50/60 hover:border-amber-500 hover:shadow-xl'
              : 'border-slate-300 bg-white hover:border-slate-400'
          }`}
        >
          <div
            className={`pointer-events-none absolute -right-4 -bottom-4 h-24 w-24 rounded-full ${
              gradingCount > 0 ? 'bg-amber-100/70' : 'bg-slate-100'
            }`}
          />
          <div className="relative flex items-start justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
              {t('classOverview.stats.gradingLabel')}
            </span>
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-md ${
                gradingCount > 0
                  ? 'bg-gradient-to-tr from-amber-500 to-orange-500 shadow-amber-500/30 animate-pulse'
                  : 'bg-gradient-to-tr from-slate-600 to-slate-500 shadow-slate-500/20'
              }`}
            >
              <GradingPenIcon />
            </div>
          </div>
          <div className="relative mt-3">
            <span className={`text-3xl font-black tracking-tight ${gradingCount > 0 ? 'text-amber-900' : 'text-slate-900'}`}>
              {data ? gradingCount : '—'}
            </span>
            <p className="mt-1 text-xs font-medium text-slate-600">
              {gradingCount > 0
                ? 'Bấm để xem danh sách bài cần chấm →'
                : t('classOverview.stats.gradingHintNone')}
            </p>
          </div>
        </button>
      </div>

      {/* 2. HÀNG 4 THẺ TỔNG QUAN TÁC VỤ (CLICK MỞ POPUP CHI TIẾT) */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Nhiệm vụ & Tiến độ lớp học</h2>
          <span className="text-xs font-medium text-slate-500">Bấm vào từng thẻ để xem bảng chi tiết</span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Sắp đóng */}
          <div
            onClick={() => setActiveModal('closingSoon')}
            className="group cursor-pointer rounded-2xl border-2 border-amber-200 bg-white p-5 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-amber-400 hover:shadow-lg"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-700 shadow-xs">
                <ClockAlertIcon />
              </div>
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
                {closingSoonCount} bài
              </span>
            </div>
            <div className="mt-4">
              <h3 className="text-base font-bold text-slate-900 group-hover:text-amber-700">
                {t('classOverview.closingSoon.heading')}
              </h3>
              <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                {t('classOverview.closingSoon.description')}
              </p>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-semibold text-amber-700">
              <span>Xem chi tiết danh sách</span>
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </div>
          </div>

          {/* Card 2: Cần chấm */}
          <div
            onClick={() => setActiveModal('needsGrading')}
            className="group cursor-pointer rounded-2xl border-2 border-rose-200 bg-white p-5 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-rose-400 hover:shadow-lg"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 shadow-xs">
                <GradingPenIcon />
              </div>
              <span className="rounded-full bg-rose-600 px-2.5 py-1 text-xs font-bold text-white shadow-xs">
                {gradingCount} bài
              </span>
            </div>
            <div className="mt-4">
              <h3 className="text-base font-bold text-slate-900 group-hover:text-rose-700">
                {t('classOverview.needsGrading.heading')}
              </h3>
              <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                {t('classOverview.needsGrading.description')}
              </p>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-semibold text-rose-700">
              <span>Chấm bài ngay</span>
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </div>
          </div>

          {/* Card 3: Chưa nộp bài */}
          <div
            onClick={() => setActiveModal('notSubmitted')}
            className="group cursor-pointer rounded-2xl border-2 border-blue-200 bg-white p-5 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-blue-400 hover:shadow-lg"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 text-blue-700 shadow-xs">
                <SubmissionListIcon />
              </div>
              <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-800">
                {notSubmittedCount} lượt
              </span>
            </div>
            <div className="mt-4">
              <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-700">
                {t('classOverview.notSubmitted.heading')}
              </h3>
              <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                {t('classOverview.notSubmitted.description')}
              </p>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-semibold text-blue-700">
              <span>Kiểm tra học sinh</span>
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </div>
          </div>

          {/* Card 4: Hoạt động gần đây */}
          <div
            onClick={() => setActiveModal('recentActivity')}
            className="group cursor-pointer rounded-2xl border-2 border-emerald-200 bg-white p-5 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-emerald-400 hover:shadow-lg"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-xs">
                <ActivityPulseIcon />
              </div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                {recentCount} lượt
              </span>
            </div>
            <div className="mt-4">
              <h3 className="text-base font-bold text-slate-900 group-hover:text-emerald-700">
                {t('classOverview.recent.heading')}
              </h3>
              <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                {t('classOverview.recent.description')}
              </p>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-semibold text-emerald-700">
              <span>Xem nhật ký nộp bài</span>
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </div>
          </div>
        </div>
      </div>

      {/* POPUP MODAL CHI TIẾT */}
      {activeModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setActiveModal(null)}
          />

          {/* Modal Container */}
          <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-3xl bg-white shadow-2xl transition-all">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {activeModal === 'closingSoon' && t('classOverview.closingSoon.heading')}
                  {activeModal === 'needsGrading' && t('classOverview.needsGrading.heading')}
                  {activeModal === 'notSubmitted' && t('classOverview.notSubmitted.heading')}
                  {activeModal === 'recentActivity' && t('classOverview.recent.heading')}
                </h3>
                <p className="text-xs text-slate-500">
                  {activeModal === 'closingSoon' && t('classOverview.closingSoon.description')}
                  {activeModal === 'needsGrading' && t('classOverview.needsGrading.description')}
                  {activeModal === 'notSubmitted' && t('classOverview.notSubmitted.description')}
                  {activeModal === 'recentActivity' && t('classOverview.recent.description')}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              >
                ✕
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Nội dung Popup Sắp đóng */}
              {activeModal === 'closingSoon' && (
                <>
                  {data?.closingSoon.length === 0 ? (
                    <EmptyState>{t('classOverview.closingSoon.empty')}</EmptyState>
                  ) : (
                    <ul className="flex flex-col divide-y divide-slate-100">
                      {data?.closingSoon.map((item) => (
                        <li key={item.testId} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
                          <Link
                            to={classTestResultsPath(cls.id, item.testId)}
                            className="text-sm font-bold text-primary-700 hover:underline"
                          >
                            {item.title}
                          </Link>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span className="font-semibold text-amber-700">
                              {t('classOverview.closingSoon.closesAt', {
                                time: formatDateTime(item.closeAt, i18n.language),
                                remaining: remainingText(item.closeAt, loaded?.at ?? 0),
                              })}
                            </span>
                            <span>•</span>
                            <span>
                              {t('classOverview.closingSoon.submitted', {
                                submitted: item.submittedCount,
                                total: item.studentCount,
                              })}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}

              {/* Nội dung Popup Cần chấm */}
              {activeModal === 'needsGrading' && (
                <>
                  {data?.needsGrading.items.length === 0 ? (
                    <EmptyState>{t('classOverview.needsGrading.empty')}</EmptyState>
                  ) : (
                    <ul className="flex flex-col divide-y divide-slate-100">
                      {data?.needsGrading.items.map((item) => (
                        <li
                          key={item.attemptId}
                          className="flex items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-slate-900">{item.studentName}</span>
                              <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                                {t('classOverview.needsGrading.ungraded', { count: item.ungradedCount })}
                              </span>
                            </div>
                            <p className="truncate text-xs font-medium text-slate-600">{item.testTitle}</p>
                            <p className="text-[11px] text-slate-400">
                              {t('classOverview.needsGrading.submittedAt', {
                                time: formatDateTime(item.submittedAt, i18n.language),
                              })}
                            </p>
                          </div>
                          <Link
                            to={`/teacher/attempts/${encodeURIComponent(item.attemptId)}`}
                            className="shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 active:scale-95"
                          >
                            {t('classOverview.needsGrading.grade')}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}

              {/* Nội dung Popup Chưa nộp bài */}
              {activeModal === 'notSubmitted' && (
                <>
                  {data?.notSubmitted.tests.length === 0 ? (
                    <EmptyState>{t('classOverview.notSubmitted.empty')}</EmptyState>
                  ) : (
                    <ul className="flex flex-col divide-y divide-slate-100">
                      {data?.notSubmitted.tests.map((item) => (
                        <li key={item.testId} className="flex flex-col gap-1.5 py-3.5 first:pt-0 last:pb-0">
                          <div className="flex items-center justify-between gap-2">
                            <Link
                              to={classTestResultsPath(cls.id, item.testId)}
                              className="text-sm font-bold text-primary-700 hover:underline"
                            >
                              {item.title}
                            </Link>
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                                item.closed ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {item.closed
                                ? t('classOverview.notSubmitted.statusClosed')
                                : t('classOverview.notSubmitted.statusClosing')}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500">
                            {t('classOverview.notSubmitted.missing', { count: item.missingCount })} •{' '}
                            {formatDateTime(item.closeAt, i18n.language)}
                          </p>
                          <p className="text-xs text-slate-700">
                            <span className="font-semibold text-slate-900">Danh sách: </span>
                            {item.students.map((student) => student.name).join(', ')}
                            {item.moreCount > 0 && (
                              <span className="font-semibold text-slate-500"> +{item.moreCount} học sinh khác</span>
                            )}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}

              {/* Nội dung Popup Hoạt động gần đây */}
              {activeModal === 'recentActivity' && (
                <>
                  {data?.recentActivity.length === 0 ? (
                    <EmptyState>{t('classOverview.recent.empty')}</EmptyState>
                  ) : (
                    <ul className="flex flex-col divide-y divide-slate-100">
                      {data?.recentActivity.map((item) => (
                        <li
                          key={item.attemptId}
                          className="flex items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900">{item.studentName}</p>
                            <p className="truncate text-xs font-medium text-slate-600">{item.testTitle}</p>
                            <p className="text-[11px] text-slate-400">
                              {formatDateTime(item.submittedAt, i18n.language)}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-black text-primary-700">
                              {item.scoresPublished && item.scorePercent !== null
                                ? formatScore10WithUnit((item.scorePercent / 100) * 10)
                                : 'Đang chờ chấm'}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end border-t border-slate-100 px-6 py-3.5">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ClassOverviewTab;
