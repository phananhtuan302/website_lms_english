import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { APP_NAME } from '@platform/shared';

interface AuthLayoutProps {
  children: ReactNode;
}

/**
 * Shared frame for Login/Register (2026-09 "professional dashboard" redesign): the form sits in
 * a raised white card, paired on wider screens with a decorative brand panel that fills what used
 * to be a large empty gap next to a narrow centered form. The panel is `hidden` below `md:` —
 * on a phone the form alone, full width, is still the whole point of the page.
 */
function AuthLayout({ children }: AuthLayoutProps) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex max-w-4xl flex-col overflow-hidden rounded-2xl bg-base-white shadow-panel md:flex-row">
      <div className="flex-1 px-6 py-10 sm:px-10">{children}</div>
      <div className="relative hidden w-80 shrink-0 flex-col justify-center gap-3 overflow-hidden bg-gradient-to-br from-primary-600 via-primary-500 to-primary-800 px-8 py-10 text-base-white md:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/10 blur-2xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-16 -left-10 h-56 w-56 rounded-full bg-primary-950/30 blur-2xl"
        />
        <span className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-white/15 text-base font-extrabold">
          E
        </span>
        <p className="relative text-lg font-bold">{APP_NAME}</p>
        <p className="relative text-sm font-medium text-primary-50">{t('auth.sidePanel.title')}</p>
        <p className="relative text-sm text-primary-100/90">{t('auth.sidePanel.subtitle')}</p>
      </div>
    </div>
  );
}

export default AuthLayout;
