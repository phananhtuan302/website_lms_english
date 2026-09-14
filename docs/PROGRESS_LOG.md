# Progress Log

Append-only history of what changed, across all future Dev/Test/BA/Leader cycles. Since each agent invocation shares no memory with the others, this file (together with `PROJECT_PLAN.md` and `BACKLOG.md`) is the team's only continuity mechanism.

**Entry format** — add a new entry at the top (most recent first), one per work session:

```
## YYYY-MM-DD — <Role> — <short title>
- Task IDs touched: T-0XX, T-0YY
- What changed: <1-3 sentences>
- Why / decisions made: <only if non-obvious — e.g. an ambiguity resolved that isn't already in PROJECT_PLAN's Assumptions section>
- Status after this entry: <e.g. "T-001 Done, T-002 In Progress">
```

Keep entries short. If a session resolves a new ambiguity not already covered by `PROJECT_PLAN.md` Section 6, add it there as a new `A#` item and just reference it here.

---

## 2026-09-14 — Dev/Test — Auth (backend+frontend) and test-content schema

- Task IDs touched: T-005, T-006, T-007
- What changed: Dev added the `Test`/`Section`/`Question`/`Choice` schema (fillBlank uses a plain `acceptedAnswers String[]`, documented inline) with a seed script proving round-trip nested queries against the real DB; JWT-based auth backend (register student-only, login both roles, bcrypt, role middleware, seeded dev teacher) with a documented rejection of `role: teacher` on public registration; auth frontend (React Router, login/register pages, `ProtectedRoute`, persisted JWT, logout). Test independently re-verified everything against the real running app and real Postgres — adversarial JWT tampering (tampered signature, forged role, `alg: none`) all correctly rejected; UI route guards, session persistence across reload, and invalid-token auto-logout all verified with a live Playwright session — PASS.
- Why / decisions made: Wrong-role UI access redirects to a dedicated `/unauthorized` page (not the user's own dashboard) for explicit testability — a Dev judgment call, not a customer-facing behavior concern. Test found one real bug (not part of T-005/006/007's acceptance criteria, logged separately): malformed JSON to any endpoint returns Express's default HTML error page with a full stack trace and absolute file paths, because no global error-handling middleware exists yet. Logged as new task **T-061** rather than blocking these three tasks' Done status, since it's a pre-existing gap from T-001's scaffold, not something T-005/006/007 introduced.
- Status after this entry: T-001–T-007 Done. T-061 (error middleware fix) added as Not Started, low effort, will bundle into an upcoming Dev batch. T-008 (teacher test authoring) is now the next unblocked task, starting the sequential MVP-core-loop chain T-008→T-009→T-010→T-011→T-012→T-013→T-014; dispatching T-008/T-009/T-010 (teacher-side: authoring, variant shuffle, QR session) as one Dev batch next since they're inherently sequential and touch overlapping code.

## 2026-09-14 — Dev/Test — DB schema, env validation, UI shell/theme

- Task IDs touched: T-002, T-003, T-004
- What changed: Dev added Prisma + `User` model against a real local PostgreSQL 17 (native service, `english_platform_dev` DB), plus a `docker-compose.yml` alternative; added fail-fast env validation (`server/src/config/env.ts`) for `DATABASE_URL`/`JWT_SECRET`; rewrote `docs/INTEGRATIONS_TODO.md` with the required table + `AIGradingProvider` placeholder row; built the Tailwind pastel orange-red/white/black theme, `Header`/`AppShell` components, and documented the English-only UI convention in `CONTRIBUTING.md`. Test independently re-verified all three against the real DB (direct `psql` queries, adversarial fail-fast triggering by removing env vars one at a time, headless-browser render with computed-CSS-color checks, clean-state reinstall/build/lint/typecheck) — PASS, no blocking bugs.
- Why / decisions made: Used the machine's existing native Postgres as the primary dev path (still keeping docker-compose as a portable fallback, noted as mutually exclusive on port 5432). Kept `User` as the only new table — no speculative auth tables ahead of T-005. Test flagged two minor/non-blocking items for later attention: (1) `App.tsx`'s status badge uses Tailwind's default slate/green/red instead of a theme token (acceptable — status-semantic colors, not brand colors); (2) `npm audit` shows 3 high-severity transitive advisories in `deepmerge-ts` via Prisma CLI's own tooling (upstream, not something Dev misconfigured) — worth Dev keeping an eye on but not a fix task by itself right now.
- Status after this entry: T-001–T-004 Done. T-005 (auth backend) and T-007 (test/question schema) are now unblocked (both depend only on already-Done tasks) and independent of each other in scope; dispatching them together with T-006 (auth frontend, depends on T-004+T-005) in one Dev session next to keep Prisma schema edits sequential rather than conflicting across parallel agents.

## 2026-09-14 — Dev/Test — Monorepo scaffold

- Task IDs touched: T-001
- What changed: Dev built the npm-workspaces monorepo (`/client` React+TS+Vite+Tailwind, `/server` Express+TS+Socket.IO, `/shared` shared types), root ESLint/Prettier, `/health` endpoint, `.env` conventions. Test independently re-verified from a clean `node_modules` state (fresh install, build, lint-with-injected-error check, live server boot + curl, live client dev-server + Tailwind CSS content check, shared-import grep, git-tracked-files check for `.env` leakage) — PASS, no bugs found.
- Why / decisions made: Dev pinned TypeScript 5.9.x, Express 4.x, Tailwind 3.x, React 18.x, Vite 7.x (avoids Windows CVEs in Vite ≤6.4.2 without jumping to the unstable Rolldown-based Vite 8) — documented in README "Notable choices", not worth a formal Assumption entry. Fixed a real Vite/Rollup npm-workspaces symlink bug via `resolve.preserveSymlinks: true` in `client/vite.config.ts`.
- Status after this entry: T-001 Done (commit `9c69e6a`). T-002/T-003/T-004 now unblocked (all depend only on T-001) and dispatched together as one Dev batch to reduce per-task coordination overhead — see next entry.

## 2026-09-14 — BA — Initial project plan and backlog

- Task IDs touched: None (planning artifacts only, no backlog task consumed by this itself)
- What changed: Read `requirements-raw.md` and `TECH_STACK.md`. Authored `PROJECT_PLAN.md` (product summary, roles, guiding principles, 10-phase roadmap Phase 0–9, requirements traceability matrix, 10 logged assumptions) and `BACKLOG.md` (60 tasks, T-001–T-060, covering every requirement row and every informal note, with acceptance criteria, dependencies, and phase grouping). Created this file as the log template.
- Why / decisions made: All ambiguities encountered while writing the backlog (teacher provisioning, the undefined "Reading" and "Mock test" tab items, Writing's grading model, reporting period definitions, QR/variant assignment mechanics, Vocabulary Check's question source, no payments/hosting specified) were resolved internally per the customer's "don't wait for us" directive and are recorded as Assumptions A1–A10 in `PROJECT_PLAN.md` — none are open questions blocking any task.
- Status after this entry: All 60 backlog tasks are `Not Started`. Ready for Dev to begin Phase 0 (`T-001`).
