# English Test Platform — Monorepo

Web platform for an English-teaching business: teachers author tests/vocabulary content,
students take tests (incl. live QR-join sessions) and study vocabulary. See `docs/PROJECT_PLAN.md`
and `docs/BACKLOG.md` for the full product plan; this file only covers running the code. See
`CONTRIBUTING.md` for durable conventions (English-only UI copy, Tailwind theme tokens) that
every Dev cycle is held to.

## Stack & layout

npm workspaces monorepo, per `docs/TECH_STACK.md`:

```
/client   React 18 + TypeScript + Vite + Tailwind CSS
/server   Node.js + TypeScript + Express + Socket.IO
/shared   Types & constants shared between client and server
/docs     Project docs (plan, backlog, progress log)
```

`/shared` is a real npm workspace package (`@platform/shared`) — both `/client` and `/server`
import from it (see `shared/src/index.ts`), so it must be built (`npm run build -w shared`)
before `/server` or `/client` can type-check or run against the latest shared code. The root
`build`/`dev` scripts already do this in the right order for you.

## Prerequisites

- Node.js 20+ (developed against Node 24)
- npm 10+ (workspaces support)

## Install

From the repo root (installs all three workspaces in one go):

```bash
npm install
```

## Environment variables

- `server/.env.example` → copy to `server/.env` (git-ignored). Vars:
  - `PORT` (optional, default `4000`)
  - `CLIENT_ORIGIN` (optional, default `http://localhost:5173`, used for CORS + Socket.IO)
  - `DATABASE_URL` (**required**) — PostgreSQL connection string for Prisma. See
    "Database (PostgreSQL + Prisma)" below for how to get a local database running.
  - `JWT_SECRET` (**required**) — secret used to sign/verify auth JWTs (T-005).
  - `SEED_TEACHER_EMAIL` / `SEED_TEACHER_PASSWORD` / `SEED_TEACHER_NAME` (all optional, have
    dev-only defaults) — credentials `npm run seed -w server` uses for the one teacher account
    it provisions. See "Seed data" below.
- `client/.env.example` → optional, copy to `client/.env` (git-ignored) to override
  `VITE_API_BASE_URL` (defaults to `http://localhost:4000` if not set). The client currently
  has no required env vars.

`PORT`/`CLIENT_ORIGIN`/`VITE_API_BASE_URL` have sensible defaults even without a `.env` file.
`DATABASE_URL` and `JWT_SECRET` do **not** — the server refuses to start without them and prints
exactly which one is missing (see `server/src/config/env.ts`). Try it: `rm server/.env && npm run dev:server`.

## Database (PostgreSQL + Prisma)

