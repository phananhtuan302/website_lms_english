import { Link } from 'react-router-dom';
import { APP_NAME } from '@platform/shared';
import { useAuth } from '../context/useAuth';

/**
 * Nav placeholder for the base app shell (T-004). The links below stay non-functional
 * (`href="#"`) — no page exists behind them yet — until the tasks that build those
 * pages (T-008 test authoring, T-022 flashcards, T-019 reports, ...) land.
 */
const NAV_ITEMS = ['Tests', 'Vocabulary', 'Grammar', 'Reports'];

/**
 * Session-aware header (T-006): shows Log in/Register when logged out, and the
 * current user's name/role + a dashboard link + Log out when logged in. There is
 * intentionally no "register as teacher" affordance anywhere here — Register always
 * leads to the student-only registration page; a teacher logs in through the same
 * Log in link as everyone else.
 */
function Header() {
  const { user, logout } = useAuth();
  const dashboardPath = user?.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard';

  return (
    <header className="border-b border-primary-200 bg-base-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-6">
        <Link to="/" className="text-lg font-bold text-primary-600">
          {APP_NAME}
        </Link>

        <nav aria-label="Main navigation">
          <ul className="flex flex-wrap items-center gap-1 sm:gap-2">
            {NAV_ITEMS.map((label) => (
              <li key={label}>
                <a
                  href="#"
                  className="rounded-md px-3 py-2 text-sm font-medium text-base-black/70 transition-colors hover:bg-primary-50 hover:text-primary-700"
                >
                  {label}
                </a>
              </li>
            ))}
            {user && (
              <li>
                <Link
                  to={dashboardPath}
                  className="rounded-md px-3 py-2 text-sm font-medium text-base-black/70 transition-colors hover:bg-primary-50 hover:text-primary-700"
                >
                  Dashboard
                </Link>
              </li>
            )}
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
