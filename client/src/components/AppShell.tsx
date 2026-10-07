import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Sidebar, { MenuIcon } from './Sidebar';
import { useAuth } from '../context/useAuth';
import { AvatarUpload, Badge } from './ui';
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

  const today = new Date().toLocaleDateString(i18n.language === 'vi' ? 'vi-VN' : 'en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="flex min-h-screen bg-app-canvas text-base-black">
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
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

        {/* Desktop header strip (2026-10) — a persistent greeting/date/role context bar above
          every page's own content, instead of the old bare canvas. Sticky so it stays in view
          while a long page (e.g. the attempts table) scrolls underneath it. */}
        <div className="sticky top-0 z-10 hidden h-16 shrink-0 items-center justify-between gap-4 border-b border-primary-100/70 bg-base-white/80 px-6 shadow-card backdrop-blur print-hidden md:flex">
          <div className="flex min-w-0 items-center gap-3">
            {user && <AvatarUpload size="sm" />}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-base-black">
                {user ? t('header.greeting', { name: user.name }) : APP_NAME}
              </p>
              <p className="truncate text-xs capitalize text-base-black/50">{today}</p>
            </div>
          </div>
          {user && <Badge tone={ROLE_BADGE_TONE[user.role]}>{t(`roles.${user.role}`)}</Badge>}
        </div>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8 sm:py-10">{children}</main>

        <footer className="print-hidden border-t border-primary-100/70 bg-base-white/50 px-4 py-6 sm:px-6">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-2 text-center sm:flex-row sm:justify-between sm:text-left">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 text-xs font-extrabold text-base-white">
                E
              </span>
              <span className="text-sm font-semibold text-base-black">{APP_NAME}</span>
            </div>
            <p className="text-xs text-base-black/50">
              {t('appShell.footer')} · © {new Date().getFullYear()}
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default AppShell;
