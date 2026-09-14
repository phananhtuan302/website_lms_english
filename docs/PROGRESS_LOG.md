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
