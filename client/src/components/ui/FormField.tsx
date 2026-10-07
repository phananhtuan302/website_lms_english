import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface FormFieldProps {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Label + control + optional hint/error, for a new or simple field. A field with its own
 * `<label>`-wraps-`<input>` pattern already in place (e.g. an inline-editable table row) should
 * keep that structure and only swap the `<input>` itself for the `Input` primitive — wrapping it
 * in `FormField` too would change its label association for no benefit. */
function FormField({ label, htmlFor, hint, error, children, className }: FormFieldProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-base-black">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-base-black/60">{hint}</p>
      ) : null}
    </div>
  );
}

export default FormField;
