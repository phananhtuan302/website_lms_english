/**
 * Public auth endpoints (T-005): student self-registration + login for both roles.
 */

import { Router } from 'express';
import type { AuthResponse, AuthUser, LoginRequest, RegisterRequest } from '@platform/shared';
import { prisma } from '../lib/prisma';
import { hashPassword, verifyPassword } from '../lib/password';
import { signToken } from '../lib/jwt';
import { requireAuth } from '../middleware/auth';

export const authRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function toAuthUser(user: { id: string; email: string; name: string; role: string }): AuthUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role as AuthUser['role'] };
}

/**
 * POST /api/auth/register
 *
 * Public self-registration. Per PROJECT_PLAN Assumption A1, this endpoint can ONLY
 * ever create a `student` account — there is no request shape that results in a
 * `teacher` account. If the caller sends a `role` field at all, we validate it's
 * exactly `"student"` and reject the request otherwise (rather than silently
 * swallowing it), so a client attempting `role: "teacher"` gets a clear, verifiable
 * rejection instead of an ambiguous silent downgrade.
 */
authRouter.post('/register', async (req, res) => {
  const body = req.body as Partial<RegisterRequest & { role?: unknown }>;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';

  if ('role' in body && body.role !== undefined && body.role !== 'student') {
    res.status(400).json({
      error:
        'Public registration only supports the student role. Teacher accounts are created via the seed script, not this endpoint.',
    });
    return;
  }

  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ error: 'A valid email address is required.' });
    return;
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
    return;
  }
  if (!name) {
    res.status(400).json({ error: 'Name is required.' });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, passwordHash, name, role: 'student' },
  });

  const authUser = toAuthUser(user);
  const response: AuthResponse = { token: signToken(authUser), user: authUser };
  res.status(201).json(response);
});

/**
 * POST /api/auth/login
 *
 * Works for both roles — the request shape doesn't distinguish teacher vs. student;
 * whichever role the matched account actually has is what gets encoded in the JWT.
 */
authRouter.post('/login', async (req, res) => {
  const body = req.body as Partial<LoginRequest>;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const passwordMatches = user ? await verifyPassword(password, user.passwordHash) : false;

  if (!user || !passwordMatches) {
    // Intentionally identical message for "no such user" and "wrong password" so the
    // response never leaks which emails are registered.
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const authUser = toAuthUser(user);
  const response: AuthResponse = { token: signToken(authUser), user: authUser };
  res.status(200).json(response);
});

/**
 * GET /api/auth/me
 *
 * Not required by T-005's acceptance criteria, but a near-zero-cost addition that
 * T-006 (client session handling) needs: a way to re-validate a stored token / re-fetch
 * the current user on app load without re-sending credentials.
 */
authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  res.status(200).json(toAuthUser(user));
});
