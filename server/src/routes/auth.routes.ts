/**
 * Public auth endpoints (T-005): student self-registration + login for both roles.
 *
 * T-074 (Phase 12): registration now requires a `classId` (Assumption A14 — a student
 * picks exactly one class at registration and is permanently scoped to it). `toAuthUser`
 * carries the resolved `classId`/`className` through register/login/`/me` alike so the
 * client always has the student's class name available without a second round-trip.
 */

import { Router } from 'express';
import type { AuthResponse, AuthUser, LoginRequest, RegisterRequest, UpdateAvatarRequest, UpdateProfileRequest } from '@platform/shared';
import { prisma } from '../lib/prisma';
import { hashPassword, verifyPassword } from '../lib/password';
import { signToken } from '../lib/jwt';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';

export const authRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

/** Exported so other join flows that issue their own JWT — currently the guest-join
 * endpoints in `sessions.routes.ts` (2026-10, `TestSession.allowGuests`) — build the
 * exact same `AuthUser` shape rather than duplicating this mapping. */
export function toAuthUser(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  classId: string | null;
  class?: { name: string } | null;
  avatarUrl: string | null;
  firstName?: string | null;
  lastName?: string | null;
  birthday?: Date | null;
  sex?: string | null;
  phoneNumber?: string | null;
  isGuest: boolean;
}): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as AuthUser['role'],
    classId: user.classId,
    className: user.class?.name ?? null,
    avatarUrl: user.avatarUrl,
    firstName: user.firstName,
    lastName: user.lastName,
    birthday: user.birthday ? user.birthday.toISOString().split('T')[0] : null,
    sex: user.sex,
    phoneNumber: user.phoneNumber,
    isGuest: user.isGuest,
  };
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
authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<RegisterRequest & { role?: unknown }>;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const classId = typeof body.classId === 'string' ? body.classId.trim() : '';

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
      res
        .status(400)
        .json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
      return;
    }
    if (!name) {
      res.status(400).json({ error: 'Name is required.' });
      return;
    }

    // T-074 (Assumption A14): a class must be explicitly selected — no silent default,
    // per the acceptance criteria "clear validation error, not a silent default".
    if (!classId) {
      res.status(400).json({ error: 'Please select your class.' });
      return;
    }
    const selectedClass = await prisma.class.findUnique({ where: { id: classId } });
    if (!selectedClass) {
      res
        .status(400)
        .json({ error: 'The selected class does not exist. Please choose a class from the list.' });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, passwordHash, name, role: 'student', classId: selectedClass.id },
    });

    const authUser = toAuthUser({ ...user, class: { name: selectedClass.name } });
    const response: AuthResponse = { token: signToken(authUser), user: authUser };
    res.status(201).json(response);
  }),
);

/**
 * POST /api/auth/login
 *
 * Works for both roles — the request shape doesn't distinguish teacher vs. student;
 * whichever role the matched account actually has is what gets encoded in the JWT.
 */
authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<LoginRequest>;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { class: { select: { name: true } } },
    });
    const passwordMatches = user ? await verifyPassword(password, user.passwordHash) : false;

    if (!user || !passwordMatches) {
      // Intentionally identical message for "no such user" and "wrong password" so the
      // response never leaks which emails are registered.
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ error: 'Tài khoản của bạn đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.' });
      return;
    }

    const authUser = toAuthUser(user);
    const response: AuthResponse = { token: signToken(authUser), user: authUser };
    res.status(200).json(response);
  }),
);

/**
 * GET /api/auth/me
 *
 * Not required by T-005's acceptance criteria, but a near-zero-cost addition that
 * T-006 (client session handling) needs: a way to re-validate a stored token / re-fetch
 * the current user on app load without re-sending credentials.
 */
authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      include: { class: { select: { name: true } } },
    });
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    res.status(200).json(toAuthUser(user));
  }),
);

