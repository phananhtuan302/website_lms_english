import { useAuth } from '../context/useAuth';

/**
 * Placeholder student-only page (T-006), reachable only via the `/student/dashboard`
 * route guarded by `ProtectedRoute allowedRoles={['student']}`. Real content
 * (joining sessions, taking tests, flashcards, ...) is built by later backlog tasks
 * (T-011+) on top of this same route.
 */
function StudentDashboardPage() {
  const { user, logout } = useAuth();

  return (
    <div className="rounded-xl border border-primary-100 bg-primary-50 p-8">
      <h1 className="text-2xl font-bold text-primary-700">Student dashboard</h1>
      <p className="mt-2 text-base-black/70">
        Welcome, {user?.name}. Joining tests and studying vocabulary land in later tasks.
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

export default StudentDashboardPage;
