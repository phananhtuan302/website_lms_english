import { Link, useLocation } from 'react-router-dom';
import { APP_NAME } from '@platform/shared';
import { useAuth } from '../context/useAuth';

interface NavItem {
  label: string;
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
 */
const TEACHER_NAV_ITEMS: NavItem[] = [
  { label: 'My Tests', to: '/teacher/tests' },
  { label: 'Flashcards', to: '/teacher/flashcard-sets' },
  { label: 'Grammar', to: '/teacher/grammar-topics' },
  { label: 'Unit Tests', to: '/teacher/unit-tests' },
  { label: 'Vocabulary Check', to: '/teacher/vocabulary-checks' },
  { label: 'Curriculum', to: '/teacher/curriculum' },
  { label: 'Reports', to: '/teacher/reports' },
];

const STUDENT_NAV_ITEMS: NavItem[] = [
  { label: 'Practice Tests', to: '/student/practice' },
  { label: 'Flashcards', to: '/student/flashcard-sets' },
  { label: 'Grammar', to: '/student/grammar-topics' },
  { label: 'Unit Tests', to: '/student/unit-tests' },
  { label: 'Vocabulary Check', to: '/student/vocabulary-checks' },
  { label: 'Leaderboard', to: '/vocab-leaderboard' },
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
 */
function Header() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const dashboardPath = user?.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard';
  const navItems = user?.role === 'teacher' ? TEACHER_NAV_ITEMS : user?.role === 'student' ? STUDENT_NAV_ITEMS : [];

  return (
    <header className="border-b border-primary-200 bg-base-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-6">
        <Link to="/" className="text-lg font-bold text-primary-600">
          {APP_NAME}
        </Link>

        <nav aria-label="Main navigation">
          <ul className="flex flex-wrap items-center gap-1 sm:gap-2">
            {user && (
              <li>
                <Link
                  to={dashboardPath}
                  aria-current={location.pathname === dashboardPath ? 'page' : undefined}
                  className="rounded-md px-3 py-2 text-sm font-medium text-base-black/70 transition-colors hover:bg-primary-50 hover:text-primary-700 aria-[current=page]:bg-primary-100 aria-[current=page]:text-primary-700"
                >
                  Dashboard
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
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {user ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-base-black/70">
              {user.name}{' '}
              <span className="text-xs font-medium uppercase text-primary-600">({user.role})</span>
            </span>
            <button
              type="button"
              onClick={logout}
              className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
            >
              Log out
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/register"
              className="rounded-md px-3 py-2 text-sm font-medium text-base-black/70 transition-colors hover:bg-primary-50 hover:text-primary-700"
            >
              Register
            </Link>
            <Link
              to="/login"
              className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
            >
              Log in
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}

export default Header;
