import { Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

/**
 * Admin-only landing page (T-069), reachable only via the `/admin/dashboard` route
 * guarded by `ProtectedRoute allowedRoles={['admin']}`. Links out to user management
 * (T-070) and the per-entity content-oversight "browse everything" lists (T-071); a
 * future Settings page (T-072, site-wide language) gets its own card here once it lands.
 */
function AdminDashboardPage() {
  const { user, logout } = useAuth();

  return (
    <div className="rounded-xl border border-primary-100 bg-primary-50 p-8">
      <h1 className="text-2xl font-bold text-primary-700">Admin dashboard</h1>
      <p className="mt-2 text-base-black/70">Welcome, {user?.name}.</p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          to="/admin/users"
          className="inline-block rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
        >
          Manage users (teachers, students &amp; admins)
        </Link>
        <Link
          to="/admin/tests"
          className="inline-block rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100"
        >
          Browse all tests
        </Link>
        <Link
          to="/admin/flashcard-sets"
          className="inline-block rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100"
        >
          Browse all flashcard sets
        </Link>
        <Link
          to="/admin/grammar-topics"
          className="inline-block rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100"
        >
          Browse all Grammar topics
        </Link>
        <Link
          to="/teacher/curriculum"
          className="inline-block rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100"
        >
          Manage curriculum (Units &amp; Academic Periods)
        </Link>
      </div>

      <div>
        <button
          type="button"
          onClick={logout}
          className="mt-6 rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100"
        >
          Log out
        </button>
      </div>
    </div>
  );
}

export default AdminDashboardPage;
