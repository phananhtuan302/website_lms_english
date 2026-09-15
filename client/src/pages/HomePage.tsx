import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { APP_NAME } from '@platform/shared';
import { useAuth } from '../context/useAuth';
import { dashboardPathForRole } from '../lib/roles';

/** i18n keys (T-067) for the four highlight cards — resolved via `t()` at render time
 * instead of storing raw English strings, so the site-wide language setting is
 * respected here too. */
const HIGHLIGHT_KEYS = ['tests', 'vocabGrammar', 'speaking', 'progress'] as const;

/**
 * Real landing page (replaces the original T-001 scaffold placeholder — the plain
 * "Monorepo scaffold: React + TypeScript..." text that was never revisited once actual
 * product pages existed, found 2026-09-15 alongside the Header nav bug: a first-time
 * visitor's very first impression was raw framework/infra copy, not the product). A
 * logged-in visitor gets a "go to your dashboard" shortcut instead of Register/Log in.
 *
 * `APP_NAME` is deliberately NOT translated (T-067) — see `Header.tsx`'s doc comment on
 * the same convention.
 */
function HomePage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const dashboardPath = user ? dashboardPathForRole(user.role) : '/student/dashboard';

  return (
    <div className="flex flex-col items-center gap-10 py-8 text-center">
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-4xl font-bold text-primary-600 sm:text-5xl">{APP_NAME}</h1>
        <p className="max-w-xl text-lg text-base-black/70">{t('home.subtitle')}</p>

        {user ? (
          <Link
            to={dashboardPath}
            className="rounded-md bg-primary-500 px-6 py-3 text-base font-semibold text-base-white transition-colors hover:bg-primary-600"
          >
            {t('home.goToDashboard')}
          </Link>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/register"
              className="rounded-md border border-primary-300 bg-base-white px-6 py-3 text-base font-semibold text-primary-700 transition-colors hover:bg-primary-100"
            >
              {t('home.createStudentAccount')}
            </Link>
            <Link
              to="/login"
              className="rounded-md bg-primary-500 px-6 py-3 text-base font-semibold text-base-white transition-colors hover:bg-primary-600"
            >
              {t('home.logIn')}
            </Link>
          </div>
        )}
      </div>

      <dl className="grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2">
        {HIGHLIGHT_KEYS.map((key) => (
          <div
            key={key}
            className="rounded-xl border border-primary-100 bg-primary-50 p-6 text-left"
          >
            <dt className="text-lg font-semibold text-primary-700">
              {t(`home.highlights.${key}.title`)}
            </dt>
            <dd className="mt-2 text-sm text-base-black/70">
              {t(`home.highlights.${key}.description`)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default HomePage;
