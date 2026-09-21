import type { ReactNode } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { classAssignmentsPath, classTestResultsPath, classVocabularyChecksPath } from '../lib/classAssignments';
import { CLASSES_HOME_PATH, classTabPath } from '../lib/classWorkspace';

/**
 * Redirects for the pre-Phase-13 teacher URLs (T-106) so old bookmarks and links never
 * dead-end: every scattered page (My Content, Unit Tests, Vocabulary Checks, Reports, ...)
 * now lives inside a class workspace (`/teacher/classes/:classId/...`).
 *
 * The old pages were scoped to a class through a `?classId=` query param (T-088/T-095/T-097).
 * When it is present the redirect goes straight to the matching class-workspace route;
 * without it there is no class to open, so the redirect lands on the class-card home. Any
 * OTHER query params are carried over untouched.
 */

/** Which class-workspace route an old page's content now lives at. */
type LegacyTarget =
  | 'assignments'
  | 'vocabularyChecks'
  | 'stats'
  | 'vocabularyStats'
  | 'grammarStats'
  | 'leaderboardStats';

const TARGET_PATHS: Record<LegacyTarget, (classId: string) => string> = {
  assignments: classAssignmentsPath,
  vocabularyChecks: classVocabularyChecksPath,
  stats: (classId) => classTabPath(classId, 'stats'),
  vocabularyStats: (classId) => classTabPath(classId, 'stats/vocabulary'),
  grammarStats: (classId) => classTabPath(classId, 'stats/grammar'),
  leaderboardStats: (classId) => classTabPath(classId, 'stats/leaderboard'),
};

/** Joins a target path with the query params that are still meaningful (all but `classId`). */
function withRemainingQuery(path: string, searchParams: URLSearchParams): string {
  const rest = new URLSearchParams(searchParams);
  rest.delete('classId');
  const query = rest.toString();
  return query ? `${path}?${query}` : path;
}

/** `?classId=X` present -> that class's `to` route; otherwise the class-card home. */
export function LegacyClassRedirect({ to }: { to: LegacyTarget }) {
  const [searchParams] = useSearchParams();
  const classId = searchParams.get('classId');
  const path = classId ? TARGET_PATHS[to](classId) : CLASSES_HOME_PATH;
  return <Navigate to={withRemainingQuery(path, searchParams)} replace />;
}

/**
 * `/vocab-leaderboard` is ALSO the student's own leaderboard page, so only the teacher (and
 * admin) view is redirected into the class workspace; students keep the real page.
 */
export function VocabLeaderboardRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user && user.role !== 'student') return <LegacyClassRedirect to="leaderboardStats" />;
  return <>{children}</>;
}

/**
 * Standalone per-test report (`/teacher/tests/:testId/report`). With `?classId=` it moves into
 * the class workspace (results page, class locked); without it the standalone page keeps
 * working as before (it asks which class to show).
 */
export function TestReportRoute({ children }: { children: ReactNode }) {
  const { testId = '' } = useParams<{ testId: string }>();
  const [searchParams] = useSearchParams();
  const classId = searchParams.get('classId');
  if (classId) {
    return <Navigate to={withRemainingQuery(classTestResultsPath(classId, testId), searchParams)} replace />;
  }
  return <>{children}</>;
}
