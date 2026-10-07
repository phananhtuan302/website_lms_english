import { cn } from '../../lib/cn';

interface AvatarProps {
  name: string;
  /** A `data:image/...` URL (or any image URL) — when set, renders the photo instead of
   * initials. `null`/`undefined`/empty falls back to initials. */
  src?: string | null;
  size?: 'sm' | 'md';
  className?: string;
}

/** A fixed palette (not the theme's `primary-*`, deliberately) so avatars stay visually distinct
 * from each other and from the brand accent — the same "assign each person a stable color from
 * a small set" trick Slack/Linear/Notion use for people who have no uploaded photo. */
const PALETTE = [
  'bg-rose-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-sky-500',
  'bg-violet-500',
  'bg-fuchsia-500',
  'bg-cyan-600',
  'bg-orange-500',
  'bg-indigo-500',
  'bg-teal-500',
];

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const SIZE_CLASSES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-9 w-9 text-sm',
};

/** A person's uploaded photo, or (when they haven't set one) their initials on a color stably
 * derived from their name — so every account reads as a real person instead of a bare name
 * string either way. */
function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        aria-hidden="true"
        className={cn('inline-block shrink-0 rounded-full object-cover shadow-card', SIZE_CLASSES[size], className)}
      />
    );
  }
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-base-white shadow-card',
        SIZE_CLASSES[size],
        colorFor(name),
        className,
      )}
      aria-hidden="true"
    >
      {initialsFor(name)}
    </span>
  );
}

export default Avatar;
