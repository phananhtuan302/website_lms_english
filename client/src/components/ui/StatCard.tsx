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

const TONE_CONFIG: Record<
  StatCardTone,
  { bg: string; text: string; border: string; iconBg: string }
> = {
  primary: {
    bg: 'bg-blue-50/50',
    text: 'text-blue-600',
    border: 'border-blue-100',
    iconBg: 'bg-blue-600 text-white',
  },
  sky: {
    bg: 'bg-sky-50/50',
    text: 'text-sky-600',
    border: 'border-sky-100',
    iconBg: 'bg-sky-500 text-white',
  },
  violet: {
    bg: 'bg-purple-50/50',
    text: 'text-purple-600',
    border: 'border-purple-100',
    iconBg: 'bg-purple-600 text-white',
  },
  amber: {
    bg: 'bg-amber-50/50',
    text: 'text-amber-600',
    border: 'border-amber-100',
    iconBg: 'bg-amber-500 text-white',
  },
  rose: {
    bg: 'bg-rose-50/50',
    text: 'text-rose-600',
    border: 'border-rose-100',
    iconBg: 'bg-rose-500 text-white',
  },
  green: {
    bg: 'bg-emerald-50/50',
    text: 'text-emerald-600',
    border: 'border-emerald-100',
    iconBg: 'bg-emerald-500 text-white',
  },
};

/** A single glanceable number for a dashboard's top strip — modern SaaS card */
function StatCard({ icon, label, value, tone = 'primary', className }: StatCardProps) {
  const conf = TONE_CONFIG[tone];
  return (
    <div
      className={cn(
        'group relative flex items-center justify-between gap-3 overflow-hidden rounded-2xl border bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
        conf.border,
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-bold uppercase tracking-wider text-slate-500" title={typeof label === 'string' ? label : undefined}>
          {label}
        </p>
        {value === null ? (
          <div className="mt-1 h-7 w-14 animate-pulse rounded bg-slate-100" />
        ) : (
          <p className="mt-0.5 text-2xl font-black tracking-tight text-slate-900">
            {value === 'error' ? '—' : value.toLocaleString()}
          </p>
        )}
      </div>
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-xs transition-transform duration-200 group-hover:scale-105',
          conf.iconBg,
        )}
      >
        {icon}
      </span>
    </div>
  );
}

export default StatCard;
