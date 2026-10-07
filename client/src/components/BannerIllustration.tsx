interface BannerIllustrationProps {
  className?: string;
}

/**
 * Custom vector artwork for `PageBanner`'s `hero` size (2026-10 "luxury" pass) — a small stack
 * of test/flashcard-like cards with a checkmark, replacing the earlier dot-grid texture (a very
 * recognizable "generic AI dashboard" pattern). Hand-drawn shapes, not a stock photo or
 * AI-generated image — no licensing concern, no external asset to host.
 */
function BannerIllustration({ className }: BannerIllustrationProps) {
  return (
    <svg viewBox="0 0 240 200" className={className} aria-hidden="true">
      <defs>
        <filter id="bannerIllustrationShadow" x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="#000000" floodOpacity="0.25" />
        </filter>
      </defs>
      <g filter="url(#bannerIllustrationShadow)">
        <rect
          x="22"
          y="56"
          width="128"
          height="98"
          rx="16"
          fill="#ffffff"
          fillOpacity="0.16"
          transform="rotate(-11 86 105)"
        />
        <rect
          x="54"
          y="34"
          width="128"
          height="98"
          rx="16"
          fill="#ffffff"
          fillOpacity="0.28"
          transform="rotate(7 118 83)"
        />
        <rect x="46" y="26" width="138" height="106" rx="18" fill="#ffffff" />
      </g>
      <rect x="64" y="46" width="62" height="9" rx="4.5" fill="#000000" fillOpacity="0.16" />
      <rect x="64" y="64" width="92" height="6" rx="3" fill="#000000" fillOpacity="0.1" />
      <rect x="64" y="77" width="76" height="6" rx="3" fill="#000000" fillOpacity="0.1" />
      <rect x="64" y="90" width="84" height="6" rx="3" fill="#000000" fillOpacity="0.1" />
      <circle cx="155" cy="104" r="22" className="fill-primary-700" />
      <path
        d="M145.5 104.5l6 6 13-14"
        stroke="#ffffff"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export default BannerIllustration;
