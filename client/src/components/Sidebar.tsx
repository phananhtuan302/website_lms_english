import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { APP_NAME } from '@platform/shared';
import { useAuth } from '../context/useAuth';
import { useAttemptLock } from '../context/useAttemptLock';
import { dashboardPathForRole } from '../lib/roles';
import NotificationBell from './NotificationBell';
import TextSizeButton from './TextSizeButton';

interface NavItem {
  labelKey: string;
  to: string;
  icon: (props: { className?: string }) => ReactNode;
  /** Path prefixes that count as "inside this item" for the active highlight (a prefix
   * matches itself or any deeper path segment-wise). Defaults to a plain `startsWith(to)`
   * when omitted. */
  activePrefixes?: string[];
}

/** Route of the "Trợ giúp" page (Phase 15) — linked for every role, and for logged-out visitors. */
const HELP_PATH = '/help';

/** Saved locally per browser (a viewer convenience, not app state) — whether the desktop rail
 * shows full labels or just icons. Wrapped in try/catch: a private window or blocked storage
 * just falls back to "expanded" every load, never breaks the sidebar. */
const COLLAPSE_KEY = 'sidebar.collapsed';
function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}
function writeCollapsed(value: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0');
  } catch {
    // Not available — the choice just won't survive a reload. Not worth telling the user.
  }
}

function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (!item.activePrefixes) return pathname.startsWith(item.to);
  return item.activePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/* --- Icons: small hand-rolled outline SVGs (same convention as NotificationBell's BellIcon —
   24x24 viewBox, `stroke="currentColor"`, 2px rounded strokes) so the sidebar never needs an
   icon-library dependency for a dozen simple glyphs. */
type IconProps = { className?: string };
const iconBase = 'h-5 w-5 shrink-0';
function Icon({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className ?? iconBase}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}
const ClassesIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <rect x="3" y="3" width="8" height="8" rx="1.5" />
    <rect x="13" y="3" width="8" height="8" rx="1.5" />
    <rect x="3" y="13" width="8" height="8" rx="1.5" />
    <rect x="13" y="13" width="8" height="8" rx="1.5" />
  </Icon>
);
const LibraryIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
  </Icon>
);
const TodoIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="m7 12 2.5 2.5L15 9" />
  </Icon>
);
const GradesIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M4 20V10" />
    <path d="M12 20V4" />
    <path d="M20 20v-6" />
  </Icon>
);
const FlashcardsIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <rect x="4" y="6" width="14" height="10" rx="2" transform="rotate(-6 11 11)" />
    <rect x="6.5" y="8" width="14" height="10" rx="2" />
  </Icon>
);
const GrammarIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    <path d="M9 7h6M9 11h4" />
  </Icon>
);
const LeaderboardIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M8 21h8" />
    <path d="M12 17v4" />
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
    <path d="M7 6H4a3 3 0 0 0 3 5" />
    <path d="M17 6h3a3 3 0 0 1-3 5" />
  </Icon>
);
const HelpIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7" />
    <path d="M12 17.5h.01" />
  </Icon>
);
const UsersIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16 4.5a3.5 3.5 0 0 1 0 7" />
    <path d="M16.5 13a6.5 6.5 0 0 1 5 6.3" />
  </Icon>
);
const TestsIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M6 2h9l4 4v16H6z" />
    <path d="M15 2v4h4" />
    <path d="m9 13 2 2 4-4" />
  </Icon>
);
const HomeIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="m3 11 9-7 9 7" />
    <path d="M5 10v10h14V10" />
  </Icon>
);
const ChevronLeftIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="m15 6-6 6 6 6" />
  </Icon>
);
const MenuIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </Icon>
);
const CloseIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>
);

const TEACHER_NAV_ITEMS: NavItem[] = [
  { labelKey: 'teacherNav.classes', to: '/teacher/classes', icon: ClassesIcon, activePrefixes: ['/teacher/classes'] },
  { labelKey: 'teacherNav.gradesOverview', to: '/teacher/grades-overview', icon: GradesIcon },
  {
    labelKey: 'teacherNav.library',
    to: '/teacher/library',
    icon: LibraryIcon,
    activePrefixes: [
      '/teacher/library',
      '/teacher/tests',
      '/teacher/flashcard-sets',
      '/teacher/grammar-topics',
      '/teacher/curriculum',
    ],
  },
];

