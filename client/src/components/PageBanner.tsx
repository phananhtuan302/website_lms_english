import type { ReactNode } from 'react';

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
 * a gradient panel in the site's own brand hue with a few soft, purely-CSS blurred shapes and a
 * faint dot grid, never an external image (no licensing/broken-link risk, nothing to load). Used
 * on the public home page, the auth pages' side panel (`AuthLayout`), and the teacher class list.
 */
function PageBanner({ eyebrow, title, subtitle, actions, size = 'hero', className = '' }: PageBannerProps) {
  const isCompact = size === 'compact';
  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-600 via-primary-500 to-primary-800 text-base-white shadow-panel ${
        isCompact ? 'px-5 py-4 sm:px-8 sm:py-5' : 'px-6 py-10 sm:px-10 sm:py-14'
      } ${className}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-20 left-1/4 h-64 w-64 rounded-full bg-primary-950/30 blur-2xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(rgb(255 255 255 / 0.14) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />
      <div className="relative flex flex-col gap-1">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-wider text-primary-100">{eyebrow}</p>
        )}
        <div className={isCompact ? 'text-lg font-bold sm:text-xl' : 'text-2xl font-bold sm:text-4xl'}>{title}</div>
        {subtitle && (
          <div className={`max-w-xl text-primary-50 ${isCompact ? 'text-sm' : 'mt-1 text-sm sm:text-base'}`}>
            {subtitle}
          </div>
        )}
        {actions && <div className="mt-4 flex flex-wrap gap-3">{actions}</div>}
      </div>
    </div>
  );
}

export default PageBanner;
