/**
 * Shared types & constants used by both /client and /server. This proves the npm-workspaces
 * linkage actually works end to end (see README.md) — it is not just an empty placeholder
 * package.
 */

/** The two user roles defined by TECH_STACK.md. Used by both auth (server) and route guards
 * (client) in later tasks; for T-001 it is exported to prove the shared-types pattern works. */
export type UserRole = 'teacher' | 'student';

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

/** Public-facing user shape returned by auth endpoints. Never includes `passwordHash`. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

/** Body for `POST /api/auth/register`. `role` is intentionally omitted — the public
 * registration endpoint always creates a `student` account (see PROJECT_PLAN
 * Assumption A1); there is no client-facing way to request `teacher` here. */
export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
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

/** Matches the Prisma `QuestionType` enum (T-007) — kept as a literal union here since
 * Prisma enums can't be imported into client code. */
export type QuestionType = 'multipleChoice' | 'trueFalse' | 'fillBlank';

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
}

export interface SectionDTO {
  id: string;
  title: string;
  order: number;
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
}

export interface UpdateTestRequest {
  title: string;
  timeLimitMinutes?: number | null;
  unitId?: string | null;
}

export interface CreateSectionRequest {
  title: string;
}

export interface UpdateSectionRequest {
  title: string;
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
  /** Required (non-empty) for multipleChoice/trueFalse, ignored for fillBlank. */
  choices?: ChoiceInput[];
  /** Required (non-empty) for fillBlank, ignored otherwise. */
  acceptedAnswers?: string[];
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

export interface TestSessionDTO {
  id: string;
  testId: string;
  manualCode: string;
  status: SessionStatus;
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
  /** Shuffled per the variant; empty for `fillBlank`. Never carries `isCorrect`. */
  choices: Array<{ id: string; text: string }>;
}

export interface AttemptSectionDTO {
  id: string;
  title: string;
  order: number;
  questions: AttemptQuestionDTO[];
}

/** The student's own previously-saved answer for one question — used to restore
 * in-progress work after a page refresh (T-012). */
export interface AttemptAnswerDTO {
  questionId: string;
  selectedChoiceId: string | null;
  textAnswer: string | null;
}

/** Response for `GET /api/attempts/:attemptId` — everything the take-test runtime needs
 * to render the assigned variant and restore any answers already saved. `sessionId`
 * (T-016) is what the take-test runtime needs to join that session's Socket.IO
 * teacher-monitor room via `student:join` — see `client/src/pages/TakeTestPage.tsx`. */
export interface AttemptDetailDTO {
  id: string;
  sessionId: string;
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
}

/** Response for `GET /api/attempts/:attemptId/result` (student, own attempt only) and
 * `GET /api/teacher/attempts/:attemptId` (teacher, own test only). */
export interface AttemptResultDTO {
  attemptId: string;
  testId: string;
  testTitle: string;
  studentId: string;
  studentName: string;
  status: AttemptStatus;
  startedAt: string;
  submittedAt: string | null;
  correctCount: number | null;
  totalCount: number | null;
  scorePercent: number | null;
  /** Total time taken in whole seconds (T-017), `null` until submitted. */
  timeTakenSeconds: number | null;
  questions: AttemptResultQuestionDTO[];
}

/** Row shape for a student's own "my attempts" list (student dashboard) and for a
 * teacher's per-session attempt list (T-014). */
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