// A resized/JPEG-compressed 160x160 avatar (`AvatarUpload.tsx`'s client-side canvas step)
// comes in well under this — it's a ceiling against a caller sending something uncompressed,
// not a target size.
const MAX_AVATAR_DATA_URL_LENGTH = 400_000;
const AVATAR_DATA_URL_RE = /^data:image\/(png|jpe?g|webp);base64,/;

/**
 * PATCH /api/auth/me/avatar (2026-10 "luxury" redesign) — self-service only; there is no
 * endpoint for setting someone ELSE's avatar (not even for an admin — `AdminUserDTO` exposes
 * `avatarUrl` read-only). `avatarUrl` is stored as-is (a `data:image/...;base64,...` string,
 * already resized/compressed client-side) or `null` to remove the current photo.
 */
authRouter.patch(
  '/me/avatar',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<UpdateAvatarRequest>;
    const avatarUrl = body.avatarUrl === null ? null : body.avatarUrl;

    if (avatarUrl !== null) {
      if (typeof avatarUrl !== 'string' || !AVATAR_DATA_URL_RE.test(avatarUrl)) {
        res.status(400).json({ error: 'avatarUrl must be a data:image/(png|jpeg|webp) URL, or null.' });
        return;
      }
      if (avatarUrl.length > MAX_AVATAR_DATA_URL_LENGTH) {
        res.status(400).json({ error: 'Image is too large. Please choose a smaller photo.' });
        return;
      }
    }

    const user = await prisma.user.update({
      where: { id: req.user!.sub },
      data: { avatarUrl },
      include: { class: { select: { name: true } } },
    });

    res.status(200).json(toAuthUser(user));
  }),
);

/**
 * PATCH /api/auth/me
 * Update user's own profile (name, personal info, and optionally change password).
 */
authRouter.patch(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<UpdateProfileRequest>;
    const userId = req.user!.sub;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { class: { select: { name: true } } },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const dataToUpdate: {
      name?: string;
      firstName?: string | null;
      lastName?: string | null;
      birthday?: Date | null;
      sex?: string | null;
      phoneNumber?: string | null;
      passwordHash?: string;
    } = {};

    if (typeof body.name === 'string') {
      const trimmedName = body.name.trim();
      if (!trimmedName) {
        res.status(400).json({ error: 'Họ và tên không được để trống.' });
        return;
      }
      dataToUpdate.name = trimmedName;
    }

    if (body.firstName !== undefined) {
      dataToUpdate.firstName = body.firstName ? body.firstName.trim() : null;
    }
    if (body.lastName !== undefined) {
      dataToUpdate.lastName = body.lastName ? body.lastName.trim() : null;
    }
    if (body.sex !== undefined) {
      dataToUpdate.sex = body.sex ? body.sex.trim() : null;
    }
    if (body.phoneNumber !== undefined) {
      dataToUpdate.phoneNumber = body.phoneNumber ? body.phoneNumber.trim() : null;
    }
    if (body.birthday !== undefined) {
      if (!body.birthday) {
        dataToUpdate.birthday = null;
      } else {
        const d = new Date(body.birthday);
        if (isNaN(d.getTime())) {
          res.status(400).json({ error: 'Ngày sinh không hợp lệ.' });
          return;
        }
        dataToUpdate.birthday = d;
      }
    }

    if (body.newPassword) {
      if (!body.currentPassword) {
        res.status(400).json({ error: 'Vui lòng nhập mật khẩu hiện tại để đổi mật khẩu mới.' });
        return;
      }

      const isCurrentValid = await verifyPassword(body.currentPassword, user.passwordHash);
      if (!isCurrentValid) {
        res.status(400).json({ error: 'Mật khẩu hiện tại không chính xác.' });
        return;
      }

      if (body.newPassword.length < 6) {
        res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự.' });
        return;
      }

      dataToUpdate.passwordHash = await hashPassword(body.newPassword);
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: dataToUpdate,
      include: { class: { select: { name: true } } },
    });

    res.status(200).json(toAuthUser(updatedUser));
  }),
);

