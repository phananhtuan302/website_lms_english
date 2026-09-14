import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../lib/apiClient';

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
 */
function RegisterPage() {
  const { register, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // See `LoginPage`'s identical guard for why this must also respect `from`: this
  // branch is what actually fires right after a successful registration too (`register()`
  // calling `setUser` can trigger a re-render of this component, with `user` now
  // truthy, that lands before `handleSubmit`'s own `navigate(from ?? fallback)` call
  // below takes effect — both must target the same place or they race).
  if (user) {
    const from = (location.state as LocationState | null)?.from?.pathname;
    return (
      <Navigate
        to={from ?? (user.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard')}
        replace
      />
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await register({ name, email, password });
      const from = (location.state as LocationState | null)?.from?.pathname;
      navigate(from ?? '/student/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-bold text-primary-700">Create a student account</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          Name
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
          Email
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
          Password
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
            At least {MIN_PASSWORD_LENGTH} characters.
          </span>
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
          {isSubmitting ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <p className="mt-4 text-sm text-base-black/70">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-primary-600 hover:underline">
          Log in
        </Link>
      </p>
      <p className="mt-2 text-xs text-base-black/50">
        Teacher accounts are provisioned by the school, not through self-registration — ask your
        administrator if you need one.
      </p>
    </div>
  );
}

export default RegisterPage;
