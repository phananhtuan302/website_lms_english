import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { APP_NAME } from '@platform/shared';
import { useAuth } from '../context/useAuth';
import { useAttemptLock } from '../context/useAttemptLock';
import { dashboardPathForRole } from '../lib/roles';
import { useActiveDesignSystem } from '../lib/designSystems';
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

/** Route of the "Trợ giúp" page — linked for every role, and for logged-out visitors. */
const HELP_PATH = '/help';

function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (!item.activePrefixes) return pathname.startsWith(item.to);
  return item.activePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/* --- Icons: small hand-rolled outline SVGs (24x24 viewBox, `stroke="currentColor"`, 2px
   rounded strokes) so the nav never needs an icon-library dependency for a dozen glyphs. */
type IconProps = { className?: string };
const iconBase = 'h-[18px] w-[18px] shrink-0';
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
  { labelKey: 'header.nav.admin.settings', to: '/admin/settings', icon: SettingsIcon },
];

const NAV_LINK_BASE =
  'group relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 whitespace-nowrap';
const NAV_LINK_INACTIVE = 'text-slate-600 hover:bg-slate-100 hover:text-slate-900';

/** The active nav item's look per design system (2026-10 "5 Design Systems" rebuild) —
 * a quiet tinted pill reads as "SaaS product", an underline reads as "academic/editorial
 * restraint", a solid filled pill reads as "bold EdTech" — each a deliberate choice, not
 * an arbitrary recolor. `null`/legacy styles keep the original tinted-pill look. */
const NAV_LINK_ACTIVE_BY_DESIGN: Record<string, string> = {
  minimalAcademic: 'text-primary-700 underline decoration-2 underline-offset-[10px]',
  editorialLearning: 'text-primary-800 underline decoration-2 underline-offset-[10px]',
  focusExam: 'bg-primary-100 text-primary-800 font-semibold',
  contemporaryCreative: 'bg-primary-600 text-white',
  minimalism: 'text-[#37352f] bg-slate-100 font-semibold',
  flatDesign: 'bg-primary-600 text-white font-bold',
  glassmorphism: 'bg-white/50 text-primary-800 backdrop-blur-sm',
  neumorphism: 'text-primary-700 shadow-[inset_2px_2px_5px_rgb(163,177,198,0.5),inset_-2px_-2px_5px_rgb(255,255,255,0.8)]',
  swissDesign: 'border-b-2 border-black text-black font-bold rounded-none',
  neoBrutalism: 'border-[3px] border-black bg-primary-400 text-black font-bold rounded-none',
  materialDesign: 'bg-primary-100 text-primary-900 rounded-full font-medium',
  cyberpunkNeon: 'bg-cyan-400/10 text-cyan-300 border border-cyan-400/40 rounded-md',
  playfulRetro: 'bg-primary-500 text-white border-2 border-[#28243d] rounded-full font-extrabold',
  claymorphism: 'bg-white text-primary-700 rounded-full shadow-[inset_2px_2px_5px_rgb(199,192,231,0.5),inset_-2px_-2px_5px_rgb(255,255,255,0.9)]',
};
const NAV_LINK_ACTIVE_DEFAULT = 'bg-primary-50 text-primary-700';

interface TopNavProps {
  /** Right-aligned controls rendered after the nav items — `TextSizeButton`/`UserMenu` in
   * `AppShell`, kept as children instead of imported directly so this file stays focused on
   * navigation/layout. */
  endSlot: ReactNode;
}

/**
 * Horizontal top navigation bar — replaces the old left-hand `Sidebar`. Same role-aware nav
 * items / active-highlight / attempt-lock behaviour `Sidebar.tsx` had, just laid out in one
 * row instead of a column, and merged with what used to be `AppShell`'s separate desktop
 * header strip (there is now exactly one chrome bar, not two).
 *
 * Below `lg`: the nav items collapse into a hamburger that opens a slide-down sheet instead
 * of an off-canvas side drawer.
 */
function TopNav({ endSlot }: TopNavProps) {
  const { user } = useAuth();
  const { lockedAttemptId } = useAttemptLock();
  const { t } = useTranslation();
  const location = useLocation();
  const design = useActiveDesignSystem();
  const activeLinkClass = (design && NAV_LINK_ACTIVE_BY_DESIGN[design]) || NAV_LINK_ACTIVE_DEFAULT;
  const [mobileOpen, setMobileOpen] = useState(false);
  // Resets the mobile sheet when navigation actually changes the route — otherwise it stays
  // open over the newly loaded page, which reads as broken on a phone. Adjusted synchronously
  // during render (React's documented "reset state when a prop changes" pattern) rather than
  // in an effect, so it needs no exemption from the stricter `set-state-in-effect` rule.
  const [prevPathname, setPrevPathname] = useState(location.pathname);
  if (location.pathname !== prevPathname) {
    setPrevPathname(location.pathname);
    setMobileOpen(false);
  }
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

  function renderLink(item: NavItem, active: boolean, onClick?: () => void) {
    return (
      <Link
        key={item.to}
        to={item.to}
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={`${NAV_LINK_BASE} ${active ? activeLinkClass : NAV_LINK_INACTIVE}`}
      >
        <item.icon className={`${iconBase} ${active ? 'text-primary-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
        <span>{t(item.labelKey)}</span>
      </Link>
    );
  }

  const allItems: Array<{ item: NavItem; active: boolean }> = [
    ...(showGenericDashboardLink
      ? [{ item: { labelKey: 'header.dashboard', to: dashboardPath, icon: HomeIcon }, active: location.pathname === dashboardPath }]
      : []),
    ...navItems.map((item) => ({ item, active: isNavItemActive(item, location.pathname) })),
    ...adminNavItems.map((item) => ({ item, active: isNavItemActive(item, location.pathname) })),
    ...(!isLocked
      ? [{ item: { labelKey: 'header.help', to: HELP_PATH, icon: HelpIcon }, active: location.pathname === HELP_PATH }]
      : []),
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-base-white/95 backdrop-blur print-hidden">
      <div className="flex h-16 items-center gap-2 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex shrink-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-base font-bold text-white">
            E
          </span>
          <span className="font-display hidden text-[15px] font-bold tracking-tight text-slate-900 sm:block">{APP_NAME}</span>
        </Link>

        {/* Desktop nav row */}
        <nav aria-label={t('header.mainNavAriaLabel')} className="ml-2 hidden min-w-0 flex-1 items-center gap-1 lg:flex">
          {allItems.map(({ item, active }) => renderLink(item, active))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* Desktop end slot (text size + user menu) */}
          <div className="hidden items-center gap-2 lg:flex">{endSlot}</div>

          {/* Mobile hamburger — only end slot items that matter on a phone (user menu) still
             render outside this button via `endSlot` below the bar; the trigger itself only
             toggles the nav-items sheet. */}
          <div className="flex items-center gap-2 lg:hidden">
            {endSlot}
            <button
              type="button"
              onClick={() => setMobileOpen((prev) => !prev)}
              aria-label={mobileOpen ? t('sidebar.close') : t('sidebar.open')}
              aria-expanded={mobileOpen}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100"
            >
              {mobileOpen ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile nav sheet */}
      {mobileOpen && (
        <nav
          aria-label={t('header.mainNavAriaLabel')}
          className="scroll-thin max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-slate-200 bg-base-white px-3 py-3 lg:hidden"
        >
          <div className="flex flex-col gap-1">
            {allItems.map(({ item, active }) => renderLink(item, active, () => setMobileOpen(false)))}
          </div>
        </nav>
      )}
    </header>
  );
}

export default TopNav;
