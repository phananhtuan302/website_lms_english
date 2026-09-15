/**
 * Teacher/viewer class-scope resolution for leaderboards & reporting engines (T-077,
 * Phase 12). Companion to `classScoping.ts` (T-076's student-facing content-visibility
 * module) but for the reporting/leaderboard side: every leaderboard and reporting engine
 * (`vocabLeaderboard.ts`, `reporting.ts`'s `computeReport`/`computeGrammarReport`/
 * `computeSpeakingReport`) now requires a single, concrete `classId` to scope its numbers
 * to — this module is the ONE place every route resolves that classId from, instead of
 * re-deriving (and potentially getting subtly wrong, e.g. accidentally merging classes)
 * the same "which class does this request mean" logic per route.
 *
 * Two resolvers, matching the two existing role-visibility conventions already used
 * elsewhere in this codebase (e.g. `unitLeaderboard.routes.ts`'s "both roles" vs.
 * `teacherReports.routes.ts`'s "teacher/admin only"):
 *
 * - `resolveTeacherClassId` — for teacher/admin-only endpoints (`/api/teacher/reports`,
 *   `/api/teacher/speaking-reports`, `/api/teacher/grammar-reports`, the vocab
 *   monthly/yearly ranking). An explicit `classId` query param must reference a class
 *   owned by the calling teacher (or, for `admin`, any class at all — see doc comment
 *   below). Omitted: auto-selects the caller's own sole class if they have exactly one
 *   (T-077's documented ambiguity resolution — "no picker needed for a choice that
 *   doesn't exist"), otherwise 400s asking for an explicit pick (0 classes) or requiring
 *   one (2+ classes) — never silently picks one of several or merges them.
 * - `resolveViewerClassId` — for endpoints visible to BOTH roles (the vocab leaderboard,
 *   the Unit Test leaderboard). A `student` caller's own `classId` (looked up fresh from
 *   the DB via `classScoping.ts`'s `getStudentClassId` — reused rather than
 *   reimplemented) is used UNCONDITIONALLY, ignoring any `classId` query param the caller
 *   supplied — a student can never view another class's leaderboard by passing a
 *   different id, even deliberately. A `teacher`/`admin` caller falls through to
 *   `resolveTeacherClassId`'s picker/default logic above.
 */

import { prisma } from './prisma';
import { isAdminOrOwner, type AuthzUser } from './authz';
import { getStudentClassId } from './classScoping';

export interface ClassScopeSuccess {
  classId: string;
  className: string;
}

export interface ClassScopeFailure {
  status: number;
  error: string;
}

export type ClassScopeResult = ClassScopeSuccess | ClassScopeFailure;

export function isClassScopeFailure(result: ClassScopeResult): result is ClassScopeFailure {
  return 'status' in result;
}

function firstNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * Teacher/admin-facing resolver — see module doc comment for the full "explicit id vs.
 * default vs. required" rule. `admin` (PROJECT_PLAN Assumption A12: bypasses ownership
 * everywhere) validates an explicit `classId` against ANY class in the system rather than
 * just its own (admin owns no classes of its own in the seeded dataset), and its "no
 * explicit id" default/require logic considers every class in the system instead of only
 * ones it owns — the natural reading of "admin has oversight of everything" for a
 * resource type admin itself never owns, consistent with `resolveTeacherClassId` being
 * the one and only place this decision is made.
 */
export async function resolveTeacherClassId(
  user: AuthzUser,
  classIdRaw: unknown,
): Promise<ClassScopeResult> {
  const explicitId = firstNonEmptyString(classIdRaw);
  if (explicitId) {
    const cls = await prisma.class.findUnique({
      where: { id: explicitId },
      select: { id: true, name: true, teacherId: true },
    });
    if (!cls || !isAdminOrOwner(user, cls.teacherId)) {
      return { status: 404, error: 'Class not found.' };
    }
    return { classId: cls.id, className: cls.name };
  }

  const classes = await prisma.class.findMany({
    where: user.role === 'admin' ? {} : { teacherId: user.sub },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  });

  if (classes.length === 1) {
    return { classId: classes[0].id, className: classes[0].name };
  }
  if (classes.length === 0) {
    return {
      status: 400,
      error: 'You have no classes yet. Create a class before viewing this report.',
    };
  }
  return {
    status: 400,
    error: 'classId is required — you have more than one class. Specify which one to view.',
  };
}

/**
 * Both-roles resolver — see module doc comment. Never trusts a `classId` query param for
 * a `student` caller, matching `classScoping.ts`'s own "never trust the JWT, always read
 * fresh from the DB" rule for exactly the same reason: correct-by-construction even if a
 * teacher/admin reassigns the student's class after their token was issued.
 */
export async function resolveViewerClassId(
  user: AuthzUser,
  classIdRaw: unknown,
): Promise<ClassScopeResult> {
  if (user.role !== 'student') {
    return resolveTeacherClassId(user, classIdRaw);
  }

  const classId = await getStudentClassId(user.sub);
  if (!classId) {
    return {
      status: 400,
      error: 'Your account is not assigned to a class yet. Contact your teacher.',
    };
  }
  const cls = await prisma.class.findUnique({ where: { id: classId }, select: { name: true } });
  return { classId, className: cls?.name ?? '' };
}
