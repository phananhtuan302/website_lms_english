import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

type BadgeTone = 'primary' | 'green' | 'amber' | 'sky' | 'red' | 'neutral';
type BadgeVariant = 'solid' | 'subtle';

interface BadgeProps {
  tone?: BadgeTone;
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const SUBTLE_CLASSES: Record<BadgeTone, string> = {
  primary: 'bg-primary-100 text-primary-800',
  green: 'bg-green-100 text-green-800',
  amber: 'bg-amber-100 text-amber-800',
  sky: 'bg-sky-100 text-sky-800',
  red: 'bg-red-100 text-red-800',
  neutral: 'bg-slate-100 text-slate-700',
};

const SOLID_CLASSES: Record<BadgeTone, string> = {
  primary: 'bg-primary-500 text-base-white',
  green: 'bg-green-600 text-base-white',
  amber: 'bg-amber-500 text-base-white',
  sky: 'bg-sky-600 text-base-white',
  red: 'bg-red-600 text-base-white',
  neutral: 'bg-slate-600 text-base-white',
};

/** Small status/type pill. `variant="subtle"` (default) is the tinted-background look used for
 * notification type chips; `variant="solid"` is a filled pill for when it needs to stand out more. */
function Badge({ tone = 'neutral', variant = 'subtle', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        variant === 'subtle' ? SUBTLE_CLASSES[tone] : SOLID_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export default Badge;