const STUDENT_NAV_ITEMS: NavItem[] = [
  { labelKey: 'studentNav.assignments', to: '/student/dashboard', icon: TodoIcon },
  { labelKey: 'studentNav.grades', to: '/student/grades', icon: GradesIcon },
  { labelKey: 'studentNav.flashcards', to: '/student/flashcard-sets', icon: FlashcardsIcon },
  { labelKey: 'studentNav.grammar', to: '/student/grammar-topics', icon: GrammarIcon },
  { labelKey: 'studentNav.leaderboard', to: '/vocab-leaderboard', icon: LeaderboardIcon },
];

const ADMIN_NAV_ITEMS: NavItem[] = [
  { labelKey: 'header.nav.admin.users', to: '/admin/users', icon: UsersIcon },
  { labelKey: 'header.nav.admin.tests', to: '/admin/tests', icon: TestsIcon },
  { labelKey: 'header.nav.admin.flashcardSets', to: '/admin/flashcard-sets', icon: FlashcardsIcon },
  { labelKey: 'header.nav.admin.grammarTopics', to: '/admin/grammar-topics', icon: GrammarIcon },
];

const NAV_LINK_BASE =
  'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors';
const NAV_LINK_INACTIVE = 'text-slate-300 hover:bg-white/10 hover:text-base-white';
const NAV_LINK_ACTIVE = 'bg-primary-500 text-base-white shadow-card';

