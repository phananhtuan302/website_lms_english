/**
 * Student-facing class-scoped visibility (T-076, Phase 12). See PROJECT_PLAN Phase 12 /
 * Assumption A14 for the full class-based-organization design and `Class`'s doc comment
 * in `schema.prisma` for why content-to-class is an ASSIGNMENT (T-075), not ownership.
 * This module is the one place every list/gating endpoint reads a student's own classId
 * from, so the "only see/join content assigned to MY class" rule is applied identically
 * everywhere (self-practice tests, flashcard sets, Grammar topics, QR join, Unit Tests)
 * instead of being re-derived (and potentially gotten subtly wrong) per route.
 */

import { prisma } from './prisma';

/**
 * Loads the calling student's own `classId` fresh from the DB — never trusts the JWT
 * payload, which (per `AuthTokenPayload` in `@platform/shared`) doesn't carry `classId`
 * at all, so this is also correct-by-construction if a teacher/admin ever reassigns a
 * student's class after a token was already issued (no stale-token class leak).
 *
 * Returns `null` for a student with no class at all — shouldn't happen for any account
 * created after T-074 (registration requires one) or after T-075's migration backfill,
 * but every call site below treats `null` as "sees/can-join nothing class-scoped" rather
 * than crashing or (worse) silently treating it as "sees everything".
 */
export async function getStudentClassId(studentId: string): Promise<string | null> {
  const student = await prisma.user.findUnique({ where: { id: studentId }, select: { classId: true } });
  return student?.classId ?? null;
}

/** True if `assignedClassIds` (a content item's currently-assigned `Class` ids) includes
 * `studentClassId`. `studentClassId: null` is always `false` — a classless student is
 * never considered "in" any class's assignment. Small, but centralizing it means every
 * call site spells the same `some`/`includes` check identically. */
export function isAssignedToClass(assignedClassIds: string[], studentClassId: string | null): boolean {
  return studentClassId != null && assignedClassIds.includes(studentClassId);
}
