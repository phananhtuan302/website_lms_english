import type { UiStyleId } from '@platform/shared';

interface UiStyleDefinition {
  id: UiStyleId;
  /** i18n key for the picker's visible name (`adminSettings.uiStyle.names.<id>`). */
  nameKey: string;
}

/** The 4 original site-wide UI styles (kept for `applyUiStyle` to still recognize/apply
 * them on a site that hasn't switched to one of the 5 current design systems yet — see
 * `designSystems.ts`'s own "5 Design Systems" doc comment for why those 5 are listed
 * separately, as plain string literals, rather than imported from here). `glass` needs no
 * entry in `index.css`'s `[data-ui-style="…"]` overrides — it IS the base CSS everything
 * else overrides. */
const LEGACY_UI_STYLE_DEFINITIONS: UiStyleDefinition[] = [
  { id: 'glass', nameKey: 'glass' },
  { id: 'brutalist', nameKey: 'brutalist' },
  { id: 'vivid', nameKey: 'vivid' },
  { id: 'dark', nameKey: 'dark' },
];
export const UI_STYLE_DEFINITIONS = LEGACY_UI_STYLE_DEFINITIONS;

/** The 5 current design systems, as plain literals (not imported as a value from
 * `@platform/shared` — see `designSystems.ts`'s doc comment for the Vite dev-cache reason
 * this specific file also avoids it) — `applyUiStyle` below needs to recognize these as
 * valid too, or it would silently clear the attribute instead of setting it. */
const CURRENT_DESIGN_SYSTEM_IDS = [
  'minimalAcademic',
  'modernSaas',
  'editorialLearning',
  'focusExam',
  'contemporaryCreative',
  'minimalism',
  'flatDesign',
  'glassmorphism',
  'neumorphism',
  'swissDesign',
  'neoBrutalism',
  'materialDesign',
  'cyberpunkNeon',
  'playfulRetro',
  'claymorphism',
] as const;

const VALID_IDS = new Set<string>([
  ...LEGACY_UI_STYLE_DEFINITIONS.map((d) => d.id),
  ...CURRENT_DESIGN_SYSTEM_IDS,
]);

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
