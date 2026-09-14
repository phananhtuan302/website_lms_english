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
