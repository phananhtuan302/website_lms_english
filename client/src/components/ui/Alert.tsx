import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

type AlertTone = 'error' | 'success' | 'info';

interface AlertProps {
  tone?: AlertTone;
  children: ReactNode;
  className?: string;
}

const TONE_CLASSES: Record<AlertTone, string> = {
  error: 'border-red-200 bg-red-50 text-red-700',
  success: 'border-green-200 bg-green-50 text-green-700',
  info: 'border-primary-200 bg-primary-50 text-primary-700',
};

/** Inline alert box. `tone="error"` gets `role="alert"` (announced immediately); the others get
 * `role="status"` (announced politely) since they aren't reporting a failure. */
function Alert({ tone = 'error', children, className }: AlertProps) {
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={cn('rounded-md border px-3 py-2 text-sm', TONE_CLASSES[tone], className)}>
      {children}
    </p>
  );
}

export default Alert;
