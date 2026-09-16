/**
 * Reporting engine v1 (T-019): the ONE shared module every filter dimension
 * (test/unit/week/month/quarter/semester/year) goes through, per the backlog's
 * "reusable cross-cutting infrastructure" guiding principle — not a one-off query per
 * dimension. Exposed via `GET /api/teacher/reports` (`teacherReports.routes.ts`).
 *
 * Design (documented choice — see PROJECT_PLAN.md Assumption A11): `groupBy` returns a
 * breakdown TABLE — one row per bucket for that granularity (every test, every unit,
 * every ISO week/month/quarter/year actually present in the data, or every Academic
 * Period) — rather than requiring the caller to name one exact period value. This
 * matches the backlog's "table/list of results" framing for the reports page and is
 * strictly more capable: an optional `testId` and/or `unitId` query param further
 * narrows the underlying attempts before bucketing (e.g. `groupBy=month&testId=X` shows
 * a monthly breakdown for one specific test; `groupBy=test&unitId=Y` shows a per-test
 * breakdown scoped to one unit's tests).
 *
 * Only `submitted` attempts are counted (T-017's convention: an abandoned/inProgress
 * attempt has `timeTakenSeconds`/`scorePercent` still `null` and must never corrupt an
 * average) — enforced once here, in the single query every dimension shares below.
 *
 * Timezone (Assumption A5): every date/time bucket boundary (week/month/quarter/year)
 * is computed against the FIXED `Asia/Ho_Chi_Minh` offset (UTC+7, no DST), never the
 * server's local timezone and never naive UTC. Since the offset never changes (no DST),
 * this is done with plain arithmetic (shift the UTC instant by +7h, read the shifted
 * instant's UTC calendar fields to get the "HCM local" Y/M/D/weekday) rather than a
 * timezone-database library — see `toHcmParts`/`hcmMidnightToUtc` below. This is the
 * same trick already documented informally by `curriculum.routes.ts`'s `parseHcmDate`,
 * generalized here to arbitrary instants (not just authored `YYYY-MM-DD` input).
 */

import type { TestType } from '@platform/shared';
import { prisma } from './prisma';

/** `student` added (T-037) alongside the original six — see `buildStudentBuckets`'s doc
 * comment below for what it powers. */
export const REPORT_GROUP_BY_VALUES = [
  'test',
  'unit',
  'student',
  'week',
  'month',
  'quarter',
  'semester',
  'year',
] as const;

export type ReportGroupBy = (typeof REPORT_GROUP_BY_VALUES)[number];

export interface ReportBucketResult {
  key: string;
  label: string;
  attemptCount: number;
  averageScorePercent: number | null;
  averageTimeTakenSeconds: number | null;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface ReportResult {
  groupBy: ReportGroupBy;
  testId: string | null;
  unitId: string | null;
  testType: TestType | null;
  buckets: ReportBucketResult[];
}

export interface ComputeReportOptions {
  /** Scopes every bucket to one teacher's own tests — required for the teacher-facing
   * `GET /api/teacher/reports` (unchanged behavior). Optional (T-037) ONLY for the
   * student/both-roles-visible Unit Test leaderboard
   * (`server/src/routes/unitLeaderboard.routes.ts`), which scopes by the (global) `Unit`
   * instead — see that file's doc comment for why a student has no single "their
   * teacher" to scope by, matching `Unit`/`AcademicPeriod`'s existing "global, not
   * per-teacher" convention (schema.prisma). Omitted/`null` means "every teacher's
   * tests" (still narrowed by `testId`/`unitId`/`testType` as given). */
  teacherId?: string | null;
  groupBy: ReportGroupBy;
  /** Narrows to one owned test's attempts. Caller (route handler) is responsible for
   * verifying this test actually belongs to `teacherId` BEFORE calling in — this module
   * trusts its inputs, same division of responsibility as `attemptView.ts`. */
  testId?: string | null;
  /** Narrows to attempts on tests tagged with this Unit. Units are global (not
   * per-teacher, see `schema.prisma`'s `Unit` doc comment), so no ownership check
   * applies here beyond "does this unit id exist" (route handler's job). */
  unitId?: string | null;
  /** Narrows to attempts on tests of this `Test.testType` (T-037: `unitTest`, for the
   * Unit Test report/leaderboard — "that unit's `unitTest`-type test(s)", not every test
   * ever tagged to the unit). Omitted means every type. */
  testType?: TestType | null;
  /** Narrows to attempts made by students in this ONE class (T-077, Phase 12) — an
   * attempt row has no `classId` of its own, only the attempting STUDENT does, so this
   * filters on `attempt.student.classId`, never on the test's own class assignment (the
   * same shared `Test` can be assigned to several classes; which class an attempt
   * "belongs to" is entirely determined by who took it, not what the test is assigned
   * to). Every caller (`teacherReports.routes.ts`, `unitLeaderboard.routes.ts`) resolves
   * a concrete, ownership-checked `classId` via `reportClassScope.ts` BEFORE calling in
   * here — required in practice for every real caller, but left optional on this type
   * (like `testId`/`unitId`) so a caller that has already computed "every class" (there is
   * none today) isn't forced to lie about one.
   *
   * `periodId` (T-099): when given ALONGSIDE `classId`, additionally narrows to tests
   * CURRENTLY assigned to that (class, period) pair — both the canonical zero-row test
   * list (`buildTestBuckets`) and the counted attempts themselves. This is what makes a
   * class-scoped report reflect "only this semester's assigned content" per the
   * customer's "each semester's content is completely separate" framing: switching a
   * class's `currentPeriodId` immediately changes what a report for that class shows,
   * without touching any attempt or assignment row. Every real caller resolves this via
   * `reportClassScope.ts`'s `requireClassPeriod` before calling in, same division of
   * responsibility as `classId` itself. */
  classId?: string | null;
  periodId?: string | null;
}

// --- Asia/Ho_Chi_Minh fixed-offset local-calendar math ------------------------------

const HCM_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Exported (T-050) so `computeGrammarReport` below reuses the exact same HCM-local
 * calendar-field shape rather than redeclaring it — see that function's doc comment. */
export interface HcmParts {
  year: number;
  /** 0-11, matches `Date`'s own month convention. */
  month: number;
  day: number;
  /** 0 = Monday .. 6 = Sunday (ISO weekday order, unlike `Date.getUTCDay()`'s 0=Sunday). */
  weekdayMon0: number;
}

/** Reads an instant's HCM-local calendar fields by shifting it +7h and reading the
 * shifted instant's UTC fields — valid because the offset is fixed (no DST) so this
 * never needs a timezone database. Exported (T-050) for reuse by `computeGrammarReport`
 * below — see that function's doc comment for why. */
export function toHcmParts(date: Date): HcmParts {
  const shifted = new Date(date.getTime() + HCM_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekdayMon0: (shifted.getUTCDay() + 6) % 7,
  };
}

/** Inverse of `toHcmParts`'s date construction: given an HCM-local calendar date
 * (midnight), returns the real UTC instant it represents. */
function hcmMidnightToUtc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day) - HCM_OFFSET_MS);
}

