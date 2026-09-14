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

import { prisma } from './prisma';

export const REPORT_GROUP_BY_VALUES = [
  'test',
  'unit',
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
  buckets: ReportBucketResult[];
}

export interface ComputeReportOptions {
  teacherId: string;
  groupBy: ReportGroupBy;
  /** Narrows to one owned test's attempts. Caller (route handler) is responsible for
   * verifying this test actually belongs to `teacherId` BEFORE calling in — this module
   * trusts its inputs, same division of responsibility as `attemptView.ts`. */
  testId?: string | null;
  /** Narrows to attempts on tests tagged with this Unit. Units are global (not
   * per-teacher, see `schema.prisma`'s `Unit` doc comment), so no ownership check
   * applies here beyond "does this unit id exist" (route handler's job). */
  unitId?: string | null;
}

// --- Asia/Ho_Chi_Minh fixed-offset local-calendar math ------------------------------

const HCM_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

interface HcmParts {
  year: number;
  /** 0-11, matches `Date`'s own month convention. */
  month: number;
  day: number;
  /** 0 = Monday .. 6 = Sunday (ISO weekday order, unlike `Date.getUTCDay()`'s 0=Sunday). */
  weekdayMon0: number;
}

/** Reads an instant's HCM-local calendar fields by shifting it +7h and reading the
 * shifted instant's UTC fields — valid because the offset is fixed (no DST) so this
 * never needs a timezone database. */
function toHcmParts(date: Date): HcmParts {
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

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

interface BucketDef {
  key: string;
  label: string;
  periodStart: Date | null;
  periodEnd: Date | null;
}

/** ISO-8601 week (Monday-Sunday) containing an HCM-local calendar date, via the
 * standard "nearest Thursday" algorithm applied to the HCM-local Y/M/D (not the
 * instant's UTC or server-local date). */
function weekBucketOf(parts: HcmParts): BucketDef {
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

function monthBucketOf(parts: HcmParts): BucketDef {
  const key = `${parts.year}-${pad2(parts.month + 1)}`;
  return {
    key,
    label: `Month ${key}`,
    periodStart: hcmMidnightToUtc(parts.year, parts.month, 1),
    periodEnd: hcmMidnightToUtc(parts.year, parts.month + 1, 1),
  };
}

function quarterBucketOf(parts: HcmParts): BucketDef {
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

function yearBucketOf(parts: HcmParts): BucketDef {
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
      test: {
        teacherId: options.teacherId,
        ...(options.testId ? { id: options.testId } : {}),
        ...(options.unitId ? { unitId: options.unitId } : {}),
      },
    },
    select: {
      startedAt: true,
      scorePercent: true,
      timeTakenSeconds: true,
      testId: true,
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
  // `GET /api/teacher/tests` (T-017).
  const tests = await prisma.test.findMany({
    where: {
      teacherId: options.teacherId,
      ...(options.testId ? { id: options.testId } : {}),
      ...(options.unitId ? { unitId: options.unitId } : {}),
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
    buckets,
  };
}
