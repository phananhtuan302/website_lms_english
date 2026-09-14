import { useAuth } from '../context/useAuth';

/**
 * Placeholder teacher-only page (T-006), reachable only via the `/teacher/dashboard`
 * route guarded by `ProtectedRoute allowedRoles={['teacher']}`. Real content (test
 * authoring, session monitoring, reports, ...) is built by later backlog tasks
 * (T-008+) on top of this same route.
 */
function TeacherDashboardPage() {
  const { user, logout } = useAuth();

  return (
    <div className="rounded-xl border border-primary-100 bg-primary-50 p-8">
      <h1 className="text-2xl font-bold text-primary-700">Teacher dashboard</h1>
      <p className="mt-2 text-base-black/70">
        Welcome, {user?.name}. Test authoring, sessions, and reports land in later tasks.
      </p>
      <button
        type="button"
        onClick={logout}
        className="mt-6 rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
      >
        Log out
      </button>
    </div>
  );
}

export default TeacherDashboardPage;