/**
 * Exported wrappers around the fixed-offset HCM month/year math above (T-032/T-033):
 * the vocabulary monthly/yearly ranking reports need the exact same `[start, end)` UTC
 * instant range this module already computes internally for `groupBy=month`/`year`
 * (via `monthBucketOf`/`yearBucketOf` below), so these are exported here rather than
 * reimplemented in `vocabLeaderboard.ts` — per the backlog's explicit instruction to
 * reuse T-019's period-bucketing convention, not reinvent date math. `month1to12` uses
 * calendar convention (1-12), matching how a teacher-facing UI would present it —
 * `monthBucketOf`'s internal `parts.month` (0-11) is only an implementation detail of
 * this module.
 */
export function hcmMonthRange(year: number, month1to12: number): { start: Date; end: Date } {
  const month0 = month1to12 - 1;
  return {
    start: hcmMidnightToUtc(year, month0, 1),
    end: hcmMidnightToUtc(year, month0 + 1, 1),
  };
}

export function hcmYearRange(year: number): { start: Date; end: Date } {
  return {
    start: hcmMidnightToUtc(year, 0, 1),
    end: hcmMidnightToUtc(year + 1, 0, 1),
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

/** Exported (T-050) alongside `HcmParts` — same reuse reasoning. */
export interface BucketDef {
  key: string;
  label: string;
  periodStart: Date | null;
  periodEnd: Date | null;
}

/** ISO-8601 week (Monday-Sunday) containing an HCM-local calendar date, via the
 * standard "nearest Thursday" algorithm applied to the HCM-local Y/M/D (not the
 * instant's UTC or server-local date). Exported (T-050) for reuse by
 * `computeGrammarReport` below. */
export function weekBucketOf(parts: HcmParts): BucketDef {
  const mondayY_M_D = new Date(Date.UTC(parts.year, parts.month, parts.day - parts.weekdayMon0));
  const mondayY = mondayY_M_D.getUTCFullYear();
  const mondayM = mondayY_M_D.getUTCMonth();
  const mondayD = mondayY_M_D.getUTCDate();

  // ISO week number: the week containing this Thursday determines both the week number
  // and the "ISO year" (which can differ from the calendar year for the first/last few
  // days of December/January).
  const thursday = new Date(Date.UTC(parts.year, parts.month, parts.day - parts.weekdayMon0 + 3));
  const isoYear = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstWeekday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstWeekday + 3);
  const isoWeek =
    1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * DAY_MS));

  const periodStart = hcmMidnightToUtc(mondayY, mondayM, mondayD);
  const periodEnd = new Date(periodStart.getTime() + 7 * DAY_MS);
  const sundayInstant = new Date(periodEnd.getTime() - DAY_MS);
  const sundayParts = toHcmParts(sundayInstant);

  return {
    key: `${isoYear}-W${pad2(isoWeek)}`,
    label: `Week ${isoYear}-W${pad2(isoWeek)} (${dateKey(mondayY, mondayM, mondayD)} to ${dateKey(sundayParts.year, sundayParts.month, sundayParts.day)})`,
    periodStart,
    periodEnd,
  };
}

/** Exported (T-050) for reuse by `computeGrammarReport` below. */
export function monthBucketOf(parts: HcmParts): BucketDef {
  const key = `${parts.year}-${pad2(parts.month + 1)}`;
  return {
    key,
    label: `Month ${key}`,
    periodStart: hcmMidnightToUtc(parts.year, parts.month, 1),
    periodEnd: hcmMidnightToUtc(parts.year, parts.month + 1, 1),
  };
}

/** Exported (T-050) for reuse by `computeGrammarReport` below. */
export function quarterBucketOf(parts: HcmParts): BucketDef {
  const quarter = Math.floor(parts.month / 3) + 1;
  const key = `${parts.year}-Q${quarter}`;
  const startMonth = (quarter - 1) * 3;
  return {
    key,
    label: `Quarter ${key}`,
    periodStart: hcmMidnightToUtc(parts.year, startMonth, 1),
    periodEnd: hcmMidnightToUtc(parts.year, startMonth + 3, 1),
  };
}

/** Exported (T-050) for reuse by `computeGrammarReport` below. */
export function yearBucketOf(parts: HcmParts): BucketDef {
  const key = `${parts.year}`;
  return {
    key,
    label: `Year ${key}`,
    periodStart: hcmMidnightToUtc(parts.year, 0, 1),
    periodEnd: hcmMidnightToUtc(parts.year + 1, 0, 1),
  };
}

// --- Shared accumulator --------------------------------------------------------------

interface BucketAccumulator {
  label: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  attemptCount: number;
  scoreSum: number;
  timeSum: number;
  /** Sort key: `periodStart` for time-based buckets, or an explicit override (e.g. Unit
   * `order`, or a test's title) for the non-time dimensions. */
  sortKey: number | string;
}

function finalizeBucket(key: string, acc: BucketAccumulator): ReportBucketResult {
  return {
    key,
    label: acc.label,
    attemptCount: acc.attemptCount,
    averageScorePercent:
      acc.attemptCount > 0 ? Number((acc.scoreSum / acc.attemptCount).toFixed(1)) : null,
    averageTimeTakenSeconds:
      acc.attemptCount > 0 ? Math.round(acc.timeSum / acc.attemptCount) : null,
    periodStart: acc.periodStart ? acc.periodStart.toISOString() : null,
    periodEnd: acc.periodEnd ? acc.periodEnd.toISOString() : null,
  };
}

/** The one query every dimension shares: every `submitted` attempt (with a non-null
 * score/time, defensively — see `Attempt`'s doc comment in schema.prisma) belonging to
 * the calling teacher, optionally narrowed to one test and/or one unit, with just enough
 * of the owning test's data to bucket by test/unit. */
