import type { ReactNode } from 'react';

type IconProps = { className?: string };

/** Same hand-rolled outline SVG convention as `Sidebar.tsx`'s icons (24x24 viewBox,
 * `stroke="currentColor"`, 2px rounded strokes) — a small, page-header-only subset so
 * `PageHeader`'s `icon` prop never needs to import from the nav-specific `Sidebar.tsx`. */
function Icon({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className ?? 'h-5 w-5'}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export const UsersIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16 4.5a3.5 3.5 0 0 1 0 7" />
    <path d="M16.5 13a6.5 6.5 0 0 1 5 6.3" />
  </Icon>
);

export const TestsIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M6 2h9l4 4v16H6z" />
    <path d="M15 2v4h4" />
    <path d="m9 13 2 2 4-4" />
  </Icon>
);

export const FlashcardsIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <rect x="4" y="6" width="14" height="10" rx="2" transform="rotate(-6 11 11)" />
    <rect x="6.5" y="8" width="14" height="10" rx="2" />
  </Icon>
);

export const GrammarIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    <path d="M9 7h6M9 11h4" />
  </Icon>
);

export const SettingsIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </Icon>
);

export const AttemptsIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="m7 12 2.5 2.5L15 9" />
  </Icon>
);

export const CameraIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
    <circle cx="12" cy="13" r="3.5" />
  </Icon>
);

export const CurriculumIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M3 9h18" />
    <path d="M8 2v4M16 2v4" />
  </Icon>
);

export const ChevronRightIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
);

export const HomeIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="m3 11 9-7 9 7" />
    <path d="M5 10v10h14V10" />
  </Icon>
);
