import { Link } from 'react-router-dom';

/** Catch-all for unmatched routes (T-006, added alongside the router since it didn't
 * exist before). */
function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md text-center">
      <h1 className="text-2xl font-bold text-primary-700">Page not found</h1>
      <p className="mt-2 text-base-black/70">
        The page you&apos;re looking for doesn&apos;t exist.
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

export default NotFoundPage;