async function fetchScopedAttempts(options: ComputeReportOptions) {
  return prisma.attempt.findMany({
    where: {
      status: 'submitted',
      scorePercent: { not: null },
      timeTakenSeconds: { not: null },
      // T-077: class scoping is on the ATTEMPTING STUDENT, not the test — see
      // `ComputeReportOptions.classId`'s doc comment above.
      ...(options.classId ? { student: { classId: options.classId } } : {}),
      test: {
        ...(options.teacherId ? { teacherId: options.teacherId } : {}),
        ...(options.testId ? { id: options.testId } : {}),
        ...(options.unitId ? { unitId: options.unitId } : {}),
        ...(options.testType ? { testType: options.testType } : {}),
        // T-099: additionally require the test to be CURRENTLY assigned to (classId,
        // periodId) — see `ComputeReportOptions.periodId`'s doc comment.
        ...(options.classId && options.periodId
          ? { classAssignments: { some: { classId: options.classId, periodId: options.periodId } } }
          : {}),
      },
    },
    select: {
      startedAt: true,
      scorePercent: true,
      timeTakenSeconds: true,
      testId: true,
      studentId: true,
      student: { select: { id: true, name: true } },
      test: { select: { id: true, title: true, unitId: true } },
    },
  });
}

type ScopedAttempt = Awaited<ReturnType<typeof fetchScopedAttempts>>[number];

function addToBucket(
  map: Map<string, BucketAccumulator>,
  key: string,
  def: Omit<BucketAccumulator, 'attemptCount' | 'scoreSum' | 'timeSum'>,
  attempt: ScopedAttempt,
): void {
  let acc = map.get(key);
  if (!acc) {
    acc = { ...def, attemptCount: 0, scoreSum: 0, timeSum: 0 };
    map.set(key, acc);
  }
  acc.attemptCount += 1;
  acc.scoreSum += attempt.scorePercent!;
  acc.timeSum += attempt.timeTakenSeconds!;
}

function sortBuckets(entries: Array<[string, BucketAccumulator]>): Array<[string, BucketAccumulator]> {
  return entries.sort(([, a], [, b]) => {
    if (a.sortKey < b.sortKey) return -1;
    if (a.sortKey > b.sortKey) return 1;
    return 0;
  });
}

// --- Per-dimension bucketing ----------------------------------------------------------

async function buildTestBuckets(
  options: ComputeReportOptions,
  attempts: ScopedAttempt[],
): Promise<ReportBucketResult[]> {
  // Canonical list of the teacher's own tests (matching the same optional unit filter)
  // so a test with zero completed attempts still appears as a 0-row, same convention as
  // `GET /api/teacher/tests` (T-017). T-099: further narrowed to tests CURRENTLY
  // assigned to (classId, periodId) when both are given — a class-scoped report's 0-row
  // list should reflect that class's THIS-SEMESTER content, not the teacher's whole
  // catalog (see `ComputeReportOptions.periodId`'s doc comment).
  const tests = await prisma.test.findMany({
    where: {
      ...(options.teacherId ? { teacherId: options.teacherId } : {}),
      ...(options.testId ? { id: options.testId } : {}),
      ...(options.unitId ? { unitId: options.unitId } : {}),
      ...(options.testType ? { testType: options.testType } : {}),
      ...(options.classId && options.periodId
        ? { classAssignments: { some: { classId: options.classId, periodId: options.periodId } } }
        : {}),
    },
    select: { id: true, title: true },
    orderBy: { title: 'asc' },
  });

  const map = new Map<string, BucketAccumulator>();
  for (const test of tests) {
    map.set(test.id, {
      label: test.title,
      periodStart: null,
      periodEnd: null,
      attemptCount: 0,
      scoreSum: 0,
      timeSum: 0,
      sortKey: test.title,
    });
  }
  for (const attempt of attempts) {
    addToBucket(
      map,
      attempt.testId,
      { label: attempt.test.title, periodStart: null, periodEnd: null, sortKey: attempt.test.title },
      attempt,
    );
  }

  return sortBuckets([...map.entries()]).map(([key, acc]) => finalizeBucket(key, acc));
}

/**
 * `groupBy: 'student'` (T-037) — powers the Unit Test leaderboard's "ranked scores":
 * every `student`-role account IN THE GIVEN CLASS (T-077 — see `ComputeReportOptions.classId`'s
 * doc comment; a 0-row default, same "0-row, not a missing row" convention as
 * `buildTestBuckets`/`buildUnitBuckets` above, but never a DIFFERENT class's students)
 * gets a bucket, and — UNLIKE every other dimension in this module — the result is sorted
 * by score DESCENDING (a leaderboard's whole point), not by the generic ascending
 * `sortBuckets` helper. A 0-attempt student's `averageScorePercent` is `null`; those sort
 * last (treated as -1 for comparison purposes only, never displayed as -1).
 */
