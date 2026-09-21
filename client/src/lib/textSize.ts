/**
 * "Chữ to" (Phase 15): a per-browser text-size choice for readers who enlarge the page.
 *
 * The size is applied by setting the ROOT font size (`<html style="font-size: …%">`); every
 * Tailwind size in the app is rem-based, so the whole interface scales with it. The choice is
 * remembered in `localStorage` under `TEXT_SIZE_STORAGE_KEY`, and `index.html` applies it with a
 * tiny inline script before the first paint (so there is no flash of small text) — keep that
 * script and `TEXT_SIZE_ROOT_PERCENT` in step. Storage can be unavailable (private window, blocked
 * site data): every access is wrapped so the app simply falls back to the normal size.
 */
export type TextSize = 'normal' | 'large' | 'xlarge';

export const TEXT_SIZE_STORAGE_KEY = 'textSize';

/** The order the header button cycles through. */
export const TEXT_SIZE_ORDER: readonly TextSize[] = ['normal', 'large', 'xlarge'];

export const TEXT_SIZE_ROOT_PERCENT: Record<TextSize, string> = {
  normal: '100%',
  large: '112.5%',
  xlarge: '125%',
};

function isTextSize(value: unknown): value is TextSize {
  return value === 'normal' || value === 'large' || value === 'xlarge';
}

/** The size currently applied to the page (from the saved choice); `normal` when none. */
export function readTextSize(): TextSize {
  try {
    const stored = window.localStorage.getItem(TEXT_SIZE_STORAGE_KEY);
    return isTextSize(stored) ? stored : 'normal';
  } catch {
    return 'normal';
  }
}

/** Sets the root font size (and a `data-text-size` hook) without saving anything. */
export function applyTextSize(size: TextSize): void {
  const root = document.documentElement;
  if (size === 'normal') {
    root.style.removeProperty('font-size');
    root.removeAttribute('data-text-size');
  } else {
    root.style.fontSize = TEXT_SIZE_ROOT_PERCENT[size];
    root.setAttribute('data-text-size', size);
  }
}

export function saveTextSize(size: TextSize): void {
  try {
    if (size === 'normal') window.localStorage.removeItem(TEXT_SIZE_STORAGE_KEY);
    else window.localStorage.setItem(TEXT_SIZE_STORAGE_KEY, size);
  } catch {
    // Degrade silently: the size still applies for this visit, it just is not remembered.
  }
}

export function nextTextSize(size: TextSize): TextSize {
  return TEXT_SIZE_ORDER[(TEXT_SIZE_ORDER.indexOf(size) + 1) % TEXT_SIZE_ORDER.length];
}
