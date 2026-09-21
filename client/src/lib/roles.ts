import type { UserRole } from '@platform/shared';

/**
 * Maps a role to its dashboard route (T-069 adds `admin` alongside the existing
 * teacher/student paths). Centralized so every page that redirects "logged in -> your
 * dashboard" (`Header`, `LoginPage`, `RegisterPage`, `HomePage`) stays in sync instead of
 * each one re-declaring its own `role === 'teacher' ? ... : ...` ternary — the exact bug
 * this replaces: those ternaries only ever considered two roles, so an admin logging in
 * through the shared `/login` form would have landed on `/student/dashboard` instead of
 * `/admin/dashboard`.
 */
export function dashboardPathForRole(role: UserRole): string {
  if (role === 'admin') return '/admin/dashboard';
  // T-102: teachers land on the class-card home; the old `/teacher/dashboard` is now only
  // a redirect to it (kept for old bookmarks).
  if (role === 'teacher') return '/teacher/classes';
  return '/student/dashboard';
}

/**
 * Where to send someone right after signing in: the page they were originally headed to
 * (`from`, T-011) when their role may open it, otherwise their own dashboard.
 */
export function postLoginPath(from: string | undefined, role: UserRole): string {
  // A logout on a role-guarded page leaves that page in the login screen's `from` state;
  // the next person to sign in on that computer (e.g. a student after the teacher) must
  // not be sent back to an area their role can't open — it would land on /unauthorized.
  if (from) {
    const teacherArea = from.startsWith('/teacher');
    const studentArea = from.startsWith('/student');
    const adminArea = from.startsWith('/admin');
    const allowed =
      (!teacherArea || role === 'teacher' || role === 'admin') &&
      (!studentArea || role === 'student') &&
      (!adminArea || role === 'admin');
    if (allowed) return from;
  }
  return dashboardPathForRole(role);
}
