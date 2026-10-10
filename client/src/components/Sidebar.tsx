import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { APP_NAME } from '@platform/shared';
import { useAuth } from '../context/useAuth';
import { useAttemptLock } from '../context/useAttemptLock';
import { dashboardPathForRole } from '../lib/roles';
import { SettingsIcon } from './ui';

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
const ChatIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.3-4.7A8 8 0 1 1 21 12Z" />
    <path d="M8 11h.01M12 11h.01M16 11h.01" />
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
  { labelKey: 'teacherNav.chatAssistant', to: '/teacher/chat', icon: ChatIcon },
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
  {
    labelKey: 'header.nav.admin.tests',
    to: '/admin/tests',
    icon: TestsIcon,
    activePrefixes: ['/admin/tests', '/teacher/tests'],
  },
  {
    labelKey: 'header.nav.admin.flashcardSets',
    to: '/admin/flashcard-sets',
    icon: FlashcardsIcon,
    activePrefixes: ['/admin/flashcard-sets', '/teacher/flashcard-sets'],
  },
  {
    labelKey: 'header.nav.admin.grammarTopics',
    to: '/admin/grammar-topics',
    icon: GrammarIcon,
    activePrefixes: ['/admin/grammar-topics', '/teacher/grammar-topics'],
  },
  // 2026-10: Settings was reachable only via the Dashboard's "Truy cập nhanh" quick-links list,
  // never from the sidebar itself like every other admin section — easy to lose track of,
  // especially now that it also holds the new UI-style picker. Added here so it's a direct,
  // permanent nav entry.
  { labelKey: 'header.nav.admin.settings', to: '/admin/settings', icon: SettingsIcon },
];

const NAV_LINK_BASE =
  'group flex items-center gap-3.5 rounded-xl px-3.5 py-3 text-sm font-medium transition-all duration-150';
const NAV_LINK_INACTIVE = 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900';
const NAV_LINK_ACTIVE = 'bg-primary-50 text-primary-700 font-semibold shadow-sm ring-1 ring-primary-200/50';

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
          className={`${NAV_LINK_BASE} ${active ? NAV_LINK_ACTIVE : NAV_LINK_INACTIVE} ${collapsed ? 'md:justify-center md:px-0' : ''}`}
        >
          <item.icon className={`${iconBase} ${active ? 'text-primary-600' : 'text-slate-400 group-hover:text-slate-700'}`} />
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
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-xs md:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-full w-72 flex-col border-r border-slate-200/80 bg-white text-slate-800 shadow-sm transition-transform duration-200 ease-in-out print-hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } md:sticky md:top-0 md:z-30 md:h-screen md:translate-x-0 md:transition-[width] ${
          collapsed ? 'md:w-20' : 'md:w-64'
        }`}
      >
        {/* Brand Header */}
        <div className={`relative flex h-16 shrink-0 items-center border-b border-slate-100 px-4 ${collapsed ? 'justify-center' : 'justify-between'}`}>
          <Link to="/" className={`flex min-w-0 items-center gap-2.5 ${collapsed ? 'justify-center' : 'flex-1 justify-center'}`}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-600 to-indigo-600 text-base font-black text-white shadow-sm">
              E
            </span>
            <span className={`truncate text-sm font-bold text-slate-900 tracking-tight text-center ${collapsed ? 'hidden' : 'block'}`}>
              {APP_NAME}
            </span>
          </Link>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label={t('sidebar.close')}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 md:hidden"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation list */}
        <nav
          aria-label={t('header.mainNavAriaLabel')}
          className="sidebar-scroll flex-1 overflow-y-auto px-3 py-4"
        >
          <ul className="flex flex-col gap-1.5">
            {showGenericDashboardLink &&
              renderLink(
                { labelKey: 'header.dashboard', to: dashboardPath, icon: HomeIcon },
                location.pathname === dashboardPath,
              )}
            {navItems.map((item) => renderLink(item, isNavItemActive(item, location.pathname)))}
            {adminNavItems.map((item) => renderLink(item, isNavItemActive(item, location.pathname)))}
            {!isLocked &&
              renderLink({ labelKey: 'header.help', to: HELP_PATH, icon: HelpIcon }, location.pathname === HELP_PATH)}
          </ul>
        </nav>

        {/* Bottom Sidebar Docked Toggle Button: Dính liền thanh menu, tinh gọn & hiện đại */}
        <div className="shrink-0 border-t border-slate-100 p-3 hidden md:block">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
            title={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
            className={`flex w-full items-center gap-3 rounded-xl py-2.5 px-3 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 ${
              collapsed ? 'justify-center px-0' : ''
            }`}
          >
            <svg
              className={`h-5 w-5 shrink-0 transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
            <span className={`truncate ${collapsed ? 'hidden' : 'block'}`}>
              {collapsed ? '' : t('sidebar.collapse')}
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}

export { MenuIcon };
export default Sidebar;
