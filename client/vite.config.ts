import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Without this, Vite resolves the npm-workspace symlink for `@platform/shared` to its real
    // path (`../shared/dist/...`), which falls outside any `node_modules` folder. Rollup's
    // default commonjs-interop only processes paths matching `node_modules/**`, so named exports
    // from the (CommonJS-compiled) shared package would silently fail to resolve during
    // `vite build` otherwise. See https://vite.dev/config/shared-options.html#resolve-preservesymlinks
    preserveSymlinks: true,
  },
  server: {
    port: 5173,
  },
});
