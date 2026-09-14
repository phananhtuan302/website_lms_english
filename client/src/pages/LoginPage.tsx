import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../lib/apiClient';

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
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Already logged in (e.g. navigated here manually) -> go straight to the dashboard
  // instead of showing the form again.
  if (user) {
    return (
      <Navigate
        to={user.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard'}
        replace
      />
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const loggedInUser = await login({ email, password });
      const from = (location.state as LocationState | null)?.from?.pathname;
      const fallback =
        loggedInUser.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard';
      navigate(from ?? fallback, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-bold text-primary-700">Log in</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
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
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-md border border-primary-200 px-3 py-2 text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
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
          {isSubmitting ? 'Logging in...' : 'Log in'}
        </button>
      </form>

      <p className="mt-4 text-sm text-base-black/70">
        New student?{' '}
        <Link to="/register" className="font-medium text-primary-600 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}

export default LoginPage;
