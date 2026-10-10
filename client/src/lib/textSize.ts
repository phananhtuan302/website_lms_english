/**
 * Dynamic font-size scaling per browser.
 * Supports smooth percentage slider scaling (e.g. 80% to 140%).
 */
export const TEXT_SIZE_STORAGE_KEY = 'textSize';
export const DEFAULT_TEXT_SCALE = 100;
export const MIN_TEXT_SCALE = 80;
export const MAX_TEXT_SCALE = 140;

/** Reads the percentage scale (e.g. 100) from localStorage */
export function readTextScale(): number {
  try {
    const stored = window.localStorage.getItem(TEXT_SIZE_STORAGE_KEY);
    if (!stored) return DEFAULT_TEXT_SCALE;
    // Backward compatibility with 'normal' | 'large' | 'xlarge'
    if (stored === 'normal') return 100;
    if (stored === 'large') return 112;
    if (stored === 'xlarge') return 125;
    const parsed = parseInt(stored, 10);
    if (!isNaN(parsed) && parsed >= MIN_TEXT_SCALE && parsed <= MAX_TEXT_SCALE) {
      return parsed;
    }
    return DEFAULT_TEXT_SCALE;
  } catch {
    return DEFAULT_TEXT_SCALE;
  }
}

/** Applies percentage scale directly to html element */
export function applyTextScale(percent: number): void {
  const root = document.documentElement;
  if (percent === 100) {
    root.style.removeProperty('font-size');
    root.removeAttribute('data-text-scale');
  } else {
    root.style.fontSize = `${percent}%`;
    root.setAttribute('data-text-scale', `${percent}%`);
  }
}

export function saveTextScale(percent: number): void {
  try {
    if (percent === 100) {
      window.localStorage.removeItem(TEXT_SIZE_STORAGE_KEY);
    } else {
      window.localStorage.setItem(TEXT_SIZE_STORAGE_KEY, percent.toString());
    }
  } catch {
    // Ignore storage issues
  }
}
