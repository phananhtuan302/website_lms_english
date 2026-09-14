/** @type {import('tailwindcss').Config} */
// NOTE (T-001 scope): this intentionally uses Tailwind's default palette. The pastel
// orange-red/white/black theme tokens described in TECH_STACK.md are introduced in T-004
// ("Tailwind theme, base app shell") — T-001 only needs to prove Tailwind itself is wired up.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
