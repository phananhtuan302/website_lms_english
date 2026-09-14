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
        },
        // Explicit base tokens (rather than relying only on Tailwind's built-in
        // `white`/`black`) so the theme file is the one documented source of the
        // "white and black as base colors" requirement.
        base: {
          white: '#ffffff',
          black: '#000000',
        },
      },
    },
  },
  plugins: [],
};
