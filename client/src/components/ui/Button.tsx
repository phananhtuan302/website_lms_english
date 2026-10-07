import type { ButtonHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { cn } from '../../lib/cn';

export type ButtonVariant = 'solid' | 'outline' | 'ghost';
export type ButtonTone = 'primary' | 'danger';
export type ButtonSize = 'sm' | 'md';

interface ButtonStyleProps {
  variant?: ButtonVariant;
  tone?: ButtonTone;
  size?: ButtonSize;
}

const BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-md font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none';

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: 'px-4 py-2 text-sm',
  sm: 'px-3 py-1.5 text-xs',
};

// "Luxury" pass — the brand hue is now the ONE accent reserved for `solid` (the actual primary
// action of a section), so it stands out instead of competing with a dozen other colored
// buttons on the same page. `outline`/`ghost` read as neutral/secondary (slate), matching how
// a premium product mutes everything except the one thing it wants you to do next.
const VARIANT_TONE_CLASSES: Record<ButtonVariant, Record<ButtonTone, string>> = {
  // A resting `shadow-card` + a colorful `shadow-glow` on hover (plus a 1px lift) — makes the
  // primary action on a page visibly "pop" instead of reading as flat colored text on a fill.
  solid: {
    primary: 'bg-primary-600 text-base-white shadow-card hover:-translate-y-px hover:bg-primary-700 hover:shadow-glow',
    danger: 'bg-red-600 text-base-white shadow-card hover:-translate-y-px hover:bg-red-700 hover:shadow-card-hover',
  },
  outline: {
    primary: 'border border-slate-300 bg-base-white text-slate-700 hover:border-slate-400 hover:bg-slate-50',
    danger: 'border border-red-300 bg-base-white text-red-700 hover:bg-red-50',
  },
  ghost: {
    primary: 'font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    danger: 'font-medium text-red-600 hover:bg-red-50',
  },
};

/** Builds the class string on its own so non-`<button>` elements (e.g. `LinkButton` below, or a
 * one-off `<Link>`) can look exactly like a `Button` without duplicating the style rules. */
export function buttonClassName(
  { variant = 'solid', tone = 'primary', size = 'md' }: ButtonStyleProps = {},
  className?: string,
): string {
  return cn(BASE, SIZE_CLASSES[size], VARIANT_TONE_CLASSES[variant][tone], className);
}

interface ButtonProps extends ButtonStyleProps, ButtonHTMLAttributes<HTMLButtonElement> {}

/** Shared button primitive (2026-10 "Modern SaaS" design system). Covers the three button looks
 * already used across the app (solid/outline/ghost) plus a `danger` tone for destructive actions
 * — see `buttonClassName` for the exact class per combination. */
function Button({ variant, tone, size, className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={buttonClassName({ variant, tone, size }, className)} {...rest} />;
}

interface LinkButtonProps extends ButtonStyleProps, LinkProps {}

/** Same look as `Button`, for navigation (`react-router-dom`'s `Link`) instead of an action. */
export function LinkButton({ variant, tone, size, className, ...rest }: LinkButtonProps) {
  return <Link className={buttonClassName({ variant, tone, size }, className)} {...rest} />;
}

export default Button;
