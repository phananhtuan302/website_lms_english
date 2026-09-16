/**
 * Shared types & constants used by both /client and /server. This proves the npm-workspaces
 * linkage actually works end to end (see README.md) — it is not just an empty placeholder
 * package.
 */

/** The user roles defined by TECH_STACK.md, extended 2026-09-15 (T-069, Phase 11) with
 * `admin` — one seeded account (PROJECT_PLAN Assumption A12) with full CRUD over every
 * `User` and oversight/CRUD over every content entity, bypassing per-teacher ownership
 * checks everywhere rather than owning a separate parallel data set. Used by both auth
 * (server) and route guards (client). */
export type UserRole = 'teacher' | 'student' | 'admin';

/** Human-readable product name, shown in the client UI and in server startup/health output. */
export const APP_NAME = 'English Test Platform';

/** Path of the server's health-check endpoint. Both the server (to register the route) and the
 * client (to call it) import this constant instead of hardcoding the string in two places. */
export const HEALTH_CHECK_PATH = '/health';

/** Shape of the JSON body returned by the health-check endpoint. */
export interface HealthCheckResponse {
  status: 'ok';
  service: string;
  timestamp: string;
}

// --- Auth (T-005 / T-006) ---------------------------------------------------------
// Shared request/response contracts so /client and /server never redeclare these
// shapes independently and drift apart.

/** Public-facing user shape returned by auth endpoints. Never includes `passwordHash`.
 *
 * `classId`/`className` (T-074, Phase 12) are only ever populated for a `student`-role
 * user — always `null` for `teacher`/`admin` accounts (Assumption A14: class membership
 * has no meaning for those roles). `className` is denormalized onto this DTO purely so
 * the student dashboard can show "which class am I in" without a second round-trip;
 * `classId` alone is what every other class-scoped feature (T-076/T-077) will actually
 * filter/check against. Both are `null` for a student account that predates the `Class`
 * concept and hasn't been migrated yet (T-075's job, not this task's). */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  classId: string | null;
  className: string | null;
}

/** Body for `POST /api/auth/register`. `role` is intentionally omitted — the public
 * registration endpoint always creates a `student` account (see PROJECT_PLAN
 * Assumption A1); there is no client-facing way to request `teacher` here.
 *
 * `classId` (T-074, Phase 12, PROJECT_PLAN Assumption A14) is REQUIRED — a student picks
 * exactly one class at registration and is permanently scoped to it (no self-service
 * switching, no default/fallback class picked silently). The server rejects registration
 * with a clear validation error if this is missing or doesn't reference a real `Class`
 * row, per T-074's acceptance criteria ("clear validation error, not a silent default"). */
export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  classId: string;
}

/** Body for `POST /api/auth/login`. Works for both roles. */
export interface LoginRequest {
  email: string;
  password: string;
}

/** Response shape for both register and login: a signed JWT plus the user it belongs
 * to (for the client to render immediately without a follow-up request). */
export interface AuthResponse {
  token: string;
  user: AuthUser;
}

/** Decoded shape of the JWT payload (`sub` = user id), per TECH_STACK.md ("JWT + bcrypt,
 * phân quyền theo role"). Shared so client-side code that needs to peek at the payload
 * (it never should for authorization — the server is the source of truth — but e.g. to
 * show "logged in as ...") uses the exact same shape as the server signs. */
export interface AuthTokenPayload {
  sub: string;
  role: UserRole;
  email: string;
}

// --- Test authoring (T-008) -------------------------------------------------------
// Shared shapes for the teacher test-authoring API. Mirrors `server/prisma/schema.prisma`
// (Test/Section/Question/Choice) but as plain DTOs, never the Prisma model directly.

/** Matches the Prisma `QuestionType` enum (T-007, extended by T-042 with `essay`) — kept
 * as a literal union here since Prisma enums can't be imported into client code. */
export type QuestionType = 'multipleChoice' | 'trueFalse' | 'fillBlank' | 'essay' | 'speaking';

/** Matches the Prisma `TestType` enum (T-036/T-038, Assumption A4) — same "string union,
 * Prisma enums can't be imported into client code" convention as `QuestionType` above.
 * See `schema.prisma`'s `TestType` doc comment for what each value unlocks. */
export type TestType = 'generic' | 'unitTest' | 'vocabularyCheck' | 'listeningTest' | 'mockTest';

/** Human-readable label per `TestType` (T-045) — shared so every list that surfaces a
 * test's type (teacher's "My tests", student's self-practice picker, ...) renders the
 * same wording instead of each screen inventing its own copy. `generic` intentionally
 * has no badge at any of those call sites (a plain test needs no extra label), but a
 * label is still provided here for completeness/exhaustiveness of the `Record`. */
export const TEST_TYPE_LABELS: Record<TestType, string> = {
  generic: 'Test',
  unitTest: 'Unit Test',
  vocabularyCheck: 'Vocabulary Check',
  listeningTest: 'Listening Test',
  mockTest: 'Mock Test',
};

/** Speaking answers (T-052–T-056) are always graded on a fixed 0–100 point scale,
 * regardless of the question's `allowedResponseSeconds` — simpler than requiring a
 * per-question configurable max score like essay's `essayMaxScore`, and matches how the
 * server's `AIGradingProvider` interface reports a score (T-051,
 * `server/src/grading/aiGradingProvider.ts`). Both the AI/mock grade and any teacher
 * override (`manualScore`, T-055) live on this same scale. */
export const SPEAKING_SCORE_SCALE = 100;

export interface ChoiceDTO {
  id: string;
  text: string;
  isCorrect: boolean;
  order: number;
}

export interface QuestionDTO {
  id: string;
  type: QuestionType;
  prompt: string;
  order: number;
  /** Only meaningful for `fillBlank`; empty array for the other types. */
  acceptedAnswers: string[];
  /** Only meaningful for `multipleChoice`/`trueFalse`; empty array for `fillBlank`. */
  choices: ChoiceDTO[];
  /** Only meaningful for `essay` (T-042) — the point value a teacher grades this essay
   * out of. `null` for every other type. */
  essayMaxScore: number | null;
  /** Only meaningful for `speaking` (T-052) — seconds allowed to respond once the
   * student reaches this question, enforced client-side by a visible countdown
   * (`TakeTestPage.tsx`). `null` for every other type. */
  allowedResponseSeconds: number | null;
  /** Only meaningful for `speaking` (T-052) — an optional audio clip for the prompt
   * itself, independent of the text `prompt` above. `null` for every other type or when
   * not configured. */
  promptAudioUrl: string | null;
}

/** Reading (T-039) and Listening (T-040/T-041) content, attached at the Section level —
 * see `Section`'s doc comment in `schema.prisma` for why. All four fields are `null`
 * when not configured for a given section. */
export interface SectionDTO {
  id: string;
  title: string;
  order: number;
  passageText: string | null;
  passageImageUrl: string | null;
  audioUrl: string | null;
  /** `null` means unlimited plays (T-040) for a STANDALONE/self-practice attempt; has no
   * effect during a live session (T-041), where students never get a self-serve Play
   * button at all. */
  maxPlayCount: number | null;
  questions: QuestionDTO[];
}

/** Row shape for the teacher's "my tests" list — no nested content, just enough to
 * render a list and link into the editor. */
export interface TestSummaryDTO {
  id: string;
  title: string;
  sectionCount: number;
  questionCount: number;
  /** Optional curriculum tag (T-018) — `null` when the test isn't tagged to a Unit. */
  unitId: string | null;
  unitName: string | null;
  /** T-036/T-038 — defaults to `generic` for every test authored before this batch. */
  testType: TestType;
  /** T-036 — only meaningful for `testType: unitTest` (see `Test.published`'s doc
   * comment in schema.prisma); always `false` for every other type. */
  published: boolean;
  createdAt: string;
  updatedAt: string;
  /** Average `timeTakenSeconds` across this test's COMPLETED (submitted) attempts only
   * (T-017) — `null` when there are zero completed attempts yet, never `0` as a stand-in
   * for "no data". An attempt that was joined but never submitted (abandoned) has
   * `timeTakenSeconds: null` and is excluded from this average rather than counted as 0,
   * so one impatient student who never finishes can't drag the average down. */
  averageTimeTakenSeconds: number | null;
  /** How many completed attempts the average above is based on — shown alongside it so
   * "average of 1 attempt" reads differently from "average of 30". */
  completedAttemptCount: number;
}

