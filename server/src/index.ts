import 'dotenv/config';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { APP_NAME, HEALTH_CHECK_PATH, type HealthCheckResponse } from '@platform/shared';
import { loadEnv } from './config/env';
import { authRouter } from './routes/auth.routes';
import { demoRouter } from './routes/demo.routes';
import { teacherTestsRouter } from './routes/teacherTests.routes';
import { teacherSessionsRouter } from './routes/teacherSessions.routes';
import { sessionsRouter } from './routes/sessions.routes';
import { practiceRouter } from './routes/practice.routes';
import { attemptsRouter } from './routes/attempts.routes';
import { curriculumRouter } from './routes/curriculum.routes';
import { teacherFlashcardsRouter } from './routes/teacherFlashcards.routes';
import { studentFlashcardsRouter } from './routes/studentFlashcards.routes';
import { teacherReportsRouter } from './routes/teacherReports.routes';
import { teacherVocabProgressRouter } from './routes/teacherVocabProgress.routes';
import { vocabLeaderboardRouter } from './routes/vocabLeaderboard.routes';
import { teacherGrammarRouter } from './routes/teacherGrammar.routes';
import { studentGrammarRouter } from './routes/studentGrammar.routes';
import { teacherUnitTestsRouter } from './routes/teacherUnitTests.routes';
import { teacherVocabularyCheckRouter } from './routes/teacherVocabularyCheck.routes';
import { studentAssignedTestsRouter } from './routes/studentAssignedTests.routes';
import { studentGradesRouter } from './routes/studentGrades.routes';
import { unitLeaderboardRouter } from './routes/unitLeaderboard.routes';
import { settingsRouter } from './routes/settings.routes';
import { adminUsersRouter } from './routes/adminUsers.routes';
import { adminContentRouter } from './routes/adminContent.routes';
import { adminAttemptsRouter } from './routes/adminAttempts.routes';
import { adminSettingsRouter } from './routes/adminSettings.routes';
import { teacherClassesRouter } from './routes/teacherClasses.routes';
import { classesRouter } from './routes/classes.routes';
import { teacherContentRouter } from './routes/teacherContent.routes';
import { teacherClassAssignmentsRouter } from './routes/teacherClassAssignments.routes';
import { teacherClassGradebookRouter } from './routes/teacherClassGradebook.routes';
import { teacherClassOverviewRouter } from './routes/teacherClassOverview.routes';
import { teacherClassRosterRouter } from './routes/teacherClassRoster.routes';
import {
  studentAnnouncementsRouter,
  teacherClassAnnouncementsRouter,
} from './routes/classAnnouncements.routes';
import { studentNotificationsRouter } from './routes/studentNotifications.routes';
import { teacherScoringRouter } from './routes/teacherScoring.routes';
import { teacherGradesOverviewRouter } from './routes/teacherGradesOverview.routes';
import { attachSessionRealtime } from './realtime/sessionRealtime';

// Validates required env vars (DATABASE_URL, JWT_SECRET) and exits with a clear
// message if any are missing, before anything else in the app starts (T-003).
const env = loadEnv();

const PORT = env.PORT;
const CLIENT_ORIGIN = env.CLIENT_ORIGIN;

const app = express();

app.use(
  cors({
    origin: [
      CLIENT_ORIGIN,
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'https://dash.nhatanh97.xyz',
      'https://api-dash.nhatanh97.xyz',
    ],
    credentials: true,
  }),
);
// Raised from Express's 100kb default (T-052–T-054): Speaking answers submit a
// base64-encoded audio recording as part of a plain JSON body (see
// `attempts.routes.ts`'s module doc comment for the documented "no real object storage
// yet" convention). Base64 inflates raw bytes ~33%, and `allowedResponseSeconds` is
// capped at 300s server-side (`teacherTests.routes.ts`), so 20mb comfortably covers a
// worst-case voice recording with headroom, without opening the door to arbitrarily
// large uploads.
app.use(express.json({ limit: '20mb' }));

// Minimal health-check endpoint. Path + response shape come from /shared so the client can
// import the exact same contract instead of hardcoding it a second time.
app.get(HEALTH_CHECK_PATH, (_req, res) => {
  const body: HealthCheckResponse = {
    status: 'ok',
    service: APP_NAME,
    timestamp: new Date().toISOString(),
  };
  res.status(200).json(body);
});