async function buildStudentBuckets(
  options: ComputeReportOptions,
  attempts: ScopedAttempt[],
): Promise<ReportBucketResult[]> {
  const students = await prisma.user.findMany({
    where: { role: 'student', ...(options.classId ? { classId: options.classId } : {}) },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  const map = new Map<string, BucketAccumulator>();
  for (const student of students) {
    map.set(student.id, {
      label: student.name,
      periodStart: null,
      periodEnd: null,
      attemptCount: 0,
      scoreSum: 0,
      timeSum: 0,
      sortKey: student.name,
    });
  }
  for (const attempt of attempts) {
    addToBucket(
      map,
      attempt.studentId,
      { label: attempt.student.name, periodStart: null, periodEnd: null, sortKey: attempt.student.name },
      attempt,
    );
  }

  const finalized = [...map.entries()].map(([key, acc]) => finalizeBucket(key, acc));
  return finalized.sort((a, b) => (b.averageScorePercent ?? -1) - (a.averageScorePercent ?? -1));
}

const UNTAGGED_UNIT_KEY = 'untagged';

async function buildUnitBuckets(
  options: ComputeReportOptions,
  attempts: ScopedAttempt[],
): Promise<ReportBucketResult[]> {
  const units = await prisma.unit.findMany({
    where: options.unitId ? { id: options.unitId } : {},
    select: { id: true, name: true, order: true },
    orderBy: { order: 'asc' },
  });

  const map = new Map<string, BucketAccumulator>();
  for (const unit of units) {
    map.set(unit.id, {
      label: unit.name,
      periodStart: null,
      periodEnd: null,
      attemptCount: 0,
      scoreSum: 0,
      timeSum: 0,
      sortKey: unit.order,
    });
  }
  // "Untagged" (tests with no Unit) is only a meaningful bucket when not already
  // filtered down to one specific real unit id (a real `unitId` filter can never match
  // an untagged test, so this would just always read 0 in that case anyway — included
  // unconditionally for simplicity, since it's harmless either way).
  if (!options.unitId) {
    map.set(UNTAGGED_UNIT_KEY, {
      label: 'Untagged',
      periodStart: null,
      periodEnd: null,
      attemptCount: 0,
      scoreSum: 0,
      timeSum: 0,
      sortKey: Number.MAX_SAFE_INTEGER,
    });
  }

  for (const attempt of attempts) {
    const key = attempt.test.unitId ?? UNTAGGED_UNIT_KEY;
    if (!map.has(key) && key === UNTAGGED_UNIT_KEY) {
      // Defensive: only reachable if `options.unitId` was set (so the block above
      // skipped pre-seeding it) yet an untagged attempt still matched — impossible
      // given the `test.unitId: options.unitId` filter in `fetchScopedAttempts`, but
      // kept so this never silently drops a row if that invariant ever changes.
      map.set(key, {
        label: 'Untagged',
        periodStart: null,
        periodEnd: null,
        attemptCount: 0,
        scoreSum: 0,
        timeSum: 0,
        sortKey: Number.MAX_SAFE_INTEGER,
      });
    }
    addToBucket(map, key, map.get(key)!, attempt);
  }

  return sortBuckets([...map.entries()]).map(([key, acc]) => finalizeBucket(key, acc));
}

const UNASSIGNED_SEMESTER_KEY = 'unassigned';

async function buildSemesterBuckets(attempts: ScopedAttempt[]): Promise<ReportBucketResult[]> {
  const periods = await prisma.academicPeriod.findMany({
    orderBy: { startDate: 'asc' },
    select: { id: true, name: true, startDate: true, endDate: true },
  });

  const map = new Map<string, BucketAccumulator>();
  for (const period of periods) {
    map.set(period.id, {
      label: period.name,
      periodStart: period.startDate,
      periodEnd: period.endDate,
      attemptCount: 0,
      scoreSum: 0,
      timeSum: 0,
      sortKey: period.startDate.getTime(),
    });
  }
  map.set(UNASSIGNED_SEMESTER_KEY, {
    label: 'Unassigned (outside any academic period)',
    periodStart: null,
    periodEnd: null,
    attemptCount: 0,
    scoreSum: 0,
    timeSum: 0,
    sortKey: Number.MAX_SAFE_INTEGER,
  });

  for (const attempt of attempts) {
    // Derived at query time from `startedAt` falling within `[startDate, endDate)` —
    // never a stored FK, per `AcademicPeriod`'s doc comment in schema.prisma (a period's
    // dates can be edited after the fact; a derived lookup never goes stale).
    const match = periods.find(
      (p) => attempt.startedAt >= p.startDate && attempt.startedAt < p.endDate,
    );
    const key = match?.id ?? UNASSIGNED_SEMESTER_KEY;
    addToBucket(map, key, map.get(key)!, attempt);
  }

  return sortBuckets([...map.entries()]).map(([key, acc]) => finalizeBucket(key, acc));
}

function buildTimeBuckets(
  groupBy: 'week' | 'month' | 'quarter' | 'year',
  attempts: ScopedAttempt[],
): ReportBucketResult[] {
  const bucketOf =
    groupBy === 'week'
      ? weekBucketOf
      : groupBy === 'month'
        ? monthBucketOf
        : groupBy === 'quarter'
          ? quarterBucketOf
          : yearBucketOf;

  const map = new Map<string, BucketAccumulator>();
  for (const attempt of attempts) {
    const def = bucketOf(toHcmParts(attempt.startedAt));
    if (!map.has(def.key)) {
      map.set(def.key, {
        label: def.label,
        periodStart: def.periodStart,
        periodEnd: def.periodEnd,
        attemptCount: 0,
        scoreSum: 0,
        timeSum: 0,
        sortKey: (def.periodStart ?? new Date(0)).getTime(),
      });
    }
    addToBucket(map, def.key, map.get(def.key)!, attempt);
  }

  return sortBuckets([...map.entries()]).map(([key, acc]) => finalizeBucket(key, acc));
}

// --- Public entry point ----------------------------------------------------------------

/** Computes a full report breakdown table for one `groupBy` dimension. This is the
 * single function every filter dimension in T-019's acceptance criteria goes through —
 * see the module doc comment above for the "one shared engine, not one-off per-dimension
 * queries" reasoning. */
export async function computeReport(options: ComputeReportOptions): Promise<ReportResult> {
  const attempts = await fetchScopedAttempts(options);

  let buckets: ReportBucketResult[];
  switch (options.groupBy) {
    case 'test':
      buckets = await buildTestBuckets(options, attempts);
      break;
    case 'unit':
      buckets = await buildUnitBuckets(options, attempts);
      break;
    case 'student':
      buckets = await buildStudentBuckets(options, attempts);
      break;
    case 'semester':
      buckets = await buildSemesterBuckets(attempts);
      break;
    default:
      buckets = buildTimeBuckets(options.groupBy, attempts);
      break;
  }

  return {
    groupBy: options.groupBy,
    testId: options.testId ?? null,
    unitId: options.unitId ?? null,
    testType: options.testType ?? null,
    buckets,
  };
}

// --- Grammar reports (T-050) -----------------------------------------------------------
//
// Extends this module ADDITIVELY: a new exported function (`computeGrammarReport`)
// alongside the existing `computeReport` above, reusing the exact same HCM-local
// time-bucketing math (`toHcmParts`/`weekBucketOf`/`monthBucketOf`/`quarterBucketOf`/
// `yearBucketOf`, exported above for this purpose) rather than reimplementing ISO-week/
// month/quarter/year arithmetic a second time. Nothing about `computeReport`'s own code
// path above is modified.
//
// Grammar practice has no `Test`-shaped "attempt" (score/time-taken over many
// questions) — instead every single exercise submission is its own row
// (`GrammarExerciseAttempt`, T-048), so the bucket metric here is REINTERPRETED rather
// than reshaped: `averageScorePercent` means "percent of exercise submissions answered
// correctly" (accuracy) in this bucket, and `averageTimeTakenSeconds` is always `null`
// (Grammar practice exercises aren't timed) — both fields keep their existing meaning
// closely enough that the client's existing `ReportBucketResult`/`ReportBucketDTO` shape
// is reused as-is (see `@platform/shared`'s `GrammarReportResponseDTO` doc comment).
//
// Unlike `Unit`/`AcademicPeriod` (genuinely global curriculum entities), `GrammarTopic`
// has real per-teacher ownership everywhere else (T-047's CRUD 404s a non-owner) — so
// this report MUST scope to the calling teacher's own topics by default, the same way
// `computeReport` above requires a `teacherId`. (Fixed as T-063: an earlier version of
// this comment incorrectly treated Grammar topics as global and let `groupBy=topic`/
// the attempt query return every teacher's data when no `topicId` filter was given.)
// `topicId`, when given, is still expected to have already been ownership-checked by the
// route handler (`teacherGrammar.routes.ts`) before calling in here — this module additionally
// enforces `teacherId` directly on the topic relation as defense in depth.

export const GRAMMAR_REPORT_GROUP_BY_VALUES = [
  'topic',
  'student',
  'week',
  'month',
  'quarter',
  'semester',
  'year',
] as const;

export type GrammarReportGroupBy = (typeof GRAMMAR_REPORT_GROUP_BY_VALUES)[number];

export interface GrammarReportResult {
  groupBy: GrammarReportGroupBy;
  topicId: string | null;
  studentId: string | null;
  buckets: ReportBucketResult[];
}

export interface ComputeGrammarReportOptions {
  groupBy: GrammarReportGroupBy;
  /** The calling teacher — required (T-063). Every topic considered by this report,
   * including the canonical zero-attempt rows in `groupBy=topic`, is restricted to
   * topics owned by this teacher. */
  teacherId: string;
  /** Narrows to one Grammar topic's attempts. */
  topicId?: string | null;
  /** Narrows to one student's attempts (the "per-student" half of T-050's acceptance
   * criteria; omitted means "per-class", i.e. every student). */
  studentId?: string | null;
  /** Narrows to attempts made by students in this ONE class (T-077, Phase 12) — same
   * "the ATTEMPTING STUDENT's classId, not the topic's own class assignment" reasoning as
   * `ComputeReportOptions.classId` above. Resolved by the route handler via
   * `reportClassScope.ts` before calling in. */
  classId?: string | null;
  /** T-099 — same "additionally require CURRENT (class, period) assignment" rule as
   * `ComputeReportOptions.periodId`, applied to `GrammarTopic` instead of `Test`. */
  periodId?: string | null;
}

interface GrammarBucketAccumulator {
  label: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  attemptCount: number;
  correctCount: number;
  sortKey: number | string;
}

function finalizeGrammarBucket(key: string, acc: GrammarBucketAccumulator): ReportBucketResult {
  return {
    key,
    label: acc.label,
    attemptCount: acc.attemptCount,
    averageScorePercent:
      acc.attemptCount > 0 ? Number(((acc.correctCount / acc.attemptCount) * 100).toFixed(1)) : null,
    // Grammar practice exercises aren't timed (unlike a Test attempt) — always null,
    // same "don't fake a zero" convention as every other averageTimeTakenSeconds field.
    averageTimeTakenSeconds: null,
    periodStart: acc.periodStart ? acc.periodStart.toISOString() : null,
    periodEnd: acc.periodEnd ? acc.periodEnd.toISOString() : null,
  };
}

/** The one query every Grammar-report dimension shares — mirrors `fetchScopedAttempts`
 * above but over `GrammarExerciseAttempt` rows instead of `Attempt` rows. Every row here
 * already has a non-null `isCorrect` (computed synchronously at submission time, see
 * `GrammarExerciseAttempt`'s doc comment in schema.prisma), so — unlike
 * `fetchScopedAttempts` — there's no "still in progress, exclude it" filter needed. */
async function fetchScopedGrammarAttempts(options: ComputeGrammarReportOptions) {
  return prisma.grammarExerciseAttempt.findMany({
    where: {
      topic: {
        teacherId: options.teacherId,
        // T-099: additionally require the topic to be CURRENTLY assigned to (classId,
        // periodId) — see `ComputeGrammarReportOptions.periodId`'s doc comment.
        ...(options.classId && options.periodId
          ? { classAssignments: { some: { classId: options.classId, periodId: options.periodId } } }
          : {}),
      },
      ...(options.topicId ? { topicId: options.topicId } : {}),
      ...(options.studentId ? { studentId: options.studentId } : {}),
      ...(options.classId ? { student: { classId: options.classId } } : {}),
    },
    select: {
      createdAt: true,
      isCorrect: true,
      topicId: true,
      studentId: true,
      topic: { select: { id: true, title: true } },
      student: { select: { id: true, name: true } },
    },
  });
}

type ScopedGrammarAttempt = Awaited<ReturnType<typeof fetchScopedGrammarAttempts>>[number];

function addToGrammarBucket(
  map: Map<string, GrammarBucketAccumulator>,
  key: string,
  def: Omit<GrammarBucketAccumulator, 'attemptCount' | 'correctCount'>,
  attempt: ScopedGrammarAttempt,
): void {
  let acc = map.get(key);
  if (!acc) {
    acc = { ...def, attemptCount: 0, correctCount: 0 };
    map.set(key, acc);
  }
  acc.attemptCount += 1;
  if (attempt.isCorrect) acc.correctCount += 1;
}

function sortGrammarBuckets(
  entries: Array<[string, GrammarBucketAccumulator]>,
): Array<[string, GrammarBucketAccumulator]> {
  return entries.sort(([, a], [, b]) => {
    if (a.sortKey < b.sortKey) return -1;
    if (a.sortKey > b.sortKey) return 1;
    return 0;
  });
}

async function buildGrammarTopicBuckets(
  options: ComputeGrammarReportOptions,
  attempts: ScopedGrammarAttempt[],
): Promise<ReportBucketResult[]> {
  // Canonical list of Grammar topics (matching the same optional `topicId` filter) so a
  // topic with zero attempts yet still appears as a 0-row — same convention as
  // `buildTestBuckets` above. T-099: further narrowed to topics CURRENTLY assigned to
  // (classId, periodId) when both are given.
  const topics = await prisma.grammarTopic.findMany({
    where: {
      teacherId: options.teacherId,
      ...(options.topicId ? { id: options.topicId } : {}),
      ...(options.classId && options.periodId
        ? { classAssignments: { some: { classId: options.classId, periodId: options.periodId } } }
        : {}),
    },
    select: { id: true, title: true },
    orderBy: { title: 'asc' },
  });

  const map = new Map<string, GrammarBucketAccumulator>();
  for (const topic of topics) {
    map.set(topic.id, {
      label: topic.title,
      periodStart: null,
      periodEnd: null,
      attemptCount: 0,
      correctCount: 0,
      sortKey: topic.title,
    });
  }
  for (const attempt of attempts) {
    addToGrammarBucket(
      map,
      attempt.topicId,
      { label: attempt.topic.title, periodStart: null, periodEnd: null, sortKey: attempt.topic.title },
      attempt,
    );
  }

  return sortGrammarBuckets([...map.entries()]).map(([key, acc]) => finalizeGrammarBucket(key, acc));
}

async function buildGrammarStudentBuckets(
  options: ComputeGrammarReportOptions,
  attempts: ScopedGrammarAttempt[],
): Promise<ReportBucketResult[]> {
  // Canonical list of students (T-050's "per-class" view: every student, even ones with
  // zero Grammar attempts yet, per the same "0-row, not a missing row" convention used
  // throughout this module) — narrowed to one student when `studentId` is given (the
  // "per-student" half of T-050's acceptance criteria).
  const students = await prisma.user.findMany({
    where: {
      role: 'student',
      ...(options.studentId ? { id: options.studentId } : {}),
      ...(options.classId ? { classId: options.classId } : {}),
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  const map = new Map<string, GrammarBucketAccumulator>();
  for (const student of students) {
    map.set(student.id, {
      label: student.name,
      periodStart: null,
      periodEnd: null,
      attemptCount: 0,
      correctCount: 0,
      sortKey: student.name,
    });
  }
  for (const attempt of attempts) {
    addToGrammarBucket(
      map,
      attempt.studentId,
      {
        label: attempt.student.name,
        periodStart: null,
        periodEnd: null,
        sortKey: attempt.student.name,
      },
      attempt,
    );
  }

  return sortGrammarBuckets([...map.entries()]).map(([key, acc]) => finalizeGrammarBucket(key, acc));
}

const UNASSIGNED_GRAMMAR_SEMESTER_KEY = 'unassigned';

async function buildGrammarSemesterBuckets(
  attempts: ScopedGrammarAttempt[],
): Promise<ReportBucketResult[]> {
  const periods = await prisma.academicPeriod.findMany({
    orderBy: { startDate: 'asc' },
    select: { id: true, name: true, startDate: true, endDate: true },
  });

  const map = new Map<string, GrammarBucketAccumulator>();
  for (const period of periods) {
    map.set(period.id, {
      label: period.name,
      periodStart: period.startDate,
      periodEnd: period.endDate,
      attemptCount: 0,
      correctCount: 0,
      sortKey: period.startDate.getTime(),
    });
  }
  map.set(UNASSIGNED_GRAMMAR_SEMESTER_KEY, {
    label: 'Unassigned (outside any academic period)',
    periodStart: null,
    periodEnd: null,
    attemptCount: 0,
    correctCount: 0,
    sortKey: Number.MAX_SAFE_INTEGER,
  });

  for (const attempt of attempts) {
    const match = periods.find(
      (p) => attempt.createdAt >= p.startDate && attempt.createdAt < p.endDate,
    );
    const key = match?.id ?? UNASSIGNED_GRAMMAR_SEMESTER_KEY;
    addToGrammarBucket(map, key, map.get(key)!, attempt);
  }

  return sortGrammarBuckets([...map.entries()]).map(([key, acc]) => finalizeGrammarBucket(key, acc));
}

function buildGrammarTimeBuckets(
  groupBy: 'week' | 'month' | 'quarter' | 'year',
  attempts: ScopedGrammarAttempt[],
): ReportBucketResult[] {
  const bucketOf =
    groupBy === 'week'
      ? weekBucketOf
      : groupBy === 'month'
        ? monthBucketOf
        : groupBy === 'quarter'
          ? quarterBucketOf
          : yearBucketOf;

  const map = new Map<string, GrammarBucketAccumulator>();
  for (const attempt of attempts) {
    const def = bucketOf(toHcmParts(attempt.createdAt));
    if (!map.has(def.key)) {
      map.set(def.key, {
        label: def.label,
        periodStart: def.periodStart,
        periodEnd: def.periodEnd,
        attemptCount: 0,
        correctCount: 0,
        sortKey: (def.periodStart ?? new Date(0)).getTime(),
      });
    }
    addToGrammarBucket(map, def.key, map.get(def.key)!, attempt);
  }

  return sortGrammarBuckets([...map.entries()]).map(([key, acc]) => finalizeGrammarBucket(key, acc));
}

/** Computes a Grammar-practice report breakdown table (T-050), alongside `computeReport`
 * above — see this section's module doc comment for the accuracy/no-time-tracking
 * reinterpretation and the additive-only reasoning. */
export async function computeGrammarReport(
  options: ComputeGrammarReportOptions,
): Promise<GrammarReportResult> {
  const attempts = await fetchScopedGrammarAttempts(options);

  let buckets: ReportBucketResult[];
  switch (options.groupBy) {
    case 'topic':
      buckets = await buildGrammarTopicBuckets(options, attempts);
      break;
    case 'student':
      buckets = await buildGrammarStudentBuckets(options, attempts);
      break;
    case 'semester':
      buckets = await buildGrammarSemesterBuckets(attempts);
      break;
    default:
      buckets = buildGrammarTimeBuckets(options.groupBy, attempts);
      break;
  }

  return {
    groupBy: options.groupBy,
    topicId: options.topicId ?? null,
    studentId: options.studentId ?? null,
    buckets,
  };
}

// --- Speaking reports (T-057) -----------------------------------------------------------
//
// Extends this module ADDITIVELY once more, same reasoning as `computeGrammarReport`
// above: reuses the exact same HCM-local bucketing helpers (`toHcmParts`/`weekBucketOf`/
// `monthBucketOf`/`quarterBucketOf`/`yearBucketOf`) rather than a third reimplementation
// of the date math, so the "single reporting area" T-057 builds on the client side has a
// real, consistent engine underneath for the Speaking module rather than reading
// Speaking scores off individual attempts one at a time.
//
// Speaking has no `Test`-shaped "attempt" score either (like Grammar) — the meaningful
// unit here is a single graded `Answer` row for a `speaking`-type `Question`
// (`speakingSubmittedAt` non-null, per T-054/T-064). `averageScorePercent` means "average
// effective Speaking score" — the teacher's override (`Answer.manualScore`, T-055) when
// present, else the AI grade (`Answer.speakingAiScore`, T-051/T-054), matching exactly
// what `AttemptResultQuestionDTO`'s "teacher value wins" rule already shows a student
// (see that DTO's doc comment in `@platform/shared`). `averageTimeTakenSeconds` is always
// `null` — a Speaking answer's response window (T-052/T-064) is a per-question time
// limit, not a whole-attempt duration, so faking a number here would be misleading; same
// "don't fake it" convention `computeGrammarReport` already established for its own
// always-timeless metric.

export const SPEAKING_REPORT_GROUP_BY_VALUES = [
  'test',
  'unit',
  'week',
  'month',
  'quarter',
  'semester',
  'year',
] as const;

export type SpeakingReportGroupBy = (typeof SPEAKING_REPORT_GROUP_BY_VALUES)[number];

export interface SpeakingReportResult {
  groupBy: SpeakingReportGroupBy;
  testId: string | null;
  unitId: string | null;
  buckets: ReportBucketResult[];
}

export interface ComputeSpeakingReportOptions {
  /** Required — scopes to the calling teacher's own tests, same as `computeReport`'s
   * `teacherId` (Speaking questions, unlike `Unit`/`AcademicPeriod`, live inside a
   * teacher-owned `Test`, so there is no "global" reading of this report). */
  teacherId: string;
  groupBy: SpeakingReportGroupBy;
  /** Narrows to one owned test's Speaking answers. Caller (route handler) verifies
   * ownership before calling in, same division of responsibility as `computeReport`. */
  testId?: string | null;
  /** Narrows to Speaking answers on tests tagged with this Unit. */
  unitId?: string | null;
  /** Narrows to Speaking answers submitted by students in this ONE class (T-077, Phase
   * 12) — same "the attempting student's classId, not the test's own class assignment"
   * reasoning as `ComputeReportOptions.classId` above. Resolved by the route handler via
   * `reportClassScope.ts` before calling in. */
  classId?: string | null;
  /** T-099 — same "additionally require CURRENT (class, period) assignment" rule as
   * `ComputeReportOptions.periodId`. */
  periodId?: string | null;
}

interface SpeakingBucketAccumulator {
  label: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  /** Count of graded Speaking answers falling in this bucket (there is no broader
   * "attempt" concept for this report — see module doc comment above). */
  attemptCount: number;
  scoreSum: number;
  sortKey: number | string;
}

function finalizeSpeakingBucket(key: string, acc: SpeakingBucketAccumulator): ReportBucketResult {
  return {
    key,
    label: acc.label,
    attemptCount: acc.attemptCount,
    averageScorePercent:
      acc.attemptCount > 0 ? Number((acc.scoreSum / acc.attemptCount).toFixed(1)) : null,
    averageTimeTakenSeconds: null,
    periodStart: acc.periodStart ? acc.periodStart.toISOString() : null,
    periodEnd: acc.periodEnd ? acc.periodEnd.toISOString() : null,
  };
}

/** The one query every Speaking-report dimension shares — mirrors
 * `fetchScopedGrammarAttempts` above but over graded `Answer` rows for `speaking`-type
 * questions, joined through `Attempt`/`Test` for ownership + test/unit bucketing. */
async function fetchScopedSpeakingAnswers(options: ComputeSpeakingReportOptions) {
  return prisma.answer.findMany({
    where: {
      speakingSubmittedAt: { not: null },
      question: { type: 'speaking' },
      attempt: {
        test: {
          teacherId: options.teacherId,
          ...(options.testId ? { id: options.testId } : {}),
          ...(options.unitId ? { unitId: options.unitId } : {}),
          // T-099: additionally require the test to be CURRENTLY assigned to (classId,
          // periodId) — see `ComputeSpeakingReportOptions.periodId`'s doc comment.
          ...(options.classId && options.periodId
            ? { classAssignments: { some: { classId: options.classId, periodId: options.periodId } } }
            : {}),
        },
        ...(options.classId ? { student: { classId: options.classId } } : {}),
      },
    },
    select: {
      speakingSubmittedAt: true,
      manualScore: true,
      speakingAiScore: true,
      attempt: { select: { testId: true, test: { select: { id: true, title: true, unitId: true } } } },
    },
  });
}

type ScopedSpeakingAnswer = Awaited<ReturnType<typeof fetchScopedSpeakingAnswers>>[number];

/** Teacher-override-wins effective score (T-055) — same rule `AttemptResultQuestionDTO`
 * documents for what a student sees. Defensive `?? 0` fallback: unreachable in practice
 * since `speakingSubmittedAt` is only ever set once `speakingAiScore` has also been
 * written (T-054), but keeps this report from ever throwing on a row that shouldn't
 * exist rather than silently excluding it. */
function effectiveSpeakingScore(answer: ScopedSpeakingAnswer): number {
  return answer.manualScore ?? answer.speakingAiScore ?? 0;
}

function addToSpeakingBucket(
  map: Map<string, SpeakingBucketAccumulator>,
  key: string,
  def: Omit<SpeakingBucketAccumulator, 'attemptCount' | 'scoreSum'>,
  answer: ScopedSpeakingAnswer,
): void {
  let acc = map.get(key);
  if (!acc) {
    acc = { ...def, attemptCount: 0, scoreSum: 0 };
    map.set(key, acc);
  }
  acc.attemptCount += 1;
  acc.scoreSum += effectiveSpeakingScore(answer);
}

function sortSpeakingBuckets(
  entries: Array<[string, SpeakingBucketAccumulator]>,
): Array<[string, SpeakingBucketAccumulator]> {
  return entries.sort(([, a], [, b]) => {
    if (a.sortKey < b.sortKey) return -1;
    if (a.sortKey > b.sortKey) return 1;
    return 0;
  });
}

async function buildSpeakingTestBuckets(
  options: ComputeSpeakingReportOptions,
  answers: ScopedSpeakingAnswer[],
): Promise<ReportBucketResult[]> {
  // Canonical list of the teacher's own tests that actually contain a Speaking question
  // (matching the same optional unit filter), so a Speaking-bearing test with zero
  // graded answers yet still appears as a 0-row — same convention as `buildTestBuckets`.
  const tests = await prisma.test.findMany({
    where: {
      teacherId: options.teacherId,
      ...(options.testId ? { id: options.testId } : {}),
      ...(options.unitId ? { unitId: options.unitId } : {}),
      sections: { some: { questions: { some: { type: 'speaking' } } } },
      // T-099: further narrowed to tests CURRENTLY assigned to (classId, periodId) when
      // both are given.
      ...(options.classId && options.periodId
        ? { classAssignments: { some: { classId: options.classId, periodId: options.periodId } } }
        : {}),
    },
    select: { id: true, title: true },
    orderBy: { title: 'asc' },
  });

  const map = new Map<string, SpeakingBucketAccumulator>();
  for (const test of tests) {
    map.set(test.id, {
      label: test.title,
      periodStart: null,
      periodEnd: null,
      attemptCount: 0,
      scoreSum: 0,
      sortKey: test.title,
    });
  }
  for (const answer of answers) {
    addToSpeakingBucket(
      map,
      answer.attempt.testId,
      {
        label: answer.attempt.test.title,
        periodStart: null,
        periodEnd: null,
        sortKey: answer.attempt.test.title,
      },
      answer,
    );
  }

  return sortSpeakingBuckets([...map.entries()]).map(([key, acc]) => finalizeSpeakingBucket(key, acc));
}

const UNTAGGED_SPEAKING_UNIT_KEY = 'untagged';

async function buildSpeakingUnitBuckets(
  options: ComputeSpeakingReportOptions,
  answers: ScopedSpeakingAnswer[],
): Promise<ReportBucketResult[]> {
  const units = await prisma.unit.findMany({
    where: options.unitId ? { id: options.unitId } : {},
    select: { id: true, name: true, order: true },
    orderBy: { order: 'asc' },
  });

  const map = new Map<string, SpeakingBucketAccumulator>();
  for (const unit of units) {
    map.set(unit.id, {
      label: unit.name,
      periodStart: null,
      periodEnd: null,
      attemptCount: 0,
      scoreSum: 0,
      sortKey: unit.order,
    });
  }
  if (!options.unitId) {
    map.set(UNTAGGED_SPEAKING_UNIT_KEY, {
      label: 'Untagged',
      periodStart: null,
      periodEnd: null,
      attemptCount: 0,
      scoreSum: 0,
      sortKey: Number.MAX_SAFE_INTEGER,
    });
  }

  for (const answer of answers) {
    const key = answer.attempt.test.unitId ?? UNTAGGED_SPEAKING_UNIT_KEY;
    if (!map.has(key)) {
      map.set(key, {
        label: 'Untagged',
        periodStart: null,
        periodEnd: null,
        attemptCount: 0,
        scoreSum: 0,
        sortKey: Number.MAX_SAFE_INTEGER,
      });
    }
    addToSpeakingBucket(map, key, map.get(key)!, answer);
  }

  return sortSpeakingBuckets([...map.entries()]).map(([key, acc]) => finalizeSpeakingBucket(key, acc));
}

const UNASSIGNED_SPEAKING_SEMESTER_KEY = 'unassigned';

async function buildSpeakingSemesterBuckets(
  answers: ScopedSpeakingAnswer[],
): Promise<ReportBucketResult[]> {
  const periods = await prisma.academicPeriod.findMany({
    orderBy: { startDate: 'asc' },
    select: { id: true, name: true, startDate: true, endDate: true },
  });

  const map = new Map<string, SpeakingBucketAccumulator>();
  for (const period of periods) {
    map.set(period.id, {
      label: period.name,
      periodStart: period.startDate,
      periodEnd: period.endDate,
      attemptCount: 0,
      scoreSum: 0,
      sortKey: period.startDate.getTime(),
    });
  }
  map.set(UNASSIGNED_SPEAKING_SEMESTER_KEY, {
    label: 'Unassigned (outside any academic period)',
    periodStart: null,
    periodEnd: null,
    attemptCount: 0,
    scoreSum: 0,
    sortKey: Number.MAX_SAFE_INTEGER,
  });

  for (const answer of answers) {
    const submittedAt = answer.speakingSubmittedAt!;
    const match = periods.find((p) => submittedAt >= p.startDate && submittedAt < p.endDate);
    const key = match?.id ?? UNASSIGNED_SPEAKING_SEMESTER_KEY;
    addToSpeakingBucket(map, key, map.get(key)!, answer);
  }

  return sortSpeakingBuckets([...map.entries()]).map(([key, acc]) => finalizeSpeakingBucket(key, acc));
}

function buildSpeakingTimeBuckets(
  groupBy: 'week' | 'month' | 'quarter' | 'year',
  answers: ScopedSpeakingAnswer[],
): ReportBucketResult[] {
  const bucketOf =
    groupBy === 'week'
      ? weekBucketOf
      : groupBy === 'month'
        ? monthBucketOf
        : groupBy === 'quarter'
          ? quarterBucketOf
          : yearBucketOf;

  const map = new Map<string, SpeakingBucketAccumulator>();
  for (const answer of answers) {
    const def = bucketOf(toHcmParts(answer.speakingSubmittedAt!));
    if (!map.has(def.key)) {
      map.set(def.key, {
        label: def.label,
        periodStart: def.periodStart,
        periodEnd: def.periodEnd,
        attemptCount: 0,
        scoreSum: 0,
        sortKey: (def.periodStart ?? new Date(0)).getTime(),
      });
    }
    addToSpeakingBucket(map, def.key, map.get(def.key)!, answer);
  }

  return sortSpeakingBuckets([...map.entries()]).map(([key, acc]) => finalizeSpeakingBucket(key, acc));
}

/** Computes a Speaking report breakdown table (T-057), alongside `computeReport`/
 * `computeGrammarReport` above — see this section's module doc comment. */
export async function computeSpeakingReport(
  options: ComputeSpeakingReportOptions,
): Promise<SpeakingReportResult> {
  const answers = await fetchScopedSpeakingAnswers(options);

  let buckets: ReportBucketResult[];
  switch (options.groupBy) {
    case 'test':
      buckets = await buildSpeakingTestBuckets(options, answers);
      break;
    case 'unit':
      buckets = await buildSpeakingUnitBuckets(options, answers);
      break;
    case 'semester':
      buckets = await buildSpeakingSemesterBuckets(answers);
      break;
    default:
      buckets = buildSpeakingTimeBuckets(options.groupBy, answers);
      break;
  }

  return {
    groupBy: options.groupBy,
    testId: options.testId ?? null,
    unitId: options.unitId ?? null,
    buckets,
  };
}
