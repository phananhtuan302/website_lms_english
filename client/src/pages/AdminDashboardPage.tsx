import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/useAuth';
import { adminApi } from '../lib/adminApi';
import type { AttemptSummaryDTO } from '@platform/shared';
import {
  AttemptsIcon,
  BarChart,
  ChevronRightIcon,
  CurriculumIcon,
  FlashcardsIcon,
  GrammarIcon,
  SettingsIcon,
  StatCard,
  TestsIcon,
  UsersIcon,
  type BarChartDatum,
} from '../components/ui';

type Count = number | 'error' | null;

interface Stats {
  users: Count;
  tests: Count;
  flashcardSets: Count;
  grammarTopics: Count;
  attempts: Count;
}

type FilterMode = 'day' | 'week' | 'month' | 'custom';

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const [stats, setStats] = useState<Stats>({
    users: null,
    tests: null,
    flashcardSets: null,
    grammarTopics: null,
    attempts: null,
  });

  const [allAttempts, setAllAttempts] = useState<AttemptSummaryDTO[]>([]);
  const [filterMode, setFilterMode] = useState<FilterMode>('week');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().slice(0, 10);
  });
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    adminApi
      .listUsers()
      .then((users) => setStats((s) => ({ ...s, users: users.length })))
      .catch(() => setStats((s) => ({ ...s, users: 'error' })));
    adminApi
      .listAllTests()
      .then((tests) => setStats((s) => ({ ...s, tests: tests.length })))
      .catch(() => setStats((s) => ({ ...s, tests: 'error' })));
    adminApi
      .listAllFlashcardSets()
      .then((sets) => setStats((s) => ({ ...s, flashcardSets: sets.length })))
      .catch(() => setStats((s) => ({ ...s, flashcardSets: 'error' })));
    adminApi
      .listAllGrammarTopics()
      .then((topics) => setStats((s) => ({ ...s, grammarTopics: topics.length })))
      .catch(() => setStats((s) => ({ ...s, grammarTopics: 'error' })));
    adminApi
      .listAttempts({ pageSize: 500 })
      .then((res) => {
        setStats((s) => ({ ...s, attempts: res.total }));
        setAllAttempts(res.attempts);
      })
      .catch(() => setStats((s) => ({ ...s, attempts: 'error' })));
  }, []);

  // Compute Chart Data dynamically based on filterMode
  const chartData: BarChartDatum[] = useMemo(() => {
    if (!allAttempts) return [];

    if (filterMode === 'day') {
      // 24 Giờ trong ngày đã chọn: 00:00 - 23:00 (Hiển thị 8 khung 3 giờ hoặc 12 khung 2 giờ)
      // Chia 12 mốc 2 giờ: 00h, 02h, 04h, 06h, 08h, 10h, 12h, 14h, 16h, 18h, 20h, 22h
      const hours = [
        { label: '00h', startH: 0, endH: 1 },
        { label: '02h', startH: 2, endH: 3 },
        { label: '04h', startH: 4, endH: 5 },
        { label: '06h', startH: 6, endH: 7 },
        { label: '08h', startH: 8, endH: 9 },
        { label: '10h', startH: 10, endH: 11 },
        { label: '12h', startH: 12, endH: 13 },
        { label: '14h', startH: 14, endH: 15 },
        { label: '16h', startH: 16, endH: 17 },
        { label: '18h', startH: 18, endH: 19 },
        { label: '20h', startH: 20, endH: 21 },
        { label: '22h', startH: 22, endH: 23 },
      ];

      return hours.map((slot) => {
        const count = allAttempts.filter((att) => {
          const d = new Date(att.startedAt);
          const dateStr = d.toISOString().slice(0, 10);
          if (dateStr !== selectedDate) return false;
          const h = d.getHours();
          return h >= slot.startH && h <= slot.endH;
        }).length;

        return {
          label: slot.label,
          value: count,
          tooltipLabel: `${slot.startH.toString().padStart(2, '0')}:00 - ${slot.endH.toString().padStart(2, '0')}:59 (${selectedDate})`,
        };
      });
    }

    if (filterMode === 'week') {
      // 7 ngày gần nhất
      const days: { key: string; label: string; tooltipLabel: string }[] = [];
      const now = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        days.push({
          key: d.toISOString().slice(0, 10),
          label: d.toLocaleDateString(i18n.language, { weekday: 'short' }),
          tooltipLabel: d.toLocaleDateString(i18n.language, { day: '2-digit', month: '2-digit', year: 'numeric' }),
        });
      }
      return days.map((d) => ({
        label: d.label,
        value: allAttempts.filter((att) => att.startedAt.slice(0, 10) === d.key).length,
        tooltipLabel: d.tooltipLabel,
      }));
    }

    if (filterMode === 'month') {
      // 30 ngày qua (chia thành 6 nhóm 5 ngày hoặc từng 3 ngày)
      const daysCount = 30;
      const days: { key: string; label: string; tooltipLabel: string }[] = [];
      const now = new Date();
      for (let i = daysCount - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        days.push({
          key: d.toISOString().slice(0, 10),
          label: `${d.getDate()}/${d.getMonth() + 1}`,
          tooltipLabel: d.toLocaleDateString(i18n.language, { day: '2-digit', month: '2-digit', year: 'numeric' }),
        });
      }
      // Gom lại cách mỗi 3 ngày 1 nhãn để hiển thị thanh thoát
      return days.filter((_, idx) => idx % 3 === 0).map((d) => ({
        label: d.label,
        value: allAttempts.filter((att) => att.startedAt.slice(0, 10) === d.key).length,
        tooltipLabel: d.tooltipLabel,
      }));
    }

    if (filterMode === 'custom') {
      // Custom từ ngày đến ngày
      if (!customStart || !customEnd) return [];
      const start = new Date(customStart);
      const end = new Date(customEnd);
      if (start > end) return [];

      const list: { key: string; label: string; tooltipLabel: string }[] = [];
      const cur = new Date(start);
      while (cur <= end && list.length < 31) {
        list.push({
          key: cur.toISOString().slice(0, 10),
          label: `${cur.getDate()}/${cur.getMonth() + 1}`,
          tooltipLabel: cur.toLocaleDateString(i18n.language, { day: '2-digit', month: '2-digit', year: 'numeric' }),
        });
        cur.setDate(cur.getDate() + 1);
      }

      return list.map((d) => ({
        label: d.label,
        value: allAttempts.filter((att) => att.startedAt.slice(0, 10) === d.key).length,
        tooltipLabel: d.tooltipLabel,
      }));
    }

    return [];
  }, [allAttempts, filterMode, selectedDate, customStart, customEnd, i18n.language]);

  const totalFilteredAttempts = useMemo(() => {
    return chartData.reduce((acc, cur) => acc + cur.value, 0);
  }, [chartData]);

  const quickLinks = [
    { to: '/admin/users', label: t('adminDashboard.manageUsers'), icon: <UsersIcon className="h-5 w-5" /> },
    { to: '/admin/tests', label: t('adminDashboard.browseTests'), icon: <TestsIcon className="h-5 w-5" /> },
    {
      to: '/admin/flashcard-sets',
      label: t('adminDashboard.browseFlashcardSets'),
      icon: <FlashcardsIcon className="h-5 w-5" />,
    },
    {
      to: '/admin/grammar-topics',
      label: t('adminDashboard.browseGrammarTopics'),
      icon: <GrammarIcon className="h-5 w-5" />,
    },
    {
      to: '/admin/attempts',
      label: t('adminDashboard.manageAttempts'),
      icon: <AttemptsIcon className="h-5 w-5" />,
    },
    { to: '/admin/settings', label: t('adminDashboard.settingsLink'), icon: <SettingsIcon className="h-5 w-5" /> },
    {
      to: '/teacher/curriculum',
      label: t('teacherDashboard.manageCurriculum'),
      icon: <CurriculumIcon className="h-5 w-5" />,
    },
  ];

  return (
    <div className="flex flex-1 flex-col gap-4">
      {/* Top Banner & Header */}
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {t('adminDashboard.heading')}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            {t('adminDashboard.welcome', { name: user?.name })} • Tổng quan thống kê và điều hành hệ thống.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/admin/settings"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            <SettingsIcon className="h-4 w-4 text-slate-500" />
            <span>Cài đặt hệ thống</span>
          </Link>
        </div>
      </div>

      {/* Metrics Row: 5 Cards */}
      <div className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          icon={<UsersIcon className="h-5 w-5" />}
          label={t('header.nav.admin.users')}
          value={stats.users}
          tone="primary"
        />
        <StatCard
          icon={<TestsIcon className="h-5 w-5" />}
          label={t('header.nav.admin.tests')}
          value={stats.tests}
          tone="sky"
        />
        <StatCard
          icon={<FlashcardsIcon className="h-5 w-5" />}
          label={t('header.nav.admin.flashcardSets')}
          value={stats.flashcardSets}
          tone="violet"
        />
        <StatCard
          icon={<GrammarIcon className="h-5 w-5" />}
          label={t('header.nav.admin.grammarTopics')}
          value={stats.grammarTopics}
          tone="amber"
        />
        <StatCard
          icon={<AttemptsIcon className="h-5 w-5" />}
          label={t('adminAttempts.heading')}
          value={stats.attempts}
          tone="rose"
        />
      </div>

      {/* Main Grid: Tự động co giãn (flex-1) chiếm trọn chiều cao vừa khít chân trang */}
      <div className="grid flex-1 grid-cols-1 gap-5 min-h-[360px] lg:grid-cols-12">
        {/* Left Column: Advanced Chart Panel */}
        <div className="flex flex-1 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-8">
          <div>
            {/* Chart Header & Controls */}
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900">Thống kê lượt làm bài</h2>
                  <span className="rounded-md bg-primary-50 px-2 py-0.5 text-xs font-bold text-primary-700">
                    {totalFilteredAttempts} lượt nộp
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Theo dõi xu hướng học sinh nộp bài thi theo các mốc thời gian linh hoạt
                </p>
              </div>

              {/* Mode Tabs */}
              <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
                {(
                  [
                    { id: 'day', label: 'Theo ngày' },
                    { id: 'week', label: 'Theo tuần' },
                    { id: 'month', label: 'Theo tháng' },
                    { id: 'custom', label: 'Tùy chỉnh' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setFilterMode(m.id)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                      filterMode === m.id
                        ? 'bg-white text-primary-700 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sub Controls: Chọn ngày cụ thể hoặc Chọn khoảng ngày */}
            {filterMode === 'day' && (
              <div className="mt-2.5 flex items-center gap-2.5 text-xs">
                <span className="font-semibold text-slate-600">Chọn ngày khảo sát:</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
                <span className="text-[11px] text-slate-400">
                  (Biểu đồ sẽ phân bổ lượt thi qua từng khung 2 giờ trong ngày)
                </span>
              </div>
            )}

            {filterMode === 'custom' && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2.5 text-xs">
                <span className="font-semibold text-slate-600">Từ ngày:</span>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
                <span className="font-semibold text-slate-600">Đến ngày:</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </div>
            )}
          </div>

          {/* Biểu đồ tự co giãn theo chiều cao container */}
          <div className="flex-1 flex flex-col justify-end pt-4 min-h-[220px]">
            <BarChart data={chartData} />
          </div>
        </div>

        {/* Right Column: Quick Links */}
        <div className="flex flex-1 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900">{t('adminDashboard.quickLinksHeading')}</h2>
            <p className="text-[11px] text-slate-400">Các chức năng quản trị trọng tâm</p>
          </div>
          <div className="divide-y divide-slate-100 flex-1 flex flex-col justify-between py-1">
            {quickLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="group flex flex-1 items-center gap-3 py-2 text-xs transition-colors hover:text-primary-600"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500 transition-colors group-hover:bg-primary-50 group-hover:text-primary-600">
                  {link.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-700 transition-colors group-hover:text-primary-600">
                    {link.label}
                  </p>
                </div>
                <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-primary-600" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