/** Full nested shape returned by the single-test editor endpoint. */
export interface TestDetailDTO {
  id: string;
  title: string;
  teacherId: string;
  timeLimitMinutes: number | null;
  /** Optional curriculum tag (T-018). `unit` is included (id+name only) so the editor
   * can show the tagged unit's name without a second round-trip. */
  unitId: string | null;
  unit: { id: string; name: string } | null;
  /** T-036/T-038 — see `TestSummaryDTO.testType`/`published` doc comments. */
  testType: TestType;
  published: boolean;
  sections: SectionDTO[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTestRequest {
  title: string;
  /** Optional whole-minute time limit (T-012). Omitted/undefined leaves it untimed. */
  timeLimitMinutes?: number | null;
  /** Optional Unit tag (T-018). Omitted/undefined leaves it untagged; explicit `null`
   * clears an existing tag. */
  unitId?: string | null;
  /** T-036 (Assumption A4). Omitted defaults to `generic` server-side — this is how a
   * teacher tags a test as `unitTest` (or, later, `mockTest`/`listeningTest`) using the
   * SAME authoring endpoint as any other test, per Guiding Principle 6. */
  testType?: TestType;
  /** T-036. Omitted defaults to `false` server-side (a new Unit Test starts
   * unpublished/invisible to students until the teacher explicitly flips this). */
  published?: boolean;
}

export interface UpdateTestRequest {
  title: string;
  timeLimitMinutes?: number | null;
  unitId?: string | null;
  testType?: TestType;
  published?: boolean;
}

/** Reading/Listening fields (T-039/T-040) are all optional and independent of each
 * other and of `title`. Omitted/undefined leaves the existing value untouched on
 * update; explicit `null` clears it back to "no passage" / "no audio". */
export interface CreateSectionRequest {
  title: string;
  passageText?: string | null;
  passageImageUrl?: string | null;
  audioUrl?: string | null;
  maxPlayCount?: number | null;
}

export interface UpdateSectionRequest {
  title: string;
  passageText?: string | null;
  passageImageUrl?: string | null;
  audioUrl?: string | null;
  maxPlayCount?: number | null;
}

/** Body for the section-reorder endpoint: the full list of that test's section ids, in
 * the new desired order (index in the array = new `order`, 1-based). */
export interface ReorderSectionsRequest {
  orderedSectionIds: string[];
}

/** Body shared by create/update question. A choice without `id` is a new choice; a
 * choice with `id` updates that existing row; any existing choice id NOT present in
 * the array is deleted. `order` is implied by array position, not sent explicitly. */
export interface ChoiceInput {
  id?: string;
  text: string;
  isCorrect: boolean;
}

export interface CreateQuestionRequest {
  type: QuestionType;
  prompt: string;
  /** Required (non-empty) for multipleChoice/trueFalse, ignored for fillBlank/essay. */
  choices?: ChoiceInput[];
  /** Required (non-empty) for fillBlank, ignored otherwise. */
  acceptedAnswers?: string[];
  /** Only meaningful for `essay` (T-042). Omitted defaults to 10 server-side; ignored
   * for every other type. */
  essayMaxScore?: number | null;
  /** Only meaningful for `speaking` (T-052). Omitted defaults to 60 seconds
   * server-side; ignored for every other type. */
  allowedResponseSeconds?: number | null;
  /** Only meaningful for `speaking` (T-052). Optional even for a speaking question — a
   * Speaking question may be text-prompt-only. Ignored for every other type. */
  promptAudioUrl?: string | null;
}

export type UpdateQuestionRequest = CreateQuestionRequest;

/** Body for the question-reorder endpoint, scoped to one section. */
export interface ReorderQuestionsRequest {
  orderedQuestionIds: string[];
}

// --- Test variants / "mã đề" (T-009) ----------------------------------------------

/** One shuffled question-order + choice-order layout, generated from an authored test.
 * See `server/prisma/schema.prisma`'s `TestVariant.layout` doc comment for the exact
 * shape stored server-side — this DTO is what the teacher-facing list/detail endpoints
 * return over HTTP. */
export interface TestVariantDTO {
  id: string;
  testId: string;
  code: string;
  createdAt: string;
  layout: {
    sections: Array<{ sectionId: string; questionIds: string[] }>;
    choiceOrder: Record<string, string[]>;
  };
}

export interface GenerateVariantsRequest {
  /** How many new variants to generate in this call. Defaults to 2 server-side (the
   * AC's "at least 2 base variants") if omitted. */
  count?: number;
}

// --- QR-join sessions (T-010) ------------------------------------------------------

export type SessionStatus = 'active' | 'closed';

/** `live` = a teacher-run QR/in-class session (T-010, unchanged/default). `selfPractice`
 * = a student-initiated home self-practice session (T-040/T-041) — see `SessionMode`'s
 * doc comment in `schema.prisma` for the full reasoning. This is what gates whether a
 * Listening section's Play button is student-controlled (T-040) or teacher-broadcast-only
 * (T-041). */
export type SessionMode = 'live' | 'selfPractice';

export interface TestSessionDTO {
  id: string;
  testId: string;
  manualCode: string;
  status: SessionStatus;
  mode: SessionMode;
  createdAt: string;
  closedAt: string | null;
  /** Relative join URL, e.g. `/join/<token>` — see `server/src/routes/teacherSessions.routes.ts`
   * for why a relative path (no scheme/host) is the documented choice here. */
  joinUrl: string;
}

/** Response for session creation only — includes the QR code as a data: URL (base64
 * PNG) and the raw token, neither of which the list/detail endpoints need to repeat. */
export interface CreateSessionResponse extends TestSessionDTO {
  joinToken: string;
  qrCodeDataUrl: string;
}

/** Response for the public join-token-check endpoint (`GET /api/sessions/join/:token`). */
export interface JoinTokenCheckResponse {
  valid: true;
  testId: string;
  testTitle: string;
  sessionId: string;
}

// --- Student attempts: join, take-test runtime, grading, results (T-011–T-014) ------

export type AttemptStatus = 'inProgress' | 'submitted';

/** Response for `POST /api/sessions/join/:token` (requires a logged-in `student`).
 * Idempotent: joining a session the student already joined returns the SAME
 * `attemptId`/`variantId` rather than creating a second attempt or reassigning the
 * variant (see `Attempt.@@unique([sessionId, studentId])` in schema.prisma). */
export interface JoinSessionResponse {
  attemptId: string;
  sessionId: string;
  testId: string;
  testTitle: string;
  variantCode: string;
  status: AttemptStatus;
}

/** One question as presented during the take-test runtime — shuffled per the student's
 * assigned variant, and deliberately WITHOUT any correctness info (`Choice.isCorrect`,
 * `Question.acceptedAnswers`) so the runtime payload can never leak the answer key. */
export interface AttemptQuestionDTO {
  id: string;
  type: QuestionType;
  prompt: string;
  /** 1-based position within the section, per the assigned variant's shuffled order. */
  order: number;
  /** Shuffled per the variant; empty for `fillBlank`/`essay`. Never carries `isCorrect`. */
  choices: Array<{ id: string; text: string }>;
  /** Only meaningful for `essay` (T-042) — shown to the student as "out of N points". */
  essayMaxScore: number | null;
  /** Only meaningful for `speaking` (T-052) — see `QuestionDTO`'s doc comment. `null`
   * for every other type. */
  allowedResponseSeconds: number | null;
  promptAudioUrl: string | null;
}

/** Reading/Listening content for this section (T-039/T-040/T-041) — same fields as
 * authoring's `SectionDTO`, just carried into the runtime payload too so the take-test
 * page can render the passage / audio player alongside this section's questions. */
export interface AttemptSectionDTO {
  id: string;
  title: string;
  order: number;
  passageText: string | null;
  passageImageUrl: string | null;
  audioUrl: string | null;
  maxPlayCount: number | null;
  questions: AttemptQuestionDTO[];
}

/** The student's own previously-saved answer for one question — used to restore
 * in-progress work after a page refresh (T-012). */
export interface AttemptAnswerDTO {
  questionId: string;
  selectedChoiceId: string | null;
  textAnswer: string | null;
  /** Speaking only (T-052–T-054): ISO timestamp of when this question's Speaking
   * answer was submitted+graded, or `null` if not yet submitted. Once set, the
   * take-test runtime locks re-recording for this question (re-submission is rejected
   * server-side too — see `attempts.routes.ts`). Deliberately the ONLY Speaking field
   * surfaced by this "restore an in-progress attempt" endpoint — the actual
   * score/feedback/audio/transcript are only ever shown on the post-submission result
   * view (T-056), never mid-test, same "never leak grading info mid-test" spirit as
   * every other question type here. */
  speakingSubmittedAt: string | null;
}

/** Response for `GET /api/attempts/:attemptId` — everything the take-test runtime needs
 * to render the assigned variant and restore any answers already saved. `sessionId`
 * (T-016) is what the take-test runtime needs to join that session's Socket.IO
 * teacher-monitor room via `student:join` — see `client/src/pages/TakeTestPage.tsx`. */
export interface AttemptDetailDTO {
  id: string;
  sessionId: string;
  /** `live` vs `selfPractice` (T-040/T-041) — gates whether a Listening section's Play
   * button is student-controlled (`selfPractice`) or teacher-broadcast-only (`live`). See
   * `SessionMode`'s doc comment. */
  sessionMode: SessionMode;
  testId: string;
  testTitle: string;
  timeLimitMinutes: number | null;
  status: AttemptStatus;
  startedAt: string;
  submittedAt: string | null;
  sections: AttemptSectionDTO[];
  answers: AttemptAnswerDTO[];
}

/** Body for `PUT /api/attempts/:attemptId/answers/:questionId` (autosave, T-012).
 * Exactly one of the two fields is meaningful depending on the question's type — same
 * type-dependent shape as authoring's `ChoiceInput`/`acceptedAnswers` split. Sending
 * `null` explicitly clears a previously-saved answer (e.g. student deselects). */
export interface SaveAnswerRequest {
  selectedChoiceId?: string | null;
  textAnswer?: string | null;
}

/** Response for `POST /api/attempts/:attemptId/submit` (T-013). `timeTakenSeconds`
 * (T-017) is `submittedAt - startedAt` in whole seconds, computed once here. */
export interface SubmitAttemptResponse {
  attemptId: string;
  status: AttemptStatus;
  correctCount: number;
  totalCount: number;
  scorePercent: number;
  timeTakenSeconds: number;
}

/** Per-question breakdown row shared by the student result view (T-014) and the
 * teacher's attempt-detail view (T-014) — same shape, since both are allowed to see the
 * full answer key once an attempt exists. `isCorrect` is `null` only for an attempt a
 * teacher is viewing before the student has submitted (ungraded yet). */
export interface AttemptResultQuestionDTO {
  questionId: string;
  type: QuestionType;
  prompt: string;
  order: number;
  choices: Array<{ id: string; text: string; isCorrect: boolean }>;
  /** Accepted answers for `fillBlank`; empty for other types. */
  acceptedAnswers: string[];
  selectedChoiceId: string | null;
  textAnswer: string | null;
  isCorrect: boolean | null;
  /** Manual essay grading (T-042) — `null` until a teacher grades this essay answer
   * (`PATCH /api/teacher/attempts/:attemptId/answers/:questionId/grade`); meaningless
   * for any non-`essay` question (use `speakingAiScore` for a `speaking` question's
   * point scale instead — see `SPEAKING_SCORE_SCALE`). `manualScore`/`manualComment`
   * below are ALSO reused by `speaking` (T-055) — see their own doc comment. Shown
   * ALONGSIDE (not merged into) `AttemptResultDTO.scorePercent`, which only ever
   * reflects auto-gradable questions — see that field's doc comment. */
  essayMaxScore: number | null;
  /** Teacher-set override (T-042 essay, T-055 speaking) — wins once present over the
   * respective auto/AI value for both display and reporting purposes. */
  manualScore: number | null;
  manualComment: string | null;
  /** Speaking (T-052–T-056) — see `Question.allowedResponseSeconds`/`promptAudioUrl`'s
   * doc comments in schema.prisma; both `null` for a non-`speaking` question. */
  allowedResponseSeconds: number | null;
  promptAudioUrl: string | null;
  /** The student's recorded answer, as a base64 `data:` URL (documented local storage
   * convention, see `attempts.routes.ts`'s module doc comment), and the client-generated
   * draft transcript (T-053, may be an empty string). Both `null` until a Speaking
   * answer has actually been submitted for this question. */
  speakingAudioData: string | null;
  speakingTranscript: string | null;
  /** The ORIGINAL AI (Mock, T-051) grade, computed once at submission (T-054) and never
   * overwritten afterward — `manualScore`/`manualComment` above are the teacher's
   * OVERRIDE (T-055), which wins once present, exactly like essay. Both `null` until
   * AI-graded. */
  speakingAiScore: number | null;
  speakingAiFeedback: string | null;
}

/** Response for `GET /api/attempts/:attemptId/result` (student, own attempt only) and
 * `GET /api/teacher/attempts/:attemptId` (teacher, own test only).
 *
 * `scoresPublished` (T-092): teacher-facing responses (`teacherSessions.routes.ts`)
 * always hardcode `true` — a teacher/admin sees full detail regardless of the
 * per-(test,class) release gate. The STUDENT-facing route (`attempts.routes.ts`'s
 * `GET /:attemptId/result`) is the only one that can return `false` for a submitted
 * attempt, and it does so via `AttemptResultPendingDTO` below instead of this full DTO —
 * see that route's doc comment. */
export interface AttemptResultDTO {
  attemptId: string;
  testId: string;
  testTitle: string;
  studentId: string;
  studentName: string;
  status: AttemptStatus;
  startedAt: string;
  submittedAt: string | null;
  /** Auto-graded objective questions only (T-013) — a test containing `essay` questions
   * (T-042) excludes them from this tally entirely; each essay's own manual score lives
   * on its `AttemptResultQuestionDTO` row instead (documented choice — see that DTO's
   * doc comment and `attempts.routes.ts`'s submit handler). */
  correctCount: number | null;
  totalCount: number | null;
  scorePercent: number | null;
  /** Total time taken in whole seconds (T-017), `null` until submitted. */
  timeTakenSeconds: number | null;
  /** Global tab-switch / exit detection (T-044) — see `Attempt.tabSwitchCount`/`tabSwitchLog`
   * doc comment in schema.prisma. Always present (0/[] if never triggered). */
  tabSwitchCount: number;
  tabSwitchLog: string[];
  questions: AttemptResultQuestionDTO[];
  scoresPublished: true;
}

/** T-092: the minimal shape `GET /api/attempts/:attemptId/result` returns INSTEAD of the
 * full `AttemptResultDTO` above when the attempt's test isn't yet score-released for the
 * calling student's own class — deliberately a separate, narrower type (rather than a
 * partially-nulled `AttemptResultDTO`) so it's structurally impossible to leak
 * `scorePercent`/`correctCount`/`totalCount`/any per-question correctness or
 * correct-answer text through this path. `scoresPublished: false` (a literal, not just
 * `boolean`) lets client code discriminate the union below with a single check. */
export interface AttemptResultPendingDTO {
  attemptId: string;
  testId: string;
  testTitle: string;
  status: AttemptStatus;
  submittedAt: string | null;
  scoresPublished: false;
}

/** Response type for `GET /api/attempts/:attemptId/result` — a discriminated union on
 * `scoresPublished` (see `AttemptResultPendingDTO`'s doc comment). */
export type AttemptResultResponseDTO = AttemptResultDTO | AttemptResultPendingDTO;

// --- Manual essay grading (T-042) ---------------------------------------------------

/** Body for `PATCH /api/teacher/attempts/:attemptId/answers/:questionId/grade`. `score`
 * must be between 0 and the question's `essayMaxScore`; `comment` is optional. */
export interface GradeEssayAnswerRequest {
  score: number;
  comment?: string | null;
}

// --- Speaking answers: recording submission + AI grading (T-052–T-054) -------------

/** Body for `POST /api/attempts/:attemptId/questions/:questionId/speaking-answer`. The
 * student's recorded audio, as a `data:` URL (documented local storage convention — no
 * real cloud storage exists yet, see `attempts.routes.ts`'s module doc comment), plus
 * whatever draft transcript the Web Speech API produced (T-053) — an empty string if
 * unsupported/no speech detected, never omitted. Rejected with 409 if this question's
 * Speaking answer was already submitted (T-054 "no silent overwrite"). */
export interface SubmitSpeakingAnswerRequest {
  audioData: string;
  transcript: string;
}

/** Response for the endpoint above — the freshly-computed AI (Mock, T-051) grade, so
 * the take-test runtime can show an immediate confirmation without a second
 * round-trip. */
export interface SubmitSpeakingAnswerResponse {
  questionId: string;
  aiScore: number;
  aiFeedback: string;
  submittedAt: string;
}

// --- Anti-copy-paste (T-043) / global tab-switch detection (T-044) ------------------
// T-043 (anti-copy-paste on the essay textarea) is entirely client-side (DOM `paste`/
// `copy`/`cut` event interception in `TakeTestPage.tsx`) and needs no server contract of
// its own — nothing to add here for it.

/** Response for `POST /api/attempts/:attemptId/tab-switch` (T-044) — echoes the updated
 * running total so the take-test UI can show "(N)" without a second round-trip. */
export interface RecordTabSwitchResponse {
  tabSwitchCount: number;
}

// --- Home self-practice (T-040) -----------------------------------------------------
// Lets a student take ANY test standalone (outside a teacher-run QR/live session) so
// Listening sections behave per T-040 (student's own Play button) rather than T-041
// (teacher-broadcast-only). See `SessionMode`'s doc comment and
// `server/src/routes/practice.routes.ts`.

/** Row shape for `GET /api/tests` (student-only, T-040) — every test is visible to every
 * student for self-practice, same "no class/enrollment concept" convention already
 * documented on `StudentFlashcardSetSummaryDTO`. */
export interface PracticeTestSummaryDTO {
  id: string;
  title: string;
  /** T-045: lets the self-practice picker badge a Mock Test (or any other non-generic
   * type) the same way the teacher's "My tests" list does, via `TEST_TYPE_LABELS`. */
  testType: TestType;
}

// --- Teacher-controlled synchronized Listening playback (T-041) --------------------
// Socket.IO event payload (not a REST DTO) shared between the server's realtime relay
// (`server/src/realtime/sessionRealtime.ts`'s `teacher:playAudio` -> `audio:play`) and
// the client (`TeacherLiveSessionPage.tsx` emits, `TakeTestPage.tsx` listens) — same
// "shared here so client/server never drift" reasoning as `LiveStudentProgressDTO`.

export interface LiveAudioPlayEventDTO {
  sectionId: string;
  audioUrl: string;
  /** ISO timestamp the teacher pressed Play — informational only; each client just
   * starts playback immediately on receipt rather than trying to compute/compensate for
   * network latency, which is more precision than an in-class listening exercise needs. */
  playedAt: string;
}

/** Row shape for a student's own "my attempts" list (student dashboard) and for a
 * teacher's per-session attempt list (T-014).
 *
 * `scoresPublished` (T-092): teacher-facing handlers (`teacherSessions.routes.ts`'s
 * `GET /sessions/:sessionId/attempts`) always hardcode `true` — this DTO's meaning is
 * NOT changed for that route. Only the STUDENT-facing handler (`attempts.routes.ts`'s
 * `GET /api/attempts`, `listMyAttempts`) ever sets this `false`, and when it does it also
 * nulls out `correctCount`/`totalCount`/`scorePercent` for that row — see that route's
 * doc comment. */
export interface AttemptSummaryDTO {
  attemptId: string;
  sessionId: string;
  testId: string;
  testTitle: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  status: AttemptStatus;
  correctCount: number | null;
  totalCount: number | null;
  scorePercent: number | null;
  startedAt: string;
  submittedAt: string | null;
  /** Total time taken in whole seconds (T-017), `null` for an attempt still `inProgress`
   * (including one that's effectively abandoned — never submitted). */
  timeTakenSeconds: number | null;
  /** Global tab-switch / exit detection (T-044) — running count only (the full timestamp
   * log is on `AttemptResultDTO`, not repeated in this list-row shape). */
  tabSwitchCount: number;
  scoresPublished: boolean;
}

// --- Curriculum tagging: Unit & Academic Period (T-018) ---------------------------
// Global entities (see `server/prisma/schema.prisma`'s `Unit`/`AcademicPeriod` doc
// comments for why they're not per-teacher) managed via teacher-only CRUD endpoints.

export interface UnitDTO {
  id: string;
  name: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUnitRequest {
  name: string;
  order: number;
}

export type UpdateUnitRequest = CreateUnitRequest;

/** `startDate`/`endDate` are ISO datetime strings representing UTC instants — see
 * `server/src/routes/curriculum.routes.ts`'s `parseHcmDate` for how a plain
 * `YYYY-MM-DD` request field is converted to/from the fixed `Asia/Ho_Chi_Minh`
 * timezone (PROJECT_PLAN Assumption A5). */
export interface AcademicPeriodDTO {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
}

/** Request shape uses plain `YYYY-MM-DD` calendar dates (interpreted in
 * Asia/Ho_Chi_Minh), not full ISO datetimes — keeps the authoring UI a plain
 * `<input type="date">` with no timezone-math for the teacher to think about. */
export interface CreateAcademicPeriodRequest {
  name: string;
  startDate: string;
  endDate: string;
}

export type UpdateAcademicPeriodRequest = CreateAcademicPeriodRequest;

// --- Live session monitoring (T-016) -----------------------------------------------
// The Socket.IO event payload shape shared between the server's in-memory relay
// (`server/src/realtime/sessionRealtime.ts`, built in T-015) and the client's live
// dashboard (`client/src/pages/TeacherLiveSessionPage.tsx`). Not a REST DTO — this is
// the `student:progress` event payload and the `teacher:join` ack's `students` array —
// but it's shared here anyway (rather than redeclared in both workspaces) for the same
// reason every other cross-workspace shape lives here: client and server must never
// drift on what fields exist.

// --- Vocabulary & Flashcards (T-021–T-027) ------------------------------------------
// Mirrors `server/prisma/schema.prisma`'s `FlashcardSet`/`FlashcardCard`/
// `FlashcardProgress` models (T-021) as plain DTOs, same pattern as the Test/Section/
// Question DTOs above.

export type FlashcardProgressStatus = 'new' | 'learning' | 'known';

/** A vocabulary card as the OWNING teacher sees it (T-022) — every field, including
 * ones an exercise must never leak to a student ahead of time (there's nothing secret
 * here; `term` itself is the "answer" for T-025/T-026/T-027). */
export interface FlashcardCardDTO {
  id: string;
  term: string;
  meaning: string;
  ipa: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  /** Optional sentence with `___` marking the blank (T-024). */
  exampleSentence: string | null;
  synonyms: string[];
  antonyms: string[];
  order: number;
}

export interface FlashcardSetSummaryDTO {
  id: string;
  name: string;
  unitId: string | null;
  unitName: string | null;
  cardCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FlashcardSetDetailDTO {
  id: string;
  name: string;
  teacherId: string;
  unitId: string | null;
  unit: { id: string; name: string } | null;
  cards: FlashcardCardDTO[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateFlashcardSetRequest {
  name: string;
  /** Optional Unit tag (mirrors `CreateTestRequest.unitId`) — omitted/undefined leaves
   * it untagged; explicit `null` clears an existing tag on update. */
  unitId?: string | null;
}
export type UpdateFlashcardSetRequest = CreateFlashcardSetRequest;

/** Body shared by create/edit-card. All fields but `term`/`meaning` are optional per
 * T-021's acceptance criteria. Sending `synonyms`/`antonyms` replaces the full list
 * (never a partial merge) — same "send full current state" convention as
 * `ChoiceInput`/authoring's question choices. */
export interface FlashcardCardInput {
  term: string;
  meaning: string;
  ipa?: string | null;
  imageUrl?: string | null;
  audioUrl?: string | null;
  /** If provided, must contain the literal substring `___` (the blank marker) —
   * validated server-side, see `teacherFlashcards.routes.ts`. */
  exampleSentence?: string | null;
  synonyms?: string[];
  antonyms?: string[];
}
export type CreateFlashcardCardRequest = FlashcardCardInput;
export type UpdateFlashcardCardRequest = FlashcardCardInput;

// --- Bulk card import (T-085) --------------------------------------------------------

/** Max rows accepted by one `POST .../cards/bulk` request — shared so the client (an
 * Excel import, T-085) can reject an over-sized file before ever uploading it, using the
 * exact same number the server independently enforces (`teacherFlashcards.routes.ts`),
 * rather than the two limits silently drifting apart. 500 is a "your call, documented"
 * choice: comfortably above any vocabulary list a teacher would realistically hand-build
 * in one spreadsheet (a full school year of vocabulary is well under this), while still
 * bounding one request to a fixed amount of DB work — see the route's own doc comment for
 * the full reasoning. */
export const FLASHCARD_BULK_IMPORT_MAX_ROWS = 500;

/** Body for `POST /flashcard-sets/:setId/cards/bulk` (T-085) — e.g. an Excel import of
 * many vocabulary cards in one request instead of one `POST .../cards` call per row. Each
 * entry reuses `CreateFlashcardCardRequest` as-is (no separate per-row DTO — the shape is
 * identical to a single-card create). */
export interface BulkCreateFlashcardCardsRequest {
  cards: CreateFlashcardCardRequest[];
}

/** One rejected row from a bulk import. `row` is the 1-based position of the entry
 * WITHIN THE SUBMITTED `cards` ARRAY (`cards[0]` -> `row: 1`), not a spreadsheet line
 * number — the server has no idea the request originated from a spreadsheet at all (per
 * T-085's "parse client-side, submit plain JSON" design), so it can only number what it
 * was actually given. The client is the one place that knows the mapping from array
 * position back to the original spreadsheet row (it filtered out client-side-invalid rows
 * before submitting), so it re-derives the real spreadsheet row for display. */
export interface BulkCreateFlashcardCardsRowError {
  row: number;
  message: string;
}

/** Response for the bulk-import endpoint (T-085). Partial-success by design (see the
 * route's own doc comment for the atomicity reasoning): `created` counts rows already
 * saved by the time this responds, `errors` lists every rejected row and why, and `set`
 * is the same `FlashcardSetDetailDTO` every other card-mutating route in this file
 * returns, so the client can re-render the full card list from this one response instead
 * of issuing a separate follow-up fetch. */
export interface BulkCreateFlashcardCardsResponse {
  created: number;
  errors: BulkCreateFlashcardCardsRowError[];
  set: FlashcardSetDetailDTO;
}

// --- Student flashcard study mode (T-023) -------------------------------------------

/** A card as shown to a student, with the requesting student's own progress for it
 * (`null` progressStatus = never reviewed yet, treated identically to `new` — see
 * `FlashcardProgress`'s doc comment in schema.prisma). */
export interface StudentFlashcardCardDTO extends FlashcardCardDTO {
  progressStatus: FlashcardProgressStatus | null;
  /** T-089: `true` once this student has answered this card correctly in the "Tự kiểm
   * tra" self-check quiz — distinct from (and stricter than) `progressStatus === 'known'`,
   * which is only the student's own self-claim. Always `false` when there's no
   * `FlashcardProgress` row yet. Lets the client's "Xem thẻ đã thuộc" view visually
   * distinguish self-claimed-only vs. verified cards without a separate endpoint. */
  verifiedKnown: boolean;
  lastReviewedAt: string | null;
}

/** Documented choice: every flashcard set is visible to every student (there is no
 * class/enrollment/assignment concept anywhere in this schema yet) — see
 * `studentFlashcards.routes.ts`'s module doc comment. */
export interface StudentFlashcardSetSummaryDTO {
  id: string;
  name: string;
  unitId: string | null;
  unitName: string | null;
  cardCount: number;
  /** T-089: this student's own running point total for THIS ONE set — the sum of
   * `selfCheck`-type `FlashcardExerciseAttempt` point-values (+10 correct / -20
   * incorrect) for cards belonging to this set. Deliberately per-set (unlike the
   * Vocabulary Leaderboard's `score`, which sums across every set — see
   * `vocabLeaderboard.ts`'s doc comment for why the two are scoped differently). */
  selfCheckScore: number;
}

export interface StudentFlashcardSetDetailDTO {
  id: string;
  name: string;
  unitId: string | null;
  unitName: string | null;
  cards: StudentFlashcardCardDTO[];
}

/** Body for `PUT /api/flashcard-sets/:setId/cards/:cardId/progress` (T-023 — direct
 * study-mode marking, e.g. "Known" / "Still learning" buttons on the flip card). */
export interface UpdateFlashcardProgressRequest {
  status: FlashcardProgressStatus;
}

export interface FlashcardProgressDTO {
  cardId: string;
  status: FlashcardProgressStatus;
  lastReviewedAt: string | null;
}

// --- Vocabulary exercises (T-024–T-027) ---------------------------------------------

export type VocabExerciseType = 'fillBlank' | 'unscramble' | 'listenAndType' | 'ipaToWord';

/** One eligible prompt for a given exercise type — never includes the answer. Exactly
 * one of `sentence` / `scrambled` / `audioUrl` / `ipa` is populated, matching `type`:
 * - `fillBlank` -> `sentence` (the card's `exampleSentence`, blank marker intact)
 * - `unscramble` -> `scrambled` (the term's letters, shuffled)
 * - `listenAndType` -> `audioUrl` (the card's audio asset)
 * - `ipaToWord` -> `ipa` (the card's IPA transcription) */
export interface VocabExercisePromptDTO {
  cardId: string;
  type: VocabExerciseType;
  sentence?: string;
  scrambled?: string;
  audioUrl?: string;
  ipa?: string;
}

export interface CheckVocabExerciseRequest {
  answer: string;
}

/** `correctAnswer` is always the card's canonical `term` — returned regardless of
 * whether the submission was right, so the UI can show "the correct answer was ..." on
 * a miss (immediate feedback, per T-024–T-027's acceptance criteria). */
export interface CheckVocabExerciseResponse {
  correct: boolean;
  correctAnswer: string;
  progressStatus: FlashcardProgressStatus;
}

// --- Self-check quiz for mastered flashcards (T-089) --------------------------------
// A completely different, STUDENT-initiated, per-flashcard-set, untimed self-quiz over
// only the cards that student has personally marked "Đã thuộc" (self-claimed `known`) in
// ONE set — do not confuse with the unrelated, teacher-assigned "Kiểm tra từ vựng" /
// Vocabulary Check feature (T-038/T-086, `Test`/`Attempt`/`TestAssignment`-based, see
// `vocabularyCheckGenerator.ts`'s doc comment). Mirrors the T-024–T-027 per-card
// "GET answer-free prompts, POST grades one submission immediately" shape, NOT the batch
// "matching/games complete" shape.

/** One multiple-choice self-check prompt (T-089): the term shown, plus `choices` —
 * the card's real `meaning` shuffled together with distractor meanings built via
 * `vocabularyCheckGenerator.ts`'s `buildDistractors` (reused as-is, not reinvented).
 * Which choice is correct is deliberately withheld — same answer-free-prompt convention
 * as `VocabExercisePromptDTO` above; the server grades the submitted text itself. Only
 * ever built from cards where, for the calling student in this set,
 * `FlashcardProgress.status === 'known' && verifiedKnown === false`. */
export interface SelfCheckPromptDTO {
  cardId: string;
  term: string;
  choices: string[];
}

/** Response for `POST /:setId/self-check/:cardId/answer` (T-089). `correctMeaning` is
 * always the card's canonical `meaning` (same "reveal the right answer on every response,
 * not just a miss" convention as `CheckVocabExerciseResponse.correctAnswer`).
 * `pointsDelta` is the exact point-value THIS answer just added to the permanent ledger
 * (`+10` correct / `-20` incorrect, see `server/src/lib/vocabLeaderboard.ts`'s doc
 * comment for why this is never a stored running total) — a correct answer also flips
 * `FlashcardProgress.verifiedKnown` to `true` server-side (not itself part of this
 * response shape; re-fetch `GET /:setId` or the self-check prompt list to observe it). */
export interface SelfCheckAnswerResponse {
  correct: boolean;
  correctMeaning: string;
  pointsDelta: number;
}

// --- Vocabulary matching exercise (T-028) -------------------------------------------
// Extends the T-024–T-027 exercise pattern above: four modes matching a word against
// its meaning / image / synonym / antonym. See
// `server/src/lib/flashcardExercises.ts`'s `isMatchingEligible`/`buildMatchingTarget`
// for the per-mode eligibility rule (mirrors `isEligible`/`buildPrompt` for the
// fill-blank/unscramble/etc. exercises above) — a mode with fewer than 2 eligible cards
// is simply unplayable for that set (empty/too-short list, never a 4xx), per T-028's
// acceptance criteria.

export type MatchingMode = 'meaning' | 'image' | 'synonym' | 'antonym';

/** One term/target pair for a matching round. `target` holds whatever the mode needs:
 * the card's meaning text, its `imageUrl`, one synonym, or one antonym. The client
 * shuffles the left (`term`) and right (`target`) columns independently and the
 * student's job is to re-pair them — nothing here is a hidden "answer" the way
 * `VocabExercisePromptDTO` hides the term, since presenting both sides IS the exercise
 * (the challenge is in the shuffled order, not in withholding data). */
export interface MatchingPairDTO {
  cardId: string;
  term: string;
  target: string;
}

/** Body for completing a batch vocabulary activity round — shared by the matching
 * exercise (T-028) and both vocab games (T-034/T-035), since all three record
 * `FlashcardProgress` the same way: one correct/incorrect verdict per card touched
 * during the round, applied via `flashcardProgress.ts`'s `advanceStatus` exactly like
 * every other exercise type. `correct` means "paired correctly on the first attempt"
 * for matching, or "answered/hit the right target for that word" for a game — see each
 * page's doc comment. */
export interface CompleteVocabActivityRequest {
  results: Array<{ cardId: string; correct: boolean }>;
}

export interface CompleteVocabActivityResponse {
  updated: number;
}

// --- Use-word-in-a-sentence exercise (T-029) ----------------------------------------

/** Every card is eligible (any word can be used in a free-text sentence) — unlike the
 * T-024–T-027 exercises there is no eligibility filter here. */
export interface SentencePromptDTO {
  cardId: string;
  term: string;
  meaning: string;
}

export interface SubmitSentenceRequest {
  sentence: string;
}

/** `containsWord` is the validation heuristic's verdict (see
 * `server/src/lib/vocabSentence.ts`) — shown to the student as feedback, but per T-029's
 * acceptance criteria it NEVER blocks the submission: the request always succeeds and
 * the raw sentence is always stored for teacher visibility, regardless of this value. */
export interface SubmitSentenceResponse {
  containsWord: boolean;
  progressStatus: FlashcardProgressStatus;
}

/** Row shape for the teacher-facing view of stored sentence submissions (T-029 "stored
 * for teacher visibility"), newest first. */
export interface SentenceSubmissionDTO {
  id: string;
  cardId: string;
  term: string;
  studentId: string;
  studentName: string;
  sentence: string;
  containsWord: boolean;
  createdAt: string;
}

// --- Vocabulary/exercise progress tracking (T-030) ----------------------------------
// Mirrors `server/prisma/schema.prisma`'s `FlashcardExerciseAttempt` model — see that
// model's doc comment for why a separate append-only log was added rather than
// retrofitting `FlashcardProgress` (which only ever holds ONE current status per
// student+card, not a history).

/** Every vocabulary "activity" type that can produce a correct/incorrect verdict on one
 * card: the four single-answer exercises (T-024-027), matching (T-028), the
 * use-in-a-sentence exercise (T-029, verdict = `containsWord`), the two vocab games
 * (T-034/T-035), and the "Tự kiểm tra" self-check quiz (T-089, verdict = whether the
 * submitted meaning matched `FlashcardCard.meaning`). A superset of `VocabExerciseType` —
 * every `VocabExerciseType` value is also a valid `VocabActivityType`.
 *
 * `'selfCheck'` rows are special: they double as a permanent point ledger (+10 correct /
 * -20 incorrect per row, see `SelfCheckAnswerResponse.pointsDelta` and
 * `server/src/lib/vocabLeaderboard.ts`'s doc comment) — never true of any other activity
 * type here, which are informational stats only. */
export type VocabActivityType =
  | VocabExerciseType
  | 'matching'
  | 'sentence'
  | VocabGameType
  | 'selfCheck';

/** Per-activity-type stats row: how many attempts, how many correct, and the resulting
 * accuracy — shared by the student's own progress view and the teacher's per-student/
 * per-class view (T-030), so both render the exact same shape. `accuracyPercent` is
 * `null` (never `0`) when `attempted` is 0, same "don't fake a zero" convention as
 * `TestSummaryDTO.averageTimeTakenSeconds`. */
export interface VocabActivityStatDTO {
  type: VocabActivityType;
  attempted: number;
  correct: number;
  accuracyPercent: number | null;
}

/** One flashcard set's card-status breakdown (T-030) — "known/learning/new" counts for
 * ONE student (either "me" on the student view, or one row of the teacher's per-student
 * table). `cardCount` is the set's total card count, always equal to
 * `knownCount + learningCount + newCount` (a card with no `FlashcardProgress` row at all
 * counts as `new`, same convention as everywhere else in this codebase). */
export interface VocabSetProgressDTO {
  setId: string;
  setName: string;
  unitName: string | null;
  cardCount: number;
  knownCount: number;
  learningCount: number;
  newCount: number;
}

/** Response for `GET /api/flashcard-sets/progress` (T-030, student-only): the
 * requesting student's own progress across every flashcard set that has at least one
 * `FlashcardProgress` row for them, plus their overall per-exercise-type stats across
 * ALL sets (not scoped to one set — a student's fill-blank accuracy is one number across
 * everything they've practiced, matching how the student experiences it). */
export interface StudentVocabProgressDTO {
  sets: VocabSetProgressDTO[];
  activityStats: VocabActivityStatDTO[];
}

/** One row of the teacher's per-student table for one flashcard set (T-030) — every
 * student account appears here (not just ones who've started), so a teacher can spot who
 * hasn't practiced at all (`cardCount` progress fields all 0, `activityStats` all
 * `attempted: 0`), per that acceptance criteria. */
export interface TeacherVocabProgressStudentRowDTO {
  studentId: string;
  studentName: string;
  knownCount: number;
  learningCount: number;
  newCount: number;
  activityStats: VocabActivityStatDTO[];
}

/** Response for `GET /api/teacher/flashcard-sets/:setId/progress` (T-030, teacher-only,
 * ownership-checked). `classSummary` is the "per-class-of-students" view the acceptance
 * criteria asks for: this schema has no separate Class/cohort entity (every flashcard
 * set is visible to every student, see `StudentFlashcardSetSummaryDTO`'s doc comment) —
 * documented choice: "the class" is every student account, the same flat cohort already
 * used throughout Phase 3, so `classSummary` aggregates across every row in `students`
 * rather than a smaller subdivision that doesn't exist in this schema yet. */
export interface TeacherVocabProgressDTO {
  setId: string;
  setName: string;
  cardCount: number;
  classSummary: {
    studentCount: number;
    knownCount: number;
    learningCount: number;
    newCount: number;
    activityStats: VocabActivityStatDTO[];
  };
  students: TeacherVocabProgressStudentRowDTO[];
}

// --- Vocabulary leaderboard (T-031) + monthly/yearly ranking (T-032/T-033) ----------
// Shared scoring shape across all three tasks — see `server/src/lib/vocabLeaderboard.ts`
// for the documented score formula (REPLACED by T-089 — third revision of this formula
// the same day, see that module's doc comment for the full history) and why the all-time
// and period-scoped variants weight things slightly differently (the latter has no
// period-attributable "verified known cards" count, only period-scoped self-check
// activity).

/** One ranked row (T-089 formula). `score` is the sum of the student's `selfCheck`-type
 * `FlashcardExerciseAttempt` point-values (+10 correct / -20 incorrect) — ACROSS EVERY
 * flashcard set they can access for the all-time variant, or scoped additionally to the
 * period's date range for the period variant — never per-set (contrast
 * `StudentFlashcardSetSummaryDTO.selfCheckScore`, which IS per-set). `knownCardCount` is
 * the count of `FlashcardProgress` rows with `verifiedKnown: true` (true verified
 * mastery via the self-check quiz, not just self-claimed `status: 'known'`) — always 0 on
 * a period-scoped leaderboard (T-032/T-033), since `verifiedKnown` has no
 * period-attributable timestamp, same reasoning as before T-089. `totalAttempts`/
 * `correctAttempts`/`accuracyPercent` are scoped to `selfCheck`-type attempts ONLY (not
 * every exercise type, unlike pre-T-089), so the displayed accuracy is coherent with
 * what's actually driving `score` now. `rank` is 1-based and accounts for ties (equal
 * `score` -> equal `rank`, per standard "competition ranking" — see the module for the
 * exact tie-break-then-rank rule). */
export interface VocabLeaderboardEntryDTO {
  rank: number;
  studentId: string;
  studentName: string;
  knownCardCount: number;
  totalAttempts: number;
  correctAttempts: number;
  accuracyPercent: number | null;
  score: number;
}

/** Response for `GET /api/vocab-leaderboard` (T-031, both roles). Includes every
 * student account, even ones with a zero score (score 0, ranked last) — a "leaderboard"
 * showing the whole cohort's standing, not just active students.
 *
 * `classId`/`className` (T-077, Phase 12): the ONE class this leaderboard is scoped to —
 * `entries` only ever contains students in this class, never a mix across classes. A
 * student always gets their own class back regardless of any `?classId=` they pass; a
 * teacher/admin gets back whichever class `?classId=` resolved to (see
 * `server/src/lib/reportClassScope.ts`). */
export interface VocabLeaderboardResponseDTO {
  classId: string;
  className: string;
  entries: VocabLeaderboardEntryDTO[];
}

/** Response for the teacher-only monthly (T-032) / yearly (T-033) ranking endpoints.
 * `entries` is filtered to students with at least one exercise attempt IN that period
 * (unlike the all-time leaderboard above) — a student with zero activity that month has
 * nothing meaningful to rank, per "identifying the highest-scoring and MOST ACTIVE
 * students for that month specifically" (T-032's acceptance criteria emphasis).
 * `periodStart`/`periodEnd` are the UTC instant bounds of the selected HCM-local
 * calendar month/year (`periodEnd` exclusive), computed via the same
 * `Asia/Ho_Chi_Minh`-fixed-offset helpers T-019's reporting engine uses (Assumption A5)
 * — see `server/src/lib/reporting.ts`'s `hcmMonthRange`/`hcmYearRange`.
 *
 * `classId`/`className` (T-077, Phase 12): teacher/admin-only endpoint, so this is always
 * an explicit-or-defaulted class from `resolveTeacherClassId` — see that function's doc
 * comment in `server/src/lib/reportClassScope.ts`. `entries` never mixes students across
 * classes, even though the same period window/formula applies to every class. */
export interface VocabPeriodLeaderboardResponseDTO {
  period: 'month' | 'year';
  year: number;
  /** 1-12, only present when `period === 'month'`. */
  month: number | null;
  periodStart: string;
  periodEnd: string;
  classId: string;
  className: string;
  entries: VocabLeaderboardEntryDTO[];
}

// --- Vocabulary games: space shooter (T-034) and runner (T-035) --------------------
// Both games use the exact same word data (term+meaning — every card qualifies, no
// eligibility filter) and the exact same round-completion contract
// (`CompleteVocabActivityRequest`/`Response` above), so only one word-list DTO and one
// `gameType` union are needed for both tasks.

export type VocabGameType = 'spaceShooter' | 'runner';

export interface GameWordDTO {
  cardId: string;
  term: string;
  meaning: string;
}

/** One student's latest known progress within a session, keyed by `studentId` (never
 * socket id — see `sessionRealtime.ts`'s module doc comment for why) so a reconnect
 * overwrites the same entry instead of adding a second one. */
export interface LiveStudentProgressDTO {
  studentId: string;
  studentName: string;
  attemptId: string;
  /** 0-based index into the student's flattened question list (matches
   * `TakeTestPage.tsx`'s `flatQuestions` indexing) — "which question they're currently
   * on (or last answered)" per T-016's acceptance criteria. */
  currentQuestionIndex: number;
  answeredCount: number;
  /** Total question count for the test being taken — set once at `student:join` time
   * (the same for every student in a session, since they all take the same test, just
   * shuffled per T-009's variants) so the dashboard can render "percent complete"
   * without a second REST round-trip. */
  totalQuestions: number;
  updatedAt: string;
}

// --- Reporting engine v1 (T-019) ----------------------------------------------------
// Shared shapes for the multi-granularity reporting endpoint. See
// `server/src/lib/reporting.ts` for the engine that produces these and PROJECT_PLAN.md
// Assumption A5 / A11 for the timezone and "breakdown table" design conventions.

/** Every filter dimension T-019 supports, all served by the same underlying engine
 * (`computeReport` in `server/src/lib/reporting.ts`) rather than one-off queries per
 * dimension. `week` is ISO-8601 (Monday–Sunday); `semester` buckets by the existing
 * `AcademicPeriod` entity (T-018); all date/time bucketing uses the fixed
 * `Asia/Ho_Chi_Minh` timezone (Assumption A5). */
/** `student` (T-037) added alongside the original six dimensions: buckets every
 * `student`-role account (0-row default, same convention as `test`/`unit` below) instead
 * of a test/unit/period — this is what powers the Unit Test leaderboard's "ranked scores"
 * (T-037), sorted by score descending rather than the other dimensions' natural/alphabetic
 * order. See `server/src/lib/reporting.ts`'s `buildStudentBuckets` doc comment. */
export type ReportGroupBy =
  | 'test'
  | 'unit'
  | 'student'
  | 'week'
  | 'month'
  | 'quarter'
  | 'semester'
  | 'year';

/** One row of the report's breakdown table (Assumption A11 — `groupBy` returns a table
 * with one row per bucket for that granularity, not a single filtered number). Only
 * `submitted` attempts are counted, matching T-017's average-time convention.
 * `periodStart`/`periodEnd` are `null` for the `test`/`unit` dimensions (no natural time
 * range) and set to the bucket's UTC instant boundaries for every time-based dimension
 * (`week`/`month`/`quarter`/`semester`/`year`) — `periodEnd` is exclusive. Averages are
 * `null` (never `0`) when `attemptCount` is 0, same "don't fake a zero" convention as
 * `TestSummaryDTO.averageTimeTakenSeconds`. */
export interface ReportBucketDTO {
  /** Stable id for the bucket: a test/unit/AcademicPeriod id, the literal `'untagged'` /
   * `'unassigned'` pseudo-bucket, or a computed period key (e.g. `2026-09`, `2026-W37`,
   * `2026-Q3`, `2026`). */
  key: string;
  /** Human-readable label for the report table (e.g. the test title, unit name,
   * academic period name, or a formatted period like `Month 2026-09`). */
  label: string;
  attemptCount: number;
  /** Average `Attempt.scorePercent`, rounded to 1 decimal place (same precision
   * `attempts.routes.ts` stores it at). */
  averageScorePercent: number | null;
  /** Average `Attempt.timeTakenSeconds`, rounded to the nearest whole second (same
   * convention as `TestSummaryDTO.averageTimeTakenSeconds`, T-017). */
  averageTimeTakenSeconds: number | null;
  periodStart: string | null;
  periodEnd: string | null;
}

/** Response for `GET /api/teacher/reports`. `testId`/`unitId`/`testType` echo back
 * whichever optional narrowing filters were applied (`null` if omitted) so the client can
 * confirm what it asked for. `testType` (T-037) is what narrows a Unit report down to
 * specifically its `unitTest`-type test(s), per that task's acceptance criteria.
 *
 * `classId`/`className` (T-077, Phase 12): UNLIKE `testId`/`unitId`/`testType`, this is
 * never `null` — every bucket's numbers are scoped to exactly this one class (resolved by
 * `resolveTeacherClassId`, `server/src/lib/reportClassScope.ts`, before the report was
 * even computed), so a teacher viewing "Test A" (which may be assigned to several
 * classes) always knows which single class's numbers they're looking at. */
export interface ReportResponseDTO {
  groupBy: ReportGroupBy;
  testId: string | null;
  unitId: string | null;
  testType: TestType | null;
  classId: string;
  className: string;
  buckets: ReportBucketDTO[];
}

// --- Speaking reports (T-057) --------------------------------------------------------
// Extends T-019's reporting engine additively once more (`computeSpeakingReport` in
// `server/src/lib/reporting.ts`, alongside `computeReport`/`computeGrammarReport`),
// reusing `ReportBucketDTO` as-is: `averageScorePercent` here means "average effective
// Speaking score" (the teacher's override when present, else the AI grade — same
// "teacher value wins" rule as `AttemptResultQuestionDTO` below), and
// `averageTimeTakenSeconds` is always `null` (no whole-attempt duration is meaningful
// for a single Speaking answer's per-question response window).

/** `test`/`unit` play the same role as in `ReportGroupBy`, restricted to tests/units that
 * actually contain a Speaking question; no `student` dimension (T-057 didn't ask for a
 * Speaking leaderboard, only the same depth of period bucketing every other module
 * gets). */
export type SpeakingReportGroupBy =
  | 'test'
  | 'unit'
  | 'week'
  | 'month'
  | 'quarter'
  | 'semester'
  | 'year';

/** `classId`/`className` (T-077, Phase 12): same "always resolved, never null" convention
 * as `ReportResponseDTO` above — see that field's doc comment. */
export interface SpeakingReportResponseDTO {
  groupBy: SpeakingReportGroupBy;
  testId: string | null;
  unitId: string | null;
  classId: string;
  className: string;
  buckets: ReportBucketDTO[];
}

// --- Grammar module (T-046–T-050) ---------------------------------------------------
// Mirrors `server/prisma/schema.prisma`'s `GrammarTopic`/`GrammarExercise`/
// `GrammarChoice`/`GrammarExerciseAttempt` models as plain DTOs, same pattern as every
// other Prisma-model-to-DTO section above. See `GrammarTopic`'s doc comment in that
// schema file for the documented choice of why `GrammarExercise` mirrors `Question`'s
// shape/types (reusing the very same `QuestionType` + the exact same
// `server/src/lib/grading.ts#gradeAnswer` function) rather than sharing a table with it.

export interface GrammarChoiceDTO {
  id: string;
  text: string;
  isCorrect: boolean;
  order: number;
}

/** Full authoring shape (teacher-only) — mirrors `QuestionDTO`, minus `essayMaxScore`
 * (Grammar exercises are objective-only; `essay` is rejected at the validation layer,
 * see schema.prisma's module doc comment). */
export interface GrammarExerciseDTO {
  id: string;
  type: QuestionType;
  prompt: string;
  order: number;
  /** Only meaningful for `fillBlank`; empty array for the other types. */
  acceptedAnswers: string[];
  /** Only meaningful for `multipleChoice`/`trueFalse`; empty array for `fillBlank`. */
  choices: GrammarChoiceDTO[];
}

export interface GrammarTopicSummaryDTO {
  id: string;
  title: string;
  unitId: string | null;
  unitName: string | null;
  exerciseCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface GrammarTopicDetailDTO {
  id: string;
  title: string;
  teacherId: string;
  unitId: string | null;
  unit: { id: string; name: string } | null;
  theoryContent: string;
  exercises: GrammarExerciseDTO[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateGrammarTopicRequest {
  title: string;
  theoryContent: string;
  /** Optional Unit tag (mirrors `CreateTestRequest.unitId`) — omitted/undefined leaves
   * it untagged; explicit `null` clears an existing tag on update. */
  unitId?: string | null;
}
export type UpdateGrammarTopicRequest = CreateGrammarTopicRequest;

/** Body shared by create/edit-exercise — mirrors `ChoiceInput`. */
export interface GrammarChoiceInput {
  id?: string;
  text: string;
  isCorrect: boolean;
}

/** Mirrors `CreateQuestionRequest`, restricted to the objective types Grammar practice
 * supports (`essay` is rejected server-side — see `GrammarExerciseDTO`'s doc comment). */
export interface CreateGrammarExerciseRequest {
  type: QuestionType;
  prompt: string;
  /** Required (non-empty) for multipleChoice/trueFalse, ignored for fillBlank. */
  choices?: GrammarChoiceInput[];
  /** Required (non-empty) for fillBlank, ignored otherwise. */
  acceptedAnswers?: string[];
}
export type UpdateGrammarExerciseRequest = CreateGrammarExerciseRequest;

// --- Student-facing Grammar browsing + theory reading (T-047) -----------------------
// Every topic is visible to every student — same "no enrollment concept" convention as
// `StudentFlashcardSetSummaryDTO`.

export interface StudentGrammarTopicSummaryDTO {
  id: string;
  title: string;
  unitId: string | null;
  unitName: string | null;
  exerciseCount: number;
}

export interface StudentGrammarTopicDetailDTO {
  id: string;
  title: string;
  unitId: string | null;
  unitName: string | null;
  theoryContent: string;
}

// --- Grammar practice exercises (T-048) ----------------------------------------------

/** One eligible practice-exercise prompt — deliberately WITHOUT correctness info
 * (`isCorrect`/`acceptedAnswers`), same "never leak the answer key ahead of time"
 * convention as `AttemptQuestionDTO`. */
export interface GrammarExercisePromptDTO {
  id: string;
  type: QuestionType;
  prompt: string;
  order: number;
  choices: Array<{ id: string; text: string }>;
}

/** Body for `POST /grammar-topics/:topicId/exercises/:exerciseId/check`. Exactly one of
 * the two fields is meaningful depending on the exercise's type, same type-dependent
 * shape as `SaveAnswerRequest`. */
export interface CheckGrammarExerciseRequest {
  selectedChoiceId?: string | null;
  textAnswer?: string | null;
}

/** `correctChoiceId`/`correctAnswers` are always populated regardless of whether the
 * submission was right, so the UI can show "the correct answer was ..." on a miss —
 * same convention as `CheckVocabExerciseResponse.correctAnswer`. */
export interface CheckGrammarExerciseResponse {
  correct: boolean;
  /** The correct choice id for multipleChoice/trueFalse; `null` for fillBlank. */
  correctChoiceId: string | null;
  /** Accepted answers for fillBlank; empty for multipleChoice/trueFalse. */
  correctAnswers: string[];
}

/** A student's own running accuracy on one topic (`GET
 * /grammar-topics/:topicId/progress`) — shown on the topic page so the practice loop has
 * a visible sense of progress, same spirit as `FlashcardProgress` for vocabulary. */
export interface GrammarTopicProgressDTO {
  attemptedCount: number;
  correctCount: number;
}

// --- Grammar game (T-049) ------------------------------------------------------------
// Adapts the vocab space-shooter's Canvas/React structure (T-034) to Grammar exercise
// content. Only multipleChoice/trueFalse exercises are eligible (a game round needs
// choices to build lanes from; fillBlank is excluded — documented choice, see
// `studentGrammar.routes.ts`'s module doc comment). Unlike `GrammarExercisePromptDTO`,
// this DTO DOES include the correct answer text up front — same "presenting the content
// IS the exercise, not a leak" reasoning already documented on `MatchingPairDTO` (T-028):
// the game's whole point is instant client-side feedback with no per-shot round trip,
// and round completion still POSTs an aggregate correct/incorrect verdict per exercise
// to `GrammarExerciseAttempt` server-side (same trust model as the vocab games).

export type GrammarGameType = 'spaceShooter';

export interface GrammarGameQuestionDTO {
  exerciseId: string;
  prompt: string;
  correctAnswer: string;
  /** This exercise's own incorrect choice texts — the natural decoy source for a game
   * round (unlike vocabulary term/meaning pairs, a multipleChoice/trueFalse Grammar
   * exercise already HAS wrong answers attached, so no cross-exercise decoy-picking is
   * needed first — though the client pads from OTHER exercises' answers too, for
   * exercises with fewer than 2 wrong choices, e.g. `trueFalse`). */
  wrongAnswers: string[];
}

/** Body for completing a batch Grammar-game round — mirrors
 * `CompleteVocabActivityRequest`: one correct/incorrect verdict per exercise touched
 * during the round, recorded as a `GrammarExerciseAttempt` row each (T-048/T-049 share
 * the same attempt log). */
export interface CompleteGrammarActivityRequest {
  results: Array<{ exerciseId: string; correct: boolean }>;
}
export interface CompleteGrammarActivityResponse {
  updated: number;
}

// --- Grammar reports (T-050) ---------------------------------------------------------
// Extends T-019's reporting engine additively (`computeGrammarReport` in
// `server/src/lib/reporting.ts`, alongside the existing `computeReport` for Test
// attempts) rather than modifying its existing code paths. Reuses `ReportBucketDTO`
// as-is, reinterpreted: `averageScorePercent` here means "percent of Grammar exercise
// submissions answered correctly" (accuracy), and `averageTimeTakenSeconds` is always
// `null` (Grammar practice exercises aren't timed).

/** Every filter dimension T-050 supports — `topic`/`student` play the role
 * `test`/`unit` play in `ReportGroupBy`, plus the same time-based dimensions
 * (`week`/`month`/`quarter`/`semester`/`year`, fixed `Asia/Ho_Chi_Minh` timezone, per
 * Assumption A5). */
export type GrammarReportGroupBy =
  | 'topic'
  | 'student'
  | 'week'
  | 'month'
  | 'quarter'
  | 'semester'
  | 'year';

/** `classId`/`className` (T-077, Phase 12): same "always resolved, never null" convention
 * as `ReportResponseDTO` above — see that field's doc comment. */
export interface GrammarReportResponseDTO {
  groupBy: GrammarReportGroupBy;
  topicId: string | null;
  studentId: string | null;
  classId: string;
  className: string;
  buckets: ReportBucketDTO[];
}

// --- Unit Test management (T-036) ---------------------------------------------------
// A "Unit Test" is just a `Test` (see above) tagged `testType: 'unitTest'` and (optionally)
// a `Unit` — see `Test.published`'s doc comment in schema.prisma for the documented
// "what makes it available to students" semantics this section's DTOs surface.

/** One curriculum Unit's group of Unit Tests, shared by both the teacher's "all my Unit
 * Tests" view and the student's "Unit Tests I can take" view. `unitId`/`unitName` are
 * `null` for the "Untagged" group (a `unitTest`-type test with no `Unit` tag yet). */
export interface UnitTestGroupDTO<TTest> {
  unitId: string | null;
  unitName: string | null;
  tests: TTest[];
}

/** Response for `GET /api/teacher/unit-tests` — every `unitTest`-type test the calling
 * teacher owns, grouped by Unit (in curriculum `order`, "Untagged" last). Reuses
 * `TestSummaryDTO` as-is (already carries `testType`/`published`). */
export interface TeacherUnitTestsResponseDTO {
  groups: UnitTestGroupDTO<TestSummaryDTO>[];
}

/** One Unit Test row as a STUDENT sees it (T-036) — deliberately NOT `TestSummaryDTO`
 * (which exposes `sectionCount`/authoring metadata a student doesn't need) and instead
 * carries the student's OWN attempt status for it, if any, so the UI can show "Take
 * test" vs. "Resume" vs. "View result" without a second round-trip per test. */
export interface StudentUnitTestSummaryDTO {
  id: string;
  title: string;
  unitId: string | null;
  unitName: string | null;
  myAttempt: { attemptId: string; status: AttemptStatus; scorePercent: number | null } | null;
}

/** Response for `GET /api/student/unit-tests` — every `unitTest`-type test with
 * `published: true`, grouped by Unit. Documented "published" semantics (T-036 "your
 * call"): a Unit Test becomes visible here the moment its owning teacher flips
 * `Test.published` to `true` via the same test editor used to author it — see that
 * field's doc comment in schema.prisma for why this was chosen over deriving
 * availability from session/self-practice activity. */
export interface StudentUnitTestsResponseDTO {
  groups: UnitTestGroupDTO<StudentUnitTestSummaryDTO>[];
}

// --- Unit Test report & leaderboard (T-037) -----------------------------------------
// Built on T-019's `computeReport` engine (`groupBy: 'student'` + `unitId` + `testType:
// 'unitTest'`), not a one-off query — see `server/src/routes/unitLeaderboard.routes.ts`.

export interface UnitLeaderboardEntryDTO {
  /** 1-based; simple sequential rank by score descending (no tie-handling beyond stable
   * sort — unlike T-031's vocab leaderboard, T-037's acceptance criteria doesn't call for
   * competition-style tie ranks, so the simpler rule was used, documented here). */
  rank: number;
  studentId: string;
  studentName: string;
  attemptCount: number;
  averageScorePercent: number | null;
}

/** Response for `GET /api/units/:unitId/leaderboard` (both roles, T-037): ranked
 * per-student scores plus the unit-wide average, both scoped to that unit's
 * `unitTest`-type test(s) only. Every student account appears (even with `attemptCount:
 * 0`, ranked last) — same "0-row, not a missing row" convention T-019/T-031 already
 * establish elsewhere in this codebase.
 *
 * `classId`/`className` (T-077, Phase 12): the ONE class `entries`/the aggregate are
 * scoped to — see `VocabLeaderboardResponseDTO`'s doc comment for the identical
 * both-roles resolution rule (`resolveViewerClassId`). */
export interface UnitLeaderboardResponseDTO {
  unitId: string;
  unitName: string;
  classId: string;
  className: string;
  attemptCount: number;
  averageScorePercent: number | null;
  entries: UnitLeaderboardEntryDTO[];
}

// --- Per-test attempt report (T-087) -------------------------------------------------
// Ranked list of every SUBMITTED attempt of ONE test, across ALL of its sessions AND
// self-practice — queried by `Attempt.testId` directly (`server/src/routes/
// teacherTests.routes.ts`'s `GET /tests/:testId/attempts`), unlike `AttemptSummaryDTO`
// above (T-014's single-session-scoped list). Class-scoped via `resolveTeacherClassId`,
// same "classId/className always resolved, never null" convention as
// `ReportResponseDTO`/`UnitLeaderboardResponseDTO` above. Reached from
// `TeacherTestsPage`'s new "Report" action; each row drills into the EXISTING
// `/teacher/attempts/:attemptId` page (`AttemptResultDTO`) rather than a new detail view.

export interface TestAttemptReportEntryDTO {
  attemptId: string;
  studentId: string;
  studentName: string;
  correctCount: number;
  totalCount: number;
  scorePercent: number;
  submittedAt: string;
}

/** Response for `GET /api/teacher/tests/:testId/attempts` (T-087). `entries` is sorted
 * by `scorePercent` descending, ties broken by `submittedAt` ascending — "ranked
 * most-correct to least-correct" per the customer request.
 *
 * `scoresPublished` (T-092): whether a `TestScoreRelease` row exists for (this `testId`,
 * this `classId`) — i.e. whether students IN THIS CLASS can currently see their own
 * score for this test. Toggled via `PUT /api/teacher/tests/:testId/score-release`. */
export interface TestAttemptReportResponseDTO {
  testId: string;
  testTitle: string;
  classId: string;
  className: string;
  entries: TestAttemptReportEntryDTO[];
  scoresPublished: boolean;
}

// --- Per-(test, class) score release (T-092) -----------------------------------------
// Presence of a `TestScoreRelease` row = published; absence = not yet published. See
// that Prisma model's doc comment in schema.prisma for the full design, and
// `attempts.routes.ts`'s module doc comment for the student-facing gating it drives.

/** Body for `PUT /api/teacher/tests/:testId/score-release`. `classId` must be one of the
 * calling teacher's own classes (or, for `admin`, any class — same rule as
 * `resolveTeacherClassId`, which this endpoint reuses). `published: true` upserts the
 * `TestScoreRelease` row; `published: false` deletes it — both idempotent. */
export interface UpdateScoreReleaseRequest {
  classId: string;
  published: boolean;
}

/** Response for the endpoint above. */
export interface ScoreReleaseDTO {
  testId: string;
  classId: string;
  scoresPublished: boolean;
}

// --- Vocabulary Check test type (T-038, redesigned by T-086 to a Unit-based random pool) --
// A `vocabularyCheck`-type `Test`, auto-generated by
// `server/src/lib/vocabularyCheckGenerator.ts` from EVERY `FlashcardCard` across every
// `FlashcardSet` tagged with a teacher-picked `unitId`, picked entirely at RANDOM —
// completely independent of whether the target student(s) have studied those specific
// words yet. (T-038's original design instead drew the pool from the target student(s)'
// OWN `FlashcardProgress`, `learning`/`known` only, per Assumption A8 — the customer
// explicitly reversed that rule 2026-09-15, see PROJECT_PLAN.md's Assumption A8
// annotation and T-086 in BACKLOG.md.) The teacher also now explicitly picks
// `questionCount` and `timeLimitMinutes` per request, replacing the old fixed 15-minute
// timer. Taking one reuses the exact same self-practice start endpoint
// (`POST /api/tests/:testId/practice`) and take-test runtime (T-012)/auto-grading (T-013)
// as any other test — see `TestAssignment`'s doc comment in schema.prisma for how access
// is scoped to exactly the students it was generated for.

/** Body for `POST /api/teacher/vocabulary-checks` (T-086). `studentIds` may be a single id
 * (one target student) or several (a "group" — every selected student is granted access
 * to the SAME generated test; unlike the pre-T-086 design, this no longer affects the
 * question pool at all). `unitId` must reference an existing `Unit` — the question pool
 * is drawn from EVERY `FlashcardCard` across every `FlashcardSet` tagged with it.
 * `questionCount` must be a positive integer strictly LESS THAN that unit's total card
 * count (a pool of 0 or 1 cards is rejected outright, since no valid count could satisfy
 * "strictly less than" then). `timeLimitMinutes` must be a whole number of minutes,
 * 1-480 — same bound `teacherTests.routes.ts`'s `validateTimeLimit` already enforces for
 * a regular Test's `timeLimitMinutes`. */
export interface GenerateVocabularyCheckRequest {
  studentIds: string[];
  unitId: string;
  questionCount: number;
  timeLimitMinutes: number;
  /** Optional custom title; omitted/blank generates one from the date + student names. */
  title?: string;
}

/** One generated Vocabulary Check as the OWNING teacher sees it — returned by both the
 * generate endpoint and the teacher's list endpoint. */
export interface TeacherVocabularyCheckSummaryDTO {
  id: string;
  title: string;
  timeLimitMinutes: number;
  questionCount: number;
  assignedStudents: Array<{ id: string; name: string }>;
  createdAt: string;
}

/** One Vocabulary Check as an ASSIGNED student sees it (T-038) — same "carry my own
 * attempt status" shape as `StudentUnitTestSummaryDTO`, since both are started via the
 * identical self-practice endpoint. */
export interface StudentVocabularyCheckSummaryDTO {
  id: string;
  title: string;
  timeLimitMinutes: number;
  questionCount: number;
  myAttempt: { attemptId: string; status: AttemptStatus; scorePercent: number | null } | null;
  createdAt: string;
}

/** Row shape for `GET /api/teacher/students` — the target-student picker for generating
 * a Vocabulary Check (T-038). No existing endpoint returned a plain student roster before
 * this batch. */
export interface TeacherStudentSummaryDTO {
  id: string;
  name: string;
  email: string;
}

// --- Admin: user management (T-070) -------------------------------------------------
// Admin-only endpoints under `/api/admin/users`. This is the ONLY place besides the seed
// script (`server/prisma/seed.ts`) that can create a `teacher` or `admin` account — see
// PROJECT_PLAN Assumption A1 (superseded)/A12.

export interface AdminUserDTO {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

/** Body for `GET /api/admin/users` query params (not a request body, but shared here for
 * symmetry with every other request-shape export) — `role` narrows by exact role,
 * `search` matches a case-insensitive substring of name OR email. Both optional; omitting
 * either returns every user. */
export interface AdminListUsersQuery {
  role?: UserRole;
  search?: string;
}

/** Body for `POST /api/admin/users`. Unlike public registration (`RegisterRequest`,
 * student-only), `role` is required and may be ANY of the three roles — this endpoint
 * (plus the seed script) is the only way to create a `teacher` or `admin` account. */
export interface CreateUserRequest {
  email: string;
  password: string;
  name: string;
  role: UserRole;
}

/** Body for `PATCH /api/admin/users/:userId` — name/email/role only; password changes go
 * through the dedicated reset-password endpoint below instead, so a plain profile edit
 * can never accidentally clear/change a password. */
export interface UpdateUserRequest {
  email: string;
  name: string;
  role: UserRole;
}

/** Body for `POST /api/admin/users/:userId/reset-password` — sets a new password
 * directly (no email-verification flow, no current-password confirmation needed since
 * only an admin can call this), per T-070's acceptance criteria. */
export interface ResetPasswordRequest {
  password: string;
}

// --- Admin: content oversight (T-071) ------------------------------------------------
// "Browse everything" admin-only list views under `/api/admin/*`, one per entity type
// the existing teacher-only list endpoints never needed to show ownership for. Each row
// links into the EXISTING teacher-side editor page (`/teacher/tests/:id`,
// `/teacher/flashcard-sets/:id`, `/teacher/grammar-topics/:id`) — see those routers'
// ownership-check helpers (`requireOwnedTest`/`requireOwnedFlashcardSet`/
// `requireOwnedGrammarTopic`, all extended via `isAdminOrOwner`) for why an admin caller
// can open ANY of these ids there, not just ones an admin account itself authored.

/** Extends `TestSummaryDTO` with the owning teacher's identity — the one thing the
 * teacher-only "my tests" list never needed to show (a teacher only ever sees their own
 * tests, so "owned by" is always implicit there). */
export interface AdminTestSummaryDTO extends TestSummaryDTO {
  teacherId: string;
  teacherName: string;
  teacherEmail: string;
}

export interface AdminFlashcardSetSummaryDTO extends FlashcardSetSummaryDTO {
  teacherId: string;
  teacherName: string;
  teacherEmail: string;
}

export interface AdminGrammarTopicSummaryDTO extends GrammarTopicSummaryDTO {
  teacherId: string;
  teacherName: string;
  teacherEmail: string;
}

// --- Admin: scores/attempts management (T-072) --------------------------------------
// Admin-only "browse every attempt in the system" list (`GET /api/admin/attempts`),
// unscoped to any one test/session — unlike the teacher-only per-session list
// (`GET /api/teacher/sessions/:sessionId/attempts`, T-014). Paginated since this can grow
// unbounded across the whole system. Viewing one attempt's full detail and editing its
// essay/Speaking manual grade deliberately reuse the EXISTING
// `GET /api/teacher/attempts/:attemptId` / `PATCH .../answers/:questionId/grade`
// endpoints as-is (already extended to accept an admin caller via `isAdminOrOwner`,
// T-071) — this DTO only covers the new admin-specific list + pagination wrapper.
// Deleting an attempt (`DELETE /api/admin/attempts/:attemptId`) is the one genuinely new
// capability, admin-only, with no prior UI anywhere else in the system.

export interface AdminAttemptListResponseDTO {
  attempts: AttemptSummaryDTO[];
  total: number;
  page: number;
  pageSize: number;
}

// --- Site-wide language setting (T-067, Phase 10 Vietnamese localization) -----------
// Mirrors `server/prisma/schema.prisma`'s `Settings`/`SiteLanguage` singleton. See that
// model's doc comment for the full read/write split: this task (T-067) only builds the
// read side; writing this setting is T-072's job (Admin Settings page), reusing this
// exact same `SiteLanguage` type for its request body.

/** The two supported UI languages (PROJECT_PLAN Assumption A13). Mirrors the Prisma
 * `SiteLanguage` enum — same "string union, Prisma enums can't be imported into client
 * code" convention as `UserRole`/`TestType`. */
export type SiteLanguage = 'en' | 'vi';

/** Response for `GET /api/settings` (T-067, PUBLIC — no auth required). This is the
 * single site-wide language every client, logged in or not, must render in — there is
 * deliberately no per-user override or public switcher anywhere in this contract (see
 * PROJECT_PLAN Guiding Principle 3). */
export interface SettingsDTO {
  language: SiteLanguage;
}

/** Body for `PATCH /api/admin/settings` (T-072, admin-only) — the only way to change the
 * site-wide language anywhere in the product; see `SettingsDTO`'s doc comment above for
 * why there's no other switcher. Validated server-side to be exactly `'en'` or `'vi'`. */
export interface UpdateSettingsRequest {
  language: SiteLanguage;
}

// --- Class-based organization (T-074, Phase 12) -------------------------------------
// Mirrors `server/prisma/schema.prisma`'s `Class` model — see that model's doc comment
// for the full design (PROJECT_PLAN Assumption A14) and the documented "block delete
// while students are assigned" choice. Content-to-class assignment (many-to-many join
// per content type) is explicitly T-075's job, not this task's.

/** Full shape as the OWNING teacher sees it (`/teacher/classes`, T-074) — includes the
 * live student count so the teacher can tell at a glance which classes are actually in
 * use before attempting to delete one (see `DELETE .../classes/:id`'s 409 behavior). */
export interface ClassDTO {
  id: string;
  name: string;
  studentCount: number;
  createdAt: string;
}

export interface CreateClassRequest {
  name: string;
}
export type UpdateClassRequest = CreateClassRequest;

/** Row shape for `GET /api/classes` (T-074, PUBLIC — no auth). Deliberately minimal, per
 * the acceptance criteria ("no sensitive data") — just enough for a prospective student
 * to tell classes with the same name apart across different teachers, or pick the right
 * teacher's section. Every class from every teacher is listed; there is no per-teacher
 * filtering at registration time since a new student doesn't have an account yet to scope
 * anything to. */
export interface PublicClassSummaryDTO {
  id: string;
  name: string;
  teacherName: string;
}

// --- Content-to-class assignment + "My Content" page (T-075, Phase 12) -------------
// A teacher authors a Test/FlashcardSet/GrammarTopic once (unchanged single-`teacherId`
// ownership, T-007/T-021/T-046) and separately ASSIGNS it to zero or more of that SAME
// teacher's `Class`es — see `schema.prisma`'s `Class.tests`/`.flashcardSets`/
// `.grammarTopics` doc comment for the full "assignment, not ownership" design this
// mirrors (PROJECT_PLAN Phase 12's "critical design correction").

/** Body for `PUT /api/teacher/tests/:id/classes` (and the equivalent flashcard-set/
 * Grammar-topic endpoints) — REPLACES the full set of assigned classIds for one item
 * (not a partial add/remove), same "send full current state" convention as
 * `ChoiceInput`/`FlashcardCardInput.synonyms`. Every id must reference a `Class` owned by
 * THIS ITEM's own teacher (checked server-side against `content.teacherId`, not
 * necessarily the caller's own id — see `contentClassAssignment.ts`'s doc comment for why
 * this matters for an admin caller managing another teacher's content) — assigning to a
 * different teacher's class is rejected with a clear 400, never silently ignored. */
export interface UpdateContentClassesRequest {
  classIds: string[];
}

/** Response for both the read (`GET .../:id/classes`) and replace (`PUT .../:id/classes`)
 * endpoints — the item's current, complete set of assigned classIds after the operation. */
export interface ContentClassAssignmentDTO {
  classIds: string[];
}

/** Discriminates one row of the consolidated "My Content" page (T-075) — the customer's
 * explicit request for ONE page covering all three content types, grouped, rather than
 * three separate pages. */
export type TeacherContentType = 'test' | 'flashcardSet' | 'grammarTopic';

/** One row on the "My Content" page: just enough to render a title and a row of
 * toggleable class chips — never the item's full nested content (sections/cards/
 * exercises), since assigning classes deliberately doesn't require opening the full
 * editor (T-075's explicit "without re-authoring" requirement). */
export interface TeacherContentItemDTO {
  id: string;
  type: TeacherContentType;
  title: string;
  classIds: string[];
}

/** Response for `GET /api/teacher/content` — every Test/FlashcardSet/GrammarTopic the
 * calling teacher has authored (grouped by type, one array each, matching
 * `TeacherContentType`), plus `classes` (this teacher's own classes, same shape as
 * `GET /api/teacher/classes`) so the page can render one chip per class without a second
 * round-trip. */
export interface TeacherContentResponseDTO {
  classes: ClassDTO[];
  tests: TeacherContentItemDTO[];
  flashcardSets: TeacherContentItemDTO[];
  grammarTopics: TeacherContentItemDTO[];
}
