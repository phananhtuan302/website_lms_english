import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { useActiveDesignSystem } from '../../lib/designSystems';

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
  { bg: string; text: string; border: string; borderLeft: string; iconBg: string; solid: string }
> = {
  primary: { bg: 'bg-blue-50/50', text: 'text-blue-600', border: 'border-blue-100', borderLeft: 'border-l-blue-500', iconBg: 'bg-blue-600 text-white', solid: 'bg-blue-600' },
  sky: { bg: 'bg-sky-50/50', text: 'text-sky-600', border: 'border-sky-100', borderLeft: 'border-l-sky-500', iconBg: 'bg-sky-500 text-white', solid: 'bg-sky-500' },
  violet: { bg: 'bg-purple-50/50', text: 'text-purple-600', border: 'border-purple-100', borderLeft: 'border-l-purple-500', iconBg: 'bg-purple-600 text-white', solid: 'bg-purple-600' },
  amber: { bg: 'bg-amber-50/50', text: 'text-amber-600', border: 'border-amber-100', borderLeft: 'border-l-amber-500', iconBg: 'bg-amber-500 text-white', solid: 'bg-amber-500' },
  rose: { bg: 'bg-rose-50/50', text: 'text-rose-600', border: 'border-rose-100', borderLeft: 'border-l-rose-500', iconBg: 'bg-rose-500 text-white', solid: 'bg-rose-500' },
  green: { bg: 'bg-emerald-50/50', text: 'text-emerald-600', border: 'border-emerald-100', borderLeft: 'border-l-emerald-500', iconBg: 'bg-emerald-500 text-white', solid: 'bg-emerald-500' },
};

function formatValue(value: StatCardProps['value']): ReactNode {
  if (value === null) return null;
  return value === 'error' ? '—' : value.toLocaleString();
}

/**
 * A single glanceable number for a dashboard's top strip. Branches its whole layout (not
 * just colors) per the active design system (`useActiveDesignSystem`, 2026-10 "5 Design
 * Systems" rebuild) — this is the component the "dashboard là tập hợp hộp thông tin rời
 * rạc" (box-in-box) complaint named most directly, so each design system gets a genuinely
 * different answer to "how do you show one number" rather than a recolored copy of the
 * same box. `null`/`legacy` (the 4 original `uiStyle`s, or none set) keeps the original
 * bordered-card-with-icon-chip rendering unchanged.
 */
