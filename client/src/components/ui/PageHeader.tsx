import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** A small icon rendered in a colored rounded chip to the left of the title — gives every page
   * its own visual identity at a glance instead of an identical bare heading everywhere. */
  icon?: ReactNode;
  className?: string;
}

/** `<h1>` + subtitle + optional action row, the pattern every page used to hand-roll.
 *
 * "Quiet utility" pass (2026-10): a premium ADMIN TOOL (Linear, Stripe, Vercel) reads as
 * restrained, not decorative — dropped the serif display face and the dark gradient icon
 * chip from the earlier "luxury" pass (closer to a marketing hero than a dashboard heading)
 * for a plain sans heading and a small, quiet monochrome icon. Data is the thing that's
 * allowed to be loud here, not the chrome around it. */
function PageHeader({ title, subtitle, actions, icon, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-center gap-3', className)}>
      {icon && (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-semibold tracking-tight text-base-black">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-base-black/60">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export default PageHeader;
