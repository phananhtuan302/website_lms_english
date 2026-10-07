import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

type IconButtonSize = 'sm' | 'md';
type IconButtonTone = 'default' | 'danger';

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** Required — an icon-only button has no visible text, so this is its accessible name. */
  label: string;
  size?: IconButtonSize;
  tone?: IconButtonTone;
}

const SIZE_CLASSES: Record<IconButtonSize, string> = {
  md: 'h-10 w-10',
  sm: 'h-8 w-8',
};

const TONE_CLASSES: Record<IconButtonTone, string> = {
  default: 'text-base-black/70 hover:bg-primary-50 hover:text-primary-700',
  danger: 'text-red-600 hover:bg-red-50',
};

/** Icon-only button (bell, close ✕, row action icons). `label` becomes `aria-label`. */
function IconButton({ label, size = 'md', tone = 'default', className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cn(
        'inline-flex items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        SIZE_CLASSES[size],
        TONE_CLASSES[tone],
        className,
      )}
      {...rest}
    />
  );
}

export default IconButton;
