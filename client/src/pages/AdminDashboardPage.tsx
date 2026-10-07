import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/useAuth';
import { adminApi } from '../lib/adminApi';
import {
  AttemptsIcon,
  BarChart,
  Card,
  ChevronRightIcon,
  CurriculumIcon,
  FlashcardsIcon,
  GrammarIcon,
  SectionHeading,
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

/** Buckets `attempts` (most-recent-first, per `adminApi.listAttempts`) into the last 7
 * calendar days. Reuses the exact same admin endpoint the stat strip already calls for its
 * `attempts` total — no new backend work — fetched with a larger page so there's enough rows
 * to bucket from; a day outside the returned page just undercounts rather than erroring. */
function lastSevenDays(attempts: { startedAt: string }[], locale: string): BarChartDatum[] {
  const days: { key: string; label: string; tooltipLabel: string }[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push({
      key: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString(locale, { weekday: 'short' }),
      tooltipLabel: d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' }),
    });
  }
  const counts = new Map(days.map((d) => [d.key, 0]));
  for (const attempt of attempts) {
    const key = attempt.startedAt.slice(0, 10);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return days.map((d) => ({ label: d.label, value: counts.get(d.key) ?? 0, tooltipLabel: d.tooltipLabel }));
}

/**
 * Admin-only landing page (T-069), reachable only via the `/admin/dashboard` route
 * guarded by `ProtectedRoute allowedRoles={['admin']}`. Links out to user management
 * (T-070), the per-entity content-oversight "browse everything" lists (T-071), and
 * scores/attempts management + the site-wide language Settings page (T-072).
 *
 * "Glassmorphism" pass (2026-10, customer request: "siêu hiện đại" — gradient mesh +
 * frosted glass, lots of color): a frosted glass hero (decorative blurred color orbs +
 * gradient-fill heading text) over `.bg-app-canvas`'s color mesh, a stat strip where each
 * tile carries its own accent instead of one repeated color, and a real 7-day attempts
 * trend (`lastSevenDays`) — all reading from admin endpoints the other admin pages already
 * call (`adminApi.*`), no new backend work.
 */
function AdminDashboardPage() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const [stats, setStats] = useState<Stats>({
    users: null,
    tests: null,
    flashcardSets: null,
    grammarTopics: null,
    attempts: null,
  });
  const [trend, setTrend] = useState<BarChartDatum[] | null>(null);

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
      .listAttempts({ pageSize: 200 })
      .then((res) => {
        setStats((s) => ({ ...s, attempts: res.total }));
        setTrend(lastSevenDays(res.attempts, i18n.language));
      })
      .catch(() => setStats((s) => ({ ...s, attempts: 'error' })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <div>
      <div className="admin-hero relative mb-6 overflow-hidden rounded-2xl border border-white/60 bg-glass-panel p-6 shadow-card sm:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-primary-400/50 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 left-8 h-52 w-52 rounded-full bg-primary-600/35 blur-3xl"
        />
        <div className="relative">
          <p className="text-sm font-medium text-primary-700">{t('adminDashboard.welcome', { name: user?.name })}</p>
          <h1 className="mt-1 bg-gradient-to-br from-primary-700 via-primary-600 to-primary-900 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
            {t('adminDashboard.heading')}
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card variant="glass" padding="md">
          <SectionHeading level="md">{t('adminDashboard.trendHeading')}</SectionHeading>
          <div className="mt-4">
            {trend ? (
              <BarChart data={trend} />
            ) : (
              <div className="h-36 animate-pulse rounded-md bg-slate-200/60" />
            )}
          </div>
        </Card>

        <Card variant="glass" padding="sm">
          <SectionHeading level="md" className="px-1 pt-1">
            {t('adminDashboard.quickLinksHeading')}
          </SectionHeading>
          <div className="mt-2 divide-y divide-white/60">
            {quickLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="flex items-center gap-3 rounded-md px-1 py-2.5 text-sm transition-colors hover:bg-white/50"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-500/15 text-primary-700">
                  {link.icon}
                </span>
                <span className="flex-1 font-medium text-base-black">{link.label}</span>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-400" />
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default AdminDashboardPage;
