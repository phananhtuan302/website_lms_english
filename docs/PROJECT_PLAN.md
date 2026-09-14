# Project Plan — English Test & Learning Platform ("Chị Hiền")

> Source of truth for requirements: `requirements-raw.md` (verbatim, Vietnamese, do not edit).
> Source of truth for technology: `TECH_STACK.md` (Leader's decision, do not override here).
> This file is the roadmap/reasoning layer. `BACKLOG.md` is the actionable, living task list. `PROGRESS_LOG.md` is the append-only history. Every future Dev/Test/BA cycle should read this file once, then live day-to-day in `BACKLOG.md` + `PROGRESS_LOG.md`.

## 1. Product Summary

A web platform for a small English-teaching business run by "Chị Hiền". Teachers author tests and learning content; students log in (their own account), join in-class tests via a QR code, take tests with randomized/shuffled variants, study vocabulary via flashcards and exercises/games, and view their own results. Teachers get realtime in-class monitoring, correctness/time analytics, and multi-granularity reports (by test, unit, week, month, quarter, semester, year). Later phases add a full Grammar module and an AI-graded Speaking module (AI grading stubbed until the customer supplies a real provider/API key). UI is entirely in English; visual theme is pastel orange-red with white and black (per the top of `requirements-raw.md`).

## 2. User Roles

- **Teacher** — creates/manages tests, questions, test variants, flashcard sets, units, grammar content; runs live test sessions (QR + realtime monitor + Listening playback control); views all reporting/leaderboards; reviews AI-graded Speaking results.
- **Student** — has a personal account; joins tests via QR/login; takes tests; studies flashcards/exercises/games; plays Grammar exercises/games; records Speaking answers; views own results, progress, and leaderboards.
- **No separate Admin role/portal is built.** The business is a single small teacher-led operation; the Teacher role covers all management needs. Teacher accounts are provisioned via a seed/admin script (see Assumptions A1), not public signup, to prevent random self-registration as a teacher.

## 3. Guiding Principles (apply to every phase, every task)

1. **Never block on the customer.** Per `requirements-raw.md`'s operating directive, the customer is unavailable until ~90–95% completion and must not be asked questions mid-build. Every ambiguity is resolved internally by the team and logged as an Assumption (Section 6) or a `Source: assumption` note on the relevant backlog task. Nothing in `BACKLOG.md` may have a step that depends on customer input.
2. **Mock/stub external integrations, never stop for them.** Per `TECH_STACK.md`: any feature needing a customer-supplied credential/account (the only current case: real AI speaking-grading provider) is built fully against an interface + mock/stub implementation, logged in `docs/INTEGRATIONS_TODO.md` (created by Dev in Phase 0), and swapped later without touching business logic.
3. **English-only UI.** All product-facing copy (labels, buttons, messages, content authored by the seed/demo data) is English. Internal docs (this plan, backlog, progress log) are also kept in English for the team's own consistency; only literal customer/domain terms are quoted in Vietnamese where useful (e.g. "mã đề").
4. **Visual theme.** Pastel orange-red as the primary/accent color, with white and black as the base palette (Tailwind theme, set up once in Phase 0, reused everywhere).
5. **Anti-cheat/integrity features are cross-cutting.** Tab-switch detection (row 20) applies to *all* test types, including ones already shipped in earlier phases — when built (Phase 6) it must retrofit onto the one shared test-taking session component introduced in Phase 1, not onto per-content-type copies.
6. **One test-taking engine, extended over time.** There is a single Test/Section/Question domain model (introduced Phase 1). Reading, Listening, Writing, Speaking, Grammar-practice and Mock Test are new *question/section content types and behaviors* layered onto that same engine in later phases, not separate parallel systems. This keeps reporting, grading, and session/monitoring infrastructure reusable.
7. **Stack is fixed.** Node/TS + Express + Socket.IO backend, React/TS/Vite/Tailwind frontend, PostgreSQL + Prisma, npm-workspaces monorepo (`/client /server /shared /docs`) per `TECH_STACK.md`. Dev does not change this without the Leader updating `TECH_STACK.md` first.

## 4. Phase Breakdown

Phases are ordered by dependency (what must exist first) and then by business value (what the customer asked for most concretely vs. what was a loose add-on note). Each phase should be fully working and demoable before the next starts, so the product is always in a shippable-ish state for the eventual 90–95% review.

### Phase 0 — Foundation & Scaffold (`T-001`–`T-006`)
Monorepo, DB/ORM wiring, env/config conventions, the `INTEGRATIONS_TODO.md` file, the Tailwind visual theme, and authentication (register/login, JWT, roles). Nothing here is customer-visible as a "feature" but everything else depends on it. Auth is included here (not Phase 1) because both teacher and student flows in every later phase need a logged-in identity first.

### Phase 1 — MVP Core Loop (`T-007`–`T-014`)
The smallest slice that is a real, usable product end-to-end: teacher builds a test, generates shuffled variants, starts a session with a QR code, a student logs in and joins via QR, takes the test, gets auto-graded on objective question types, and both sides see a basic result. This directly covers requirement rows 1–5 and 9 (partially). Deliberately excludes realtime monitoring, rich reporting, and any non-objective question types — those come next. Task count (14, including Phase 0) matches the "first 10–15 tasks stand up an end-to-end slice" goal.

### Phase 2 — Realtime Monitoring & Reporting Foundations (`T-015`–`T-020`)
Adds Socket.IO-based live progress monitoring (rows 6–7), time-on-test tracking and averages (row 8), the curriculum tagging entities (Unit, Academic Period/semester) needed for "by unit / by semester" reporting, and a first reporting engine + per-question correct/incorrect detail (row 9 depth). This is placed right after the MVP loop because reporting/monitoring is a cross-cutting capability that every later module (vocab, unit tests, grammar, speaking) will plug into — building its foundation early avoids rework.

### Phase 3 — Vocabulary & Flashcards Core (`T-021`–`T-030`)
Flashcard sets/words and every exercise sub-type the customer listed (fill-blank, unscramble, listen-and-type, IPA-to-word, four matching modes, use-in-sentence), plus per-student progress tracking (row 11–12). This is the single largest explicit feature area in the requirements and has no dependency on Unit Tests or Grammar, so it can proceed in parallel with/after Phase 2.

### Phase 4 — Vocabulary Leaderboards, Reports & Games (`T-031`–`T-035`)
Leaderboard, monthly/yearly vocab ranking reports (rows 13–15), and the two Quizlet-style mini-games the customer floated as "an idea to add" (row 11 note). Placed after Phase 3 core because leaderboards/reports need real progress data to be meaningful, and the games are explicitly a nice-to-have relative to the core learning flow.

### Phase 5 — Unit Tests & Vocabulary Check (`T-036`–`T-038`)
Organizes tests by curriculum Unit (row 16), unit-level reports/leaderboards (row 17), and the 15-minute Vocabulary Check test type that draws from previously-studied vocab (row 18). Depends on both the Test engine (Phase 1) and the Unit/vocab-progress data (Phases 2–3), which is why it sits here rather than earlier.

### Phase 6 — Specialized Content Types & Exam Integrity (`T-039`–`T-045`)
Reading passages, Listening (home self-practice play button, then teacher-controlled synchronized in-class playback), Writing (essay content type + manual grading + anti-copy-paste), global Tab-switch detection, and Mock Test composition (rows 10, 19, 20, plus the tab-list items Reading and Mock Test). Grouped together because they are all "extend the core test engine with a new content type or a new integrity guard" work, and Listening's teacher-controlled playback reuses the Phase 2 realtime infrastructure directly.

### Phase 7 — Grammar Module (`T-046`–`T-050`)
Theory content, practice exercises, games, and reports for Grammar (customer's informal note). Placed after Phase 6 because its practice-exercise and game mechanics deliberately reuse patterns/components built for Vocabulary (Phase 3–4) and its reporting reuses the Phase 2 engine — building it earlier would mean building those patterns twice.

### Phase 8 — Speaking Module & AI Grading, Stubbed (`T-051`–`T-056`)
Speaking prompts with a timed response window, client-side recording + Web Speech API draft transcript, and grading via an `AIGradingProvider` interface whose only implementation for now is `MockAIGradingProvider` (per `TECH_STACK.md`). Placed last among feature phases both because it's the customer's most informally-specified idea ("muốn có thêm") and because it is the clearest case of the mock/stub rule — nothing about it can regress once a real provider is swapped in later.

### Phase 9 — Cross-Cutting Hardening & Deployment Prep (`T-057`–`T-060`)
Full reporting depth across every module and every granularity, a deployment/hosting/CI-CD placeholder (logged to `INTEGRATIONS_TODO.md`, no actual infra since none was specified), mobile-responsive polish for the QR-join/test-taking flows (QR is scanned with a phone camera), and a full Playwright regression pass across all core flows. This is the run-up to the customer's 90–95% review checkpoint.

## 5. Requirements Traceability Matrix

Every row of `requirements-raw.md`'s table and every item in its "Ghi chú bổ sung" notes maps to at least one backlog task, so nothing is dropped.

| Requirement row / note | Backlog task(s) |
|---|---|
| 1 — English UI | T-004 |
| 2 — Student has own account | T-005, T-006, T-011 |
| 3 — Teacher creates test | T-007, T-008 |
| 4 — QR join | T-010, T-011 |
| 5 — Shuffled test codes/variants | T-009 |
| 6 — Realtime progress tracking | T-016 |
| 7 — % completion tracking | T-016 |
| 8 — Time tracking + report by month/unit/quarter/year | T-017, T-018, T-019, T-057 |
| 9 — Correct/incorrect tracking | T-013, T-014, T-020 |
| 10 — Writing anti-copy-paste | T-042, T-043 |
| 11 — Flashcards + exercise sub-types + vocab games idea | T-021–T-030, T-034, T-035 |
| 12 — Track vocab/flashcard learning progress | T-030 |
| 13 — Vocabulary leaderboard | T-031 |
| 14 — Vocabulary monthly ranking report | T-032 |
| 15 — Vocabulary yearly ranking report | T-033 |
| 16 — Unit Test management | T-036 |
| 17 — Unit Test report & leaderboard | T-037 |
| 18 — Vocabulary Check (15 min) | T-038 |
| 19 — Listening: teacher-controlled playback + home self-practice | T-040, T-041 |
| 20 — Tab-switch detection, all tests | T-044 |
| Note — Speaking + AI grading | T-051–T-056 |
| Note — Grammar module (theory/practice/game/report) | T-046–T-050 |
| Note — Tab list item "Reading" (not in the row table) | T-039 (Assumption A2) |
| Note — Tab list item "Mock test" | T-045 (Assumption A4) |
| Note — Report granularities incl. "semester" | T-018, T-019, T-057 (Assumption A5) |
| Top-of-doc — pastel orange-red/white/black theme | T-004 |

## 6. Assumptions (resolved internally — do not re-ask the customer; revisit only at the 90–95% review)

- **A1 — Teacher provisioning.** No public teacher self-signup. Teacher accounts are created via a seed/admin script run during setup (documented by Dev alongside `T-005`). Students may self-register or be bulk-created by a teacher. No separate Admin role/portal exists.
- **A2 — "Reading" tab.** Not in the requirement table, only in the customer's informal tab list. Implemented as a passage content type attached to a Test/Section, with one or more existing question types (mostly multiple-choice) referencing the passage — no new grading mechanics needed.
- **A3 — "Writing" beyond anti-paste.** Writing questions are free-text/essay responses, graded manually by the teacher (rubric optional/simple score+comment). AI grading is explicitly scoped to Speaking only, per the customer's own notes — Writing never gets AI grading. Anti-copy-paste means: block pasting into the answer textarea, and also disable copy/cut out of it, with a visible warning to the student when blocked.
- **A4 — "Mock test".** Not a separate engine. It is a `Test` whose `testType` is `mockTest`, assembled from sections spanning multiple content types (Reading/Listening/Writing/Vocab, and Grammar once Phase 7 exists) using the same authoring tool as any other test. `testType` also carries the values `generic`, `unitTest`, `vocabularyCheck`, `listeningTest`.
- **A5 — Reporting periods.** "Week" = ISO-8601 week (Monday–Sunday). "Semester" = a configurable Academic Period entity (name + start/end date), seeded with two semesters/year by default and editable by the teacher, since no fixed school calendar was supplied. All date/time bucketing uses a fixed `Asia/Ho_Chi_Minh` (UTC+7, no DST) timezone.
- **A6 — QR join mechanics.** Teacher picks a test, starts a "session", and the system generates (a) a QR code encoding a join URL/token and (b) a short manual-entry code as a fallback if scanning fails. The QR/code carries only a join token, never credentials — students must still be logged into their own existing account to complete the join.
- **A7 — Variant assignment.** When a student joins a session, the system automatically assigns them one of the pre-generated shuffled variants (round-robin or random), so neighboring students in class get different question/answer order without the teacher manually assigning codes.
- **A8 — Vocabulary Check content source.** The 15-minute Vocabulary Check pulls its question pool from vocabulary the student has already studied (per their `FlashcardProgress`), not from unseen/new words.
- **A9 — No payments/billing.** Nothing in the source docs mentions payment; none is planned. Hosting/domain/CI-CD and any other future paid third-party integration are logged as placeholders in `INTEGRATIONS_TODO.md` (`T-058`) and not designed further now.
- **A10 — Assumptions are final for this build cycle.** Because the customer cannot be reached until ~90–95% completion, A1–A9 are treated as committed product decisions, not open questions. If the customer requests something different at the review checkpoint, that becomes a new backlog item at that time — it does not block anything before then.
- **A11 — T-019 reporting engine's `groupBy` shape.** The backlog's "filtered by: a single test, a Unit, an ISO week, a calendar month, a quarter, an Academic Period, and a year" reads two ways: return one aggregate number for one caller-picked value, or return a breakdown table with one row per bucket for that granularity. Resolved as the latter: `GET /api/teacher/reports?groupBy=...` always returns a table (one row per test/unit/week/month/quarter/semester/year actually present in the data), which matches the task's own "a table/list of results is enough" framing for the reports page and is strictly more capable — optional `testId`/`unitId` query params further narrow the underlying attempts before bucketing, so a caller can still pick out one specific row/value if that's all they want. See `server/src/lib/reporting.ts`'s module doc comment for the full reasoning.

## 7. How Future Cycles Should Use These Docs

1. Read this file (`PROJECT_PLAN.md`) once for orientation — phase order, principles, and assumptions rarely change.
2. Work from `BACKLOG.md` day to day: pick the next `Not Started` task whose dependencies are `Done`, implement/test it, flip its `Status:` line, and keep moving.
3. Append one short entry to `PROGRESS_LOG.md` at the end of each work session (what changed, which task IDs, by which role, and why for any non-obvious decision) so the next agent — who shares no memory with you — has continuity.
4. If a genuinely new ambiguity turns up that isn't covered by Section 6, resolve it the same way (pick the reasonable interpretation, do not stop for the customer), add it as a new `A11`, `A12`, ... entry here, and note the resolution in `PROGRESS_LOG.md`.

## 8. Process & Velocity Mode (customer-approved, 2026-09-14)

The customer explicitly reviewed the pace of the first ~18 tasks (each batch used two full independent verification passes — Dev self-testing everything including live browser automation, then a fully adversarial independent Test pass with its own scripts) and asked to trade some of that redundancy for speed. This is a deliberate, approved change to how every subsequent cycle should operate — not a one-off — until/unless the customer says otherwise at the 90–95% review:

- **Bigger batches.** Group 5–8 backlog tasks per Dev cycle (up from 2–4), whenever they're in the same feature area or a mostly-linear dependency chain (e.g. a whole phase's schema+backend+frontend+exercises). Bigger batches amortize the fixed cost every fresh agent pays just to read the docs and existing code before writing anything.
- **Lighter Dev self-verification.** Dev should verify primarily via direct HTTP/API calls and direct DB queries (fast, no browser overhead). Reserve a real browser (Playwright) check for the single primary end-to-end flow of the batch, not for every sub-case, edge case, or question type combination.
- **Sampled, not exhaustive, Test verification.** Test should verify the stated acceptance criteria plus the one or two highest-risk edge cases per task (e.g. an ownership/cross-account check), not attempt to adversarially break every possible angle (JWT tampering variants, multiple race-condition replays, decoding QR bytes with an independent library, etc.) on every single task. Save that depth of adversarial testing for **Phase-boundary milestones** (the point where a whole Phase's tasks are all nominally Done) — run one thorough, adversarial regression pass per completed phase instead of per task.
- **Pipeline Dev and Test across batches.** Don't wait for Test to finish verifying batch N before starting Dev on batch N+1, as long as batch N+1's tasks don't depend on batch N's task IDs (check `Depends on:` — plenty of later phases, e.g. Phase 3 vocabulary, don't depend on Phase 2 reporting work at all). Dispatch the next Dev batch immediately when the current Dev batch reports done, in parallel with dispatching Test for the just-finished batch.
- **Known trade-off, explicitly accepted by the customer:** this will let a few minor bugs slip past into `Done` status that a fully adversarial pass might have caught immediately. That's expected and acceptable — they get caught at the next Phase-boundary regression pass or the 90–95% review instead of before every single task. If Test (at a per-task or phase-boundary pass) finds a bug in something already marked `Done`, don't revert its status — just log a new backlog task for the fix (as already practiced for `T-061`) and keep moving.