interface SidebarProps {
  /** Whether the mobile off-canvas drawer is open (state lives in `AppShell` so its own
   * hamburger trigger and this drawer always agree). Ignored at `md:` and up, where the
   * sidebar is always visible, in-flow. */
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

/**
 * Left-hand navigation (2026-09, replaces the old top `Header` bar — customer request: "menu
 * nên nằm ở bên trái màn hình, có nút ẩn menu"). Same role-aware nav items / active-highlight /
 * attempt-lock behaviour `Header.tsx` had, just laid out vertically with two collapse controls:
 *
 *  - Desktop (`md:` and up): an in-flow, `sticky` column (a flex sibling of the page content, so
 *    the browser reflows the content itself — no manual margin-syncing) that toggles between a
 *    full `md:w-64` rail and an icon-only `md:w-20` rail via the chevron button in its own
 *    header; the choice is remembered per browser (`sidebar.collapsed`).
 *  - Below `md:`: an off-canvas drawer (`fixed`, slides in with `translate-x`) opened by a
 *    hamburger button that lives in `AppShell`'s slim mobile top bar; a backdrop click or the
 *    drawer's own ✕ closes it. Always full width and never "collapsed" there — collapsing only
 *    makes sense when it shares the screen with content.
 */
function Sidebar({ mobileOpen, onCloseMobile }: SidebarProps) {
  const { user, logout } = useAuth();
  const { lockedAttemptId } = useAttemptLock();
  const { t } = useTranslation();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
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
  const showGenericDashboardLink = !isLocked && user && user.role !== 'student' && user.role !== 'teacher';

  // Closing the mobile drawer on every navigation (a real link click) — otherwise it stays open
  // over the newly-loaded page, which reads as broken on a phone.
  useEffect(() => {
    onCloseMobile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    writeCollapsed(next);
  }

  function renderLink(item: NavItem, active: boolean) {
    return (
      <li key={item.to}>
        <Link
          to={item.to}
          aria-current={active ? 'page' : undefined}
          title={collapsed ? t(item.labelKey) : undefined}
          className={`${NAV_LINK_BASE} ${active ? NAV_LINK_ACTIVE : NAV_LINK_INACTIVE} ${collapsed ? 'md:justify-center' : ''}`}
        >
          <item.icon className={`${iconBase} ${active ? 'text-base-white' : 'text-slate-400 group-hover:text-base-white'}`} />
          <span className={collapsed ? 'md:hidden' : ''}>{t(item.labelKey)}</span>
        </Link>
      </li>
    );
  }

  return (
    <>
      {mobileOpen && (
        <div
          aria-hidden="true"
          onClick={onCloseMobile}
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-full w-72 flex-col bg-slate-900 text-base-white shadow-sidebar transition-transform duration-200 ease-in-out print-hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } md:sticky md:top-0 md:z-auto md:h-screen md:translate-x-0 md:transition-[width] ${
          collapsed ? 'md:w-20' : 'md:w-64'
        }`}
      >
        <div className={`flex h-16 shrink-0 items-center gap-2 border-b border-white/10 px-4 ${collapsed ? 'md:justify-center md:px-0' : ''}`}>
          <Link to="/" className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-500 text-sm font-extrabold text-base-white">
              E
            </span>
            <span className={`truncate text-base font-bold text-base-white ${collapsed ? 'md:hidden' : ''}`}>{APP_NAME}</span>
          </Link>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label={t('sidebar.close')}
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-md text-slate-300 hover:bg-white/10 md:hidden"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <nav
          aria-label={t('header.mainNavAriaLabel')}
          className="sidebar-scroll flex-1 overflow-y-auto px-3 py-4"
        >
          <ul className="flex flex-col gap-1">
            {showGenericDashboardLink &&
              renderLink(
                { labelKey: 'header.dashboard', to: dashboardPath, icon: HomeIcon },
                location.pathname === dashboardPath,
              )}
            {navItems.map((item) => renderLink(item, isNavItemActive(item, location.pathname)))}
            {adminNavItems.map((item) => renderLink(item, location.pathname.startsWith(item.to)))}
            {!isLocked &&
              renderLink({ labelKey: 'header.help', to: HELP_PATH, icon: HelpIcon }, location.pathname === HELP_PATH)}
          </ul>
        </nav>

        <div className="shrink-0 border-t border-white/10 p-3">
          {isLocked ? (
            <p role="status" className="rounded-md border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-xs font-medium text-sky-100">
              {t('header.attemptLockNotice')}
            </p>
          ) : user ? (
            <div className="flex flex-col gap-2">
              <div className={`flex items-center gap-2 ${collapsed ? 'md:justify-center' : ''}`}>
                {user.role === 'student' && <NotificationBell key={user.id} />}
                <div className={`min-w-0 flex-1 ${collapsed ? 'md:hidden' : ''}`}>
                  <p className="truncate text-sm font-medium text-base-white">{user.name}</p>
                  <p className="truncate text-xs font-medium uppercase text-primary-300">
                    {user.role === 'teacher' || user.role === 'student' ? t(`roles.${user.role}`) : user.role}
                  </p>
                </div>
              </div>
              <div className={`flex items-center gap-2 ${collapsed ? 'md:flex-col' : ''}`}>
                <TextSizeButton compact={collapsed} />
                {/* Collapsed rail only: a visible gap between the frequently-used text-size
                  toggle and Logout — stacked flush with no separation, the two same-size squares
                  were an easy mis-tap into an accidental logout (2026-09 mobile/phone review). */}
                {collapsed && <div aria-hidden="true" className="hidden h-px w-8 shrink-0 bg-white/10 md:block" />}
                <button
                  type="button"
                  onClick={logout}
                  title={collapsed ? t('header.logOut') : undefined}
                  className={`inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-md bg-primary-500 px-3 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 ${collapsed ? 'md:flex-none md:w-10 md:px-0' : ''}`}
                >
                  <span className={collapsed ? 'md:hidden' : ''}>{t('header.logOut')}</span>
                  <span className={collapsed ? 'hidden md:inline' : 'hidden'} aria-hidden="true">
                    ⏻
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div className={`flex flex-col gap-2 ${collapsed ? 'md:items-center' : ''}`}>
              <TextSizeButton compact={collapsed} />
              <Link
                to="/login"
                className="inline-flex min-h-10 items-center justify-center rounded-md bg-primary-500 px-3 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
              >
                <span className={collapsed ? 'md:hidden' : ''}>{t('header.logIn')}</span>
              </Link>
              <Link
                to="/register"
                className={`inline-flex min-h-10 items-center justify-center rounded-md border border-white/20 px-3 text-sm font-medium text-slate-200 transition-colors hover:bg-white/10 ${collapsed ? 'md:hidden' : ''}`}
              >
                {t('header.register')}
              </Link>
            </div>
          )}
        </div>

        {/* Desktop-only collapse toggle, pinned to the edge so it's easy to find again once
          collapsed. Hidden on the mobile drawer (there, closing IS the "collapse"). */}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          className="absolute top-16 -right-3 hidden h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-base-white text-slate-500 shadow-card hover:text-primary-600 md:flex"
        >
          <ChevronLeftIcon className={`h-4 w-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </aside>
    </>
  );
}

export { MenuIcon };
export default Sidebar;
