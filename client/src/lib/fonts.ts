import type { FontFamilyId } from '@platform/shared';

// Plain literal array (not imported as a value from `@platform/shared`) for the same Vite
// dev-cache reason as `designSystems.ts`'s `DESIGN_SYSTEM_IDS` — see that file's doc
// comment. The TYPE still comes from `@platform/shared` (erased at compile time, so no
// caching concern there).
export const FONT_FAMILY_IDS = [
  'inter',
  'roboto',
  'openSans',
  'lato',
  'montserrat',
  'poppins',
  'nunito',
  'workSans',
  'sourceSans',
  'ibmPlexSans',
  'merriweather',
  'lora',
  'playfairDisplay',
  'sourceSerif',
  'sora',
  'spaceGrotesk',
  'dmSans',
  'outfit',
  'manrope',
  'jetbrainsMono',
] as const satisfies readonly FontFamilyId[];

interface FontDefinition {
  id: FontFamilyId;
  /** The actual CSS `font-family` stack this id resolves to — same fonts loaded in
   * `index.html`'s Google Fonts `<link>`. */
  stack: string;
  category: 'sans' | 'serif' | 'mono';
}

/** 20 fonts an admin can pick as a site-wide override (2026-10 font picker request) — a
 * deliberately curated set spanning sans/serif/mono, not a free-text font name input (same
 * "pre-vetted options, never a jarring choice" philosophy as `themePalettes.ts`'s color
 * themes). `AdminSettingsPage.tsx`'s font picker shows `label`/`category` via i18n
 * (`adminSettings.fonts.names.<id>`), this just carries the actual CSS stack. */
export const FONT_DEFINITIONS: FontDefinition[] = [
  { id: 'inter', stack: "'Inter', ui-sans-serif, system-ui, sans-serif", category: 'sans' },
  { id: 'roboto', stack: "'Roboto', ui-sans-serif, system-ui, sans-serif", category: 'sans' },
  { id: 'openSans', stack: "'Open Sans', ui-sans-serif, system-ui, sans-serif", category: 'sans' },
  { id: 'lato', stack: "'Lato', ui-sans-serif, system-ui, sans-serif", category: 'sans' },
  { id: 'montserrat', stack: "'Montserrat', ui-sans-serif, system-ui, sans-serif", category: 'sans' },
  { id: 'poppins', stack: "'Poppins', ui-sans-serif, system-ui, sans-serif", category: 'sans' },
  { id: 'nunito', stack: "'Nunito', ui-sans-serif, system-ui, sans-serif", category: 'sans' },
  { id: 'workSans', stack: "'Work Sans', ui-sans-serif, system-ui, sans-serif", category: 'sans' },
  { id: 'sourceSans', stack: "'Source Sans 3', ui-sans-serif, system-ui, sans-serif", category: 'sans' },
  { id: 'ibmPlexSans', stack: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif", category: 'sans' },
  { id: 'merriweather', stack: "'Merriweather', Georgia, Cambria, serif", category: 'serif' },
  { id: 'lora', stack: "'Lora', Georgia, Cambria, serif", category: 'serif' },
  { id: 'playfairDisplay', stack: "'Playfair Display', Georgia, Cambria, serif", category: 'serif' },
  { id: 'sourceSerif', stack: "'Source Serif 4', Georgia, Cambria, serif", category: 'serif' },
  { id: 'sora', stack: "'Sora', ui-sans-serif, system-ui, sans-serif", category: 'sans' },
  { id: 'spaceGrotesk', stack: "'Space Grotesk', ui-sans-serif, system-ui, sans-serif", category: 'sans' },
  { id: 'dmSans', stack: "'DM Sans', ui-sans-serif, system-ui, sans-serif", category: 'sans' },
  { id: 'outfit', stack: "'Outfit', ui-sans-serif, system-ui, sans-serif", category: 'sans' },
  { id: 'manrope', stack: "'Manrope', ui-sans-serif, system-ui, sans-serif", category: 'sans' },
  { id: 'jetbrainsMono', stack: "'JetBrains Mono', ui-monospace, 'Courier New', monospace", category: 'mono' },
];

const FONT_BY_ID = new Map(FONT_DEFINITIONS.map((f) => [f.id, f]));

/** Applies (or clears) the admin's site-wide font override by setting `--font-body`/
 * `--font-display` as INLINE styles on the root element — same "inline style beats any
 * stylesheet rule, including a `[data-ui-style='…']` block's own font vars" mechanism
 * `applyTheme`'s brand-color vars already use, so a chosen font always wins over whichever
 * design system is active, and `null` cleanly falls back to that design system's own
 * default (removing the inline override, not setting it to some hardcoded value). Called
 * once at boot (`main.tsx`) and again right after an admin saves a new font (instant
 * preview), exactly like `applyTheme`/`applyUiStyle`. */
export function applyFontFamily(fontFamilyId: FontFamilyId | null): void {
  const root = document.documentElement;
  if (!fontFamilyId) {
    root.style.removeProperty('--font-body');
    root.style.removeProperty('--font-display');
    return;
  }
  const font = FONT_BY_ID.get(fontFamilyId);
  if (!font) {
    root.style.removeProperty('--font-body');
    root.style.removeProperty('--font-display');
    return;
  }
  root.style.setProperty('--font-body', font.stack);
  root.style.setProperty('--font-display', font.stack);
}
