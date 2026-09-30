import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';

interface HorizontalScrollHintProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/**
 * Wraps a horizontally-scrollable element with a soft edge fade that only shows while there is
 * more content to scroll to (left and/or right) — a visual "there's more this way" cue. Added
 * 2026-09 after a phone-width review found the gradebook/roster tables cut columns off with no
 * hint that scrolling revealed the rest, so a teacher could easily mistake a cut-off table for
 * the whole thing. Purely decorative: the wrapped element keeps its own scroll behaviour, props,
 * and ref-free markup — this only measures scroll position and overlays two gradients.
 */
function HorizontalScrollHint({ children, className = '', ...rest }: HorizontalScrollHintProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      setCanScrollLeft(el.scrollLeft > 2);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="relative">
      <div ref={ref} className={className} {...rest}>
        {children}
      </div>
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 left-0 w-6 rounded-l-xl bg-gradient-to-r from-base-white to-transparent transition-opacity duration-150 ${
          canScrollLeft ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 right-0 w-6 rounded-r-xl bg-gradient-to-l from-base-white to-transparent transition-opacity duration-150 ${
          canScrollRight ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
}

export default HorizontalScrollHint;
