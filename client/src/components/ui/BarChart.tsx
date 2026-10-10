import { useId, useState } from 'react';
import { cn } from '../../lib/cn';

export interface BarChartDatum {
  label: string;
  value: number;
  tooltipLabel?: string;
  subtitle?: string;
}

interface BarChartProps {
  data: BarChartDatum[];
  className?: string;
  height?: number;
}

function niceMax(value: number): number {
  if (value <= 0) return 5;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return Math.max(step * magnitude, 5);
}

function BarChart({ data, className, height }: BarChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const chartId = useId();
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const ticks = [max, Math.round(max * 0.75), Math.round(max * 0.5), Math.round(max * 0.25), 0];

  return (
    <div className={cn('select-none w-full h-full flex flex-col justify-between', className)}>
      <div
        className="relative flex items-stretch gap-2 flex-1 min-h-[180px]"
        style={height ? { height: `${height}px` } : undefined}
      >
        {/* Y Axis ticks */}
        <div className="flex w-9 shrink-0 flex-col justify-between py-1 text-right text-[11px] font-semibold tabular-nums text-slate-400">
          {ticks.map((tick, i) => (
            <span key={`${tick}-${i}`}>{tick}</span>
          ))}
        </div>

        {/* Chart Canvas */}
        <div className="relative flex flex-1 items-end gap-1.5 sm:gap-2 border-b border-l border-slate-200">
          {/* Horizontal Grid lines */}
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
            {ticks.map((tick, i) => (
              <div key={`grid-${tick}-${i}`} className="border-t border-slate-100 first:border-t-0" />
            ))}
          </div>

          {/* Bars */}
          {data.map((d, index) => {
            const heightPct = max > 0 ? (d.value / max) * 100 : 0;
            const isActive = activeIndex === index;
            return (
              <div
                key={`${chartId}-${d.label}-${index}`}
                className="group relative flex h-full flex-1 flex-col items-center justify-end"
                onMouseEnter={() => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
                tabIndex={0}
              >
                {/* Modern Hover Tooltip */}
                {isActive && (
                  <div className="absolute bottom-full z-30 mb-2 whitespace-nowrap rounded-xl bg-slate-900/95 px-3 py-1.5 text-xs text-white shadow-xl backdrop-blur-xs pointer-events-none transition-all">
                    <div className="font-bold text-white flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-primary-400" />
                      <span>{d.value} lượt nộp</span>
                    </div>
                    <div className="text-[10px] text-slate-300 font-medium">
                      {d.tooltipLabel ?? d.label}
                    </div>
                  </div>
                )}

                {/* Animated Column Bar */}
                <div
                  className={cn(
                    'w-full max-w-[32px] rounded-t-lg transition-all duration-200',
                    isActive
                      ? 'bg-gradient-to-t from-primary-600 to-indigo-500 shadow-md scale-x-105'
                      : d.value > 0
                        ? 'bg-gradient-to-t from-primary-500 to-primary-400 hover:from-primary-600 hover:to-primary-500'
                        : 'bg-slate-100 hover:bg-slate-200',
                  )}
                  style={{
                    height: `${Math.max(heightPct, d.value > 0 ? 5 : 2)}%`,
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* X Axis Labels */}
      <div className="mt-2.5 flex gap-1.5 sm:gap-2 pl-11">
        {data.map((d, index) => (
          <div
            key={`label-${chartId}-${d.label}-${index}`}
            className="flex-1 text-center text-[11px] font-medium text-slate-500 truncate"
            title={d.tooltipLabel ?? d.label}
          >
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default BarChart;
