// Flat ESLint config (ESLint 9+/10) covering the whole npm-workspaces monorepo from the root.
// A single config is used instead of per-workspace .eslintrc files because flat config already
// scopes rules by glob (`files`), which is simpler to maintain across /client, /server, /shared.
//
// Note: this uses typescript-eslint's *non* type-aware `recommended` ruleset (no
// `parserOptions.project`) rather than `recommendedTypeChecked`. That keeps linting fast and
// avoids per-workspace tsconfig wiring for the initial scaffold; it can be upgraded to
// type-aware linting later if the team wants stricter rules (e.g. no-floating-promises).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/*.tsbuildinfo',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // /client — browser (React) code
    files: ['client/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // /server and /shared — Node.js code
    files: ['server/**/*.ts', 'shared/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
  },
  {
    // Root-level config files (this file, tailwind/postcss/vite configs) run under Node.
    files: ['*.{js,mjs,cjs}', '**/*.config.{js,mjs,cjs,ts}'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    rules: {
      // Allow underscore-prefixed args/vars to signal "intentionally unused" (e.g. Express
      // middleware signatures like `(_req, res) => ...`).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // Must stay last: disables stylistic rules that would conflict with Prettier formatting.
  eslintConfigPrettier,
);