function StatCard({ icon, label, value, tone = 'primary', className }: StatCardProps) {
  const design = useActiveDesignSystem();
  const conf = TONE_CONFIG[tone];
  const labelText = typeof label === 'string' ? label : undefined;

  if (design === 'minimalAcademic') {
    // A borderless row: icon muted and small, number and label inline, separated from
    // its neighbors by a hairline bottom rule instead of a boxed card.
    return (
      <div className={cn('flex items-center gap-3 border-b border-slate-100 py-3', className)}>
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center', conf.text)}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-slate-500" title={labelText}>
            {label}
          </p>
          {value === null ? (
            <div className="mt-1 h-6 w-12 animate-pulse rounded bg-slate-100" />
          ) : (
            <p className="font-display text-xl font-semibold text-base-black">{formatValue(value)}</p>
          )}
        </div>
      </div>
    );
  }

  if (design === 'editorialLearning') {
    // No icon, no box — a pull-quote-style number with a small-caps label above it. Pure
    // typography, separated from neighbors by whitespace alone.
    return (
      <div className={cn('py-1', className)}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500" title={labelText}>
          {label}
        </p>
        {value === null ? (
          <div className="mt-2 h-9 w-16 animate-pulse rounded bg-slate-100" />
        ) : (
          <p className="font-display mt-1 text-4xl font-bold leading-none text-base-black">{formatValue(value)}</p>
        )}
      </div>
    );
  }

  if (design === 'focusExam') {
    // Plain, high-contrast, functional — no color fill, no icon prominence, just a
    // bordered cell that reads instantly without competing for attention.
    return (
      <div className={cn('rounded-xl border border-slate-200 bg-base-white px-4 py-3', className)}>
        <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500" title={labelText}>
          {label}
        </p>
        {value === null ? (
          <div className="mt-1.5 h-7 w-14 animate-pulse rounded bg-slate-100" />
        ) : (
          <p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900">{formatValue(value)}</p>
        )}
      </div>
    );
  }

  if (design === 'contemporaryCreative') {
    // A solid color-filled block instead of a white card with a border — bold, but a
    // flat fill, never a gradient (explicitly ruled out for this style).
    return (
      <div className={cn('flex items-center gap-3 rounded-2xl p-4 text-white', conf.solid, className)}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-white/80" title={labelText}>
            {label}
          </p>
          {value === null ? (
            <div className="mt-1 h-7 w-14 animate-pulse rounded bg-white/20" />
          ) : (
            <p className="mt-0.5 text-2xl font-extrabold tracking-tight">{formatValue(value)}</p>
          )}
        </div>
      </div>
    );
  }

  if (design === 'minimalism') {
    // Notion-style: a quiet row with a small colored dot (not an icon chip — Notion's own
    // property rows use a plain glyph, never a colored circle), hairline divider below,
    // sans-only throughout (no display-font flourish).
    return (
      <div className={cn('flex items-center gap-2.5 border-b border-slate-100 py-2.5', className)}>
        <span aria-hidden="true" className={cn('h-1.5 w-1.5 shrink-0 rounded-full', conf.solid)} />
        <p className="min-w-0 flex-1 truncate text-sm text-slate-600" title={labelText}>
          {label}
        </p>
        {value === null ? (
          <div className="h-5 w-10 shrink-0 animate-pulse rounded bg-slate-100" />
        ) : (
          <p className="shrink-0 text-base font-semibold text-[#37352f]">{formatValue(value)}</p>
        )}
      </div>
    );
  }

  if (design === 'flatDesign') {
    // A solid flat-colored block — zero shadow, zero gradient, a thick left accent bar
    // instead of an icon chip (flat design's "color block as a label" convention).
    return (
      <div className={cn('flex items-center gap-3 border-l-4 bg-white p-4', conf.borderLeft, className)}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold uppercase tracking-wide text-slate-500" title={labelText}>
            {label}
          </p>
          {value === null ? (
            <div className="mt-1 h-7 w-14 animate-pulse rounded bg-slate-100" />
          ) : (
            <p className="mt-0.5 text-2xl font-bold text-slate-900">{formatValue(value)}</p>
          )}
        </div>
      </div>
    );
  }

  if (design === 'glassmorphism') {
    // A frosted glass tile: translucent fill + blur + a soft top highlight, icon in its
    // own smaller glass chip — the technique this style is literally named after.
    return (
      <div
        className={cn(
          'flex items-center gap-3 rounded-2xl border border-white/60 bg-white/40 p-4 shadow-[0_1px_0_0_rgb(255,255,255,0.6)_inset,0_8px_20px_-8px_rgb(31,41,55,0.2)] backdrop-blur-md',
          className,
        )}
      >
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/50 backdrop-blur-sm', conf.text)}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-600" title={labelText}>
            {label}
          </p>
          {value === null ? (
            <div className="mt-1 h-7 w-14 animate-pulse rounded bg-white/50" />
          ) : (
            <p className="mt-0.5 text-2xl font-bold text-slate-900">{formatValue(value)}</p>
          )}
        </div>
      </div>
    );
  }

  if (design === 'neumorphism') {
    // Same tone as the canvas, a dual soft shadow standing in for a border — looks
    // embossed/pressed out of the background rather than laid on top of it.
    return (
      <div
        className={cn('rounded-2xl bg-[#e6e9ef] p-4 shadow-[6px_6px_12px_-2px_rgb(163,177,198,0.55),-6px_-6px_12px_-2px_rgb(255,255,255,0.85)]', className)}
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e6e9ef] shadow-[3px_3px_6px_-1px_rgb(163,177,198,0.6),-3px_-3px_6px_-1px_rgb(255,255,255,0.9)]',
              conf.text,
            )}
          >
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500" title={labelText}>
              {label}
            </p>
            {value === null ? (
              <div className="mt-1 h-6 w-12 animate-pulse rounded bg-slate-300/40" />
            ) : (
              <p className="mt-0.5 text-xl font-bold text-slate-700">{formatValue(value)}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (design === 'swissDesign') {
    // Pure grid typography: a thin top rule, uppercase label, large tabular number — no
    // box, no icon, no radius, no shadow.
    return (
      <div className={cn('border-t-2 border-black pt-2', className)}>
        <p className="truncate text-[11px] font-bold uppercase tracking-[0.1em] text-slate-700" title={labelText}>
          {label}
        </p>
        {value === null ? (
          <div className="mt-1.5 h-8 w-14 animate-pulse bg-slate-100" />
        ) : (
          <p className="mt-0.5 text-3xl font-bold tabular-nums text-black">{formatValue(value)}</p>
        )}
      </div>
    );
  }

  if (design === 'neoBrutalism') {
    // Raw block: thick black border, hard offset shadow, zero radius, uppercase mono-ish
    // label — no icon chip, no gradient, no softness anywhere.
    return (
      <div className={cn('border-[3px] border-black bg-white p-4 shadow-[4px_4px_0_0_#000]', className)}>
        <p className="truncate text-xs font-bold uppercase tracking-wide text-black" title={labelText}>
          {label}
        </p>
        {value === null ? (
          <div className="mt-1.5 h-7 w-14 animate-pulse bg-slate-200" />
        ) : (
          <p className="font-display mt-0.5 text-2xl font-bold text-black">{formatValue(value)}</p>
        )}
      </div>
    );
  }

  if (design === 'materialDesign') {
    // M3 tonal container: no border, layered soft elevation, pill-leaning radius, icon in
    // its own rounded "tonal" chip.
    return (
      <div
        className={cn(
          'flex items-center gap-3 rounded-[1.75rem] bg-[#f3edf7] p-4 shadow-[0_1px_2px_0_rgb(0,0,0,0.3),0_1px_3px_1px_rgb(0,0,0,0.15)]',
          className,
        )}
      >
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', conf.iconBg)}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-slate-600" title={labelText}>
            {label}
          </p>
          {value === null ? (
            <div className="mt-1 h-7 w-14 animate-pulse rounded-full bg-white/60" />
          ) : (
            <p className="mt-0.5 text-2xl font-medium text-slate-900">{formatValue(value)}</p>
          )}
        </div>
      </div>
    );
  }

  if (design === 'cyberpunkNeon') {
    // Dark HUD tile: near-black panel, neon cyan edge glow, monospace tabular number —
    // reads like a terminal readout, not a card.
    return (
      <div
        className={cn(
          'rounded-md border border-cyan-400/30 bg-[#0b0e17] px-4 py-3 shadow-[0_0_0_1px_rgb(34,211,238,0.25),0_0_16px_-4px_rgb(34,211,238,0.35)]',
          className,
        )}
      >
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-300/80" title={labelText}>
          {label}
        </p>
        {value === null ? (
          <div className="mt-1.5 h-7 w-14 animate-pulse rounded bg-cyan-400/10" />
        ) : (
          <p className="font-display mt-0.5 text-2xl font-bold tabular-nums text-[#e7f9ff]">{formatValue(value)}</p>
        )}
      </div>
    );
  }

  if (design === 'playfulRetro') {
    // Cartoon-outline sticker: thick navy border, bouncy large radius, hard brand-colored
    // offset shadow, icon in a round confetti-dot chip.
    return (
      <div
        className={cn(
          'flex items-center gap-3 rounded-[1.5rem] border-2 border-[#28243d] bg-white p-4 shadow-[4px_4px_0_0_rgb(var(--color-primary-500))]',
          className,
        )}
      >
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', conf.iconBg)}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-bold uppercase tracking-wide text-[#28243d]/70" title={labelText}>
            {label}
          </p>
          {value === null ? (
            <div className="mt-1 h-7 w-14 animate-pulse rounded-full bg-slate-100" />
          ) : (
            <p className="mt-0.5 text-2xl font-extrabold text-[#28243d]">{formatValue(value)}</p>
          )}
        </div>
      </div>
    );
  }

  if (design === 'claymorphism') {
    // Puffy clay tile: pastel gradient fill, oversized radius, soft colorful dual shadow
    // instead of a border — looks sculpted, not laid flat.
    return (
      <div
        className={cn(
          'rounded-[1.75rem] bg-[linear-gradient(145deg,#ffffff,#f1eefc)] p-4 shadow-[8px_8px_16px_rgb(199,192,231,0.45),-8px_-8px_16px_rgb(255,255,255,0.9)]',
          className,
        )}
      >
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(145deg,#ffffff,#f1eefc)] shadow-[4px_4px_8px_rgb(199,192,231,0.5),-4px_-4px_8px_rgb(255,255,255,0.95)]',
              conf.text,
            )}
          >
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500" title={labelText}>
              {label}
            </p>
            {value === null ? (
              <div className="mt-1 h-7 w-14 animate-pulse rounded-full bg-white/70" />
            ) : (
              <p className="mt-0.5 text-2xl font-bold text-slate-700">{formatValue(value)}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // `modernSaas` and every legacy style (`glass`/`dark`/`brutalist`/`vivid`/unset): the
  // original bordered-card-with-icon-chip treatment, unchanged.
  return (
    <div
      className={cn(
        'group relative flex items-center justify-between gap-3 overflow-hidden rounded-2xl border bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
        conf.border,
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-bold uppercase tracking-wider text-slate-500" title={labelText}>
          {label}
        </p>
        {value === null ? (
          <div className="mt-1 h-7 w-14 animate-pulse rounded bg-slate-100" />
        ) : (
          <p className="mt-0.5 text-2xl font-black tracking-tight text-slate-900">{formatValue(value)}</p>
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