// Public site-wide settings (T-067, Phase 10 localization): currently just the global
// UI language, readable by anyone — including a logged-out visitor — with no auth
// header at all. See `settings.routes.ts`'s module doc comment for the documented
// write-side (Admin-only, T-072) this DB shape is ready for.
app.use('/api/settings', settingsRouter);

// Public class list (T-074, Phase 12): every class from every teacher, no auth — the
// registration form's "select your class" dropdown reads this before an account exists.
app.use('/api/classes', classesRouter);

// Auth endpoints (T-005): student self-registration + login for both roles. Registration
// now requires a `classId` (T-074) — see `auth.routes.ts`'s module doc comment.
app.use('/api/auth', authRouter);

// Placeholder protected routes proving the role-based middleware works (T-005) — see
// routes/demo.routes.ts for why these exist and when to remove them.
app.use('/api/demo', demoRouter);

// Teacher-only test authoring (T-008) + variant generation (T-009) + QR-join session
// management (T-010). All teacher-only routes; ownership of a given test is enforced
// inside the router, not by middleware, since it needs to inspect the id in the path.
app.use('/api/teacher', teacherTestsRouter);
app.use('/api/teacher', teacherSessionsRouter);

// Teacher-only curriculum tagging CRUD (T-018): Unit + Academic Period, both global
// entities (see curriculum.routes.ts's doc comment for why). Independent of test
// authoring/sessions above except that `Test.unitId` references a `Unit` here.
app.use('/api/teacher', curriculumRouter);

// Public join-token lookup (T-010) plus the real, authenticated join (T-011): creates
// the student's `Attempt` and auto-assigns a variant. See sessions.routes.ts.
app.use('/api/sessions', sessionsRouter);

// Student-facing home self-practice (T-040): list every test and start/resume a
// standalone practice attempt for one, outside any teacher-run QR/live session.
app.use('/api/tests', practiceRouter);

// Student-facing take-test runtime (T-012), auto-grading on submit (T-013), and the
// student's own result view (T-014). Joining itself is the route above, not here.
app.use('/api/attempts', attemptsRouter);

// Teacher-only flashcard-set/vocabulary-word authoring (T-022). Same mount point as
// `teacherTestsRouter`/`curriculumRouter` above — all teacher-only routes live under
// `/api/teacher`, disambiguated by their own path prefixes.
app.use('/api/teacher', teacherFlashcardsRouter);

// Student-facing flashcard study/review mode (T-023) and vocabulary exercises
// (T-024–T-027). See `studentFlashcards.routes.ts`'s module doc comment for why these
// are NOT scoped under `/api/teacher` or ownership-checked per teacher.
app.use('/api/flashcard-sets', studentFlashcardsRouter);

// Teacher-only reporting engine v1 (T-019): multi-granularity aggregate stats
// (test/unit/week/month/quarter/semester/year), all served by the single shared
// `computeReport` engine in `lib/reporting.ts`. Same `/api/teacher` mount point as the
// other teacher-only routers above.
app.use('/api/teacher', teacherReportsRouter);

// Teacher-only vocabulary progress (T-030) + monthly/yearly ranking (T-032/T-033). Same
// `/api/teacher` mount point as every other teacher-only router above.
app.use('/api/teacher', teacherVocabProgressRouter);

// Vocabulary leaderboard (T-031) — the one vocab-progress endpoint visible to BOTH
// roles, so it gets its own top-level mount point instead of `/api/teacher` or
// `/api/flashcard-sets` (which is student-only, see `studentFlashcards.routes.ts`).
app.use('/api/vocab-leaderboard', vocabLeaderboardRouter);

// Teacher-only Grammar-topic authoring (T-046/T-047) + practice-exercise authoring
// (T-048) + Grammar reporting (T-050). Same `/api/teacher` mount point as every other
// teacher-only router above.
app.use('/api/teacher', teacherGrammarRouter);

// Student-facing Grammar topic browsing/reading (T-047), practice exercises (T-048),
// and the Grammar game (T-049). Same "not ownership-scoped, no enrollment concept"
// reasoning as `/api/flashcard-sets` above.
app.use('/api/grammar-topics', studentGrammarRouter);

