import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Sidebar, { MenuIcon } from './Sidebar';
import { APP_NAME } from '@platform/shared';

interface AppShellProps {
  children: ReactNode;
}

/**
 * App shell (T-004, redesigned 2026-09 — customer request: a left-hand sidebar with a collapse
 * toggle, replacing the old top `Header` bar, plus a more polished "professional dashboard"
 * look). A flex ROW of `<Sidebar>` (in-flow, `sticky` — see its own doc comment for why) and the
 * page content, so the browser reflows the content itself as the sidebar's width changes; no
 * manual margin-syncing. Below `md:` the sidebar becomes an off-canvas drawer instead, opened by
 * the hamburger in the slim mobile top bar here.
 *
 * The content column uses `.bg-app-canvas` (index.css) — a soft slate/brand wash instead of flat
 * white — so every page's existing `bg-base-white` cards read as raised surfaces with zero
 * per-page changes.
 */
function AppShell({ children }: AppShellProps) {
  const { t } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-app-canvas text-base-black">
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-primary-100 bg-base-white/80 px-4 backdrop-blur print-hidden md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label={t('sidebar.open')}
            className="flex h-10 w-10 items-center justify-center rounded-md text-base-black/70 hover:bg-primary-50 hover:text-primary-700"
          >
            <MenuIcon className="h-6 w-6" />
          </button>
          <span className="text-base font-bold text-primary-600">{APP_NAME}</span>
        </div>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
        <footer className="print-hidden border-t border-primary-100/70 px-4 py-4 text-center text-xs text-base-black/50 sm:px-6">
          {t('appShell.footer')}
        </footer>
      </div>
    </div>
  );
}

export default AppShell;
