import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type StatCardTone = 'primary' | 'green' | 'amber' | 'sky' | 'violet' | 'rose';

interface StatCardProps {
  icon: ReactNode;
  label: ReactNode;
  /** `null` while the count is still loading (shows a pulse skeleton), `'error'` if its fetch
   * failed (shows an em dash — one stat failing shouldn't block the others from rendering). */
  value: number | 'error' | null;
  /** Each tile gets its own accent (default `primary`) — a row of same-color tiles reads as
   * flat; distinct colors make each one individually scannable. */
  tone?: StatCardTone;
  className?: string;
}

const TONE_ICON_CLASSES: Record<StatCardTone, string> = {
  primary: 'bg-primary-500/15 text-primary-700',
  green: 'bg-emerald-500/15 text-emerald-700',
  amber: 'bg-amber-500/15 text-amber-700',
  sky: 'bg-sky-500/15 text-sky-700',
  violet: 'bg-violet-500/15 text-violet-700',
  rose: 'bg-rose-500/15 text-rose-700',
};

/** A single glanceable number for a dashboard's top strip — icon chip + the count + label, on a
 * frosted-glass surface ("glassmorphism" pass, 2026-10) so `.bg-app-canvas`'s color mesh shows
 * through. Each tile's icon chip carries its own `tone` instead of one repeated color, so the
 * row reads as a set of distinct metrics rather than a flat strip. */
function StatCard({ icon, label, value, tone = 'primary', className }: StatCardProps) {
  return (
    <div className={cn('flex items-center gap-3 rounded-xl border border-white/60 bg-glass-panel p-4 shadow-card', className)}>
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', TONE_ICON_CLASSES[tone])}>
        {icon}
      </span>
      <div className="min-w-0">
        {value === null ? (
          <div className="h-7 w-10 animate-pulse rounded bg-slate-200/70" />
        ) : (
          <p className="text-xl font-semibold tracking-tight text-base-black">
            {value === 'error' ? '—' : value.toLocaleString()}
          </p>
        )}
        <p className="truncate text-xs text-base-black/60">{label}</p>
      </div>
    </div>
  );
}

export default StatCard;
