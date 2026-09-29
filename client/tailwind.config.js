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
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fff5f2',
          100: '#ffe7e0',
          200: '#ffcdbd',
          300: '#ffab91',
          400: '#fa8767',
          500: '#f2694a', // base pastel orange-red — primary brand color
          600: '#da5236',
          700: '#b5402a',
          800: '#8f3220',
          900: '#6b2517',
          950: '#471708', // 2026-09: a richer near-black shade for the dark sidebar's active
          // state / deep gradients — same hue, just dark enough to sit next to `slate-900`
          // without looking like a different brand.
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
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)',
        'card-hover': '0 4px 8px -2px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.06)',
        panel: '0 10px 30px -10px rgb(0 0 0 / 0.15)',
        sidebar: '1px 0 0 0 rgb(0 0 0 / 0.06), 2px 0 12px -4px rgb(0 0 0 / 0.12)',
      },
    },
  },
  plugins: [],
};
