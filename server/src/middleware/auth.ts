/**
 * Auth middleware (T-005): verifies the JWT on protected routes and enforces
 * role-based access (teacher-only / student-only routes).
 */

import type { NextFunction, Request, Response } from 'express';
import type { AuthTokenPayload, UserRole } from '@platform/shared';
import { verifyToken } from '../lib/jwt';

// Augment Express's Request type so `req.user` is typed everywhere it's read, instead
// of every handler re-casting `req` to `any`.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

/**
 * Requires a valid `Authorization: Bearer <token>` header. On success, attaches the
 * decoded payload to `req.user` and calls `next()`. On failure, responds 401 — never
 * lets the request continue unauthenticated.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.header('authorization') ?? req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;

  if (!token) {
    res.status(401).json({ error: 'Authentication required. Missing bearer token.' });
    return;
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
}

/**
 * Must run after `requireAuth`. Rejects with 403 if `req.user.role` is not one of the
 * allowed roles — this is what makes a route "teacher-only" or "student-only" per
 * T-005's acceptance criteria.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      // Defensive: only happens if a route uses requireRole without requireAuth first.
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `Access denied. This endpoint requires role: ${allowedRoles.join(' or ')}.`,
      });
      return;
    }

    next();
  };
}
