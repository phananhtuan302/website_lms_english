/** @type {import('tailwindcss').Config} */
// Theme (T-004): pastel orange-red as the primary/accent color, white and black as the
// base palette — per the color directive at the top of docs/requirements-raw.md
// ("Màu sắc chủ đạo: đỏ cam pastel kèm trắng, đen") and TECH_STACK.md.
//
// `primary` is a full 50–900 scale so components have room for hover/active/subtle-bg
// variants without ever needing a one-off hex value (see CONTRIBUTING.md's theme-token
// rule). The same scale also serves as the "accent" color per the design note — there is
// deliberately only one brand hue, not a separate accent color, to keep the palette small
// and consistent for a two-role (teacher/student) app.
//
// 2026-09: each shade now reads a CSS custom property (`--color-primary-*`, defaults in
// `src/index.css`'s `:root`, matching these exact original values) instead of a literal
// hex, so an admin's chosen theme (`client/src/lib/themePalettes.ts`, applied by
// `main.tsx` before the first paint) can swap the whole brand hue at runtime with no
// rebuild — every existing `bg-primary-500`/`text-primary-700`/etc. class already repaints
// for free. The `<alpha-value>` token is Tailwind's own placeholder — it substitutes the
// opacity from a class like `bg-primary-500/50` and is NOT literal syntax to type
// yourself; do not use these color tokens via the `theme()` CSS function (see
// `index.css`'s `.text-primary-600` override for why, and how it's done instead).
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // 2026-10 "Modern SaaS" redesign — Inter (loaded in index.html) as the display/body
      // typeface everywhere `font-sans` applies (Tailwind's default stack stays as the
      // fallback chain, so a slow/blocked font request never leaves blank text).
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        // "Luxury" pass — a serif reserved for the one or two biggest headings per page
        // (`PageHeader`, `PageBanner`), never body text/controls/nav, so it reads as a
        // deliberate accent rather than a wholesale font swap.
        display: ['"Playfair Display"', 'Georgia', 'Cambria', 'serif'],
      },
      // Rounder corners than Tailwind's defaults (xl 12px→16px, 2xl 16px→24px) — the softer
      // "Modern SaaS" card/modal/button look. Every existing `rounded-xl`/`rounded-2xl` class
      // picks this up automatically; nothing needed a rename.
      borderRadius: {
        xl: '1rem',
        '2xl': '1.5rem',
      },
      colors: {
        primary: {
          50: 'rgb(var(--color-primary-50) / <alpha-value>)',
          100: 'rgb(var(--color-primary-100) / <alpha-value>)',
          200: 'rgb(var(--color-primary-200) / <alpha-value>)',
          300: 'rgb(var(--color-primary-300) / <alpha-value>)',
          400: 'rgb(var(--color-primary-400) / <alpha-value>)',
          500: 'rgb(var(--color-primary-500) / <alpha-value>)', // base — primary brand color
          600: 'rgb(var(--color-primary-600) / <alpha-value>)',
          700: 'rgb(var(--color-primary-700) / <alpha-value>)',
          800: 'rgb(var(--color-primary-800) / <alpha-value>)',
          900: 'rgb(var(--color-primary-900) / <alpha-value>)',
          950: 'rgb(var(--color-primary-950) / <alpha-value>)', // a richer near-black shade
          // for the dark sidebar's active state / deep gradients — same hue, just dark
          // enough to sit next to `slate-900` without looking like a different brand.
        },
        // Explicit base tokens (rather than relying only on Tailwind's built-in
        // `white`/`black`) so the theme file is the one documented source of the
        // "white and black as base colors" requirement.
        base: {
          white: '#ffffff',
          black: '#000000',
        },
      },
      // 2026-09: a "professional dashboard" pass (customer request) — soft, layered shadows
      // for cards/panels/the sidebar, instead of the flat 1px borders used everywhere before.
      // Tailwind's default `slate` scale (unchanged, always available) is the neutral partner
      // to the one brand hue above — used for the sidebar and page background, never for text
      // that competes with `primary`.
      //
      // 2026-10 "quiet utility" pass — admin tools that read as premium (Linear, Stripe,
      // Vercel) lean on a crisp hairline border for definition, not a heavy drop shadow; a
      // loud shadow reads as "soft consumer app", not "serious tool". `card` is now just
      // enough lift to separate a surface from the page without competing with its border;
      // `card-hover` stays a clear step up so hover/lift interactions still read.
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.04)',
        'card-hover': '0 4px 10px -2px rgb(0 0 0 / 0.10)',
        panel: '0 16px 40px -12px rgb(0 0 0 / 0.22)',
        sidebar: '1px 0 0 0 rgb(0 0 0 / 0.06), 4px 0 16px -4px rgb(0 0 0 / 0.16)',
        // A softer, deeper shadow for floating surfaces (popovers, dropdown menus) that sit
        // above cards, between `card-hover` and `panel`.
        dropdown: '0 12px 28px -8px rgb(0 0 0 / 0.18), 0 4px 10px -4px rgb(0 0 0 / 0.10)',
        // A shadow tinted with the current brand hue (reads `--color-primary-*` directly, same
        // convention as `colors.primary` above — NOT `theme()`, see that comment) instead of
        // plain black, for a colorful "glow" under primary buttons and the active nav item.
        // Repaints with the admin's chosen theme preset automatically, like every other
        // `primary-*` class already does.
        glow: '0 10px 24px -6px rgb(var(--color-primary-500) / 0.45), 0 3px 8px -2px rgb(var(--color-primary-600) / 0.3)',
      },
    },
  },
  plugins: [],
};
