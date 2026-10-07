import type { UiStyleId } from '@platform/shared';

interface UiStyleDefinition {
  id: UiStyleId;
  /** i18n key for the picker's visible name (`adminSettings.uiStyle.names.<id>`). */
  nameKey: string;
}

/** The 4 selectable site-wide UI styles (2026-10, admin request). `glass` needs no entry
 * in `index.css`'s `[data-ui-style="…"]` overrides — it IS the base CSS everything else
 * overrides — so this list exists only for the picker UI and for `applyUiStyle` to
 * validate against. */
export const UI_STYLE_DEFINITIONS: UiStyleDefinition[] = [
  { id: 'glass', nameKey: 'glass' },
  { id: 'brutalist', nameKey: 'brutalist' },
  { id: 'vivid', nameKey: 'vivid' },
  { id: 'dark', nameKey: 'dark' },
];

const VALID_IDS = new Set(UI_STYLE_DEFINITIONS.map((d) => d.id));

/** Sets (or clears, for the default `glass`) the `data-ui-style` attribute on the root
 * element — `index.css`'s `[data-ui-style="…"]` blocks key off this to override the same
 * surface/text/border/shadow classes every component already uses, so switching needs no
 * per-component code and no reload. Called once at boot (`main.tsx`, before the first
 * render — no flash) and again right after an admin saves a new style (instant preview,
 * same documented behavior as `applyTheme`/language). Falls back to `glass` (by clearing
 * the attribute) for an unrecognized id, same "never throw on a stale/unfamiliar value"
 * convention as `applyTheme`. */
export function applyUiStyle(uiStyle: UiStyleId): void {
  const root = document.documentElement;
  if (uiStyle === 'glass' || !VALID_IDS.has(uiStyle)) {
    root.removeAttribute('data-ui-style');
    return;
  }
  root.setAttribute('data-ui-style', uiStyle);
}
