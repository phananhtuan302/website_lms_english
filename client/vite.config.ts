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
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: [
      'dash.nhatanh97.xyz',
      '.nhatanh97.xyz',
      'localhost',
      '127.0.0.1',
    ],
    // Proxies API/socket calls through this SAME port instead of the browser hitting
    // `localhost:5000` directly. Fixes a real bug found 2026-09-15: in a remote/sandboxed
    // dev environment where only the client's port gets forwarded to the user's actual
    // browser, a hardcoded `http://localhost:5000` in client JS resolves to the wrong
    // machine's port 5000 (nothing listening there), producing a bare `TypeError: Failed
    // to fetch` with no CORS message (never even reaches CORS negotiation). Proxying
    // means the browser only ever needs to reach the one port it already proved
    // reachable; Vite forwards `/api` and `/socket.io` to the API server itself
    // (server-to-server, unaffected by browser-side port forwarding). Also sidesteps
    // CORS entirely in dev, since the browser now sees everything as same-origin.
    proxy: {
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:5000', changeOrigin: true, ws: true },
    },
  },
});
