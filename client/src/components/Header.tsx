import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { APP_NAME } from '@platform/shared';
import { useAuth } from '../context/useAuth';
import { dashboardPathForRole } from '../lib/roles';

interface NavItem {
  labelKey: string;
  to: string;
}

/**
 * Real, role-aware navigation (fixes a bug found 2026-09-15: the header shipped in T-004
 * as a `href="#"` placeholder — "stays non-functional until the tasks that build those
 * pages land" — and was never revisited once T-008/T-019/T-022/etc. actually landed, so
 * every page's real feature was reachable only via each dashboard's own links, never from
 * the persistent top nav a user actually tries first). Mirrors the link set already on
 * `TeacherDashboardPage`/`StudentDashboardPage` so the same feature has the same label in
 * both places.
 *
 * Labels are i18n keys (T-067), not raw strings — resolved via `t()` at render time so
 * the site-wide language setting (never a per-user switcher, see PROJECT_PLAN Guiding
 * Principle 3) is respected here too.
 */
const TEACHER_NAV_ITEMS: NavItem[] = [
  { labelKey: 'header.nav.teacher.myTests', to: '/teacher/tests' },
  { labelKey: 'header.nav.teacher.flashcards', to: '/teacher/flashcard-sets' },
  { labelKey: 'header.nav.teacher.grammar', to: '/teacher/grammar-topics' },
  { labelKey: 'header.nav.teacher.unitTests', to: '/teacher/unit-tests' },
  { labelKey: 'header.nav.teacher.vocabularyCheck', to: '/teacher/vocabulary-checks' },
  { labelKey: 'header.nav.teacher.curriculum', to: '/teacher/curriculum' },
  { labelKey: 'header.nav.teacher.reports', to: '/teacher/reports' },
];

const STUDENT_NAV_ITEMS: NavItem[] = [
  { labelKey: 'header.nav.student.practiceTests', to: '/student/practice' },
  { labelKey: 'header.nav.student.flashcards', to: '/student/flashcard-sets' },
  { labelKey: 'header.nav.student.grammar', to: '/student/grammar-topics' },
  { labelKey: 'header.nav.student.unitTests', to: '/student/unit-tests' },
  { labelKey: 'header.nav.student.vocabularyCheck', to: '/student/vocabulary-checks' },
  { labelKey: 'header.nav.student.leaderboard', to: '/vocab-leaderboard' },
];

/** Admin nav set (T-069/T-071), translated as part of T-068 — mirrors the teacher/student
 * arrays above in shape and intent (one item per top-level admin area). */
const ADMIN_NAV_ITEMS: NavItem[] = [
  { labelKey: 'header.nav.admin.users', to: '/admin/users' },
  { labelKey: 'header.nav.admin.tests', to: '/admin/tests' },
  { labelKey: 'header.nav.admin.flashcardSets', to: '/admin/flashcard-sets' },
  { labelKey: 'header.nav.admin.grammarTopics', to: '/admin/grammar-topics' },
];

/**
 * Session-aware header (T-006): shows Log in/Register when logged out, and the
 * current user's name/role + a dashboard link + Log out when logged in. There is
 * intentionally no "register as teacher" affordance anywhere here — Register always
 * leads to the student-only registration page; a teacher logs in through the same
 * Log in link as everyone else.
 *
 * Logged-out visitors get NO feature nav items — every one of them sits behind
 * `ProtectedRoute` and would just bounce a logged-out click to `/login` anyway, which
 * reads as "broken" rather than "please log in first." Register/Log in are enough.
 *
 * `APP_NAME` (the brand name) is deliberately NOT run through `t()` (T-067) — a product
 * name/wordmark isn't translated content, same convention as any real brand name.
 */
function Header() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();
  const dashboardPath = user ? dashboardPathForRole(user.role) : '/student/dashboard';
  const navItems =
    user?.role === 'teacher' ? TEACHER_NAV_ITEMS : user?.role === 'student' ? STUDENT_NAV_ITEMS : [];
  const adminNavItems = user?.role === 'admin' ? ADMIN_NAV_ITEMS : [];

  return (
    <header className="border-b border-primary-200 bg-base-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-6">
        <Link to="/" className="text-lg font-bold text-primary-600">
          {APP_NAME}
        </Link>

        <nav aria-label={t('header.mainNavAriaLabel')}>
          <ul className="flex flex-wrap items-center gap-1 sm:gap-2">
            {user && (
              <li>
                <Link
                  to={dashboardPath}
                  aria-current={location.pathname === dashboardPath ? 'page' : undefined}
                  className="rounded-md px-3 py-2 text-sm font-medium text-base-black/70 transition-colors hover:bg-primary-50 hover:text-primary-700 aria-[current=page]:bg-primary-100 aria-[current=page]:text-primary-700"
                >
                  {t('header.dashboard')}
                </Link>
              </li>
            )}
            {navItems.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  aria-current={location.pathname.startsWith(item.to) ? 'page' : undefined}
                  className="rounded-md px-3 py-2 text-sm font-medium text-base-black/70 transition-colors hover:bg-primary-50 hover:text-primary-700 aria-[current=page]:bg-primary-100 aria-[current=page]:text-primary-700"
                >
                  {t(item.labelKey)}
                </Link>
              </li>
            ))}
            {adminNavItems.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  aria-current={location.pathname.startsWith(item.to) ? 'page' : undefined}
                  className="rounded-md px-3 py-2 text-sm font-medium text-base-black/70 transition-colors hover:bg-primary-50 hover:text-primary-700 aria-[current=page]:bg-primary-100 aria-[current=page]:text-primary-700"
                >
                  {t(item.labelKey)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {user ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-base-black/70">
              {user.name}{' '}
              <span className="text-xs font-medium uppercase text-primary-600">
                ({user.role === 'teacher' || user.role === 'student' ? t(`roles.${user.role}`) : user.role})
              </span>
            </span>
            <button
              type="button"
              onClick={logout}
              className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
            >
              {t('header.logOut')}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/register"
              className="rounded-md px-3 py-2 text-sm font-medium text-base-black/70 transition-colors hover:bg-primary-50 hover:text-primary-700"
            >
              {t('header.register')}
            </Link>
            <Link
              to="/login"
              className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
            >
              {t('header.logIn')}
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}

export default Header;