// Teacher-only Unit Test management (T-036: grouped-by-Unit listing) + Vocabulary Check
// generation (T-038: target-student picker + generate + list). Same `/api/teacher` mount
// point as every other teacher-only router above, disambiguated by their own
// `unit-tests`/`vocabulary-checks`/`students` path segments.
app.use('/api/teacher', teacherUnitTestsRouter);
app.use('/api/teacher', teacherVocabularyCheckRouter);

// Student-facing "tests relevant to me" views: Unit Tests (T-036) + assigned Vocabulary
// Checks (T-038). A fresh top-level mount point (`/api/student`), distinct from every
// other prefix above — see `studentAssignedTests.routes.ts`'s module doc comment.
app.use('/api/student', studentAssignedTestsRouter);

// Student "Điểm của tôi" (T-110, Phase 14): the caller's own grades per semester, scores
// withheld until published. Shares the `/api/student` prefix (student-only).
app.use('/api/student', studentGradesRouter);

// Unit Test report & leaderboard (T-037) — visible to BOTH roles, built on T-019's
// `computeReport` engine. Own top-level mount point (`/api/units`), distinct from
// `/api/teacher/units` (curriculum Unit CRUD, T-018) — see that router's doc comment.
app.use('/api/units', unitLeaderboardRouter);

// Admin-only user management (T-070) + content-oversight "browse everything" list views
// (T-071). Own top-level mount point (`/api/admin`), distinct from `/api/teacher` — the
// actual per-item view/edit/delete for Tests/Flashcard sets/Grammar topics reuses the
// EXISTING `/api/teacher/...` routers above, which now also accept an admin caller (see
// each router's own doc comment for the `requireRole('teacher', 'admin')` + ownership-
// check extension) — only the admin-only roster + browse-all lists live here.
app.use('/api/admin', adminUsersRouter);
app.use('/api/admin', adminContentRouter);

// Admin-only scores/attempts management (T-072a: system-wide attempt browse + delete —
// viewing/editing one attempt's detail reuses the EXISTING `/api/teacher/attempts/...`
// routes above, already admin-accessible) and the site-wide language Settings write
// endpoint (T-072b, completing the read/write split `settings.routes.ts` documented).
app.use('/api/admin', adminAttemptsRouter);
app.use('/api/admin', adminSettingsRouter);

// Teacher-only class management (T-074, Phase 12): CRUD for a teacher's own `Class`
// rows. Same `/api/teacher` mount point as every other teacher-only router above,
// disambiguated by its own `classes` path segment. The PUBLIC cross-teacher list for
// registration is the separate `/api/classes` mount above, not this router.
app.use('/api/teacher', teacherClassesRouter);

// Consolidated "My Content" listing (T-075, Phase 12): every Test/FlashcardSet/
// GrammarTopic the calling teacher has authored, grouped by type, plus their own
// classes — everything the `/teacher/content` page needs to render its per-item
// class-assignment chips. The actual assignment WRITES live on each content type's own
// router above (`PUT .../:id/classes`), not here. Same `/api/teacher` mount point as
// every other teacher-only router.
app.use('/api/teacher', teacherContentRouter);

// Class workspace "Bài tập" tab read model (T-103, Phase 13): everything currently
// assigned to one class for its current semester, across all three content types. Read-only;
// the writes stay on each content type's own `PUT .../:id/classes` + the test schedule route.
app.use('/api/teacher', teacherClassAssignmentsRouter);

// Class workspace "Học sinh" roster + "Điểm số" gradebook read models (T-104, Phase 13):
// best-attempt grid of students × the class's current-semester tests. Read-only.
app.use('/api/teacher', teacherClassGradebookRouter);

// Class workspace "Tổng quan" attention dashboard read model (T-107, Phase 14): closing-soon,
// awaiting-grading, not-submitted and recent-activity lists for one class. Read-only.
app.use('/api/teacher', teacherClassOverviewRouter);

// Add students to a class in bulk (T-111, Phase 14): the "Thêm học sinh" dialog's endpoint —
// creates student accounts (form or Excel roster import), one result per row.
app.use('/api/teacher', teacherClassRosterRouter);

// Class announcements "Thông báo lớp" (T-108, Phase 14): the owning teacher/admin manages a
// class's announcements; a student reads only their own class's (`/api/student/announcements`).
app.use('/api/teacher', teacherClassAnnouncementsRouter);
app.use('/api/student', studentAnnouncementsRouter);

