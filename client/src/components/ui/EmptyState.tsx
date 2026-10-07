import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface EmptyStateProps {
  title: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** "No results" placeholder (title + optional hint/icon/action). For a plain loading state, keep
 * the simple `<p className="text-sm text-base-black/60">{t('common.loading')}</p>` pattern — this
 * is for "the request finished and there's genuinely nothing to show". */
function EmptyState({ title, hint, icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-2 px-4 py-10 text-center', className)}>
      {icon && <div className="text-primary-300">{icon}</div>}
      <p className="text-sm font-semibold text-base-black">{title}</p>
      {hint && <p className="text-sm text-base-black/60">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export default EmptyState;
