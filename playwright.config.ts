import { defineConfig, devices } from '@playwright/test';

/**
 * T-060 — Playwright E2E regression suite config.
 *
 * Run with: `npm run test:e2e` (see root package.json / README.md "End-to-end tests
 * (Playwright, T-060)" section for the full documented command + prerequisites).
 *
 * This is the FIRST time Playwright is committed as a real project dependency —
 * `@playwright/test` lives at the ROOT (not inside `/client` or `/server`) because the
 * suite drives the client dev server as a black box over HTTP while also needing the API
 * server up, i.e. it exercises the whole monorepo, not one workspace — a root-level tool
 * matches the existing root-level `eslint`/`prettier` placement more than a
 * client-or-server-only concern.
 *
 * Prerequisites (documented in README.md, NOT automated here — matches this repo's
 * existing convention that DB setup is a one-time prerequisite before `npm run dev`,
 * see README "Database" section):
 *   1. PostgreSQL running, migrated (`npm run prisma:migrate -w server`).
 *   2. Seed data present (`npm run seed -w server`) — the suite reuses the seeded
 *      teacher account and demo flashcard set rather than creating everything from
 *      scratch.
 *
 * Dev servers: the `webServer` array below starts the API server (port 4000) and the
 * Vite client (port 5173) for you via the existing root `dev:server` / `dev:client`
 * scripts IF they aren't already running (`reuseExistingServer: true` — checked by
 * hitting the URL below first). If you already have `npm run dev` running in another
 * terminal (or, as in this build, another concurrent Dev agent already has the API
 * server up), the suite reuses it as-is instead of trying to bind the port again.
 */
const CLIENT_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const SERVER_URL = process.env.E2E_SERVER_URL ?? 'http://localhost:4000';

export default defineConfig({
  testDir: './e2e',
  // One worker, no parallelism: several specs share one persistent seeded teacher
  // account and one freshly-registered student (created once in globalSetup) rather
  // than provisioning fresh fixtures per test, per the task's "reuse existing seed
  // data/accounts where sensible" instruction — running specs concurrently against the
  // same accounts would race (e.g. two specs both mutating the same student's session).
  // Each spec still creates its OWN uniquely-titled Test, so specs never collide on test
  // content, just on which shared account is doing the clicking.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  globalSetup: require.resolve('./e2e/global-setup.ts'),
  use: {
    baseURL: CLIENT_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Speaking (T-052–T-054) needs a granted microphone + a fake media device so
        // `getUserMedia`/`MediaRecorder` work headlessly with no real hardware and no
        // manual permission prompt.
        permissions: ['microphone'],
        launchOptions: {
          args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
        },
      },
    },
  ],
  webServer: [
    {
      command: 'npm run dev:server',
      cwd: __dirname,
      url: `${SERVER_URL}/health`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npm run dev:client',
      cwd: __dirname,
      url: CLIENT_URL,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
