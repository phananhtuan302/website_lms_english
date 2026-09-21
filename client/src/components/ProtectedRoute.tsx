import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { UserRole } from '@platform/shared';
import { useAuth } from '../context/useAuth';

interface ProtectedRouteProps {
  /** Roles allowed to view the nested route(s). A logged-in user whose role isn't in
   * this list is redirected to `/unauthorized` rather than rendering the content. */
  allowedRoles: UserRole[];
}

/**
 * Route guard (T-006). Used as a layout route wrapping one or more `<Route>`s:
 *
 * ```tsx
 * <Route element={<ProtectedRoute allowedRoles={['teacher']} />}>
 *   <Route path="/teacher/library" element={<TeacherLibraryPage />} />
 * </Route>
 * ```
 *
 * - Logged out -> redirect to `/login` (remembers the attempted path so login can
 *   send the user back where they meant to go).
 * - Logged in but wrong role -> redirect to `/unauthorized`.
 * - Logged in with an allowed role -> renders the nested route via `<Outlet />`.
 */
function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();

  if (isLoading) {
    // Avoid a flash-redirect to /login while we're still checking a stored token.
    return <p className="text-center text-base-black/60">{t('common.loading')}</p>;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
}

export default ProtectedRoute;
