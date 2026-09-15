/**
 * Shared "is this user an admin, OR does this resource belong to them" rule (T-069,
 * Phase 11, PROJECT_PLAN Assumption A12): admin bypasses every per-owner ownership check
 * in the system rather than owning a separate parallel data set. Centralized here so
 * every ownership-check helper (`ownedTest.ts`, `ownedFlashcardSet.ts`,
 * `ownedGrammarTopic.ts`, and any direct `resource.teacherId === req.user.sub` comparison
 * that needs the same treatment, e.g. `teacherSessions.routes.ts`) enforces the identical
 * rule instead of re-implementing (and potentially forgetting) the admin bypass per call
 * site.
 */

export interface AuthzUser {
  sub: string;
  role: string;
}

/** True if `user` is an admin (bypasses ownership everywhere) or is the resource's own
 * owner (`ownerId`). `ownerId` may be `null`/`undefined` for a resource with no owner at
 * all (e.g. a global entity) — in that case only the admin branch can ever be true, which
 * is the correct behavior for "this never belonged to a specific user anyway". */
export function isAdminOrOwner(user: AuthzUser, ownerId: string | null | undefined): boolean {
  return user.role === 'admin' || (ownerId != null && user.sub === ownerId);
}
