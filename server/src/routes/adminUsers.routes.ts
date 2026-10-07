/**
 * Admin-only user management (T-070): list every user (any role) with search/filter,
 * create a user of ANY role, edit name/email/role, reset a password directly, and delete
 * a user. Per PROJECT_PLAN Assumption A12, this (plus the seed script) is the ONLY place
 * in the system that can create a `teacher` or `admin` account — public registration
 * (`auth.routes.ts`) only ever creates `student` accounts.
 *
 * Every route here is admin-only (`requireRole('admin')` — a teacher or student token
 * gets 403). There is no per-resource ownership check to extend (unlike
 * `teacherTests.routes.ts`/etc.) since `User` itself has no owner other than the account
 * holder — admin's authority here is unconditional, per Assumption A12's "full CRUD over
 * every User" framing.
 */

import { Router } from 'express';
import type {
  AdminUserDTO,
  CreateUserRequest,
  ResetPasswordRequest,
  UpdateUserRequest,
  UserRole,
} from '@platform/shared';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { hashPassword } from '../lib/password';

export const adminUsersRouter = Router();

adminUsersRouter.use(requireAuth, requireRole('admin'));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const ROLES: UserRole[] = ['teacher', 'student', 'admin'];

function toAdminUserDTO(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: Date;
  avatarUrl: string | null;
}): AdminUserDTO {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as UserRole,
    createdAt: user.createdAt.toISOString(),
    avatarUrl: user.avatarUrl,
  };
}

function validateRole(value: unknown): string | null {
  if (typeof value !== 'string' || !ROLES.includes(value as UserRole)) {
    return `role must be one of: ${ROLES.join(', ')}.`;
  }
  return null;
}

/** GET /api/admin/users?role=&search= — every user, optionally narrowed by exact role
 * and/or a case-insensitive substring match on name OR email. Both filters are optional
 * and independent; omitting both returns the full roster. */
adminUsersRouter.get(
  '/users',
  asyncHandler(async (req, res) => {
    const roleRaw = req.query.role;
    const searchRaw = req.query.search;

    if (roleRaw !== undefined && (typeof roleRaw !== 'string' || !ROLES.includes(roleRaw as UserRole))) {
      res.status(400).json({ error: `role must be one of: ${ROLES.join(', ')}.` });
      return;
    }
    const search = typeof searchRaw === 'string' ? searchRaw.trim() : '';

    const users = await prisma.user.findMany({
      where: {
        ...(roleRaw ? { role: roleRaw as UserRole } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json(users.map(toAdminUserDTO));
  }),
);

/** POST /api/admin/users — create a user of ANY role. */
adminUsersRouter.post(
  '/users',
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<CreateUserRequest>;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';

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
    const roleError = validateRole(body.role);
    if (roleError) {
      res.status(400).json({ error: roleError });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, passwordHash, name, role: body.role as UserRole },
    });

    res.status(201).json(toAdminUserDTO(user));
  }),
);

/** PATCH /api/admin/users/:userId — edit name/email/role. Password changes go through
 * the dedicated reset-password endpoint below, not this one. */
adminUsersRouter.patch(
  '/users/:userId',
  asyncHandler(async (req, res) => {
    const target = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const body = req.body as Partial<UpdateUserRequest>;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';

    if (!EMAIL_RE.test(email)) {
      res.status(400).json({ error: 'A valid email address is required.' });
      return;
    }
    if (!name) {
      res.status(400).json({ error: 'Name is required.' });
      return;
    }
    const roleError = validateRole(body.role);
    if (roleError) {
      res.status(400).json({ error: roleError });
      return;
    }

    if (email !== target.email) {
      const emailTaken = await prisma.user.findUnique({ where: { email } });
      if (emailTaken) {
        res.status(409).json({ error: 'An account with this email already exists.' });
        return;
      }
    }

    // Documented choice (genuine ambiguity, resolved rather than blocked on the
    // customer): demoting the LAST remaining admin (including oneself) would lock every
    // admin out of this panel with no way back in short of a direct DB edit — a strictly
    // worse failure mode than the analogous "can't delete the last admin" guard on the
    // delete route below, so the same guard applies here too.
    if (target.role === 'admin' && body.role !== 'admin') {
      const adminCount = await prisma.user.count({ where: { role: 'admin' } });
      if (adminCount <= 1) {
        res.status(409).json({ error: 'Cannot change the role of the last remaining admin account.' });
        return;
      }
    }

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { email, name, role: body.role as UserRole },
    });

    res.status(200).json(toAdminUserDTO(updated));
  }),
);

/** POST /api/admin/users/:userId/reset-password — sets a new password directly, no
 * email-verification flow and no current-password confirmation (only an admin can call
 * this at all). */
adminUsersRouter.post(
  '/users/:userId/reset-password',
  asyncHandler(async (req, res) => {
    const target = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const body = req.body as Partial<ResetPasswordRequest>;
    const password = typeof body.password === 'string' ? body.password : '';
    if (password.length < MIN_PASSWORD_LENGTH) {
      res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
      return;
    }

    const passwordHash = await hashPassword(password);
    await prisma.user.update({ where: { id: target.id }, data: { passwordHash } });

    res.status(200).json({ ok: true });
  }),
);

/** DELETE /api/admin/users/:userId — cascades exactly per the existing schema relations
 * (e.g. deleting a teacher cascades their tests/sessions/etc. via `onDelete: Cascade`;
 * deleting a student cascades their attempts/progress) — no custom cleanup logic, per
 * T-070's acceptance criteria.
 *
 * Documented choice (genuine ambiguity, resolved rather than blocked on the customer):
 * an admin may not delete their OWN account (prevents an accidental total lockout with
 * no other admin able to restore access) and may not delete the LAST remaining admin
 * account for the same reason. Neither restriction is in the acceptance criteria
 * verbatim, but both are the only reasonable reading of "manage the admin role safely"
 * given there is exactly one seeded admin and no recovery flow (e.g. no "forgot password"
 * email) in this build. */
adminUsersRouter.delete(
  '/users/:userId',
  asyncHandler(async (req, res) => {
    const target = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    if (target.id === req.user!.sub) {
      res.status(409).json({ error: 'You cannot delete your own account while logged in as it.' });
      return;
    }

    if (target.role === 'admin') {
      const adminCount = await prisma.user.count({ where: { role: 'admin' } });
      if (adminCount <= 1) {
        res.status(409).json({ error: 'Cannot delete the last remaining admin account.' });
        return;
      }
    }

    await prisma.user.delete({ where: { id: target.id } });
    res.status(204).send();
  }),
);
