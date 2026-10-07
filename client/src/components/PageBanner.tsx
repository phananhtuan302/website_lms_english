import type { ReactNode } from 'react';
import BannerIllustration from './BannerIllustration';

interface PageBannerProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** `hero` (default) is the big, roomy version for a landing page; `compact` is a slim welcome
   * strip meant to sit above a page's own heading without competing with it (used on the
   * teacher class list). */
  size?: 'hero' | 'compact';
  className?: string;
}

/**
 * Reusable decorative banner (2026-09, customer request: "background, hình banner đẹp mắt") —
 * a gradient panel in the site's own brand hue, never an external image (no licensing/broken-
 * link risk, nothing to load). Used on the public home page, the auth pages' side panel
 * (`AuthLayout`), and the teacher class list.
 *
 * "Luxury" pass (2026-10): dropped the dot-grid texture and the top-right blur blob — a very
 * recognizable "generic AI dashboard" combination — in favor of `BannerIllustration`, a small
 * hand-drawn card/checkmark composition (`hero` size only; `compact` stays plain, it's a slim
 * strip with no room for one).
 */
function PageBanner({ eyebrow, title, subtitle, actions, size = 'hero', className = '' }: PageBannerProps) {
  const isCompact = size === 'compact';
  return (
    <div
      // A deeper, richer gradient (700→600→950, was 600→500→800) reads as a jewel tone instead
      // of a bright candy wash; the `hero` title now uses `font-display` (Playfair Display,
      // loaded in `index.html`) for an editorial moment — `compact` stays sans/bold since it's
      // a slim strip, not a hero.
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-700 via-primary-600 to-primary-950 text-base-white shadow-panel ${
        isCompact ? 'px-5 py-4 sm:px-8 sm:py-5' : 'px-6 py-10 sm:px-10 sm:py-14'
      } ${className}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-20 left-1/4 h-64 w-64 rounded-full bg-primary-950/30 blur-2xl"
      />
      {!isCompact && (
        <BannerIllustration className="pointer-events-none absolute -right-2 top-1/2 hidden h-44 w-52 -translate-y-1/2 lg:block" />
      )}
      <div className={`relative flex flex-col gap-1 ${isCompact ? '' : 'lg:max-w-[60%]'}`}>
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-wider text-primary-100">{eyebrow}</p>
        )}
        <div className={isCompact ? 'text-lg font-bold sm:text-xl' : 'font-display text-3xl font-bold sm:text-5xl'}>
          {title}
        </div>
        {subtitle && (
          <div className={`max-w-xl text-primary-50 ${isCompact ? 'text-sm' : 'mt-2 text-sm sm:text-base'}`}>
            {subtitle}
          </div>
        )}
        {actions && <div className="mt-4 flex flex-wrap gap-3">{actions}</div>}
      </div>
    </div>
  );
}

export default PageBanner;
