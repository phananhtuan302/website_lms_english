/**
 * Shared validation for the content-to-class(-period) assignment endpoints (T-075, Phase
 * 12; extended T-099 with the semester dimension): `PUT
 * /api/teacher/{tests,flashcard-sets,grammar-topics}/:id/classes`, one per content type
 * but all sharing this exact same rule.
 *
 * These are ASSIGNMENTS, not ownership (PROJECT_PLAN Phase 12's "critical design
 * correction") — a `Test`/`FlashcardSet`/`GrammarTopic` keeps its single `teacherId` as
 * always, and is separately assignable to zero or more of that SAME teacher's `Class`es
 * (each under that class's own CURRENT semester, as of T-099 — the actual (class, period)
 * write, per content type, lives inline in each of the three routers below this
 * validation step, since each writes to its own distinct `*ClassPeriodAssignment` Prisma
 * model). The one rule every call site must enforce: every incoming classId must
 * reference a `Class` owned by the CONTENT's own teacher — never the calling user's id
 * directly. This distinction matters for an
 * admin caller (who bypasses ownership checks on the content itself, per
 * `isAdminOrOwner`/Assumption A12, but owns no classes of their own): when an admin
 * manages teacher X's test, the valid classIds are teacher X's classes, not admin's — so
 * every route below passes the loaded content row's own `teacherId`, not `req.user!.sub`.
 */

import { prisma } from './prisma';

export type ClassIdsValidationResult = { error: string } | { classIds: string[] };

/**
 * Validates `value` (the raw `classIds` field of an `UpdateContentClassesRequest` body)
 * against the classes owned by `ownerTeacherId`. Returns `{ error }` (an English message,
 * same "return a string or null-ish sentinel" convention as every other `validate*`
 * helper in this codebase) if the shape is wrong OR any id doesn't reference a class this
 * teacher owns (which also covers "doesn't exist at all" — same "don't distinguish
 * missing vs. someone else's" reasoning as `requireOwnedTest`'s 404s, though this is a
 * 400 here since it's a request-body validation failure, not a path-param lookup).
 * Otherwise returns `{ classIds }` — the deduplicated, validated list to persist.
 */
export async function validateClassIdsForOwner(
  value: unknown,
  ownerTeacherId: string,
): Promise<ClassIdsValidationResult> {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    return { error: 'classIds must be an array of class id strings.' };
  }

  const classIds = [...new Set(value as string[])];
  if (classIds.length === 0) {
    return { classIds: [] };
  }

  const owned = await prisma.class.findMany({
    where: { id: { in: classIds }, teacherId: ownerTeacherId },
    select: { id: true },
  });
  if (owned.length !== classIds.length) {
    return {
      error:
        'One or more classIds do not reference a class owned by this content’s teacher. You can only assign content to your own classes.',
    };
  }

  return { classIds };
}

/**
 * Every one of `ownerTeacherId`'s own classes that HAS a current semester selected
 * (T-099), paired with that class's own `currentPeriodId` — shared by all three content
 * types' `.../classes` GET/PUT handlers (`teacherTests.routes.ts`/
 * `teacherFlashcards.routes.ts`/`teacherGrammar.routes.ts`), since each needs the exact
 * same "which (class, period) pairs could this content possibly be assigned to right
 * now" set before reading/replacing its own `*ClassPeriodAssignment` rows. A class with
 * `currentPeriodId: null` can never appear here (nothing to key an assignment against
 * yet) — same "degrades like no class" rule used everywhere else T-099 touches.
 */
export async function loadOwnerClassesWithCurrentPeriod(
  ownerTeacherId: string,
): Promise<Array<{ classId: string; periodId: string }>> {
  const classes = await prisma.class.findMany({
    where: { teacherId: ownerTeacherId },
    select: { id: true, currentPeriodId: true },
  });
  return classes
    .filter((c): c is { id: string; currentPeriodId: string } => c.currentPeriodId != null)
    .map((c) => ({ classId: c.id, periodId: c.currentPeriodId }));
}
