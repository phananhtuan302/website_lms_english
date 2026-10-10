import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/useAuth';
import { ApiError, isRememberLoginEnabled, setRememberLoginEnabled } from '../lib/apiClient';
import { postLoginPath } from '../lib/roles';

interface LocationState {
  from?: { pathname: string };
}

/**
 * Login page (T-006). Works for both roles — there is no role selector, the server
 * decides based on the matched account (see server `POST /api/auth/login`). This is
 * also how a seeded teacher account logs in: through this exact same form.
 */
function LoginPage() {
  const { login, user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem('webeng.rememberedEmail') ?? '';
    } catch {
      return '';
    }
  });

  const [rememberLogin, setRememberLogin] = useState(() => isRememberLoginEnabled());

  useEffect(() => {
    try {
      if (rememberLogin) {
        localStorage.setItem('webeng.rememberedEmail', email);
      } else {
        localStorage.removeItem('webeng.rememberedEmail');
      }
    } catch {
      /* Storage may be disabled; authentication must remain available. */
    }
  }, [rememberLogin, email]);

  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Already logged in (e.g. navigated here manually) -> go straight to the dashboard
  // instead of showing the form again. Also respects `from` (T-011): this same branch
  // is what actually fires right after a successful login too — `login()` calling
  // `setUser` triggers a re-render of THIS component (with `user` now truthy) which can
  // land before `handleSubmit`'s own `navigate(from ?? fallback)` call below takes
  // effect, so this guard must redirect to the exact same place `handleSubmit` would,
  // or the two can race and whichever runs last silently overrides the other's target
  // (discovered via an end-to-end Playwright run of the T-011 join flow: a fresh login
  // from `/join/:token` intermittently landed on `/student/dashboard` instead of back on
  // the join page).
  if (user) {
    const from = (location.state as LocationState | null)?.from?.pathname;
    return <Navigate to={postLoginPath(from, user.role)} replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      setRememberLoginEnabled(rememberLogin);
      const loggedInUser = await login({ email, password }, rememberLogin);
      const from = (location.state as LocationState | null)?.from?.pathname;
      navigate(postLoginPath(from, loggedInUser.role), { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('auth.genericError'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <header className="mb-7">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">
          {t('auth.login.welcomeEyebrow')}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-base-black sm:text-4xl">
          {t('auth.login.heading')}
        </h1>
        <p className="mt-3 text-sm leading-6 text-base-black/60">{t('auth.login.subtitle')}</p>
      </header>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <label className="flex flex-col gap-2 text-sm font-semibold text-base-black">
          {t('auth.email')}
          <input
            id="login-email"
            aria-describedby="login-email-hint"
            type="text"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="min-h-12 w-full rounded-xl border border-primary-200 bg-base-white px-4 py-3 text-base font-normal text-base-black transition-colors focus:border-primary-400 focus:outline-none"
          />
          <span id="login-email-hint" className="text-xs font-normal leading-5 text-base-black/60">
            {t('auth.emailHint')}
          </span>
        </label>
        <label className="flex flex-col gap-2 text-sm font-semibold text-base-black">
          {t('auth.password')}
          <input
            id="login-password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="min-h-12 w-full rounded-xl border border-primary-200 bg-base-white px-4 py-3 text-base font-normal text-base-black transition-colors focus:border-primary-400 focus:outline-none"
          />
        </label>
        {/* Option to keep session and remember login */}
        <label className="-mt-2 flex min-h-11 w-fit items-center gap-2 text-sm text-base-black/80 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={rememberLogin}
            onChange={(event) => {
              setRememberLogin(event.target.checked);
              setRememberLoginEnabled(event.target.checked);
            }}
            className="h-4 w-4 rounded accent-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-700 cursor-pointer"
          />
          <span>Duy trì đăng nhập trên thiết bị này</span>
        </label>

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-primary-300 bg-primary-50 px-4 py-3 text-sm text-primary-900"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="min-h-12 w-full rounded-xl bg-primary-700 px-4 py-3 text-sm font-semibold text-base-white transition-colors hover:bg-primary-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? t('auth.login.submitting') : t('auth.login.submit')}
        </button>
      </form>

      <p className="mt-6 border-t border-primary-100 pt-6 text-center text-sm leading-6 text-base-black/70">
        {t('auth.login.newStudentPrompt')}{' '}
        <Link
          to="/register"
          state={location.state}
          className="inline-flex min-h-11 items-center rounded font-semibold text-primary-700 underline decoration-primary-200 underline-offset-4 hover:decoration-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-700"
        >
          {t('auth.login.createAccountLink')}
        </Link>
      </p>
    </>
  );
}

export default LoginPage;
