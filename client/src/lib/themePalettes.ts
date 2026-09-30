import type { ThemeId } from '@platform/shared';

/** One 50–950 color scale, as `"R G B"` triplets (space-separated decimal, no `#`/`rgb()`)
 * — the exact format Tailwind's `rgb(var(--x) / <alpha-value>)` color function expects
 * (see `tailwind.config.js`). Same 11 stops as the original hand-tuned T-004 scale. */
type ColorScale = Record<'50' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900' | '950', string>;

interface ThemeDefinition {
  id: ThemeId;
  /** i18n key for the picker's visible name (`adminSettings.themeNames.<id>`). */
  nameKey: string;
  scale: ColorScale;
}

/**
 * The site's curated, pre-built color themes (2026-09, admin "custom theme" request —
 * "làm sẵn 5-10 bộ màu premium"). Deliberately a fixed picker, not a free-form hex/RGB
 * input: every scale here is a known-good, accessible progression (the non-`sunset`
 * scales are Tailwind's own official palettes, already vetted at scale by that project),
 * so an admin can never end up with a muddy or low-contrast combination.
 *
 * `sunset` is the ORIGINAL hand-tuned orange-red scale from T-004 / `tailwind.config.js`
 * — kept byte-identical and as the default, so every existing database (which defaults
 * `Settings.themeId` to `sunset` at the Prisma level too) renders exactly as before until
 * an admin picks something else.
 *
 * Applying a theme (`applyTheme`) sets each shade as a CSS custom property on the root
 * element — `tailwind.config.js`'s `primary` color reads these vars, so every existing
 * `bg-primary-500`/`text-primary-700`/etc. class in the app repaints with no per-component
 * change. `main.tsx` calls this once at boot, before the first render, using the theme
 * `GET /api/settings` returns — so there is no flash of the wrong theme.
 */
export const THEME_DEFINITIONS: ThemeDefinition[] = [
  {
    id: 'sunset',
    nameKey: 'sunset',
    scale: {
      '50': '255 245 242',
      '100': '255 231 224',
      '200': '255 205 189',
      '300': '255 171 145',
      '400': '250 135 103',
      '500': '242 105 74',
      '600': '218 82 54',
      '700': '181 64 42',
      '800': '143 50 32',
      '900': '107 37 23',
      '950': '71 23 8',
    },
  },
  {
    id: 'ocean',
    nameKey: 'ocean',
    scale: {
      '50': '239 246 255',
      '100': '219 234 254',
      '200': '191 219 254',
      '300': '147 197 253',
      '400': '96 165 250',
      '500': '59 130 246',
      '600': '37 99 235',
      '700': '29 78 216',
      '800': '30 64 175',
      '900': '30 58 138',
      '950': '23 37 84',
    },
  },
  {
    id: 'forest',
    nameKey: 'forest',
    scale: {
      '50': '236 253 245',
      '100': '209 250 229',
      '200': '167 243 208',
      '300': '110 231 183',
      '400': '52 211 153',
      '500': '16 185 129',
      '600': '5 150 105',
      '700': '4 120 87',
      '800': '6 95 70',
      '900': '6 78 59',
      '950': '2 44 34',
    },
  },
  {
    id: 'violet',
    nameKey: 'violet',
    scale: {
      '50': '245 243 255',
      '100': '237 233 254',
      '200': '221 214 254',
      '300': '196 181 253',
      '400': '167 139 250',
      '500': '139 92 246',
      '600': '124 58 237',
      '700': '109 40 217',
      '800': '91 33 182',
      '900': '76 29 149',
      '950': '46 16 101',
    },
  },
  {
    id: 'teal',
    nameKey: 'teal',
    scale: {
      '50': '240 253 250',
      '100': '204 251 241',
      '200': '153 246 228',
      '300': '94 234 212',
      '400': '45 212 191',
      '500': '20 184 166',
      '600': '13 148 136',
      '700': '15 118 110',
      '800': '17 94 89',
      '900': '19 78 74',
      '950': '4 47 46',
    },
  },
  {
    id: 'rose',
    nameKey: 'rose',
    scale: {
      '50': '255 241 242',
      '100': '255 228 230',
      '200': '254 205 211',
      '300': '253 164 175',
      '400': '251 113 133',
      '500': '244 63 94',
      '600': '225 29 72',
      '700': '190 18 60',
      '800': '159 18 57',
      '900': '136 19 55',
      '950': '76 5 25',
    },
  },
  {
    id: 'amber',
    nameKey: 'amber',
    scale: {
      '50': '255 251 235',
      '100': '254 243 199',
      '200': '253 230 138',
      '300': '252 211 77',
      '400': '251 191 36',
      '500': '245 158 11',
      '600': '217 119 6',
      '700': '180 83 9',
      '800': '146 64 14',
      '900': '120 53 15',
      '950': '69 26 3',
    },
  },
  {
    id: 'indigo',
    nameKey: 'indigo',
    scale: {
      '50': '238 242 255',
      '100': '224 231 255',
      '200': '199 210 254',
      '300': '165 180 252',
      '400': '129 140 248',
      '500': '99 102 241',
      '600': '79 70 229',
      '700': '67 56 202',
      '800': '55 48 163',
      '900': '49 46 129',
      '950': '30 27 75',
    },
  },
];

const THEME_BY_ID = new Map(THEME_DEFINITIONS.map((theme) => [theme.id, theme]));

/** Sets every `--color-primary-*` custom property on the root element from the given
 * theme's scale. Called once at boot (`main.tsx`, before the first render — no flash) and
 * again right after an admin saves a new theme (an instant, no-reload preview of their
 * own change; every OTHER visitor picks it up on their next page load, same documented
 * behavior as the language setting). Falls back to `sunset` for an unrecognized id rather
 * than throwing, so a stale client talking to a newer server with an unfamiliar theme
 * never breaks the page. */
export function applyTheme(themeId: ThemeId): void {
  const theme = THEME_BY_ID.get(themeId) ?? THEME_BY_ID.get('sunset')!;
  const root = document.documentElement;
  for (const [shade, rgb] of Object.entries(theme.scale)) {
    root.style.setProperty(`--color-primary-${shade}`, rgb);
  }
}