The server uses [Prisma](https://www.prisma.io/) against PostgreSQL (`server/prisma/schema.prisma`).
Pick **one** of the two setups below for local dev, then run the migration.

### Option A — native PostgreSQL (what this repo's dev environment actually uses)

Assumes PostgreSQL is already installed and running as a local service (any recent version; this
was verified against PostgreSQL 17 on Windows).

1. Create a dedicated database for this project:
   ```bash
   createdb english_platform_dev
   # or, from psql:
   # CREATE DATABASE english_platform_dev;
   ```
2. Set `server/.env`'s `DATABASE_URL` to point at it, e.g.:
   ```
   DATABASE_URL="postgresql://postgres@localhost:5432/english_platform_dev?schema=public"
   ```
   (Adjust user/password/port to match your local install. If your Postgres uses password auth
   rather than `trust` for localhost, include the password: `postgresql://USER:PASSWORD@localhost:5432/...`.)

### Option B — Docker (no native Postgres install needed)

A `docker-compose.yml` is committed at the repo root:

```bash
docker compose up -d
```

This starts Postgres 16 on `localhost:5432` with database `english_platform_dev`, user
`postgres`, password `postgres`, and a named volume so data survives restarts. With this option,
`server/.env`'s `DATABASE_URL` must include the password:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/english_platform_dev?schema=public"
```

### Run the migration (either option)

```bash
npm run prisma:migrate -w server   # prisma migrate dev — creates/applies migrations
npm run prisma:generate -w server  # regenerate the Prisma client after schema changes
npm run prisma:studio -w server    # optional GUI to browse the DB at http://localhost:5555
```

`prisma migrate dev` creates the `users` table plus the `tests` / `sections` / `questions` /
`choices` tables added by T-007 (see `server/prisma/schema.prisma`).

### Seed data (dev-only teacher account)

There is no public teacher self-registration (see `docs/PROJECT_PLAN.md` Assumption A1), so a
seed script provisions one for local dev/testing, plus a demo `Test` used to verify T-007's
nested Test/Section/Question/Choice structure round-trips correctly:

```bash
npm run seed -w server   # also runnable as: npx prisma db seed (run from server/)
```

Idempotent — safe to re-run. Prints the teacher credentials it used (default
`teacher@example.com` / `teacher-dev-password123`, overridable via `SEED_TEACHER_EMAIL` /
`SEED_TEACHER_PASSWORD` / `SEED_TEACHER_NAME` in `server/.env`, see `server/.env.example`).

## Auth (T-005 / T-006)

- REST endpoints: `POST /api/auth/register` (student self-registration only — a `role` field
  other than `"student"` is rejected), `POST /api/auth/login` (works for both roles), and
  `GET /api/auth/me` (re-validates a stored token). Passwords are hashed with bcrypt; JWTs
  carry the user id + role and are signed with `JWT_SECRET`.
- `server/src/middleware/auth.ts` exports `requireAuth` and `requireRole(...roles)` for
  protecting routes; `server/src/routes/demo.routes.ts` has a minimal teacher-only and
  student-only route demonstrating them (delete once real protected routes exist).
- The client (`/client/src/context/AuthContext.tsx`) persists the JWT in `localStorage` and
  attaches it to API calls via `lib/apiClient.ts`. `components/ProtectedRoute.tsx` redirects a
  logged-out visitor to `/login` and a wrong-role visitor to `/unauthorized`. Try it at
  `/login`, `/register`, `/teacher/dashboard`, `/student/dashboard` (the latter two are
  placeholder pages proving the guard works; real content lands in later tasks).

## Run in dev mode

Both apps at once (builds `/shared` once first, then runs shared in watch mode alongside the
server and client dev servers):

```bash
npm run dev
```

- Server: http://localhost:4000 (health check at `/health`)
- Client: http://localhost:5173

Or run each workspace individually in separate terminals:

```bash
npm run dev:server   # server/src/index.ts via tsx watch
npm run dev:client   # Vite dev server for /client
```

If you edit `/shared` while only running `dev:server` / `dev:client` individually (not the
combined `npm run dev`), re-run `npm run build -w shared` so the compiled output picks up your
change — those two scripts rebuild shared once at start but don't watch it.

## Build

Compiles all three workspaces (shared → server → client, in that order) with no type errors:

```bash
npm run build
```

Per-workspace equivalents: `npm run build -w shared`, `npm run build -w server`,
`npm run build -w client`.

## Lint & format

```bash
npm run lint           # ESLint across the whole monorepo (flat config at repo root)
npm run lint:fix
npm run format          # Prettier --write
npm run format:check    # Prettier --check (CI-friendly)
```

## End-to-end tests (Playwright, T-060)

A Playwright regression suite lives at the repo root (`e2e/`, `playwright.config.ts`) —
`@playwright/test` is a root-level devDependency, not under `/client` or `/server`, since the
suite drives the client dev server over real HTTP while also depending on the API server being
up: it exercises the whole running app, not one workspace.

**Prerequisites** (one-time, same convention as the "Database" section above — not automated by
the test command itself):

```bash
npm install
npx playwright install chromium   # downloads the Chromium browser Playwright drives
npm run prisma:migrate -w server  # DB must be migrated
npm run seed -w server            # seeds the teacher account + demo Test/flashcard set the suite reuses
```

**Run the suite** (single documented command):

```bash
npm run test:e2e
```

This starts the API server (`npm run dev:server`) and the Vite client (`npm run dev:client`) for
you if they aren't already running (checked via `http://localhost:4000/health` /
`http://localhost:5173` — see `playwright.config.ts`'s `webServer` array). If you already have
`npm run dev` running in another terminal, the suite reuses it as-is instead of trying to bind the
ports again. Other useful scripts: `npm run test:e2e:ui` (Playwright's interactive UI mode) and
`npm run test:e2e:report` (opens the last HTML report).

**What it covers** — one spec file per flow under `e2e/`:

- `01-core-test-flow.spec.ts` — teacher login → create test → generate variants → start a QR
  session → student login → join → take the test → auto-grade → both teacher and student see the
  matching result.
- `02-flashcard-and-exercise.spec.ts` — flashcard study mode (flip/mark known, progress persists
  across reload) + the fill-in-the-blank vocabulary exercise, reusing the seeded demo flashcard
  set.
- `03-unit-test-and-report.spec.ts` — tagging/publishing a Unit Test, a student taking it via
  self-practice, and the resulting Unit Test leaderboard/report from both roles.
- `04-listening-live-playback.spec.ts` — a live QR session's teacher-controlled, synchronized
  Listening playback (no student-facing Play button during a live session).
- `05-writing-anti-paste.spec.ts` — simulated `paste`/`copy`/`cut` `ClipboardEvent`s against an
  essay answer, confirming they're blocked with a visible warning and normal typing still works.
- `06-speaking-mock-grading.spec.ts` — a recorded Speaking answer (Chromium's fake media device,
  no real microphone needed) submitted and graded by `MockAIGradingProvider`, visible on both the
  in-progress question and the final result page.

**Fixtures**: `e2e/global-setup.ts` runs once per suite invocation, logging in as the seeded
teacher (`server/prisma/seed.ts`) and registering ONE fresh student account, then saving both
sessions' `storageState` for every spec to reuse (`e2e/.auth/`, git-ignored) — per-spec content
(each test/flashcard set/etc.) is still created fresh with a timestamped title so re-running the
suite never collides with a previous run's data. The suite is intentionally single-worker,
non-parallel (`playwright.config.ts`) since specs share these two accounts.

Verified passing twice in a row (12/12 total) against the real running app and a real PostgreSQL
database.

## Notable choices made for this scaffold (T-001)

Where the backlog/tech stack didn't pin an exact version, these were chosen for stability and
ecosystem compatibility (documented here instead of stopping to ask):

- **TypeScript pinned to 5.9.x**, not the newest major, because `typescript-eslint` (as of this
  scaffold) only supports TypeScript `<6.1.0`.
- **Express 4.x**, not 5.x — broadest middleware/ecosystem compatibility for a project that will
  accumulate many small Express additions over the backlog.
- **Tailwind CSS 3.x**, not 4.x — keeps the classic `tailwind.config.js` file, which later task
  T-004 (theme setup) is expected to edit.
- **React 18.x** — pinned explicitly per the backlog's acceptance criteria (not 19.x).
- **Vite 7.x** (classic Rollup/esbuild build, not the newer Rolldown-based `vite@8` /
  `@vitejs/plugin-react@6`) — avoids known Windows-specific `vite@<=6.4.2` advisories
  (`server.fs.deny` bypass, UNC-path NTLM hash disclosure) while staying off the very new
  Rolldown toolchain.
- ESLint uses **flat config** (`eslint.config.mjs`) with `typescript-eslint`'s non type-aware
  `recommended` ruleset (fast, no per-workspace `tsconfig` project wiring required for linting).
  Can be upgraded to type-aware rules later if desired.
