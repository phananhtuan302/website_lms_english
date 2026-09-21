import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { PublicClassSummaryDTO } from '@platform/shared';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../lib/apiClient';
import { classesApi } from '../lib/classesApi';
import { postLoginPath } from '../lib/roles';

const MIN_PASSWORD_LENGTH = 8;

interface LocationState {
  from?: { pathname: string };
}

/**
 * Self-registration page (T-006) — students only. There is deliberately no role
 * selector anywhere on this page/form: the server always creates a `student` account
 * from this endpoint regardless of what's submitted (see server `POST /api/auth/register`),
 * so there is nothing here that could create a teacher account even by mistake.
 *
 * Respects a `location.state.from` (T-011): a student who landed here via the join-gate
 * on `/join/:token` (logged out -> prompted to register) is sent back to finish joining
 * after their account is created, same convention as `LoginPage`.
 *
 * T-074 (Phase 12): adds a REQUIRED "Select your class" dropdown, populated from the
 * public `GET /api/classes` endpoint (no auth needed — this page is reachable
 * logged-out). Per Assumption A14, a student picks exactly one class here and is
 * permanently scoped to it; submitting with no class selected is rejected client-side
 * (and, redundantly, server-side too) with a clear message rather than silently
 * defaulting to one.
 */
function RegisterPage() {
  const { register, user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [classId, setClassId] = useState('');
  const [classes, setClasses] = useState<PublicClassSummaryDTO[] | null>(null);
  const [classesLoadError, setClassesLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    classesApi
      .listPublicClasses()
      .then(setClasses)
      .catch((err) =>
        setClassesLoadError(err instanceof ApiError ? err.message : t('auth.register.loadClassesFailed')),
      );
    // Same "`t` is stable in practice" reasoning as every other one-shot load effect in
    // this codebase (see `TeacherCurriculumPage.tsx`) — omitted from deps on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // See `LoginPage`'s identical guard for why this must also respect `from`: this
  // branch is what actually fires right after a successful registration too (`register()`
  // calling `setUser` can trigger a re-render of this component, with `user` now
  // truthy, that lands before `handleSubmit`'s own `navigate(from ?? fallback)` call
  // below takes effect — both must target the same place or they race).
  if (user) {
    const from = (location.state as LocationState | null)?.from?.pathname;
    return <Navigate to={postLoginPath(from, user.role)} replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    // T-074: required, no silent default — checked client-side first for immediate
    // feedback; the server re-validates the exact same rule regardless.
    if (!classId) {
      setError(t('auth.register.classRequired'));
      return;
    }

    setIsSubmitting(true);
    try {
      await register({ name, email, password, classId });
      const from = (location.state as LocationState | null)?.from?.pathname;
      navigate(postLoginPath(from, 'student'), { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('auth.genericError'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-bold text-primary-700">{t('auth.register.heading')}</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          {t('auth.register.name')}
          <input
            type="text"
            required
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded-md border border-primary-200 px-3 py-2 text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          {t('auth.email')}
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-md border border-primary-200 px-3 py-2 text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          {t('auth.password')}
          <input
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-md border border-primary-200 px-3 py-2 text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
          <span className="text-xs font-normal text-base-black/50">
            {t('auth.register.passwordHint', { count: MIN_PASSWORD_LENGTH })}
          </span>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          {t('auth.register.selectClassLabel')}
          <select
            required
            value={classId}
            onChange={(event) => setClassId(event.target.value)}
            disabled={classes === null || classes.length === 0}
            className="rounded-md border border-primary-200 bg-base-white px-3 py-2 text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">{t('auth.register.selectClassPlaceholder')}</option>
            {classes?.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {t('auth.register.classOption', { className: cls.name, teacherName: cls.teacherName })}
              </option>
            ))}
          </select>
          {classesLoadError && (
            <span className="text-xs font-normal text-red-600">{classesLoadError}</span>
          )}
          {classes !== null && classes.length === 0 && !classesLoadError && (
            <span className="text-xs font-normal text-base-black/50">
              {t('auth.register.noClassesAvailable')}
            </span>
          )}
        </label>

        {error && (
          <p
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? t('auth.register.submitting') : t('auth.register.submit')}
        </button>
      </form>

      <p className="mt-4 text-sm text-base-black/70">
        {t('auth.register.alreadyHaveAccount')}{' '}
        <Link to="/login" className="font-medium text-primary-600 hover:underline">
          {t('auth.register.logInLink')}
        </Link>
      </p>
      <p className="mt-2 text-xs text-base-black/50">{t('auth.register.teacherNote')}</p>
    </div>
  );
}

export default RegisterPage;
