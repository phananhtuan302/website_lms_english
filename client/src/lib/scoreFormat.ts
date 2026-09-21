/**
 * Score display (Phase 15): the platform stores every score as a PERCENT (`Attempt.scorePercent`,
 * 0–100), but a Vietnamese teacher, student or parent reads "điểm" on the thang điểm 10 —
 * "8,5" (decimal COMMA), "8/10", never "85%". Everything a person reads goes through these helpers;
 * a percent stays only where it is an internal number.
 */

/** Percent (0–100) → thang điểm 10, rounded to ONE decimal (half up): 85 → 8.5, 66.7 → 6.7. */
export function percentToScore10(percent: number): number {
  return Math.round(percent) / 10;
}

/** "8,5" — decimal comma, and a whole score drops the ".0": 80 → "8", 100 → "10", 66.7 → "6,7".
 * `null`/`undefined` (nothing to show) → "—". */
export function formatScore10(percent: number | null | undefined): string {
  if (percent === null || percent === undefined || Number.isNaN(percent)) return '—';
  const value = percentToScore10(percent);
  return (Number.isInteger(value) ? String(value) : value.toFixed(1)).replace('.', ',');
}

/** "8,5/10" (or "—" when there is no score). */
export function formatScore10WithUnit(percent: number | null | undefined): string {
  return percent === null || percent === undefined || Number.isNaN(percent)
    ? '—'
    : `${formatScore10(percent)}/10`;
}

/** A plain number of points such as an essay score: "4,5" (comma, no trailing ".0"). */
export function formatPoints(points: number): string {
  const rounded = Math.round(points * 100) / 100;
  return String(rounded).replace('.', ',');
}
