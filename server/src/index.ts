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
import { attemptsRouter } from './routes/attempts.routes';
import { curriculumRouter } from './routes/curriculum.routes';
import { attachSessionRealtime } from './realtime/sessionRealtime';

// Validates required env vars (DATABASE_URL, JWT_SECRET) and exits with a clear
// message if any are missing, before anything else in the app starts (T-003).
const env = loadEnv();

const PORT = env.PORT;
const CLIENT_ORIGIN = env.CLIENT_ORIGIN;

const app = express();

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

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

// Auth endpoints (T-005): student self-registration + login for both roles.
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

// Student-facing take-test runtime (T-012), auto-grading on submit (T-013), and the
// student's own result view (T-014). Joining itself is the route above, not here.
app.use('/api/attempts', attemptsRouter);

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
  cors: { origin: CLIENT_ORIGIN },
});

attachSessionRealtime(io);

httpServer.listen(PORT, () => {
  console.log(`[${APP_NAME}] server listening on http://localhost:${PORT}`);
  console.log(`[${APP_NAME}] health check: http://localhost:${PORT}${HEALTH_CHECK_PATH}`);
});
