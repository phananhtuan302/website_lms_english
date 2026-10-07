import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

type CardPadding = 'sm' | 'md' | 'lg';
type CardVariant = 'plain' | 'tinted' | 'glass';

interface CardStyleProps {
  padding?: CardPadding;
  variant?: CardVariant;
  /** Adds a hover shadow lift — for a card that's also a click target (e.g. wraps a `Link`). */
  hoverable?: boolean;
}

const PADDING_CLASSES: Record<CardPadding, string> = {
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

// `tinted` is a neutral slate wash, not a pastel of the brand hue: a page full of pale-orange
// boxes reads as "friendly SaaS", not premium. The brand color still shows up deliberately
// elsewhere (buttons, active nav, icon chips, the page background mesh), just not as a flat fill.
//
// "Glassmorphism" pass (2026-10) — `glass` (`.bg-glass-panel`, index.css) is a frosted,
// semi-transparent panel meant to float over `.bg-app-canvas`'s color mesh (`AppShell`'s content
// background) — a white border reads as a lit edge against that, where the other variants'
// slate border would look muddy.
const VARIANT_CLASSES: Record<CardVariant, string> = {
  plain: 'border-slate-200 bg-base-white',
  tinted: 'border-slate-200 bg-slate-50',
  glass: 'border-white/60 bg-glass-panel',
};

/** Builds the class string on its own so a non-`<div>` element (e.g. a `Link` styled as a card)
 * can match `Card` exactly without duplicating the style rules. */
export function cardClassName(
  { padding = 'md', variant = 'plain', hoverable = false }: CardStyleProps = {},
  className?: string,
): string {
  return cn(
    'rounded-xl border shadow-card',
    VARIANT_CLASSES[variant],
    PADDING_CLASSES[padding],
    hoverable && 'transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card-hover',
    className,
  );
}

interface CardProps extends CardStyleProps, HTMLAttributes<HTMLDivElement> {}

function Card({ padding, variant, hoverable, className, ...rest }: CardProps) {
  return <div className={cardClassName({ padding, variant, hoverable }, className)} {...rest} />;
}

export default Card;
