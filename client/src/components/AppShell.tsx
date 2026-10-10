import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import AuthLayout from './AuthLayout';
import Sidebar, { MenuIcon } from './Sidebar';
import UserMenu from './UserMenu';
import TextSizeButton from './TextSizeButton';
import { useAuth } from '../context/useAuth';
import { APP_NAME } from '@platform/shared';

interface AppShellProps {
  children: ReactNode;
}

const ROLE_BADGE_TONE = { admin: 'primary', teacher: 'sky', student: 'green' } as const;

/**
 * App shell (T-004, redesigned 2026-09 — left-hand sidebar with a collapse toggle; redesigned
 * again 2026-10 "Modern SaaS" pass — a real desktop header strip and a fuller footer, on top of
 * a flex ROW of `<Sidebar>` (in-flow, `sticky` — see its own doc comment for why) and the page
 * content, so the browser reflows the content itself as the sidebar's width changes; no manual
 * margin-syncing. Below `md:` the sidebar becomes an off-canvas drawer instead, opened by the
 * hamburger in the slim mobile top bar here — the desktop header below is `md:`-only, since the
 * mobile bar already carries the hamburger + app name in that cramped space.
 *
 * The content column uses `.bg-app-canvas` (index.css) — a soft slate/brand wash instead of flat
 * white — so every page's existing `bg-base-white` cards read as raised surfaces with zero
 * per-page changes.
 */
function AppShell({ children }: AppShellProps) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  // Only these two real routes bypass the application's navigation chrome.
  if (pathname === '/login' || pathname === '/register') {
    return <AuthLayout>{children}</AuthLayout>;
  }

  const today = new Date().toLocaleDateString(i18n.language === 'vi' ? 'vi-VN' : 'en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-app-canvas text-base-black">
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col h-full overflow-hidden">
        {/* Mobile top bar (hamburger + app name) — unchanged from the 2026-09 shell. */}
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-primary-100/70 bg-base-white/80 px-4 shadow-card backdrop-blur print-hidden md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label={t('sidebar.open')}
            className="flex h-10 w-10 items-center justify-center rounded-md text-base-black/70 transition-colors hover:bg-primary-50 hover:text-primary-700"
          >
            <MenuIcon className="h-6 w-6" />
          </button>
          <span className="text-base font-bold text-primary-600">{APP_NAME}</span>
        </div>

        {/* Desktop header strip — clean modern context & user action bar */}
        <header className="sticky top-0 z-10 hidden h-16 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-8 shadow-[0_1px_2px_rgba(0,0,0,0.03)] print-hidden md:flex">
          <div className="flex min-w-0 items-center text-slate-500 text-sm">
            <span className="font-medium text-slate-600 capitalize">{today}</span>
          </div>

          <div className="flex items-center gap-3">
            <TextSizeButton />
            <UserMenu />
          </div>
        </header>

        {/* Cuộn nội dung bên trong, footer luôn cố định dính ở đáy không bao giờ bị đẩy mất */}
        <main className="flex flex-1 flex-col w-full overflow-y-auto px-8 py-5">
          {children}
        </main>

        <footer
          className="shrink-0 border-t border-slate-200 bg-white px-6 py-2.5 text-center text-xs font-medium text-slate-500 print-hidden z-10"
          data-auth-footer
        >
          Powered by{' '}
          <a
            href="https://techvn.top/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-slate-800 hover:text-primary-600 transition-colors"
          >
            TechVN.top
          </a>
        </footer>
      </div>
    </div>
  );
}

export default AppShell;
