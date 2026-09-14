# Backlog

Single source of truth for concrete, independently-implementable work. Read `PROJECT_PLAN.md` first for the reasoning behind phase order and for the Assumptions this backlog relies on.

**How to use this file**
- Each task has a stable ID (`T-0XX`), never reused or renumbered even if a task is dropped (mark it `Won't Do` instead of deleting).
- Status values: `Not Started` | `In Progress` | `Blocked` | `Done`. Update the `Status:` line in place when work happens — that's the only thing that needs to stay grep-friendly (`grep "Status: Not Started"`).
- `Depends on:` lists task IDs that must be `Done` first. `None` if it has no dependency.
- `Source:` traces the task back to `requirements-raw.md` (row number) or to an informal note / assumption in `PROJECT_PLAN.md`.
- `Acceptance Criteria:` is written so the Test role can verify it directly against running software — concrete, observable outcomes, not vague goals.
- When you finish a task, also add one line to `PROGRESS_LOG.md`.
- New work discovered mid-build gets a new task ID appended at the end of its phase's section (or a new phase if truly new scope) — never silently done off-backlog.

---

## Phase 0 — Foundation & Scaffold

- [x] **T-001 — Monorepo scaffold & tooling**
  - Status: Done
  - Depends on: None
  - Source: TECH_STACK.md (architecture)
  - Acceptance Criteria: Running `npm install` at the repo root installs all workspaces (`/client`, `/server`, `/shared`) without error. Each workspace has a working TypeScript config, and `npm run build` (or equivalent per-workspace script) compiles all three without type errors. ESLint + Prettier are configured at the root and running the lint script reports zero errors on the initial scaffold. A root `README.md` (or `docs/` note) explains how to install and run client + server in dev mode.

- [x] **T-002 — PostgreSQL + Prisma init & base schema**
  - Status: Done
  - Depends on: T-001
  - Source: TECH_STACK.md (database)
  - Acceptance Criteria: `/server` has Prisma configured against a local PostgreSQL instance (connection via `.env`, documented setup steps for a fresh machine). `prisma migrate dev` runs cleanly and creates a `User` model (id, email, passwordHash, role enum `teacher`/`student`, name, createdAt) plus any needed base tables. `prisma studio` (or an equivalent query) shows the tables exist after migration.

- [x] **T-003 — Env/config conventions & INTEGRATIONS_TODO.md seed**
  - Status: Done
  - Depends on: T-001
  - Source: TECH_STACK.md (external integration rule)
  - Acceptance Criteria: `.env.example` files exist for `/server` (and `/client` if needed) listing every required variable with a comment, and the app fails fast with a clear error message if a required variable is missing. `docs/INTEGRATIONS_TODO.md` is created with a table (columns: integration name, code location, what the customer must supply, current mock/stub, how to swap in real credentials) and at least a placeholder row for the eventual AI speaking-grading provider. `.env` itself is git-ignored.

