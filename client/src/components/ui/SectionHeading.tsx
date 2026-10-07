import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

type SectionHeadingLevel = 'lg' | 'md';

interface SectionHeadingProps {
  level?: SectionHeadingLevel;
  children: ReactNode;
  className?: string;
}

const LEVEL_CLASSES: Record<SectionHeadingLevel, string> = {
  lg: 'text-lg font-bold text-base-black',
  md: 'text-base font-bold text-base-black',
};

/** A section's own heading within a page (not `Modal`'s title, which keeps its own class). */
function SectionHeading({ level = 'lg', children, className }: SectionHeadingProps) {
  return <h2 className={cn(LEVEL_CLASSES[level], className)}>{children}</h2>;
}

export default SectionHeading;
