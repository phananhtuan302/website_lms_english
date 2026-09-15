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
  if (role === 'teacher') return '/teacher/dashboard';
  return '/student/dashboard';
}