- [x] **T-004 — Tailwind theme, base app shell & English-only UI convention**
  - Status: Done
  - Depends on: T-001
  - Source: Requirement row 1 (English UI); top-of-doc color directive in requirements-raw.md
  - Acceptance Criteria: `/client` has Tailwind configured with a theme defining a pastel orange-red primary/accent color plus white and black as base colors, used consistently (verifiable by inspecting `tailwind.config` and at least one rendered page using the theme tokens, not ad-hoc hex codes). A minimal app shell (header/nav placeholder, content area) renders. All visible text in the shell is English. This convention (English-only UI copy) is written down (e.g. in a short CONTRIBUTING note or this task's notes) so every later task is held to it during review.

- [x] **T-005 — Auth backend: register/login, JWT, roles**
  - Status: Done
  - Depends on: T-002, T-003
  - Source: Requirement row 2; Assumption A1
  - Acceptance Criteria: REST endpoints exist for student self-registration (email/password/name) and login for both roles, returning a signed JWT containing user id + role. Passwords are hashed with bcrypt (never stored/returned in plaintext). A role-based middleware exists that rejects requests to teacher-only routes from a student token (403) and vice versa where applicable. Teacher accounts cannot be created via the public registration endpoint (verified by calling it with `role: teacher` and confirming it's rejected or ignored); a documented seed script creates at least one teacher account for local dev.

- [x] **T-006 — Auth frontend: login/register UI, session handling, route guards**
  - Status: Done
  - Depends on: T-004, T-005
  - Source: Requirement row 2
  - Acceptance Criteria: A student can register and log in through the UI; a seeded teacher can log in through the same login form (no register option shown/usable for teacher role). The JWT is persisted (e.g. localStorage) and attached to authenticated API calls. Navigating to a teacher-only or student-only page while logged in as the wrong role (or logged out) redirects to an appropriate page instead of rendering protected content. Logout clears the session and blocks further access to protected pages.

## Phase 1 — MVP Core Loop

- [x] **T-007 — DB schema: Test, Section, Question, Choice (objective types)**
  - Status: Done
  - Depends on: T-002
  - Source: Requirement row 3
  - Acceptance Criteria: Prisma models exist for `Test` (owned by a teacher), `Section`, `Question` (with a `type` enum including at minimum `multipleChoice`, `trueFalse`, `fillBlank`), and `Choice`/accepted-answer data as appropriate per type. A migration applies cleanly. Seed/test data can create a `Test` with at least one `Section` containing one question of each of the three types, and querying it back returns the full nested structure.

- [x] **T-008 — Teacher: test authoring (create/edit test & questions)**
  - Status: Done
  - Depends on: T-006, T-007
  - Source: Requirement row 3
  - Acceptance Criteria: A logged-in teacher can create a new test, add/edit/delete sections and questions of the three objective types (setting correct answer(s) for each), reorder questions, and save. Reloading the test editor shows the previously saved content. A student account cannot access the authoring UI or its API endpoints (403).

- [x] **T-009 — Test code/variant shuffle engine**
  - Status: Done
  - Depends on: T-007, T-008
  - Source: Requirement row 5
  - Acceptance Criteria: Given an authored test, the system can generate at least 2 base variants ("mã đề") plus additional variants by shuffling question order and, within a question, choice order (per Assumption A7, variants are later auto-assigned per joining student). Generating variants twice from the same test produces different orderings (not identical output), while the underlying question/answer-key mapping stays correct (grading a shuffled variant still scores against the right answer). A teacher can view the list of generated variants for a test.

- [x] **T-010 — QR join: session creation + QR code generation**
  - Status: Done
  - Depends on: T-009
  - Source: Requirement row 4; Assumption A6
  - Acceptance Criteria: A teacher can start a "session" for one of their tests, which creates a unique join token and displays a scannable QR code (generated with the `qrcode` npm package, no external service) encoding a join URL, plus a short manual-entry fallback code shown alongside it. Each session start produces a new, distinct token (old QR codes/tokens for a closed session no longer allow joining).

- [x] **T-011 — Student: join session via QR/link + login gate**
  - Status: Done
  - Depends on: T-006, T-010
  - Source: Requirement rows 2, 4
  - Acceptance Criteria: Opening the join URL (as if scanned) while logged out prompts login/registration first, then completes the join; while already logged in as a student it joins immediately. On successful join, the student is attached to the session and (per Assumption A7) assigned one of the session's shuffled variants. Attempting to join with an invalid/expired token shows a clear error instead of a crash.

- [x] **T-012 — Student: take-test runtime UI**
  - Status: Done
  - Depends on: T-007, T-011
  - Source: Requirement row 3 (implied "students take tests"); foundation for row 20 later
  - Acceptance Criteria: A joined student can navigate between questions, answer each objective question type, see a visible timer if the test has a time limit, and submit. Answers are autosaved (e.g. on change or at an interval) so that refreshing the page mid-test restores previously entered answers rather than losing them. Submitting is a distinct, confirmed action that ends the attempt.

- [x] **T-013 — Auto-grading engine for objective question types**
  - Status: Done
  - Depends on: T-012
  - Source: Requirement row 9
  - Acceptance Criteria: On submission, the system scores multiple-choice and true/false by exact match against the stored correct choice, and fill-blank by case-insensitive match against a list of accepted answers configured at authoring time. Each answer is persisted with an `isCorrect` boolean and the attempt has a total score (correct/total and percentage). Grading is deterministic — grading the same submitted answers twice yields the same score.

- [x] **T-014 — Basic result views (student + teacher)**
  - Status: Done
  - Depends on: T-013
  - Source: Requirement row 9
  - Acceptance Criteria: After submitting, a student sees their own score and a correct/incorrect indicator per question for that attempt. A teacher, from the test/session view, sees a list of all students who attempted it with each one's score. A student cannot view another student's result (403/blocked at the API level, not just hidden in the UI).

## Phase 2 — Realtime Monitoring & Reporting Foundations

- [x] **T-015 — Realtime session infrastructure (Socket.IO)**
  - Status: Done
  - Depends on: T-006, T-007
  - Source: TECH_STACK.md (realtime rationale); foundation for rows 6, 7, 19
  - Acceptance Criteria: The server exposes a Socket.IO namespace/room per active test session. A connected teacher client (authenticated) can join the room for a session they own; a student client joining the same session emits progress events the server relays to the room. Disconnecting and reconnecting a student mid-test does not duplicate them in the room or crash the server.

- [x] **T-016 — Teacher live monitoring dashboard**
  - Status: Done
  - Depends on: T-015, T-012
  - Source: Requirement rows 6, 7
  - Acceptance Criteria: While a session is active, the teacher's dashboard shows, per joined student and updating without a manual page refresh: which question they're currently on (or last answered) and their percent-complete. Opening the dashboard mid-session (after students already started) shows their current state, not just updates from that point forward. Closing/finishing the session stops further live updates.

- [x] **T-017 — Time tracking & averages**
  - Status: Done
  - Depends on: T-013, T-015
  - Source: Requirement row 8
  - Acceptance Criteria: Each attempt records start time and submit time; total time-taken is computed and stored. For a given test, the teacher can see the average time-taken across all attempts. A student who never submits (abandoned attempt) does not corrupt the average (excluded or clearly flagged as incomplete).

- [x] **T-018 — Curriculum tagging: Unit & Academic Period (semester) entities**
  - Status: Done
  - Depends on: T-007
  - Source: Requirement row 8 note ("report theo unit"); Assumption A5
  - Acceptance Criteria: A `Unit` model (name, order) and an `AcademicPeriod`/semester model (name, startDate, endDate) exist and can be managed by a teacher (create/edit/list). A `Test` can optionally be tagged with a `Unit`. Seeding creates at least two default academic periods for the current year. This task does not yet build the full "Unit Test" feature (that's T-036) — it only introduces the tagging data needed for reporting.

- [x] **T-019 — Reporting engine v1 (multi-granularity)**
  - Status: Done
  - Depends on: T-013, T-017, T-018
  - Source: Requirement row 8; tab-list report note; Assumption A5
  - Acceptance Criteria: A teacher can view aggregate test-attempt stats (average score, average time) filtered by: a single test, a Unit, an ISO week, a calendar month, a quarter, an Academic Period (semester), and a year. Changing the filter changes the displayed numbers correctly against seeded data spanning at least two different periods (verifiable by checking the math against raw attempt records). All bucketing uses the fixed `Asia/Ho_Chi_Minh` timezone per Assumption A5.

- [x] **T-020 — Result detail: per-question correct/incorrect breakdown**
  - Status: Done
  - Depends on: T-013, T-014
  - Source: Requirement row 9
  - Acceptance Criteria: From a specific student's attempt, both the student and the owning teacher can open a per-question breakdown showing the question text, the student's answer, whether it was correct, and the correct answer. This view is available from both the student result page (T-014) and the teacher's per-session student list.

## Phase 3 — Vocabulary & Flashcards Core

- [x] **T-021 — DB schema: Vocabulary, FlashcardSet, FlashcardCard, FlashcardProgress**
  - Status: Done
  - Depends on: T-002
  - Source: Requirement row 11
  - Acceptance Criteria: Prisma models exist for a vocabulary word (term, meaning, IPA, image URL, audio URL, synonyms, antonyms — fields may be optional), a `FlashcardSet` grouping words (optionally tagged to a `Unit`), and a `FlashcardProgress` per student per card (e.g. status/familiarity, last reviewed). Migration applies cleanly and a seeded set with several words can be queried back with all fields intact.

- [x] **T-022 — Teacher: manage flashcard sets & vocabulary words**
  - Status: Done
  - Depends on: T-006, T-021
  - Source: Requirement row 11
  - Acceptance Criteria: A teacher can create a flashcard set, add/edit/delete words with meaning, IPA, optional image, optional audio, and optional synonym/antonym lists, and save. Reopening the set shows all saved data. A student cannot access the authoring endpoints (403).

- [x] **T-023 — Student: flashcard study/review mode**
  - Status: Done
  - Depends on: T-022
  - Source: Requirement row 11
  - Acceptance Criteria: A student can open a flashcard set and flip through cards (front: term or prompt, back: meaning/details), marking each as known/unknown or similar, which updates that student's `FlashcardProgress` for the card. Reopening the set later reflects the previously recorded progress (e.g. resumes or shows prior status) rather than resetting.

- [x] **T-024 — Exercise: fill-in-the-blank vocabulary**
  - Status: Done
  - Depends on: T-021
  - Source: Requirement row 11 note
  - Acceptance Criteria: For a flashcard set, a student can attempt a fill-in-the-blank exercise (sentence with the target word blanked out); submitting an answer is checked case-insensitively against the correct word (and any configured alternates), the result (correct/incorrect) is shown immediately, and the attempt updates that student's exercise progress for the set.

- [x] **T-025 — Exercise: unscramble word**
  - Status: Done
  - Depends on: T-021
  - Source: Requirement row 11 note
  - Acceptance Criteria: A student is shown a scrambled arrangement of a vocabulary word's letters and must reconstruct it; submitting checks the exact word, gives immediate correct/incorrect feedback, and records progress the same way as T-024.

- [x] **T-026 — Exercise: listen-and-type (dictation)**
  - Status: Done
  - Depends on: T-021
  - Source: Requirement row 11 note
  - Acceptance Criteria: A student can play the audio for a word (using the word's audio asset from T-021; if no audio asset is present for a word, that word is excluded from this exercise type rather than failing) and type what they heard; submission is checked case-insensitively against the word, gives immediate feedback, and records progress.

- [x] **T-027 — Exercise: IPA-to-word**
  - Status: Done
  - Depends on: T-021
  - Source: Requirement row 11 note
  - Acceptance Criteria: A student is shown a word's IPA transcription and must type the word it represents; submission is checked case-insensitively, gives immediate feedback, and records progress. Words without an IPA field populated are excluded from this exercise type.

- [x] **T-028 — Exercise: matching (meaning / image / synonym / antonym)**
  - Status: Done
  - Depends on: T-021
  - Source: Requirement row 11 note
  - Acceptance Criteria: A student can play a matching exercise in each of the four modes listed by the customer — word-to-meaning, word-to-image, word-to-synonym, word-to-antonym — presented as a set of pairs to match; the UI clearly indicates correct vs. incorrect pairings and completion state, and each completed round records exercise progress. Modes with no eligible data (e.g. a set with no words that have synonyms) are simply unavailable for that set rather than erroring.

- [x] **T-029 — Exercise: use-word-in-a-sentence**
  - Status: Done
  - Depends on: T-021
  - Source: Requirement row 11 note
  - Acceptance Criteria: A student is prompted to write a sentence using a given vocabulary word and submits free text. Since correctness isn't objectively checkable, the system at minimum validates the target word appears in the submission (simple heuristic) and stores the submission for teacher visibility; it does not block progress on a "wrong" answer. This is explicitly not AI-graded (see PROJECT_PLAN Assumption A3 — AI grading is Speaking-only).

- [x] **T-030 — Vocabulary/exercise progress tracking (student + teacher views)**
  - Status: Done
  - Depends on: T-023, T-024, T-025, T-026, T-027, T-028, T-029
  - Source: Requirement row 12
  - Acceptance Criteria: A student has a personal progress view showing, per flashcard set, how many cards are known/learning and how many of each exercise type have been completed/attempted with what accuracy. A teacher has a per-student (and per-class-of-students) view of the same data for sets they own, so they can identify who hasn't practiced.

## Phase 4 — Vocabulary Leaderboards, Reports & Games

- [x] **T-031 — Vocabulary leaderboard**
  - Status: Done
  - Depends on: T-030
  - Source: Requirement row 13
  - Acceptance Criteria: A ranked leaderboard is visible to both teacher and students, ordered by a defined score derived from vocabulary results/activity level (e.g. exercise accuracy plus volume of cards learned). Given seeded progress data for multiple students, the displayed order matches a manually-computed expected order.

- [x] **T-032 — Vocabulary monthly ranking report**
  - Status: Done
  - Depends on: T-030, T-019
  - Source: Requirement row 14
  - Acceptance Criteria: A teacher can select a calendar month and see a ranked report identifying the highest-scoring and most active students for that month specifically (not all-time), using the reporting engine's month bucketing from T-019.

- [x] **T-033 — Vocabulary yearly ranking report**
  - Status: Done
  - Depends on: T-030, T-019
  - Source: Requirement row 15
  - Acceptance Criteria: Same as T-032 but bucketed by year. Selecting different years with seeded multi-year data produces different, correct rankings for each year.

- [x] **T-034 — Vocab game: space-shooter style word game**
  - Status: Done
  - Depends on: T-021
  - Source: Requirement row 11 note ("game học vocab kiểu Quizlet — bắn tàu vũ trụ")
  - Acceptance Criteria: A student can play a space-shooter-style game (built with React + Canvas/DOM per TECH_STACK.md, no external game-engine dependency) where correctly matching/answering vocabulary from a chosen flashcard set advances play (e.g. destroys the right target) and wrong answers have a visible penalty. Completing a round records an exercise-progress entry for that set, consistent with T-030's tracking.

- [x] **T-035 — Vocab game: mario-style runner word game**
  - Status: Done
  - Depends on: T-021
  - Source: Requirement row 11 note ("...mario,...")
  - Acceptance Criteria: A student can play a side-scrolling/runner-style game where progressing requires correctly answering vocabulary prompts from a chosen set; same completion/progress-recording behavior as T-034.

## Phase 5 — Unit Tests & Vocabulary Check

- [x] **T-036 — Unit Test management**
  - Status: Done
  - Depends on: T-018, T-008
  - Source: Requirement row 16
  - Acceptance Criteria: A teacher can tag a test as `testType: unitTest` and associate it with a `Unit` (from T-018). A "Unit Tests" view lists tests grouped by unit for both teacher and student (students only see units/tests relevant to them, e.g. published ones).

- [x] **T-037 — Unit Test report & leaderboard**
  - Status: Done
  - Depends on: T-036, T-019
  - Source: Requirement row 17
  - Acceptance Criteria: For a given Unit, both teacher and students can view a report/leaderboard comparing student results on that unit's test(s) — at minimum ranked scores and average score for the unit, consistent with data from T-019.

- [x] **T-038 — Vocabulary Check test type (15 minutes)**
  - Status: Done
  - Depends on: T-012, T-021, T-030
  - Source: Requirement row 18; Assumption A8
  - Acceptance Criteria: A teacher can generate a Vocabulary Check test (`testType: vocabularyCheck`) with a fixed 15-minute timer, whose question pool is drawn from vocabulary the target student(s) have already studied per their `FlashcardProgress` (Assumption A8) rather than arbitrary new words. Taking it uses the same test-runtime (T-012) and auto-grading (T-013) already built, and the timer auto-submits at 15 minutes if the student hasn't already.

## Phase 6 — Specialized Content Types & Exam Integrity

- [x] **T-039 — Reading module (passage content type)**
  - Status: Done
  - Depends on: T-008
  - Source: Tab-list note "Reading"; Assumption A2
  - Acceptance Criteria: A teacher can attach a reading passage (rich text, possibly with an image) to a Section, and add one or more questions (reusing existing objective types) that reference it. A student taking such a section sees the passage alongside its questions and is graded exactly as in T-013 — no new grading logic is introduced.

- [x] **T-040 — Listening module: audio question type + home self-practice playback**
  - Status: Done
  - Depends on: T-008
  - Source: Requirement row 19 (home self-practice half)
  - Acceptance Criteria: A teacher can attach an audio clip to a question/section. When a student takes such a test outside of a live in-class session (self-practice at home), they see and can freely use a Play button to hear the audio as many times as allowed by the teacher's configuration (e.g. unlimited or a max-play-count setting). Grading of any attached questions works as in T-013.

- [x] **T-041 — Listening: teacher-controlled synchronized in-class playback**
  - Status: Done
  - Depends on: T-015, T-040
  - Source: Requirement row 19 (in-class half — this is the primary, explicit requirement)
  - Acceptance Criteria: During a live session (from T-015/T-010), students taking a Listening section do NOT see an enabled Play button — audio only plays for them when the teacher, from their session control screen, presses Play, at which point it plays (via the realtime channel) on all joined students' screens in sync. Students cannot start, pause, or seek the audio themselves during a live session. This behavior only applies to live sessions; the same test taken standalone at home uses T-040's student-controlled playback.

- [x] **T-042 — Writing module: essay question type + manual teacher grading**
  - Status: Done
  - Depends on: T-008
  - Source: Tab-list note "Writing"; Assumption A3
  - Acceptance Criteria: A teacher can add a free-text/essay question to a test. A student can submit a multi-paragraph text response. Since this isn't auto-gradable, the teacher has a review UI to read each submission and assign a manual score (and optional comment), which then shows up in the student's result view alongside the auto-graded questions in the same attempt.

- [x] **T-043 — Writing anti-copy-paste enforcement**
  - Status: Done
  - Depends on: T-042
  - Source: Requirement row 10
  - Acceptance Criteria: On the Writing answer field, a `paste` event is intercepted and blocked (content is not inserted), and copy/cut out of the field is also disabled; attempting either shows a visible warning message to the student rather than failing silently. This is verified via a simulated paste/copy event in an automated test, not just manual inspection. It does not block normal typing.

- [x] **T-044 — Global tab-switch / exit detection**
  - Status: Done
  - Depends on: T-012
  - Source: Requirement row 20
  - Acceptance Criteria: While a student has any test in progress (any `testType`, including ones from earlier phases — MVP test, Unit Test, Vocabulary Check, Listening, Mock Test), switching away from the tab or window (`visibilitychange`/`blur`) triggers a visible on-screen notice to the student and is recorded on the attempt (e.g. a tab-switch count/timestamp log) visible to the teacher afterward. This is implemented once in the shared test-taking session component (T-012) so it automatically covers every test type without per-content-type changes.

- [ ] **T-045 — Mock Test composition**
  - Status: Not Started
  - Depends on: T-008, T-039, T-041, T-042
  - Source: Tab-list note "Mock test"; Assumption A4
  - Acceptance Criteria: The `Test` model's `testType` field supports `mockTest`, and the authoring UI (T-008) lets a teacher assemble a single test whose sections mix Reading, Listening, Writing, and standard objective/vocab-sourced questions. Taking and grading such a test reuses T-012/T-013/T-042 as appropriate per section — no separate mock-test-only runtime is built.

## Phase 7 — Grammar Module

- [x] **T-046 — Grammar DB schema**
  - Status: Done
  - Depends on: T-002
  - Source: Notes — Grammar module
  - Acceptance Criteria: Prisma models exist for a `GrammarTopic` (title, optional Unit tag) with associated theory content (rich text) and a set of practice exercises (reusing the `Question` shape/types from T-007 where possible, tagged as grammar). Migration applies cleanly and a seeded topic with theory + at least one exercise can be queried back intact.

- [x] **T-047 — Grammar theory content pages**
  - Status: Done
  - Depends on: T-006, T-046
  - Source: Notes — Grammar module ("có lý thuyết")
  - Acceptance Criteria: A teacher can create/edit a Grammar topic's theory content (rich text, e.g. explanation + examples) and a student can browse the list of topics and read one. Content persists across reload.

- [x] **T-048 — Grammar practice exercises**
  - Status: Done
  - Depends on: T-047, T-024
  - Source: Notes — Grammar module ("có bài luyện tập")
  - Acceptance Criteria: A student can attempt practice exercises attached to a Grammar topic (reusing objective question types and grading logic from T-013), see immediate correct/incorrect feedback, and have their attempts recorded per topic for later reporting.

- [x] **T-049 — Grammar game(s)**
  - Status: Done
  - Depends on: T-048, T-034
  - Source: Notes — Grammar module ("có game")
  - Acceptance Criteria: At least one game mechanic (reusing/adapting the vocab game engine from T-034/T-035) is playable using Grammar exercise content instead of vocabulary words, with the same win/lose and progress-recording behavior.

- [x] **T-050 — Grammar reports**
  - Status: Done
  - Depends on: T-046, T-019
  - Source: Notes — Grammar module ("có report")
  - Acceptance Criteria: A teacher can view per-student and per-class progress/accuracy on Grammar topics/exercises, using the same reporting engine and period-bucketing (week/month/quarter/semester/year) established in T-019.

## Phase 8 — Speaking Module & AI Grading (Stubbed)

- [x] **T-051 — AIGradingProvider interface + MockAIGradingProvider**
  - Status: Done
  - Depends on: T-003
  - Source: Notes — Speaking + AI grading; TECH_STACK.md (AIGradingProvider design)
  - Acceptance Criteria: An `AIGradingProvider` interface is defined (server-side) with a method that takes an audio/transcript + prompt and returns a score plus written feedback. `MockAIGradingProvider` implements it with a documented simple heuristic (e.g. based on transcript length/keyword overlap with the prompt) requiring no API key, and is the only registered provider for now. The chosen implementation is swappable via configuration (e.g. one factory/DI point), and this is logged as an entry in `docs/INTEGRATIONS_TODO.md` naming exactly what a real provider integration would need (e.g. an Anthropic API key) and where to plug it in.

- [x] **T-052 — Speaking question type: prompt + timed response window**
  - Status: Done
  - Depends on: T-008, T-051
  - Source: Notes — Speaking ("trả lời câu hỏi trong thời gian cho phép")
  - Acceptance Criteria: A teacher can add a Speaking question with a text/audio prompt and a configured allowed response time. When a student reaches it during a test, a visible countdown enforces that window (recording auto-stops / question auto-advances when time expires).

- [x] **T-053 — Client-side audio recording + Web Speech API draft transcript**
  - Status: Done
  - Depends on: T-052
  - Source: TECH_STACK.md (Web Speech API, no key needed)
  - Acceptance Criteria: A student can record their spoken answer in-browser within the allowed time window; a draft transcript is generated client-side via the Web Speech API while/after recording. If the browser doesn't support the Web Speech API, the flow still allows submitting the audio with an empty/placeholder transcript rather than failing.

- [x] **T-054 — Submit & grade Speaking answers via AIGradingProvider**
  - Status: Done
  - Depends on: T-053, T-051
  - Source: Notes — Speaking + AI grading
  - Acceptance Criteria: On submission, the recorded audio and draft transcript are sent to the server, run through the currently-registered `AIGradingProvider` (Mock, for now), and the resulting score + feedback text are stored against the attempt's Speaking answer. Re-submitting is either disallowed or clearly versioned (no silent overwrite that loses the original).

- [x] **T-055 — Teacher: review/override AI-graded Speaking results**
  - Status: Done
  - Depends on: T-054
  - Source: Notes — Speaking + AI grading (quality control given it's a mock provider)
  - Acceptance Criteria: A teacher can play back a student's recorded Speaking answer, see the AI-generated (mock) score/feedback, and optionally override the score and/or edit the feedback before it's considered final in reporting.

- [x] **T-056 — Student: view Speaking feedback/score**
  - Status: Done
  - Depends on: T-054
  - Source: Notes — Speaking + AI grading
  - Acceptance Criteria: A student can revisit a completed Speaking attempt and see their score and the feedback text (teacher-overridden version if T-055 applied one, otherwise the AI/mock version), alongside their other attempt results.

## Phase 9 — Cross-Cutting Hardening & Deployment Prep

- [ ] **T-057 — Full reporting depth across all modules**
  - Status: Not Started
  - Depends on: T-019, T-032, T-033, T-037, T-050
  - Source: Requirement row 8; tab-list Report note; Assumption A5
  - Acceptance Criteria: A single teacher-facing reporting area lets the teacher pick a module (Test/Unit Test/Vocabulary/Grammar/Speaking) and a period granularity (test, unit, week, month, quarter, semester, year) and see consistent, correctly-aggregated results for each combination, built on the T-019 engine rather than a one-off implementation per module.

- [ ] **T-058 — Deployment/hosting/CI-CD placeholder**
  - Status: Not Started
  - Depends on: T-003
  - Source: TECH_STACK.md (deployment note); Assumption A9
  - Acceptance Criteria: `docs/INTEGRATIONS_TODO.md` has an entry for hosting/domain/CI-CD explicitly stating none was specified by the customer, what would be needed to choose one (e.g. domain name, hosting budget/provider preference), and that local dev is the supported mode until then. No actual infrastructure is provisioned by this task.

- [ ] **T-059 — Mobile-responsive polish for QR-join & test-taking flows**
  - Status: Not Started
  - Depends on: T-011, T-012
  - Source: Requirement row 4 (QR is scanned via phone camera)
  - Acceptance Criteria: The join page and the test-taking UI are usable on a common mobile viewport (e.g. 375px width) without horizontal scrolling or clipped controls, verified on at least the join flow and the question-answering flow for each objective question type.

- [ ] **T-060 — Full Playwright E2E regression suite**
  - Status: Not Started
  - Depends on: T-014, T-030, T-037, T-041, T-043, T-054
  - Source: TECH_STACK.md (testing strategy)
  - Acceptance Criteria: Automated Playwright tests cover, at minimum end to end: teacher login → create test → generate variants → start session with QR → student login → join → take test → auto-grade → both see result; a flashcard study + one exercise type; a Unit Test + its report; a Listening session with teacher-controlled playback; Writing anti-paste triggering; and a Speaking submission graded by the mock provider. The suite runs via a single documented command and passes on a clean checkout.

## Phase 0 (follow-up) — Bugs found during QA

- [x] **T-062 — Fix flaky `verify-reporting.ts` (matches answer by array position, not question type)**
  - Status: Done
  - Depends on: T-019
  - Source: QA finding during T-019 verification (2026-09-14)
  - Acceptance Criteria: `server/scripts/verify-reporting.ts`'s `runAttempt()` selects the correct choice by looking up `question.type` (or `question.prompt`) rather than assuming a fixed array index — because `generateVariantLayout()` genuinely shuffles question order on every call, the current position-based lookup fails ~50% of the time with "Could not find choice ... on question 0". This is a test-tooling bug only (the actual reporting engine and grading are unaffected — confirmed correct by an independently-written QA script). Fix verified by running `npm run verify:reporting -w server` at least 5 times in a row with no crash.

- [x] **T-063 — Fix cross-teacher data leak in Grammar reports (no ownership scoping when no topicId filter given)**
  - Status: Done
  - Depends on: T-050
  - Source: QA finding during T-050 verification (2026-09-15)
  - Acceptance Criteria: `GET /api/teacher/grammar-reports` (backed by `computeGrammarReport` in `server/src/lib/reporting.ts`) must scope results to the calling teacher's own `GrammarTopic`s by default, the same way T-019's `computeReport` requires a `teacherId`. Currently, calling it with no `topicId` filter returns every teacher's topics/accuracy data (ownership is only enforced when an explicit `topicId` is passed and checked). Fix verified by: teacher2 (no filter) sees only their own topics; teacher2 passing `topicId=<teacher1's topic>` still gets 404 (already correct, must not regress); teacher1's own report is unaffected.

- [x] **T-061 — Global JSON error-handling middleware (stop stack-trace leakage)**
  - Status: Done
  - Depends on: T-001
  - Source: QA finding during T-005/T-006/T-007 verification (2026-09-14)
  - Acceptance Criteria: `/server` registers a 4-arg Express error-handling middleware (after all routes) that catches unhandled errors (incl. malformed-JSON body-parser errors) and returns a clean JSON error body (e.g. `{ "error": "..." }`) with an appropriate status code — never an HTML page or a raw stack trace/file path, regardless of `NODE_ENV`. Repro to fix: `curl -s -i -X POST http://localhost:4000/api/auth/register -H "Content-Type: application/json" -d '{not valid json'` must return clean JSON, not Express's default HTML+stacktrace error page. Verified on at least one other route too (not just `/api/auth/register`), and confirm a genuinely unexpected thrown error (e.g. a temporarily-injected `throw` in a route handler) is also caught and returns clean JSON rather than crashing the process.

- [x] **T-064 — Enforce Speaking response time window server-side (currently client-only, spoofable)**
  - Status: Done
  - Depends on: T-052, T-054
  - Source: QA finding during T-051..T-056 verification (2026-09-15)
  - Acceptance Criteria: `allowedResponseSeconds` on a Speaking question is enforced server-side, not just via the client countdown. Repro of the current gap: create a Speaking question with `allowedResponseSeconds: 5`, wait 8+ seconds, then call `POST /api/attempts/:attemptId/questions/:questionId/speaking-answer` directly — it currently returns 200 with a full grade instead of being rejected/flagged. Fix by recording when the student first reached the question (e.g. a per-question `speakingWindowStartedAt` timestamp, set on first view/first recording-start signal from the client) and rejecting or flagging-as-late a submission that arrives meaningfully past `speakingWindowStartedAt + allowedResponseSeconds` (+ a small grace period for network latency — document the exact tolerance chosen). Verify: an on-time submission still succeeds normally; a late one is rejected/flagged; this matches the same "exam integrity" bar already set by T-041 (server-enforced Listening control) and T-044 (server-recorded tab-switches) rather than trusting the client alone.
