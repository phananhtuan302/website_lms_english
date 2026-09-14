import { Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

/**
 * Teacher-only landing page (T-006), reachable only via the `/teacher/dashboard` route
 * guarded by `ProtectedRoute allowedRoles={['teacher']}`. Test authoring (T-008),
 * variant generation (T-009), and QR-join sessions (T-010) all live under
 * `/teacher/tests`, linked from here — reports and other later features (T-019+) get
 * their own cards on this same page when they land.
 */
function TeacherDashboardPage() {
  const { user, logout } = useAuth();

  return (
    <div className="rounded-xl border border-primary-100 bg-primary-50 p-8">
      <h1 className="text-2xl font-bold text-primary-700">Teacher dashboard</h1>
      <p className="mt-2 text-base-black/70">Welcome, {user?.name}.</p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          to="/teacher/tests"
          className="inline-block rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
        >
          Manage my tests
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

export default TeacherDashboardPage;
