import { useState } from 'react';
import { cn } from '../../lib/cn';

export interface BarChartDatum {
  /** Short x-axis label (e.g. a weekday abbreviation). */
  label: string;
  value: number;
  /** Fuller description shown in the tooltip only (e.g. the full date). Falls back to `label`. */
  tooltipLabel?: string;
}

interface BarChartProps {
  data: BarChartDatum[];
  className?: string;
}

/** Rounds a max value up to a "clean" tick (1/2/5 × a power of ten) so axis labels read as
 * round numbers instead of an arbitrary max like 17. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

/**
 * Single-series bar chart (dataviz skill: one hue for one series, 4px rounded data-end, hairline
 * gridlines, per-bar hover tooltip, no legend needed for a single series). Built for a small
 * embedded trend — e.g. "attempts per day" on the admin dashboard — from data the page already
 * has, not a generic charting dependency.
 */
function BarChart({ data, className }: BarChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const ticks = [max, Math.round(max / 2), 0];

  return (
    <div className={cn('select-none', className)}>
      <p className="sr-only">
        {data.map((d) => `${d.tooltipLabel ?? d.label}: ${d.value}`).join('; ')}
      </p>
      <div aria-hidden="true" className="flex h-36 items-stretch gap-1">
        <div className="flex w-8 shrink-0 flex-col justify-between py-0 text-right text-[11px] leading-none text-slate-400">
          {ticks.map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </div>
        <div className="relative flex flex-1 items-end gap-2 border-l border-slate-200">
          {/* Gridlines at 0% / 50% / 100% — hairline, recessive. */}
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
            {ticks.map((tick) => (
              <div key={tick} className="border-t border-slate-100 first:border-t-0" />
            ))}
          </div>
          {data.map((d, index) => {
            const heightPct = max > 0 ? (d.value / max) * 100 : 0;
            const isActive = activeIndex === index;
            return (
              <div
                key={`${d.label}-${index}`}
                className="group relative flex h-full flex-1 flex-col items-center justify-end"
                onMouseEnter={() => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
                onFocus={() => setActiveIndex(index)}
                onBlur={() => setActiveIndex(null)}
                tabIndex={0}
                role="img"
                aria-label={`${d.tooltipLabel ?? d.label}: ${d.value}`}
              >
                {isActive && (
                  <div className="absolute bottom-full z-10 mb-1.5 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-base-white shadow-dropdown">
                    <span className="font-semibold">{d.value}</span>{' '}
                    <span className="text-slate-300">{d.tooltipLabel ?? d.label}</span>
                  </div>
                )}
                <div
                  className={cn(
                    'w-full max-w-[22px] rounded-t bg-primary-600 transition-colors',
                    isActive && 'bg-primary-700',
                  )}
                  style={{ height: `${heightPct}%`, minHeight: d.value > 0 ? 3 : 0 }}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-1.5 flex gap-2 pl-9">
        {data.map((d, index) => (
          <div key={`${d.label}-${index}`} className="flex-1 text-center text-[11px] text-slate-400">
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default BarChart;
