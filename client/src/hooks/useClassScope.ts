import { useParams, useSearchParams } from 'react-router-dom';

/**
 * Which class a teacher-facing page is scoped to, and whether it is "embedded" in the class
 * workspace (T-104, Phase 13). One rule shared by every page that can render both ways:
 *
 * - **Embedded** — rendered inside `/teacher/classes/:classId/...`. The class comes from the
 *   ROUTE param (`useParams()` also returns ancestor route params, so a page mounted under
 *   `.../stats` sees `classId` without the route being declared on it). The workspace header
 *   already shows the class, so the page hides its own "Đổi lớp" link / "Đang thao tác: Lớp X"
 *   label and keeps the class locked (no dropdown).
 * - **Standalone / legacy** — no route param. The class falls back to the `?classId=` query
 *   param (T-088/T-095/T-097 hand-off); when that is absent too the page shows its own class
 *   picker, exactly as before.
 *
 * `initialClassId` is a starting value for `useTeacherClasses(enabled, initialClassId)`; a page
 * treats itself as class-locked whenever it is non-empty (its existing T-097 rule).
 */
export function useClassScope() {
  const { classId: routeClassId } = useParams<{ classId: string }>();
  const [searchParams] = useSearchParams();
  const isEmbedded = routeClassId !== undefined;
  const initialClassId = routeClassId ?? searchParams.get('classId') ?? '';
  return { isEmbedded, initialClassId };
}
