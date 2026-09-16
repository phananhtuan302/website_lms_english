/**
 * Student-facing class-scoped visibility (T-076, Phase 12; extended T-099 with the
 * semester/`AcademicPeriod` dimension). See PROJECT_PLAN Phase 12 / Assumption A14 for
 * the full class-based-organization design and `Class`'s doc comment in `schema.prisma`
 * for why content-to-class-to-period is an ASSIGNMENT, not ownership. This module is the
 * one place every list/gating endpoint reads a student's own class+period from, so the
 * "only see/join content assigned to MY class, for MY class's CURRENT semester" rule is
 * applied identically everywhere (self-practice tests, flashcard sets, Grammar topics, QR
 * join, Unit Tests) instead of being re-derived (and potentially gotten subtly wrong) per
 * route.
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
 *
 * Kept alongside `getStudentClassAndPeriod` below (rather than replaced by it) for the
 * rare call site that genuinely only needs the classId itself with no period dimension —
 * every content-visibility/enforcement check added or touched by T-099 uses
 * `getStudentClassAndPeriod` instead.
 */
export async function getStudentClassId(studentId: string): Promise<string | null> {
  const student = await prisma.user.findUnique({ where: { id: studentId }, select: { classId: true } });
  return student?.classId ?? null;
}

/** A student's own class + that class's CURRENTLY SELECTED semester (T-099). */
export interface StudentClassPeriod {
  classId: string;
  /** The student's class's `currentPeriodId` — `null` when the teacher hasn't picked one
   * yet. Every caller must treat a `null` periodId EXACTLY like "no class" already
   * degrades everywhere in this codebase: an empty list / a clean rejection, never a
   * crash (BACKLOG.md T-099's explicit instruction). */
  periodId: string | null;
}

/**
 * Loads the calling student's own class AND that class's current semester, fresh from
 * the DB (same "never trust the JWT" reasoning as `getStudentClassId` above) — the T-099
 * extension every content-to-class-to-period visibility/enforcement check now goes
 * through instead of the old classId-only helper. Returns `null` only when the student
 * has no class at all; a classed student whose class has no `currentPeriodId` yet still
 * gets a result, just with `periodId: null` — callers check that field explicitly rather
 * than treating this function's own return value as the sole signal, so the two distinct
 * "nothing to scope against" causes (no class vs. no current period) are both handled by
 * the exact same downstream "empty/clean-rejection" code path without being conflated at
 * this layer.
 */
export async function getStudentClassAndPeriod(studentId: string): Promise<StudentClassPeriod | null> {
  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: { classId: true, class: { select: { currentPeriodId: true } } },
  });
  if (!student?.classId) return null;
  return { classId: student.classId, periodId: student.class?.currentPeriodId ?? null };
}

/** True if `assignedClassIds` (a content item's currently-assigned `Class` ids) includes
 * `studentClassId`. `studentClassId: null` is always `false` — a classless student is
 * never considered "in" any class's assignment. Small, but centralizing it means every
 * call site spells the same `some`/`includes` check identically.
 *
 * Kept for any remaining plain classId-only caller — every content-assignment check
 * T-099 touches uses `isAssignedToClassPeriod` below instead, since presence in the new
 * 3-key join tables is checked with a direct DB lookup (see e.g.
 * `studentFlashcards.routes.ts`'s `loadSetWithCards`), not by first collecting a whole
 * `assignedClassIds` array client-side. */
export function isAssignedToClass(assignedClassIds: string[], studentClassId: string | null): boolean {
  return studentClassId != null && assignedClassIds.includes(studentClassId);
}

/** True if `scp` (this student's own class+period, from `getStudentClassAndPeriod`)
 * matches one of `assignedPairs` (a content item's currently-assigned (classId, periodId)
 * pairs). `scp: null` or a `null` `scp.periodId` is always `false` — a classless student,
 * or one whose class has no current semester selected yet, is never considered "in" any
 * class's assignment (T-099's "degrades like no class" rule). */
export function isAssignedToClassPeriod(
  assignedPairs: Array<{ classId: string; periodId: string }>,
  scp: StudentClassPeriod | null,
): boolean {
  if (!scp || scp.periodId == null) return false;
  return assignedPairs.some((p) => p.classId === scp.classId && p.periodId === scp.periodId);
}
