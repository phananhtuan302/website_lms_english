/**
 * JWT sign/verify helpers (T-005).
 *
 * A single place that knows the token's shape and secret, so route handlers and
 * middleware never touch `jsonwebtoken` directly and can't accidentally sign a token
 * with a different payload shape than the middleware expects to read.
 */

import jwt from 'jsonwebtoken';
import type { AuthTokenPayload, AuthUser } from '@platform/shared';
import { loadEnv } from '../config/env';

const env = loadEnv();

// Local dev secret only — see server/.env.example. 7 days is generous for a
// local-dev/demo tool with no refresh-token flow; revisit if this ever needs to run
// somewhere session length actually matters.
const TOKEN_TTL = '7d';

export function signToken(user: AuthUser): string {
  const payload: AuthTokenPayload = {
    sub: user.id,
    role: user.role,
    email: user.email,
  };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: TOKEN_TTL });
}

/** Throws (via jsonwebtoken) if the token is missing, malformed, expired, or signed
 * with a different secret. Callers (the auth middleware) are expected to catch this. */
export function verifyToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
}
