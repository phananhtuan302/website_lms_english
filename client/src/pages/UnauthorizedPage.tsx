import { Link } from 'react-router-dom';

/** Shown by `ProtectedRoute` when a logged-in user's role doesn't match the page
 * they tried to reach (T-006) — e.g. a student hitting `/teacher/dashboard`. */
function UnauthorizedPage() {
  return (
    <div className="mx-auto max-w-md text-center">
      <h1 className="text-2xl font-bold text-primary-700">Access denied</h1>
      <p className="mt-2 text-base-black/70">
        You don&apos;t have permission to view that page with your current account.
      </p>
      <Link
        to="/"
        className="mt-6 inline-block rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
      >
        Go to home page
      </Link>
    </div>
  );
}

export default UnauthorizedPage;
