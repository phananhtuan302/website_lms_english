import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { APP_NAME } from '@platform/shared';
import { useAuth } from '../context/useAuth';
import { dashboardPathForRole } from '../lib/roles';
import { teacherApi } from '../lib/teacherApi';

interface DashboardStats {
  testsCount: number | null;
  flashcardsCount: number | null;
  grammarCount: number | null;
  classesCount: number | null;
}

function HomePage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const dashboardPath = user ? dashboardPathForRole(user.role) : '/student/dashboard';

  const [stats, setStats] = useState<DashboardStats>({
    testsCount: null,
    flashcardsCount: null,
    grammarCount: null,
    classesCount: null,
  });

  useEffect(() => {
    let cancelled = false;
    if (user?.role === 'teacher' || user?.role === 'admin') {
      Promise.allSettled([
        teacherApi.listTests(),
        teacherApi.listFlashcardSets(),
        teacherApi.listGrammarTopics(),
        teacherApi.listClasses(),
      ]).then(([tests, flashcards, grammar, classes]) => {
        if (cancelled) return;
        setStats({
          testsCount: tests.status === 'fulfilled' ? tests.value.length : 0,
          flashcardsCount: flashcards.status === 'fulfilled' ? flashcards.value.length : 0,
          grammarCount: grammar.status === 'fulfilled' ? grammar.value.length : 0,
          classesCount: classes.status === 'fulfilled' ? classes.value.length : 0,
        });
      });
    }
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Greeting helper based on local time
  const currentHour = new Date().getHours();
  const greeting =
    currentHour < 12
      ? 'Chào buổi sáng'
      : currentHour < 18
        ? 'Chào buổi chiều'
        : 'Chào buổi tối';

  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* 1. HERO BANNER - Sinh động, truyền cảm hứng & hành động trực tiếp */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-700 via-indigo-700 to-primary-700 p-7 sm:p-10 text-white shadow-xl">
        {/* Họa tiết trang trí nền */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-16 left-1/3 h-64 w-64 rounded-full bg-blue-400/20 blur-2xl" />

        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur-md">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Nền tảng học tập & Khảo thí Tiếng Anh</span>
              {user && (
                <span className="rounded-full bg-white/20 px-2 py-0.5 uppercase tracking-wider text-[10px]">
                  {user.role}
                </span>
              )}
            </div>

            <h1 className="text-2xl font-black tracking-tight sm:text-4xl text-white">
              {user ? `${greeting}, ${user.name}!` : `Chào mừng đến với ${APP_NAME}!`}
            </h1>

            <p className="text-sm leading-relaxed text-blue-100 sm:text-base">
              Nền tảng toàn diện tích hợp kiểm tra đánh giá, xáo trộn câu hỏi tự động, luyện thi Speaking AI,
              kho thẻ từ vựng tương tác và thực hành ngữ pháp chuyên sâu.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              {user ? (
                <>
                  <Link
                    to={dashboardPath}
                    className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-blue-800 shadow-md transition-all hover:bg-blue-50 hover:shadow-lg active:scale-95"
                  >
                    <span>Vào không gian làm việc</span>
                    <span>→</span>
                  </Link>

                  {user.role === 'student' && (
                    <Link
                      to="/join"
                      className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/20"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                      </svg>
                      <span>Vào phòng thi (Mã PIN / QR)</span>
                    </Link>
                  )}

                  {user.role === 'teacher' && (
                    <Link
                      to="/teacher/library"
                      className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/20"
                    >
                      <span>Kho bài soạn</span>
                      <span>→</span>
                    </Link>
                  )}
                </>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    to="/login"
                    className="rounded-xl bg-white px-6 py-2.5 text-sm font-bold text-blue-800 shadow-md hover:bg-blue-50"
                  >
                    Đăng nhập ngay
                  </Link>
                  <Link
                    to="/register"
                    className="rounded-xl border border-white/30 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-sm hover:bg-white/20"
                  >
                    Đăng ký học sinh mới
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Quick Info Box góc phải của Banner */}
          <div className="shrink-0 rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur-md lg:w-72">
            <div className="flex items-center gap-3 border-b border-white/10 pb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/20 text-emerald-300">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-blue-100 font-medium">Hệ thống sẵn sàng</p>
                <p className="text-sm font-bold text-white">Chấm thi & Đánh giá AI</p>
              </div>
            </div>
            <div className="mt-3 space-y-2 text-xs text-blue-100">
              <div className="flex items-center justify-between">
                <span>Chế độ thi:</span>
                <span className="font-semibold text-white">Tập trung / Chống gian lận</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Điểm danh & Vào bài:</span>
                <span className="font-semibold text-white">Quét QR Code tức thì</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Luyện phát âm:</span>
                <span className="font-semibold text-white">Hỗ trợ thu âm micro</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. CHỈ SỐ NHANH (KPI STATS TIỆN ÍCH) */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs transition-all hover:border-blue-300 hover:shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Đề kiểm tra</p>
              <p className="text-lg font-bold text-slate-900">
                {stats.testsCount !== null ? `${stats.testsCount} bài thi` : 'Khảo thí Live'}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs transition-all hover:border-emerald-300 hover:shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Bộ từ vựng</p>
              <p className="text-lg font-bold text-slate-900">
                {stats.flashcardsCount !== null ? `${stats.flashcardsCount} bộ thẻ` : 'Flashcards'}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs transition-all hover:border-amber-300 hover:shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Ngữ pháp</p>
              <p className="text-lg font-bold text-slate-900">
                {stats.grammarCount !== null ? `${stats.grammarCount} chủ đề` : 'Chuyên đề'}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs transition-all hover:border-indigo-300 hover:shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Lớp học</p>
              <p className="text-lg font-bold text-slate-900">
                {stats.classesCount !== null ? `${stats.classesCount} lớp học` : 'Quản lý lớp'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. BẢNG 4 TÍNH NĂNG TRỌNG TÂM (INTERACTIVE CARDS) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black tracking-tight text-slate-900 sm:text-xl">
              Hệ thống chức năng cốt lõi
            </h2>
            <p className="text-xs text-slate-500">
              Khám phá và truy cập nhanh các tính năng chính của phần mềm
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {/* Card 1: Khảo thí & Phòng thi Live QR */}
          <Link
            to={user?.role === 'student' ? '/student/assignments' : user?.role === 'admin' ? '/admin/tests' : '/teacher/tests'}
            className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-blue-400 hover:shadow-lg"
          >
            <div className="flex items-start justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 group-hover:bg-blue-100">
                Live & Tự luyện
              </span>
            </div>

            <div className="mt-4">
              <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-600">
                Bài kiểm tra & Phòng thi Live QR
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                Soạn bài trắc nghiệm, tự luận, điền từ, nghe - nói. Giáo viên khởi tạo phiên thi trực tiếp với mã QR Code & PIN, theo dõi học sinh nộp bài theo thời gian thực và tự động đảo đề.
              </p>
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-semibold text-blue-600">
              <span>{user?.role === 'student' ? 'Làm bài kiểm tra ngay' : 'Quản lý danh sách bài test'}</span>
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </div>
          </Link>

          {/* Card 2: Từ vựng Flashcard & Minigame */}
          <Link
            to={user?.role === 'student' ? '/student/flashcard-sets' : user?.role === 'admin' ? '/admin/flashcard-sets' : '/teacher/flashcard-sets'}
            className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-emerald-400 hover:shadow-lg"
          >
            <div className="flex items-start justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 transition-colors group-hover:bg-emerald-600 group-hover:text-white">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 group-hover:bg-emerald-100">
                Gợi ý từ điển offline
              </span>
            </div>

            <div className="mt-4">
              <h3 className="text-base font-bold text-slate-900 group-hover:text-emerald-600">
                Kho thẻ từ vựng & Arcade Games
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                Học từ vựng qua Flashcard lật thẻ, âm thanh, phiên âm IPA tự động tra cứu hơn 91.000 từ. Trải nghiệm các trò chơi Arcade sinh động như Bắn tàu vũ trụ (Space Shooter), Đố vui từ vựng.
              </p>
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-semibold text-emerald-600">
              <span>{user?.role === 'student' ? 'Học từ vựng & Chơi game' : 'Quản lý kho bộ thẻ từ vựng'}</span>
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </div>
          </Link>

          {/* Card 3: Chuyên đề ngữ pháp & CKEditor */}
          <Link
            to={user?.role === 'student' ? '/student/grammar-topics' : user?.role === 'admin' ? '/admin/grammar-topics' : '/teacher/grammar-topics'}
            className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-amber-400 hover:shadow-lg"
          >
            <div className="flex items-start justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 transition-colors group-hover:bg-amber-600 group-hover:text-white">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 group-hover:bg-amber-100">
                Soạn thảo CKEditor
              </span>
            </div>

            <div className="mt-4">
              <h3 className="text-base font-bold text-slate-900 group-hover:text-amber-600">
                Chuyên đề Ngữ pháp & Luyện tập
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                Hệ thống lý thuyết phong phú được định dạng trực quan với bảng biểu, công thức và màu sắc nổi bật. Kèm hệ thống câu hỏi trắc nghiệm, đúng/sai, điền khuyết tự động chấm điểm.
              </p>
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-semibold text-amber-600">
              <span>{user?.role === 'student' ? 'Ôn tập ngữ pháp ngay' : 'Quản lý chuyên đề ngữ pháp'}</span>
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </div>
          </Link>

          {/* Card 4: Lớp học & Bảng tổng hợp điểm số */}
          <Link
            to={user?.role === 'student' ? '/student/grades' : user?.role === 'admin' ? '/admin/classes' : '/teacher/grades-overview'}
            className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-indigo-400 hover:shadow-lg"
          >
            <div className="flex items-start justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-600 group-hover:text-white">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700 group-hover:bg-indigo-100">
                Thống kê chi tiết
              </span>
            </div>

            <div className="mt-4">
              <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-600">
                Lớp học & Tổng quan Điểm số
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                Theo dõi tiến độ làm bài, bảng điểm trung bình, xếp loại học lực theo từng học kỳ. Hỗ trợ chấm bài thi tự luận/Speaking và xuất báo cáo kết quả đánh giá cho cả lớp.
              </p>
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-semibold text-indigo-600">
              <span>{user?.role === 'student' ? 'Xem kết quả & Điểm số' : 'Xem tổng quan điểm lớp học'}</span>
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </div>
          </Link>
        </div>
      </section>

      {/* 4. PHÍM TẮT THAO TÁC NHANH (QUICK ACTIONS) */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Lối tắt thao tác nhanh</h3>
          <span className="text-xs text-slate-400">Thao tác phổ biến</span>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {user?.role === 'teacher' && (
            <>
              <Link
                to="/teacher/tests"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                <span>➕</span>
                <span>Tạo bài test mới</span>
              </Link>
              <Link
                to="/teacher/flashcard-sets"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                <span>🎴</span>
                <span>Tạo bộ thẻ từ vựng</span>
              </Link>
              <Link
                to="/teacher/classes"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                <span>👥</span>
                <span>Quản lý danh sách lớp</span>
              </Link>
            </>
          )}

          {user?.role === 'student' && (
            <>
              <Link
                to="/join"
                className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100"
              >
                <span>🎯</span>
                <span>Vào phòng thi ngay</span>
              </Link>
              <Link
                to="/student/flashcard-sets"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                <span>🚀</span>
                <span>Chơi game Space Shooter</span>
              </Link>
              <Link
                to="/student/grammar-topics"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                <span>📖</span>
                <span>Luyện bài tập ngữ pháp</span>
              </Link>
            </>
          )}

          {user?.role === 'admin' && (
            <>
              <Link
                to="/admin/users"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                <span>👤</span>
                <span>Quản lý người dùng</span>
              </Link>
              <Link
                to="/admin/tests"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                <span>📝</span>
                <span>Tất cả bài kiểm tra</span>
              </Link>
              <Link
                to="/admin/settings"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                <span>⚙️</span>
                <span>Cài đặt hệ thống</span>
              </Link>
            </>
          )}

          <Link
            to="/vocab-leaderboard"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <span>🏆</span>
            <span>Bảng xếp hạng từ vựng</span>
          </Link>
        </div>
      </section>
    </div>
  );
}

export default HomePage;
