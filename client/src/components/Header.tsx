import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { APP_NAME } from '@platform/shared';
import { useAuth } from '../context/useAuth';
import { useAttemptLock } from '../context/useAttemptLock';
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
/** T-094: the top bar used to list all 9 of these individually, which the customer
 * found cluttered and unclear about which class an action applied to. They now live as
 * two labeled groups on `TeacherDashboardPage` instead ("Thư viện của tôi" /
 * "Lớp học của tôi") — the top bar's own "Trang tổng quan" (Dashboard) link below is the
 * one entry point into that page, so this array is intentionally empty rather than
 * deleted outright (keeps the `navItems` wiring below uniform across roles). */
const TEACHER_NAV_ITEMS: NavItem[] = [];

/** T-105 (Phase 13): the student nav is four items, not six. Everything a student has to DO
 * (practice tests, Unit Tests, Vocabulary Checks) is now one list, "Bài tập" — the
 * `/student/dashboard` "Bài cần làm" page — so the old Luyện tập / Kiểm tra Unit / Kiểm tra
 * từ vựng items are gone (their old routes redirect there). Students get "Bài tập" from
 * this array instead of the generic "Trang tổng quan" link the other roles use (see the
 * `role !== 'student'` guard on that link below). */
const STUDENT_NAV_ITEMS: NavItem[] = [
  { labelKey: 'studentNav.assignments', to: '/student/dashboard' },
  { labelKey: 'studentNav.flashcards', to: '/student/flashcard-sets' },
  { labelKey: 'studentNav.grammar', to: '/student/grammar-topics' },
  { labelKey: 'studentNav.leaderboard', to: '/vocab-leaderboard' },
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
 *
 * T-091: while `useAttemptLock()` reports a locked in-progress attempt (student role
 * only — see that context), the nav items/dashboard link and the log-out button are
 * replaced entirely by an inline message, rather than merely disabled — a determined
 * student couldn't click their way around a disabled link anyway, but the message is
 * also what tells them WHY nav suddenly stopped working. The app name/logo stays
 * visible either way; it isn't part of the lock (there's no route behind it that
 * escapes the take-test screen — `/` just redirects, and the force-redirect effect in
 * `AttemptLockContext` bounces right back).
 */
function Header() {
  const { user, logout } = useAuth();
  const { lockedAttemptId } = useAttemptLock();
  const { t } = useTranslation();
  const location = useLocation();
  const dashboardPath = user ? dashboardPathForRole(user.role) : '/student/dashboard';
  const isLocked = lockedAttemptId !== null;
  const navItems = isLocked
    ? []
    : user?.role === 'teacher'
      ? TEACHER_NAV_ITEMS
      : user?.role === 'student'
        ? STUDENT_NAV_ITEMS
        : [];
  const adminNavItems = isLocked ? [] : user?.role === 'admin' ? ADMIN_NAV_ITEMS : [];

  return (
    <header className="border-b border-primary-200 bg-base-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-6">
        <Link to="/" className="text-lg font-bold text-primary-600">
          {APP_NAME}
        </Link>

        <nav aria-label={t('header.mainNavAriaLabel')}>
          <ul className="flex flex-wrap items-center gap-1 sm:gap-2">
            {!isLocked && user && user.role !== 'student' && (
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

        {isLocked ? (
          // T-091: no logout, no nav — just the reason why, in place of both.
          <p role="status" className="text-sm font-medium text-primary-700">
            {t('header.attemptLockNotice')}
          </p>
        ) : user ? (
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