// Student reminders (T-109, Phase 14): the notification bell (`/api/student/notifications`) and
// the "Lịch" agenda (`/api/student/calendar`) — both derived on request, nothing stored.
app.use('/api/student', studentNotificationsRouter);

// Scoring & grading helpers (Phase 15, cross-class widened in Phase 17): "next ungraded attempt"
// for the grading screen and the per-test grading status behind the "let students see scores"
// confirmation. Read-only.
app.use('/api/teacher', teacherScoringRouter);

// Teacher-level score comparison across classes (Phase 17, T-118B): one row per class with its
// average score, reusing the class gradebook's own computation. Read-only.
app.use('/api/teacher', teacherGradesOverviewRouter);

// Catch-all for any API path that doesn't match a route above. Registered after every
// route but before the error middleware. Not strictly required by T-061 (that task is
// about *thrown errors*, not "no route matched"), but it's a one-line fix for the same
// underlying symptom — Express's default behavior here is also an HTML page
// ("Cannot GET /whatever") — so it's included for consistency: this API never returns
// HTML, full stop.
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

/**
 * Global JSON error-handling middleware (T-061).
 *
 * Must be registered with exactly 4 parameters (Express identifies error-handling
 * middleware by arity) and after every other `app.use`/route — Express walks forward
 * through the middleware stack looking for the next error handler whenever any
 * middleware calls `next(err)` or throws synchronously, so "registered last" is what
 * makes this the catch-all for the whole app, not where it's mounted.
 *
 * Covers two kinds of failures the QA finding flagged:
 * 1. Malformed-JSON body-parser errors — `express.json()` (registered above) calls
 *    `next(err)` synchronously when `req.body` isn't valid JSON, before any route
 *    handler runs. That error lands here directly.
 * 2. Any other unhandled error from a route handler — a synchronous `throw` (Express
 *    catches these into the error-handling chain automatically) or an async rejection
 *    (only reaches here because every async handler in this codebase is wrapped with
 *    `asyncHandler`, see `lib/asyncHandler.ts`).
 *
 * In both cases the response is always clean JSON (`{ "error": "..." }`), never an
 * HTML page or a raw stack trace — and that's true regardless of `NODE_ENV`: a 500's
 * message is always the same generic string, never `err.message`/`err.stack`, because
 * an unexpected server error's real message can leak internals (file paths, query
 * fragments, library internals) to the client no matter what environment it's running
 * in. The real error is still logged server-side via `console.error` for debugging.
 */
app.use((err: unknown, req: Request, res: Response, next: NextFunction): void => {
  console.error(`[error] ${req.method} ${req.originalUrl}:`, err);

  // If a response has already started streaming, we can't send a fresh JSON body —
  // hand off to Express's default handler, which just terminates the connection.
  if (res.headersSent) {
    next(err);
    return;
  }

  const asRecord = typeof err === 'object' && err !== null ? (err as Record<string, unknown>) : {};
  const rawStatus = asRecord.status ?? asRecord.statusCode;
  const status =
    typeof rawStatus === 'number' && rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500;

  // `express.json()` reports malformed JSON as a SyntaxError with a `body` property
  // (a body-parser convention) and status 400. Give it a clear, specific message
  // rather than whatever raw parser text it carries.
  const isMalformedJson = err instanceof SyntaxError && 'body' in asRecord && status === 400;

  const message = isMalformedJson
    ? 'Malformed JSON in request body.'
    : status < 500 && typeof asRecord.message === 'string' && asRecord.message.trim() !== ''
      ? asRecord.message
      : status < 500
        ? 'Request could not be processed.'
        : // 500s: never forward err.message/err.stack to the client, in any environment.
          'Internal server error.';

  res.status(status).json({ error: message });
});

// Socket.IO is attached to the same underlying HTTP server as Express (not a separate
// port). T-015 wires up the actual realtime session infrastructure (auth handshake,
// teacher-monitor rooms, student progress relay) — see realtime/sessionRealtime.ts.
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: [
      CLIENT_ORIGIN,
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'https://dash.nhatanh97.xyz',
      'https://api-dash.nhatanh97.xyz',
    ],
    credentials: true,
  },
});

attachSessionRealtime(io);

httpServer.listen(PORT, () => {
  console.log(`[${APP_NAME}] server listening on http://localhost:${PORT}`);
  console.log(`[${APP_NAME}] health check: http://localhost:${PORT}${HEALTH_CHECK_PATH}`);
});
