import type { ReactNode } from 'react';
import Header from './Header';

interface AppShellProps {
  children: ReactNode;
}

/**
 * Minimal app shell (T-004): header/nav + a content area, built entirely from Tailwind
 * theme tokens (`primary`, `base.white`, `base.black` — see tailwind.config.js) rather
 * than one-off colors. Every page in the app renders inside this shell.
 */
function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-base-white text-base-black">
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">{children}</main>
      <footer className="border-t border-primary-100 px-4 py-4 text-center text-xs text-base-black/50 sm:px-6">
        English Test Platform — local development build
      </footer>
    </div>
  );
}

export default AppShell;
