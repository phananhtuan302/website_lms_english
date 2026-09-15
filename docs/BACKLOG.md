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

- [x] **T-045 — Mock Test composition**
  - Status: Done
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

- [x] **T-057 — Full reporting depth across all modules**
  - Status: Done
  - Depends on: T-019, T-032, T-033, T-037, T-050
  - Source: Requirement row 8; tab-list Report note; Assumption A5
  - Acceptance Criteria: A single teacher-facing reporting area lets the teacher pick a module (Test/Unit Test/Vocabulary/Grammar/Speaking) and a period granularity (test, unit, week, month, quarter, semester, year) and see consistent, correctly-aggregated results for each combination, built on the T-019 engine rather than a one-off implementation per module.

- [x] **T-058 — Deployment/hosting/CI-CD placeholder**
  - Status: Done
  - Depends on: T-003
  - Source: TECH_STACK.md (deployment note); Assumption A9
  - Acceptance Criteria: `docs/INTEGRATIONS_TODO.md` has an entry for hosting/domain/CI-CD explicitly stating none was specified by the customer, what would be needed to choose one (e.g. domain name, hosting budget/provider preference), and that local dev is the supported mode until then. No actual infrastructure is provisioned by this task.

- [x] **T-059 — Mobile-responsive polish for QR-join & test-taking flows**
  - Status: Done
  - Depends on: T-011, T-012
  - Source: Requirement row 4 (QR is scanned via phone camera)
  - Acceptance Criteria: The join page and the test-taking UI are usable on a common mobile viewport (e.g. 375px width) without horizontal scrolling or clipped controls, verified on at least the join flow and the question-answering flow for each objective question type.

- [x] **T-060 — Full Playwright E2E regression suite**
  - Status: Done
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

- [ ] **T-065 — Harden TeacherTestEditorPage against racing PATCH calls (unitId/testType/published)**
  - Status: Not Started
  - Depends on: T-036
  - Source: Dev finding during T-060 E2E suite work (2026-09-15) — worked around at the test level, not yet fixed in app code
  - Acceptance Criteria: In the test editor, `unitId`, `testType`, and `published` currently each save via independent async `PATCH` calls fired without waiting on each other; rapid successive edits (e.g. a fast E2E test, or a teacher clicking through several fields quickly) can race and have one call's client-side state clobber another's. Fix by serializing these saves (e.g. queue/await sequentially, or a single combined PATCH) so rapid edits always converge to the last-intended value for every field, not just whichever request happens to land last. Verify with a test that fires several such edits back-to-back without artificial waits and confirms the final saved state matches every edit made, not a partial/clobbered mix.

- [ ] **T-066 — Wire `e2e/` and `playwright.config.ts` into the root typecheck script**
  - Status: Not Started
  - Depends on: T-060
  - Source: QA finding during T-060 verification (2026-09-15)
  - Acceptance Criteria: `npm run typecheck` (root) currently doesn't actually type-check anything under `e2e/` or `playwright.config.ts`, since none of the three workspace `tsconfig.json`s include them (each is scoped to its own `rootDir: "src"`) and Playwright itself only transpiles specs via esbuild, never `tsc`. Add an e2e-scoped `tsconfig.json` (or extend the root typecheck script) so `npm run typecheck` genuinely covers these files too. A manual `tsc --noEmit --strict` run against them currently passes clean, so this is a tooling-coverage gap, not a sign of an existing type error — verify the fix by intentionally introducing a type error in a spec file and confirming `npm run typecheck` now catches it (then revert the intentional error).

## Phase 10 — Vietnamese Localization (customer request, 2026-09-15)

- [ ] **T-067 — i18n infrastructure + global language setting + highest-traffic pages**
  - Status: Not Started
  - Depends on: T-004
  - Source: Customer request 2026-09-15; PROJECT_PLAN.md Guiding Principle 3 (superseded), Assumption A13
  - Acceptance Criteria: A React i18n library (e.g. `react-i18next`) is wired in, with `en.json`/`vi.json` resource files keyed by short string ids. A `Settings` table (or equivalent singleton) stores the current site language (`en` default), exposed via a public unauthenticated `GET` endpoint the client reads on load (so even a logged-out visitor gets the admin-chosen language) — changing it is Admin-only (`T-072`'s job to build the control; this task just needs the setting + the read endpoint + the client applying it). NO public/per-user switcher exists anywhere. Fully translated (both `en` and `vi`, correct grammatically, not machine-garbled) for: `Header`, `HomePage`, `LoginPage`, `RegisterPage`, `UnauthorizedPage`, `NotFoundPage`, `TeacherDashboardPage`, `StudentDashboardPage`. Verify by using the (not-yet-built) settings write path directly (a raw API call / DB update is fine for this task) to flip the global setting to `vi` and confirming these pages render Vietnamese text, then back to `en`.

- [x] **T-068 — Translate all remaining pages**
  - Status: Done
  - Depends on: T-067
  - Source: Customer request 2026-09-15
  - Acceptance Criteria: Every remaining page/component with product-facing copy (test authoring/taking, flashcards/exercises/games, Grammar, Unit Tests, Vocabulary Check, reports/leaderboards, Speaking, attempt results, session/live-monitoring views, error/validation messages surfaced to the user) is translated into both `en` and `vi` through the `T-067` i18n layer — no page left with raw hardcoded English strings outside the i18n system. Verify by flipping the global language setting to `vi` and clicking through every major flow (teacher authoring, student taking a test, flashcards, reports) confirming no page shows a mix of English and Vietnamese or an untranslated placeholder/raw key (e.g. literally showing `common.submit` instead of translated text).

## Phase 11 — Admin Role & Management Panel (customer request, 2026-09-15)

- [x] **T-069 — Admin role, seeded account, auth/route guards**
  - Status: Done
  - Depends on: T-005, T-006
  - Source: Customer request 2026-09-15; PROJECT_PLAN.md Assumption A1 (superseded), A12
  - Acceptance Criteria: `admin` added to the `Role` enum. Seed script creates exactly one admin account: `admin@example.com` / `123456` (per Assumption A12 — an intentionally simple local-dev credential, not a production secret). Admin logs in through the same `/login` form as everyone else (no separate admin login page). `ProtectedRoute` supports `admin` as an allowed role; an `/admin/dashboard` landing page exists (can be minimal — links to the pages built in `T-070`–`T-072`) reachable only by the admin role (teacher/student get redirected, same as any other cross-role access today). Verify: admin logs in and reaches `/admin/dashboard`; a teacher or student token hitting any `/api/admin/*` route (even before those routes have real logic, a stub 200 is enough for this task) gets 403.

- [x] **T-070 — Admin: user management (teachers + students + admins)**
  - Status: Done
  - Depends on: T-069
  - Source: Customer request 2026-09-15; Assumption A12
  - Acceptance Criteria: Admin can list every user (any role) with search/filter by role, create a new user of ANY role (including `teacher` and `admin` — this is the one place in the system that can create a teacher account outside the seed script), edit a user's name/email/role, reset a user's password, and delete a user (cascading exactly per the existing schema relations — deleting a teacher cascades their tests/sessions/etc., deleting a student cascades their attempts/progress). A non-admin gets 403 on every one of these endpoints. Verify by creating a brand-new teacher account through this panel (not the seed script) and confirming that teacher can immediately log in and author a test.

- [x] **T-071 — Admin: content oversight (Tests, Units, Flashcard sets, Grammar topics, Academic Periods)**
  - Status: Done
  - Depends on: T-069
  - Source: Customer request 2026-09-15; Assumption A12
  - Acceptance Criteria: Admin can view, edit, and delete ANY teacher's `Test` (and its sections/questions), any `Unit`, `AcademicPeriod`, `FlashcardSet` (and its cards), and `GrammarTopic` (and its exercises) — reusing the existing teacher-side editor UI/routes wherever practical (extend their ownership checks to also allow `role === 'admin'` rather than building parallel admin-only editor screens from scratch), plus an admin-only list view per entity type showing which teacher owns each item (since the existing teacher UI only ever shows "my own"). Verify: as admin, edit and delete a test/flashcard set/grammar topic that belongs to a DIFFERENT teacher than the one admin is "impersonating" nothing as — i.e. admin never needs to log in as that teacher to manage their content.

- [x] **T-072 — Admin: scores/attempts management + language Settings page**
  - Status: Done
  - Depends on: T-069, T-067
  - Source: Customer request 2026-09-15; Assumption A12, A13
  - Acceptance Criteria: (a) Admin can view any attempt across the whole system (any student, any test), edit its score/manual grades, and delete it, extending existing attempt-detail/grading endpoints to allow the admin role rather than building a parallel scoring system. (b) An Admin Settings page has a control to switch the site-wide language between English and Vietnamese (writing to `T-067`'s `Settings` row via an admin-only endpoint) — this is the ONLY place in the product that can change it. Verify: (a) admin edits a score belonging to a student they've never interacted with before and it's reflected in that student's own result view; (b) toggling the Settings page's language control actually changes what a fresh, logged-out visitor sees on `/` and `/login` without them doing anything themselves.

- [ ] **T-073 — AdminUsersPage: role dropdown doesn't revert display after a rejected role change**
  - Status: Not Started
  - Depends on: T-070
  - Source: QA finding during T-069..T-071 verification (2026-09-15)
  - Acceptance Criteria: `AdminUsersPage.tsx` seeds each row's `role`/`name`/`email` into local `useState` once from props with no re-sync. If the server rejects a role change (e.g. the last-remaining-admin lockout guard fires with 409), the dropdown keeps showing the attempted (rejected) role until the page is manually refreshed, even though the account's real role is unchanged server-side — a cosmetic display bug only, no data integrity issue. Fix by reverting the local state to the server's actual value on a failed request (or re-fetching that row) instead of leaving the optimistic/attempted value displayed. Verify: trigger the last-admin lockout rejection, confirm the dropdown snaps back to the real current role without a manual page refresh.

## Phase 12 — Class-Based Organization (customer request, 2026-09-15)

- [x] **T-074 — Class schema, teacher class management, student registration class picker**
  - Status: Done
  - Depends on: T-005, T-006
  - Source: Customer request 2026-09-15; PROJECT_PLAN.md Assumption A14
  - Acceptance Criteria: `Class` model (`id`, `name`, `teacherId`, `createdAt`). Teacher CRUD for their own classes (list/create/rename/delete) at `/teacher/classes`. Public `GET /api/classes` (id, name, owning teacher's name — no sensitive data) for the registration picker. `User` gets a `classId` field; the student registration form gets a required "Select your class" dropdown populated from that public endpoint, and the account is created with that `classId`. A student cannot register without picking a class (clear validation error, not a silent default). Verify: a teacher creates 2 classes; a new student registers picking one; the student's `classId` persists and is visible on their own profile/dashboard somewhere reasonable (even just a label).

- [x] **T-075 — Content-to-class assignment + consolidated "My Content" management page + data migration**
  - Status: Done
  - Depends on: T-074, T-008, T-022, T-047
  - Source: Customer request 2026-09-15 (explicit correction: content is authored once and assigned to classes, never re-authored per class); Assumption A14
  - Acceptance Criteria: Three new many-to-many join tables (or equivalent): `Test`↔`Class`, `FlashcardSet`↔`Class`, `GrammarTopic`↔`Class`. ONE consolidated teacher-facing page (e.g. `/teacher/content`) lists every Test, FlashcardSet, and GrammarTopic the teacher has authored (grouped by type) with a compact per-item multi-select control to toggle which of the teacher's classes it's assigned to — no need to open each item's full editor just to assign it. Endpoints to read/replace an item's assigned-class set exist for all three content types, teacher-only, ownership-checked (admin bypasses per existing convention). **Data migration** (run once, e.g. in a migration script or idempotent seed-time logic): create one `Class` named "Default Class" per existing teacher; auto-assign every one of that teacher's existing Test/FlashcardSet/GrammarTopic rows to it; backfill every pre-existing student account's `classId` to the first seeded teacher's default class (per Assumption A14 — documented as pragmatic dev-data cleanup). Verify: a teacher assigns one existing test to 2 of their classes via the new page in a few clicks (no re-authoring); after migration, all pre-existing demo/seed content and student accounts still have a valid `classId`/class-assignment (nothing orphaned or 500-ing due to a missing class reference).

- [x] **T-076 — Student-facing visibility scoped to assigned class**
  - Status: Done (2026-09-15)
  - Depends on: T-075
  - Source: Customer request 2026-09-15
  - Acceptance Criteria: Every student-facing list (self-practice tests, flashcard sets, Grammar topics) only shows items assigned to the student's own class — an item assigned only to a different class of the same teacher must not appear. QR join, Vocabulary Check generation, and Unit Test visibility all verify the acting student's class matches one of the content's assigned classes (reject/hide otherwise, clean error not a crash). Verify: teacher assigns Test A to Class 1 only; a Class 2 student cannot see it in self-practice, cannot join it via a valid QR token for it either (explicit adversarial check, not just hidden from a list).
  - Verified: independent Test agent, 39-check adversarial matrix (list hiding, self-practice 403, QR-join 403 on a valid/active token, flashcard/grammar detail 404, Unit Test visibility, Vocabulary Check exemption confirmed structurally sound via `TestAssignment` schema) — all PASS. `typecheck`/scoped `lint` clean; e2e specs 01/02/04/05/06/07 pass. Spec 03's teacher-side Unit Leaderboard failure confirmed unrelated (caused by concurrent, in-flight T-077 change). Commit: `872e2d9`.

- [x] **T-077 — Leaderboards and reports scoped per class**
  - Status: Done (2026-09-15)
  - Depends on: T-075
  - Source: Customer request 2026-09-15
  - Acceptance Criteria: Vocabulary leaderboard and Unit Test leaderboard are computed within one class at a time — never mixing students across classes even under the same teacher. A teacher picks which of their classes to view (a class filter/selector on the relevant pages); a student's own leaderboard view is automatically their own class, no picker needed. Every reporting engine (Test/Grammar/Speaking reports, `T-019`/`T-050`/`T-057`'s hub) gains a required class dimension so a teacher viewing "Test A"'s report sees numbers isolated to one class at a time even though the same Test A may be assigned to multiple classes. Verify: the same Test assigned to 2 classes, with different score distributions per class — confirm each class's leaderboard/report shows only its own students' numbers, and switching the class filter changes the displayed numbers correctly.
  - Verified: independent Test agent, own adversarial fixture (2 classes, one Unit Test assigned to both, 100%/0% score split) — Unit Test leaderboard, generic Test report, Grammar report, Vocabulary leaderboard, and Speaking report all correctly isolated per class in both directions; student spoofing the other class's `classId` is ignored, never honored. Auto-select-on-1-class and 400-on-2+-classes-unpicked edge cases empirically proven; admin's every-class oversight resolution confirmed. `typecheck`/repo-wide `lint`/full `test:e2e` (8/8) all clean. Commit: `cea0318`. Two new non-blocking findings logged as T-082/T-083 (see below); T-081 confirmed resolved by this same commit.

- [x] **T-078 — Adversarial cross-class isolation regression pass**
  - Status: Done (2026-09-15) — **Phase 12 (Class-Based Organization) is now fully complete.**
  - Depends on: T-076, T-077
  - Source: Customer request 2026-09-15 — phase-boundary milestone per PROJECT_PLAN.md Section 8
  - Acceptance Criteria: A dedicated, genuinely adversarial pass (not the lighter per-task sampling used elsewhere) proving a student in Class B can never see, join, self-practice, appear on a leaderboard, or show up in a report scoped to Class A — even when both classes share the same teacher and the exact same underlying Test/FlashcardSet/GrammarTopic row, and even via direct API calls with a valid JWT (not just "hidden in the UI"). Covers every content type and every reporting/leaderboard surface touched by `T-076`/`T-077`, INCLUDING the already-known gap logged as `T-083` (per-set vocab progress endpoint, currently unscoped by class or even by teacher) — fix it as part of this pass rather than treating it as a separate follow-up, since it's exactly the class of bug this task exists to catch. Full existing `npm run test:e2e` suite still passes (update/extend it if the core flows now require picking/assuming a class). Any gap found is fixed before this task is marked Done, not deferred to a follow-up task, given this is the customer's explicit "không sử dụng db của nhau" (classes must never share data) requirement.
  - Verified: combined Dev+QA pass built a 68-check adversarial fixture (2 teachers × 2 classes × 5 students, same-teacher-multi-class content, cross-teacher content) covering every surface T-076/T-077 touch — all passed. Found and fixed two real gaps: T-083 (see below) and an admin-report-narrowing bug (`teacherReports.routes.ts`/`teacherGrammar.routes.ts` used a raw ownership check instead of `isAdminOrOwner`, and — a deeper layer — even after that fix `reporting.ts` would have silently zeroed admin's results by ANDing the wrong `teacherId`; both layers fixed). A fully independent Test agent then re-verified from scratch with its own differently-named fixture (29/29 checks), ran the Dev's own new permanent regression script (`npm run verify:t078 -w server`, 68/68), re-sampled T-074–T-077's already-verified behavior for regressions (none found), and confirmed `typecheck`/repo-wide `lint`/full `test:e2e` (8/8) all clean. PASS. Commit: `84331d6`. One new normal-priority (non-blocking) follow-up logged as T-084.

- [ ] **T-079 — TeacherClassesPage: name input doesn't revert display after a rejected rename**
  - Status: Not Started
  - Depends on: T-074
  - Source: QA finding during T-074 verification (2026-09-15)
  - Acceptance Criteria: Same root cause and fix as `T-073` (`AdminUsersPage.tsx`), now also found in `TeacherClassesPage.tsx`'s `ClassRow`: `name` is seeded into local `useState` once from props with no re-sync, so if a rename is rejected (e.g. 404 because the class was deleted concurrently elsewhere), the input keeps showing the locally-typed rejected value instead of reverting to the real server state or the row disappearing. No data-integrity issue — display-only. Fix by reverting local state (or re-fetching the list) on a failed rename, and — since this exact bug has now appeared twice independently — consider whether the same stale-local-state pattern exists anywhere else editable-row-list pages follow (grep for the same `useState(prop.value)`-with-no-resync shape) and fix any other instances found in the same pass.

- [ ] **T-080 — TeacherContentPage: save-lock is global instead of per-row**
  - Status: Not Started
  - Depends on: T-075
  - Source: QA finding during T-075 verification (2026-09-15)
  - Acceptance Criteria: `toggleClass`'s in-flight guard in `TeacherContentPage.tsx` is a single `pendingKey` value, not scoped per row — while ANY row's class-assignment PUT is in flight, clicking a class chip on a DIFFERENT row is silently swallowed (no visual feedback, no error), even though only the in-flight row's chips are visually disabled. Contradicts the code's own comment claiming per-row scoping. No data-integrity issue (nothing is corrupted, the click is just a no-op), but it's a real UX bug under normal fast-clicking-across-rows usage. Fix by tracking in-flight keys as a `Set`/collection instead of a single value, so unrelated rows remain fully interactive while another row's request is in flight. Verify: throttle the network, click a chip on row 1, then immediately click a different chip on row 2 before row 1's request resolves — row 2's click must take effect.

- [x] **T-081 — `eslint.config.mjs` doesn't ignore Playwright local artifacts**
  - Status: Done (2026-09-15, fixed as a side-effect of T-077's own verification work)
  - Depends on: (none)
  - Source: QA finding during T-076 verification (2026-09-15)
  - Acceptance Criteria: `eslint.config.mjs`'s `ignores` array only excludes `dist`/`build`/`coverage`/`node_modules`, so a local `npm run test:e2e` run leaves a gitignored-but-untracked `playwright-report/` directory that `npm run lint` then walks into, producing ~3600 false-positive errors and making root `lint` useless as a signal until manually scoped to source dirs. Add `playwright-report/` and `test-results/` to the ignore list. Verify: after a local Playwright run, `npm run lint` reports the same result as running it scoped to `server client shared e2e`.
  - Verified: T-077's Dev agent added `playwright-report/`/`test-results/` to the ignore list in commit `cea0318`; T-077's independent Test agent confirmed `npm run lint` stays clean (exit 0) both before AND after actually running the full e2e suite, no manual dir-scoping needed.

- [ ] **T-082 — TakeTestPage: fire-and-forget choice-answer save can lose to Submit**
  - Status: Not Started
  - Depends on: (none — predates Phase 12, part of T-012's original take-test design)
  - Source: QA finding during T-077 verification (2026-09-15)
  - Acceptance Criteria: `client/src/pages/TakeTestPage.tsx`'s `handleSelectChoice` → `persistAnswer` fires `studentApi.saveAnswer(...)` without awaiting it (fire-and-forget, errors swallowed). `flushPendingSaves`, which `handleSubmit` does await before calling `submitAttempt`, only flushes debounced free-text (fillBlank/essay) saves — it never waits on an in-flight multiple-choice save. If a student picks an answer and clicks Submit (or auto-submit fires) before that PUT lands, grading runs against whatever was already persisted, silently scoring the question as unanswered — a real, credible correctness bug under normal fast usage, not just a theoretical race. T-077's own new e2e spec 08 already works around it by explicitly awaiting the save-answer response before clicking Submit (see its lines ~138–146) — that workaround is evidence the race is real, not a flaky test. Fix by having `handleSelectChoice` track its in-flight promise the same way debounced saves are tracked, and having `flushPendingSaves` (or `handleSubmit` directly) await all outstanding choice-answer saves too, not just text ones. Verify: throttle the network, select a choice answer, immediately click Submit, confirm the answer is still graded correctly (not scored as unanswered).

- [x] **T-083 — Per-set vocab progress endpoint leaks every student system-wide (not scoped by class OR teacher)**
  - Status: Done (2026-09-15, fixed as part of T-078)
  - Depends on: T-076, T-077
  - Source: QA finding during T-077 verification (2026-09-15)
  - Acceptance Criteria: `GET /api/teacher/flashcard-sets/:setId/progress` in `server/src/routes/teacherVocabProgress.routes.ts` (T-030's per-set vocab progress view) was never touched by T-076 or T-077 and still does `prisma.user.findMany({ where: { role: 'student' } })` — every student account in the entire system, not scoped to the calling teacher's own students, let alone to a class. Empirically confirmed live: returned 332 students including two freshly-registered students in two different classes/teachers unrelated to the caller. Its own doc comment claims "every set is visible to every student," which predates the Class model and is now stale. This is more severe than the class-isolation gaps T-078 targets (it's cross-TEACHER, not just cross-class), so — even though it wasn't literally touched by T-076/T-077's diffs — it must be found and fixed as part of T-078's adversarial pass, per T-078's own acceptance criteria ("any gap found is fixed before that task is marked Done"). Fix by scoping the roster to the calling teacher's own students only (via class assignment, matching the T-076/T-077 pattern), admin bypass per the existing `isAdminOrOwner` convention. Related minor detail found in the same area (low priority, can be fixed in the same pass or separately): `teacherReports.routes.ts`'s `/reports`/`/speaking-reports`/`grammar-reports` handlers use a raw `test.teacherId !== req.user!.sub` check instead of the standard `isAdminOrOwner` bypass, so admin gets a 404 narrowing by a testId it doesn't own, inconsistent with `requireOwnedTest` elsewhere.
  - Verified: fixed via `class: { teacherId }` relation scoping (admin bypass preserved); the related admin-404 detail was fixed too (see T-078). Independently re-verified with a fresh, differently-named fixture: each teacher's roster now contains only their own students, admin still sees everyone, cross-owner probe still 404s. Commit: `84331d6`.

- [ ] **T-084 — Teacher-facing session/grading views don't distinguish class when content spans multiple classes**
  - Status: Not Started
  - Depends on: T-075
  - Source: QA finding during T-078 verification (2026-09-15)
  - Acceptance Criteria: `TestSession` has no `classId` (schema predates Phase 12), so `GET /api/teacher/sessions/:sessionId/attempts` can show students from two different classes mixed together if a Test is assigned to more than one class and both are exposed to the same live session. `GET /api/teacher/flashcard-sets/:setId/sentence-submissions` has the same gap unconditionally (no timing coincidence needed) whenever a set is assigned to 2+ classes — an everyday configuration, not an edge case. Both are same-teacher-only data (no cross-tenant leak), so this was explicitly assessed during T-078 and judged non-blocking for Phase 12 sign-off, but a teacher currently has no way to tell which class a given attempt/submission in these views belongs to. Fix by adding `classId`/`className` to `AttemptSummaryDTO` and the sentence-submission DTO (reusing `resolveTeacherClassId`/the existing class-scoping helpers), so a teacher can at least distinguish, and ideally filter by, class in these operational views — matching the class-filter pattern already established for leaderboards/reports in T-077.

- [x] **T-085 — Bulk-import flashcard set cards from an Excel file**
  - Status: Done (2026-09-15)
  - Depends on: (none — extends T-022's existing flashcard authoring)
  - Source: Customer request 2026-09-15 ("ở cái thẻ từ vựng, thêm cái import = excel được không")
  - Acceptance Criteria: On `TeacherFlashcardSetEditorPage.tsx`, a teacher can upload an `.xlsx`/`.xls` file to add many cards to the currently-open set in one action, instead of using the existing one-at-a-time `POST /flashcard-sets/:setId/cards` form for every word. Column mapping: `term`/`meaning` required, `ipa`/`imageUrl`/`audioUrl`/`exampleSentence`/`synonyms`/`antonyms` optional (comma-separated cell for the two array fields), header row required, case-insensitive header matching. Provide a downloadable template file so a teacher knows the exact expected column names before filling one in. Parse the file CLIENT-SIDE (SheetJS `xlsx` npm package — new client dependency) into row objects, run them through the SAME validation rules `validateCardBody` already enforces server-side (required term/meaning, `exampleSentence` must contain `___` if present) before ever hitting the network, then submit via a NEW bulk endpoint (`POST /api/teacher/flashcard-sets/:setId/cards/bulk`, `requireOwnedFlashcardSet`-gated exactly like every other route in this file) rather than one request per row. The server independently re-validates every row too (never trust client-side validation alone) and enforces a reasonable max-rows-per-import cap. Document and justify the chosen atomicity model (all-or-nothing vs. partial-success-with-per-row-errors) directly in the route's code comment. The UI shows a clear preview/result: how many rows will import cleanly vs. which specific rows have which specific error, before and after the actual import. New strings added to both `en.json`/`vi.json` with full key parity (existing project convention). At least one new Playwright e2e spec covering a successful bulk import and at least one deliberately malformed row.
  - Verified (scope narrowed to this feature only per customer request — no full-suite regression run): independent 48-check adversarial API script (valid batch incl. order-continuity, mixed valid/invalid batch with correct per-row 1-based error indices, 500-row cap boundary, 501-row rejection, cross-tenant 404, unauthenticated 401, wrong-role 403, malformed body 400) all passed against a throwaway teacher/set, cleaned up after. Confirmed the real "1A1" class (40 students) untouched throughout. Full code review confirmed i18n key parity and correct client-to-real-spreadsheet-row remapping for error display. One trivial non-blocking doc-comment imprecision noted (client validator's comment says it mirrors "the exact same three rules" as the server, but omits restating a synonyms/antonyms-must-be-string-array rule that can never actually fire for spreadsheet-sourced data) — not fixed, doesn't affect behavior. Commit: `b49b0be`.

- [x] **T-086 — Redesign Vocabulary Check generation: Unit-based random pool, not per-student studied vocabulary**
  - Status: Done (2026-09-15)
  - Depends on: (none — supersedes T-038's original generation design)
  - Source: Customer request 2026-09-15 ("Ở kiểm tra từ vựng, giáo viên sẽ chọn thời gian, số câu (số câu < số câu trong list từ vựng của unit đó), unit, rồi sẽ mói đống từ vựng trong đó ra random lẫn lộn tạo thành 1 bộ kiểm tra không liên quan tới học sinh đó đã thuộc hay chưa")
  - **Explicit design pivot, replacing T-038/Assumption A8's original rule**: the previous design drew each generated Vocabulary Check's question pool from the target student(s)' OWN `FlashcardProgress` (`learning`/`known` only) and always used a fixed 15-minute timer. The customer now wants the pool sourced ENTIRELY from a teacher-selected curriculum `Unit`'s vocabulary (every `FlashcardCard` across every `FlashcardSet` tagged with that `unitId`), picked at random, completely independent of whether the target student(s) have studied those specific words yet. The old "must be from studied vocabulary, error if none studied" rule is REMOVED, not kept as an alternate mode.
  - Acceptance Criteria: `POST /api/teacher/vocabulary-checks` (`GenerateVocabularyCheckRequest`) gains three new required fields: `unitId` (must reference an existing `Unit`), `questionCount` (positive integer, must be strictly LESS THAN the total number of `FlashcardCard`s across every `FlashcardSet` tagged to that unit — reject with a clear message stating the actual available count if violated, and also reject cleanly if the unit's vocabulary pool has 0 or only 1 card, since no valid `questionCount` could satisfy "strictly less than" in that case), `timeLimitMinutes` (whole number 1-480, same bound `teacherTests.routes.ts`'s `validateTimeLimit` already enforces for a regular Test — reuse that validation, don't reinvent a new range) — replacing the old fixed `VOCAB_CHECK_TIME_LIMIT_MINUTES=15` constant. `studentIds` (who the generated check is assigned to, via `TestAssignment`, same as today) is UNCHANGED. The generator picks `questionCount` random cards from the unit's full pool (shuffle, no `FlashcardProgress` filtering at all) and builds `multipleChoice`/`fillBlank` questions using the EXISTING distractor-building logic in `vocabularyCheckGenerator.ts` — only the pool-selection source changes, not the question-building mechanics. Update `TeacherVocabularyChecksPage.tsx` with a Unit picker (reuse `teacherApi.listUnits()`, already used elsewhere), a question-count input, and a time-limit input, alongside the existing student multi-select (unchanged). Update every doc comment referencing the old per-student/Assumption-A8 design (schema.prisma's `TestAssignment`, `vocabularyCheckGenerator.ts`'s module comment, `teacherVocabularyCheck.routes.ts`'s module comment, `shared/src/index.ts`'s Vocabulary Check section header) to describe the new Unit-based design instead. Update both `en.json`/`vi.json` with the new UI strings. Any existing e2e spec that generates a Vocabulary Check needs its fixture updated to the new required request shape (create/tag a Unit with enough vocabulary first) rather than the feature being weakened to keep an old spec passing. Verify (scoped to this feature only, per the customer's standing "don't re-run full-system regression per feature" request): generate a check for a student who has NEVER studied any of the unit's words and confirm it still generates successfully and is answerable; confirm `questionCount >= pool size` is cleanly rejected; confirm the generated question count/time limit match exactly what the teacher requested.
  - Follow-up additions folded in mid-task (same page, same commit expected): (a) `TeacherVocabularyChecksPage.tsx`'s generation form was missing a visible title input even though `GenerateVocabularyCheckRequest.title`/the route's `requestedTitle` handling already existed server-side — add the input (optional, custom title used verbatim when provided); (b) the auto-generated DEFAULT title (used when left blank) previously appended every selected student's name, making it very long for a group generation (`Vocabulary Check — <date> (<student names>)`) — change the default to `${unit.name} — <date>` (same date formatting as today), dropping the student-name suffix entirely; (c) the student checklist has no way to select all of a real class's students at once (impractical with 40 real students) — add a "select all" checkbox that toggles every currently-listed student.
  - Verified: base redesign — Dev's own scoped adversarial script (unit/questionCount/timeLimitMinutes validation incl. wording cross-check against the regular Test route, 0/1-card pool rejection, a student who never studied any word in the unit still generating/answering/submitting a full-score attempt, exact question-count/time-limit echo) all passed; commit `86aaec3`. Follow-up additions (title input, shorter default title, select-all) implemented directly by the Leader after the customer reported the select-all checkbox was still missing; typecheck clean; commit `37e0c93` (a mid-task git race briefly mixed this into T-087's first commit attempt — caught and cleanly separated by the T-087 agent itself, no content lost, see T-087's entry).

- [x] **T-087 — Per-test attempt report (ranked list + drill-down) and a delete-test button, both on "My Tests"**
  - Status: Done (2026-09-15)
  - Depends on: (none — extends T-008's existing "My Tests" list and reuses T-014's existing per-attempt detail page)
  - Source: Customer request 2026-09-15 ("ở bài kiểm tra của tôi, phải có thêm nút báo cáo, bấm vô thì sẽ hiện 1 list người làm, kết quả bao nhiêu / bao nhiêu, xếp hạng đúng nhiều nhất tới sai nhiều nhất. bấm vô xem chi tiết thì hiện rõ câu nào đúng câu nào sai. ở nút mở trình chỉnh sửa ở dưới cùng thì phải có nút xóa bài kiểm tra."), given while looking at the real `client/src/pages/TeacherTestsPage.tsx` ("Bài kiểm tra của tôi") list, which today only offers one action per test card ("Mở trình chỉnh sửa" → the editor) and has no reporting or delete affordance anywhere.
  - Acceptance Criteria:
    1. **New "Report" action** on each test card in `TeacherTestsPage.tsx` (next to the existing "Mở trình chỉnh sửa"/open-editor link), leading to a new page showing EVERY submitted attempt of that one test across ALL of its sessions (live sessions AND self-practice — query by `Attempt.testId` directly, not by one `sessionId`, unlike the existing `GET /api/teacher/sessions/:sessionId/attempts` which is single-session-scoped), each row showing student name, `correctCount`/`totalCount` ("X/Y"), and `scorePercent`, sorted by `scorePercent` descending (ties broken by `submittedAt` ascending) — "ranked most-correct to least-correct" per the request. In-progress (not yet submitted) attempts are excluded, same convention as every other report/average in this codebase.
    2. **Class-scoped**, matching every other Phase-12 reporting/leaderboard surface (`resolveTeacherClassId`, `useTeacherClasses`/`ClassFilterControl` client pattern — see `UnitLeaderboardPage.tsx` for the exact reference pattern to mirror) — a test assigned to multiple classes must show one class's ranked list at a time, not everyone mixed together, consistent with the customer's core "no shared data between classes" requirement. Auto-hidden picker when the teacher owns exactly one class (current real-world state: one class, "1A1").
    3. **Drill-down**: each row links to the EXISTING `/teacher/attempts/:attemptId` page (`TeacherAttemptDetailPage.tsx`, already shows the full per-question correct/incorrect breakdown via `AttemptResultDTO` — reuse it unchanged, do not build a second detail view).
    4. **Delete-test button**: add a delete action next to "Mở trình chỉnh sửa" on `TeacherTestsPage.tsx`'s list (the client API call `teacherApi.deleteTest` already exists and is already wired to a real `DELETE` endpoint — it's simply never been exposed in any UI before this task). Must ask for confirmation before deleting (`window.confirm`, matching the exact existing convention in `AdminUsersPage.tsx`/`AdminAttemptsPage.tsx`), since deleting a test cascades away every section/question/session/attempt permanently.
    5. New i18n strings in both `en.json`/`vi.json` with full key parity (existing hard requirement). New shared DTOs added to `shared/src/index.ts` following existing naming/doc-comment conventions.
  - Verify (scoped to this feature only, per the customer's standing "don't re-run full-system regression per feature" request): a test taken by 3+ students across at least 2 different sessions (mix of live + self-practice) shows all of them ranked correctly, best score first; a student in a DIFFERENT class assigned the same test doesn't appear when viewing the other class; clicking a row opens the correct existing per-question detail page; delete removes the test and its data, confirmed gone from the list, and is blocked/cancelable via the confirmation prompt.
  - Verified: Dev's own 24-check adversarial API script (3 Class-6A students scoring 100/50/0 via a mix of self-practice + live-session join, correct ranking, Class 6B's student excluded both directions, drill-down matching exactly, cross-teacher 404, delete → 204 → 404 afterward) plus a live Playwright UI pass (Report/Delete/Open-editor actions render, report table renders with class filter, confirm-dialog cancel vs. confirm both behave correctly) — all passed. `typecheck`/scoped `lint` clean. Commit `fe75371`. Note: a mid-task git race briefly swept the concurrently-edited `TeacherVocabularyChecksPage.tsx`/`teacherVocabularyCheck.routes.ts` (Leader's T-086 follow-up work) into this agent's first commit attempt — it caught this itself via `git show --stat HEAD`, cleanly reset and re-split the two changesets with no content lost (Leader recommitted its own 2 files separately as `37e0c93` right after).

- [x] **T-088 — Wire the T-087 detailed report into the Reports hub's "Bài kiểm tra"/"Kiểm tra Unit"/"Nói" tabs**
  - Status: Done (2026-09-15)
  - Depends on: T-087 (reuses its new `/teacher/tests/:testId/report` page and endpoint — do not build a second detail view)
  - Source: Customer request 2026-09-15, made while looking at the real Reports hub screen (`TeacherReportsHubPage.tsx`'s "Bài kiểm tra" tab, screenshot showing the "Bài kiểm tra (lọc tùy chọn)" test-narrowing dropdown already selecting a specific Vocabulary Check): "Ở phần này cũng nên có thêm cái nút báo cáo chi tiết... bấm vô thì sẽ hiện 1 list người làm, kết quả bao nhiêu/bao nhiêu, xếp hạng đúng nhiều nhất tới sai nhiều nhất. bấm vô xem chi tiết thì hiện rõ câu nào đúng câu nào sai. còn nếu có tự luận hay dạng gì khác cũng hiện rõ luôn."
  - **Scope note (confirm with customer if wrong, don't silently guess wider)**: this hub has 5 tabs — "Bài kiểm tra" (Test), "Kiểm tra Unit" (Unit Test), "Từ vựng" (Vocabulary), "Ngữ pháp" (Grammar), "Nói" (Speaking). Only the first, second, and fifth are backed by discrete `Test`/`Attempt` rows with a single `scorePercent` per submission — the same shape T-087's new report already covers (and its drill-down page already handles essay/Speaking manual-grading detail via the existing `AttemptResultDTO`, satisfying the "tự luận hay dạng gì khác" ask for those three tabs with zero extra work). "Từ vựng"/"Ngữ pháp" are aggregate practice-exercise logs (`FlashcardExerciseAttempt`/`GrammarExerciseAttempt`, no single per-submission score to rank by) — a genuinely different shape, NOT built by this task. If the customer wants an equivalent for those two as well, that's separate follow-up work, not assumed here.
  - Acceptance Criteria: On `TeacherReportsPage.tsx` (shared by the "Bài kiểm tra" and "Kiểm tra Unit" tabs via its `fixedTestType` prop) and `TeacherSpeakingReportsPage.tsx` ("Nói" tab) — both already have a `testId` filter dropdown — show a "Xem báo cáo chi tiết" button/link whenever a SPECIFIC test is selected (i.e. `testId !== ''`, not "Tất cả bài kiểm tra"), linking to T-087's existing `/teacher/tests/:testId/report` page. Carry the currently-selected `classId` through as a query param so the detail page opens already scoped to the same class the teacher was just viewing, rather than making them re-pick it. New i18n strings in both `en.json`/`vi.json` with full key parity.
  - Verify (scoped to this feature only): from each of the 3 applicable tabs, picking a specific test reveals the button; clicking it lands on T-087's report page pre-scoped to the right class; the button is absent/hidden when "all tests" is selected (nothing coherent to link to).
  - Verified: `TeacherTestAttemptsReportPage.tsx` extended to read an initial `?classId=` query param (via a new optional `initialClassId` param on `useTeacherClasses`, backward-compatible default `''`) so the hand-off actually pre-scopes the class. Dev's own live-browser check across all 3 tabs confirmed the link's absence/presence and correct `href` (`Đang xem lớp: Class 6A` rendered correctly after navigating from the hub), using throwaway tests cleaned up afterward via the API. `typecheck`/scoped `lint` clean; `git show --stat HEAD` confirmed the commit contained only the 6 intended files (no repeat of the earlier git race). Commit: `87aeb81`.

- [x] **T-089 — "Tự kiểm tra" (self-check) quiz for mastered flashcards, with a permanent +10/-20 point ledger that REPLACES the Vocabulary Leaderboard formula**
  - Status: Done (2026-09-15)
  - Depends on: T-021/T-022 (FlashcardSet/FlashcardCard/FlashcardProgress), T-030 (FlashcardExerciseAttempt log), T-031/T-077 (Vocabulary Leaderboard, its scoring formula is being replaced by this task)
  - Source: Customer request 2026-09-15, made while looking at the real `StudentFlashcardSetPage.tsx` study screen and the `StudentFlashcardsPage.tsx` set-list screen: "Chỗ này có cái tự kiểm tra từ vựng. bấm vô thì có bài tập trắc nghiệm moi hết đống từ vựng đã bấm Đã thuộc đó làm thành 1 list trắc nghiệm. cái nào bấm sai thì bị -20 điểm trong xếp hạng, cái nào bấm đúng thì mới tính là + 10 điểm trong xếp hạng và flashcard không hiện thẻ đó nữa. thêm 1 nút nữa là hiện các thẻ flashcard đã thuộc. còn nếu chỉ bấm đã thuộc thì chỉ tính là người dùng đó tự nhận là đã thuộc, còn để hệ thống gắn là người này thực sự thuộc thì phải làm xong luyện tập. điểm bị - là trừ vĩnh viễn. còn bên ngoài thì hiện tổng điểm của bộ thẻ đó." Follow-up clarifications: leaderboard score = sum of ALL of a student's self-check point events across EVERY flashcard set (not per-set) — "xếp hạng thì cứ lấy hết all điểm của học sinh đó của các bộ thẻ là được"; a wrong-answered card keeps reappearing in future self-check attempts until eventually answered correctly (every wrong attempt is its own permanent -20, no cap, no forgiveness) — "Có, vẫn hỏi lại tới khi đúng".
  - **Critical naming/UX distinction — do not conflate with the existing, unrelated "Kiểm tra từ vựng" (Vocabulary Check) feature (T-038/T-086)**: that is a teacher-generated, 15-minute, Unit-based multiple-choice TEST assigned to specific students, using the `Test`/`Attempt`/`TestAssignment` engine. THIS task is a completely different, STUDENT-initiated, per-flashcard-set, untimed self-quiz over only the cards that student has personally marked "Đã thuộc" in ONE set, using `FlashcardCard`/`FlashcardProgress`/`FlashcardExerciseAttempt` — no `Test` row is ever created for this. Pick clearly distinct UI copy (e.g. "Tự kiểm tra" / "Self-check") everywhere so a student never confuses the two features.
  - Acceptance Criteria:
    1. **Two-tier "known" concept**: clicking "Đã thuộc" during normal study (`PUT /:setId/cards/:cardId/progress`, unchanged trigger/endpoint) sets `FlashcardProgress.status = 'known'` exactly as today — this is now explicitly documented as the student's SELF-CLAIM only. Add a new `FlashcardProgress.verifiedKnown: Boolean @default(false)` column (migration required) — set to `true` ONLY the first time the student answers that specific card correctly in the new self-check quiz; never reset back to `false` once true (a verified card is done forever, matching "flashcard không hiện thẻ đó nữa" — it's excluded from all FUTURE self-check quiz pools once verified, since there's nothing left to verify).
    2. **New self-check quiz**, scoped to one `FlashcardSet` + the calling student: a `GET` endpoint returning multiple-choice prompts (term shown, meaning + distractor meanings as choices — reuse the exact distractor-building approach already in `server/src/lib/vocabularyCheckGenerator.ts`'s `buildDistractors`, don't reinvent) built ONLY from cards where `status === 'known' AND verifiedKnown === false` for that student in that set. A `POST` endpoint grades one answer at a time (mirroring the existing `POST /:setId/exercises/:type/:cardId/check` pattern in `studentFlashcards.routes.ts`, not the batch "matching/games" pattern) — the server re-checks eligibility itself (still `known && !verifiedKnown` for that card) before grading, both to prevent farming points by re-submitting an already-verified card and to prevent grading a card that was never marked known. Add a new `VocabActivityType` enum value `selfCheck` (schema.prisma + `@platform/shared`'s matching TS union) and log ONE `FlashcardExerciseAttempt(type: 'selfCheck', correct)` row per answer, reusing that table exactly as designed for this ("append-only, one row per event", per its own doc comment) — this row IS the permanent point ledger; correct → also flip `verifiedKnown` to `true` for that card+student.
    3. **Point values, computed from the `selfCheck`-type `FlashcardExerciseAttempt` log, never stored as a separate mutable running total**: a correct answer is worth `+10`, an incorrect answer is `-20`; both are permanent (an incorrect attempt is never un-recorded or refunded by a later correct retry on the same card — each is its own row, summed, not overwritten). A card may be answered incorrectly multiple times across separate self-check sessions before eventually being answered correctly (per the customer's explicit "ask again until correct" confirmation) — each wrong attempt is its own additional `-20`.
    4. **New "Xem thẻ đã thuộc" button** on `StudentFlashcardSetPage.tsx`: shows the cards currently at `status === 'known'` for that student in that set (no new endpoint needed — this data already comes back from the existing `GET /:setId` detail response; add `verifiedKnown` to `StudentFlashcardCardDTO` so this view can visually distinguish self-claimed-only vs. verified cards). A simple filtered list/modal is enough — no need to rebuild the full flip-card UI for this view.
    5. **Per-SET score display** on `StudentFlashcardsPage.tsx`'s set list (the screen showing "1A1 · 50 thẻ · Unit 1 — Getting Started · Học ngay →"): add the student's own running point total for that ONE set (sum of `selfCheck`-type `FlashcardExerciseAttempt` point-values for cards belonging to that set) to `StudentFlashcardSetSummaryDTO`.
    6. **Vocabulary Leaderboard formula REPLACED** (`server/src/lib/vocabLeaderboard.ts`'s `computeAllTimeLeaderboard`/`computePeriodLeaderboard`, both variants, both already class-scoped per T-077 — keep that unchanged): the ranking `score` is now the sum of `selfCheck`-type `FlashcardExerciseAttempt` point-values for that student, ACROSS EVERY flashcard set they have access to (not scoped to one set — this is the customer's explicit "lấy hết all điểm ... của các bộ thẻ" instruction), for the all-time variant; for the period (monthly/yearly) variant, sum only `selfCheck` events whose `createdAt` falls in that period, same convention as the rest of that function. For full internal consistency, also change what `knownCardCount`/`totalAttempts`/`correctAttempts`/`accuracyPercent` mean on `VocabLeaderboardEntryDTO`: `knownCardCount` → count of cards with `verifiedKnown: true` (true verified mastery, not just self-claimed status) across all the student's accessible sets; `totalAttempts`/`correctAttempts`/`accuracyPercent` → scoped to `selfCheck`-type attempts only (not every exercise type as before), so the displayed accuracy is coherent with what's actually driving the score. Document this as an explicit, deliberate formula replacement (third revision of this feature this same day — see the two prior formula-change entries in `docs/PROGRESS_LOG.md`), matching this codebase's "your call, document it" convention in the module's doc comment.
    7. New i18n strings in both `en.json`/`vi.json` with full key parity (existing hard requirement) — including on `VocabLeaderboardPage.tsx`'s subtitle text, which currently describes the OLD formula and must be updated to describe this one.
  - Verify (scoped to this feature only, per the customer's standing "don't re-run full-system regression per feature" request, but this task changes real scoring/ranking behavior so should be checked with real care within its own scope): a student marks several cards "Đã thuộc" in one set, opens the self-check quiz, answers one correctly (+10, card now excluded from future self-check pools, `verifiedKnown: true`) and one incorrectly (-20, card still reappears in a fresh self-check pool fetch); confirm the per-set score on the sets list reflects exactly +10-20=-10 for that set; confirm the Vocabulary Leaderboard (all-time) now reflects this same net total for that student, summed correctly if they also have self-check activity in a DIFFERENT set; confirm a card never marked "known" is never offered in the self-check quiz; confirm re-submitting an already-verified card's cardId directly against the answer endpoint is rejected/ignored rather than granting extra points.
  - Verified: new permanent regression script `server/scripts/verify-t089.ts` (`npm run verify:t089 -w server`), built against a fully throwaway teacher/class/student/2-sets fixture (cleaned up after) — 22 assertions covering exactly the scenarios above, all passed: pool correctness, +10/`verifiedKnown` flip/exclusion from future pools, -20/permanence/reappearance until correct, rejection of both already-verified and never-`known` cards, a wrong-then-right sequence on the same card netting to 0 while keeping 2 separate attempt rows (not overwriting), per-set score isolation across two different sets, and leaderboard summing (score, `knownCardCount`, `totalAttempts`, `correctAttempts`) correctly combining both sets. `typecheck`/scoped `lint` clean; real "1A1" class (40 students) confirmed untouched; `git show --stat HEAD` confirmed the commit held exactly the 19 intended files. Commit: `b5d6cee`.

- [x] **T-090 — File upload (not just paste-a-URL) for a Section's passage image / listening audio in the Test Editor**
  - Status: Done (2026-09-15)
  - Depends on: (none — extends T-039/T-040/T-041's existing `Section.passageImageUrl`/`Section.audioUrl` plain-text-URL fields)
  - Source: Customer request 2026-09-15, quoting the exact current UI labels on `TeacherTestEditorPage.tsx`'s Section content editor: "URL hình ảnh đoạn văn (không bắt buộc) ... URL âm thanh (T-040/T-041, quy ước tạm thời giống âm thanh thẻ từ vựng)) 2 cái này có thể up file trong máy vào." Explicitly scoped light: "test nhanh phần này thôi không cần test sâu vì cũng chỉ up file vào rồi lấy link ./... lên thôi."
  - **Design approach (matches this codebase's existing convention, no new infra)**: this project has NEVER used real file/object storage or a multipart upload endpoint anywhere — the ONLY existing precedent for storing binary content is Speaking's `Answer.speakingAudioData`, a base64 `data:` URL generated CLIENT-SIDE and sent as a plain string in a JSON body (see `attempts.routes.ts`'s module doc comment). Follow that exact same precedent here rather than introducing multer/disk storage/cloud storage for the first time: add a file `<input type="file">` next to each of the two existing URL text inputs (`passageImageUrlLabel`/`audioUrlLabel` in `TeacherTestEditorPage.tsx`'s Section editor, lines ~559-582) that reads the chosen file via `FileReader.readAsDataURL`, and writes the resulting `data:` URL string into the EXACT SAME existing field (`passageImageUrl`/`audioUrl`, both already plain, unvalidated `String` columns) via the same `handleUpdateSectionContent` call the URL text input already uses — no schema change, no new endpoint, no new DTO field. The teacher can still alternatively just paste a real hosted URL into the text input as before; both paths write to the same field.
  - Acceptance Criteria: a teacher can either (a) type/paste a URL as today, or (b) pick a file from their computer, for both the passage image and the section audio fields; picking a file immediately populates the same field with a working `data:` URL preview (image renders via `<img src>`, audio is playable via `<audio src>` wherever these fields are already rendered elsewhere in the app — e.g. the take-test runtime). New i18n strings (e.g. "hoặc tải lên từ máy") in both `en.json`/`vi.json` with full key parity.
  - Verify (explicitly light-touch per the customer's own instruction — "up file vào rồi lấy link ra thôi", no deep testing needed): upload a small real image file for the passage image field and a small real audio file for the section audio field, confirm the resulting value is a valid `data:` URL and renders correctly wherever the section is subsequently viewed (e.g. reopening the editor, or the take-test screen for that section). `npm run typecheck`/scoped `lint` clean.
  - Verified: 5MB raw-file size guard chosen and documented (keeps the base64-inflated string comfortably under the server's existing 20MB JSON body limit, already raised for Speaking's identical `data:` URL precedent). A real headless-Chromium check (login-blocked by the sandbox's own safety classifier, so Dev used a login-free equivalent instead) confirmed a real PNG and a real WAV both round-trip byte-for-byte through the exact shipped `FileReader.readAsDataURL` + size-guard logic and are genuinely decodable/playable (`<img>` real dimensions, `<audio>` `readyState: 4`), and that an oversized file is cleanly rejected with the correct message. `typecheck`/scoped `lint` clean; i18n key parity verified for the whole file, not just new keys. Commit: `e5dd7af`.

- [x] **T-091 — Lock a student into an in-progress test attempt: no nav menu, no logout, force-redirect back on any navigation**
  - Status: Done (2026-09-15)
  - Depends on: T-011/T-012 (Attempt/take-test runtime), T-044 (tab-switch detection — complementary, not touched by this task)
  - Source: Customer request 2026-09-15, made while looking at a real student mid-attempt on `TakeTestPage.tsx`: "khi làm bài luyện tập thì không thể bấm bất cứ nút nào trong menu bên trên. nếu chuyển trang bằng domain thì cũng tự default vào bài luyện tập đang làm dở đó. không cho đăng xuất luôn."
  - Acceptance Criteria:
    1. While a student has ANY `Attempt` with `status: 'inProgress'` (any `Test.testType` — generic self-practice, live session, Unit Test, Vocabulary Check, the new "Tự kiểm tra" self-check quiz does NOT count here since it never creates a `Test`/`Attempt` row at all, T-089 — this lock is specifically about the `Attempt`-based take-test runtime), the top nav menu (`Header.tsx`'s student nav items, dashboard link) renders as NON-FUNCTIONAL — no clickable links to any other page — AND the "Đăng xuất" (log out) button is hidden/disabled. Replace both with a clear inline message (e.g. "Bạn đang làm bài dở, hãy nộp bài trước khi rời khỏi trang") so the student understands why, rather than nav items just silently vanishing.
    2. If the student navigates to ANY other in-app route while locked — by typing a URL, using browser back/forward, or any other client-side navigation — the app force-redirects them (`replace`, not a new history entry) back to `/student/attempts/:id` for that SPECIFIC in-progress attempt. This is enforced by a route-level guard, not just by hiding nav buttons (a determined student typing a URL directly must still bounce back).
    3. Detection is SERVER-DERIVED (re-check via the existing `GET /api/attempts` — `studentApi.listMyAttempts()`, no new endpoint needed — filtering for `status === 'inProgress'`), not a client-only flag, so the lock correctly persists across page reloads, new tabs, and even a different device/session for the same student — there is deliberately no way to "escape" by clearing local storage.
    4. **Critical race condition to avoid** (explicitly flag this to whoever implements it): the lock state must NOT still show as "locked" for a brief moment right after a successful submit, or the app will incorrectly redirect the student away from their own just-submitted result page back to the (now-submitted, no-longer-in-progress) attempt's take-test screen. `TakeTestPage.tsx`'s submit-success handler must proactively clear/refresh the lock state itself (not just navigate and hope a passive re-fetch catches up in time) before or as part of navigating to the result page.
    5. Teachers/admins are never subject to this lock — student-only. Scope this to the take-test runtime specifically; do not touch or attempt to lock the new T-089 "Tự kiểm tra" flow, flashcard exercises, Grammar exercises, or any other non-`Attempt`-based activity — none of those are "làm bài luyện tập" in the sense the customer means here (a timed, submittable Test attempt).
  - Verify (scoped to this feature only, per the customer's standing "don't re-run full-system regression per feature" request): start a self-practice attempt as a real (throwaway) student, confirm every nav link/logout button is non-functional while it's in progress; try navigating directly to another route (e.g. typing `/student/flashcard-sets` equivalent via the router) and confirm it bounces back to the attempt; submit the attempt and confirm the student is NOT bounced back — they land on and can freely view the result page, and nav/logout work normally again immediately after.
  - Verified: race condition fixed by calling `clearLock()` synchronously in `TakeTestPage.tsx` right when `submitAttempt()` resolves (and on the 409-already-submitted and already-submitted-on-load paths too), BEFORE navigating to the result page — so the lock is already cleared in the same render pass, and the async re-check triggered by the route change can never observe stale "still locked" state. Independent 24-check Playwright script against a throwaway teacher/class/test/student (real `teacher.1a1@example.com`/"1A1"/`test1` untouched) confirmed: full nav+logout when unlocked; hidden nav/logout + inline notice when locked; force-redirect on both a typed-URL-style navigation and the browser Back button; zero bounce-back after submit even after an extra 2.5s settle time; teacher/admin nav completely unaffected. `typecheck`/scoped `lint` clean; `git diff --stat` confirmed only the 8 intended files. Commit: `e6748eb`.
