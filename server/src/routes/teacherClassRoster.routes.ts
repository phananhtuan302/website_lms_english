/**
 * Add students to a class in bulk (T-111, Phase 14): the endpoint behind the "Học sinh" tab's
 * "Thêm học sinh" dialog — both the one-student form and the Excel roster import send here.
 *
 * `POST /api/teacher/classes/:classId/students/bulk` with `{ students: [{ name, email, password? }] }`
 * (1..`CLASS_ROSTER_BULK_MAX_ROWS` rows) creates `student` accounts assigned to the class.
 *
 * Teacher/admin-only (`requireRole`), ownership-checked with `requireOwnedClass` (another
 * teacher's class id gets the same 404 as a missing one; `admin` bypasses, PROJECT_PLAN
 * Assumption A12 — same convention as every other class route).
 *
 * Every row is independent and the response reports each one (`created` / `skipped` + reason):
 *  - a blank name / malformed email / too-short password → that row is skipped;
 *  - the same email twice in the request → the FIRST occurrence is used, later ones are skipped;
 *  - an email that already has an account → skipped, and that account is left EXACTLY as it was
 *    (never moved between classes, password never overwritten — this endpoint only creates);
 *  - a blank password → an 8-character random one is generated and returned ONCE, in this
 *    response (only its bcrypt hash is stored).
 * Email normalising (trim + lower-case), the email pattern, the minimum password length and the
 * hashing (`hashPassword`, bcrypt) are exactly what public registration (`auth.routes.ts`) uses,
 * so an account made here can log in through the same `/api/auth/login` as any other.
 *
 * `POST /api/teacher/classes/:classId/students/:studentId/reset-password` gives ONE student of
 * the class a new generated password (same generator + hashing as above) and returns it once —
 * the teacher's answer to "a student lost their password". The student must belong to THAT class
 * (`role: 'student'`, `classId` = the class), otherwise the same 404 as a missing student; the
 * password is never logged and only its hash is stored. Nothing else about the student changes.
 *
 * `POST /api/teacher/classes/:classId/students/:studentId/transfer` (T-118C, Phase 17) moves ONE
 * student from `:classId` to `{ toClassId }` — self-service (a teacher no longer needs an admin
 * to move a student between their OWN classes, T-117's "Nhẹ" finding). Both `:classId` and
 * `toClassId` are ownership-checked with `requireOwnedClass` exactly like every other route here
 * (404 for another teacher's class or a missing one; `admin` bypasses); `toClassId === classId`
 * is a 400; the student must currently be a `role: 'student'` of `:classId`, otherwise 404. On
 * success only `User.classId` is written (one `update`, in place) — `Attempt`/`FlashcardProgress`/
 * `GrammarExerciseAttempt` rows key off `studentId`, not `classId`, so the student's history
 * carries over untouched with no further writes needed.
 */

import { randomInt } from 'node:crypto';
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import {
  CLASS_ROSTER_BULK_MAX_ROWS,
  CLASS_ROSTER_MIN_PASSWORD_LENGTH,
  type ClassRosterBulkResponseDTO,
  type ClassRosterBulkResultDTO,
  type ClassRosterBulkSkipReason,
  type ClassStudentResetPasswordResponseDTO,
  type ClassStudentTransferRequest,
  type ClassStudentTransferResponseDTO,
} from '@platform/shared';
import { prisma } from '../lib/prisma';
import { hashPassword } from '../lib/password';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { requireOwnedClass } from '../lib/ownedClass';

export const teacherClassRosterRouter = Router();

teacherClassRosterRouter.use(requireAuth, requireRole('teacher', 'admin'));

// Same pattern as `auth.routes.ts` / `adminUsers.routes.ts`.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
// bcrypt only reads the first 72 bytes of a password; anything longer would silently be cut.
const MAX_PASSWORD_LENGTH = 72;

const GENERATED_PASSWORD_LENGTH = 8;
// Letters and digits that are hard to confuse when a teacher reads the password off a printout:
// no 0/O/o, 1/l/I. (Case is kept — 8 characters over 54 symbols is ~46 bits, plenty for a
// first-login password.)
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const PASSWORD_DIGITS = '23456789';

/** Cryptographically random password (`crypto.randomInt`, never `Math.random`) that always
 * contains at least one digit and one letter. */
function generatePassword(): string {
  for (;;) {
    let password = '';
    for (let i = 0; i < GENERATED_PASSWORD_LENGTH; i += 1) {
      password += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
    }
    const hasDigit = [...password].some((ch) => PASSWORD_DIGITS.includes(ch));
    const hasLetter = [...password].some((ch) => !PASSWORD_DIGITS.includes(ch));
    if (hasDigit && hasLetter) return password;
  }
}

/** How many bcrypt hashes run at once — bcrypt runs on libuv's 4-thread pool, so a small bound
 * keeps a 200-row import from starving every other request's own thread-pool work. */
const HASH_CONCURRENCY = 4;

/** Runs `worker` over `items` with at most `limit` in flight at any time. */
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await worker(item);
    }
  });
  await Promise.all(lanes);
}

interface PendingStudent {
  index: number;
  name: string;
  email: string;
  /** `null` = generate one. */
  suppliedPassword: string | null;
}

teacherClassRosterRouter.post(
  '/classes/:classId/students/bulk',
  asyncHandler(async (req, res) => {
    const cls = await requireOwnedClass(req.params.classId, req.user!, res);
    if (!cls) return;

    const rows = (req.body as { students?: unknown } | undefined)?.students;
    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: '`students` must be a non-empty array.' });
      return;
    }
    if (rows.length > CLASS_ROSTER_BULK_MAX_ROWS) {
      res.status(400).json({
        error: `At most ${CLASS_ROSTER_BULK_MAX_ROWS} students can be added per request (received ${rows.length}).`,
      });
      return;
    }

    // Pass 1 — per-row validation + in-request duplicate detection (no DB, no hashing yet).
    const results: ClassRosterBulkResultDTO[] = [];
    const pending: PendingStudent[] = [];
    const seenEmails = new Set<string>();
    const skip = (
      index: number,
      name: string,
      email: string,
      reason: ClassRosterBulkSkipReason,
    ): void => {
      results[index] = {
        row: index + 1,
        name,
        email,
        status: 'skipped',
        reason,
        studentId: null,
        generatedPassword: null,
      };
    };

    rows.forEach((raw: unknown, index) => {
      const item = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      const email = typeof item.email === 'string' ? item.email.trim().toLowerCase() : '';
      const password = typeof item.password === 'string' ? item.password : '';

      if (!name || name.length > MAX_NAME_LENGTH) return skip(index, name, email, 'nameRequired');
      if (!EMAIL_RE.test(email) || email.length > MAX_EMAIL_LENGTH) {
        return skip(index, name, email, 'emailInvalid');
      }
      if (
        password !== '' &&
        (password.length < CLASS_ROSTER_MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH)
      ) {
        return skip(index, name, email, 'passwordInvalid');
      }
      if (seenEmails.has(email)) return skip(index, name, email, 'duplicateInFile');
      seenEmails.add(email);
      pending.push({ index, name, email, suppliedPassword: password === '' ? null : password });
    });

    // Pass 2 — one query for every email that already has an account (case-insensitively, in
    // case an older account was stored with capitals). Those rows are skipped untouched.
    const existingEmails = new Set<string>();
    if (pending.length > 0) {
      const existing = await prisma.user.findMany({
        where: {
          OR: pending.map((student) => ({
            email: { equals: student.email, mode: 'insensitive' as const },
          })),
        },
        select: { email: true },
      });
      for (const user of existing) existingEmails.add(user.email.toLowerCase());
    }
    const toCreate: PendingStudent[] = [];
    for (const student of pending) {
      if (existingEmails.has(student.email)) {
        skip(student.index, student.name, student.email, 'emailExists');
      } else {
        toCreate.push(student);
      }
    }

    // Pass 3 — hash + insert, each row on its own so one failure never affects another.
    await runWithConcurrency(toCreate, HASH_CONCURRENCY, async (student) => {
      const generatedPassword = student.suppliedPassword === null ? generatePassword() : null;
      const passwordHash = await hashPassword(student.suppliedPassword ?? generatedPassword!);
      try {
        const user = await prisma.user.create({
          data: {
            email: student.email,
            passwordHash,
            name: student.name,
            role: 'student',
            classId: cls.id,
          },
          select: { id: true },
        });
        results[student.index] = {
          row: student.index + 1,
          name: student.name,
          email: student.email,
          status: 'created',
          reason: null,
          studentId: user.id,
          generatedPassword,
        };
      } catch (error) {
        // Someone registered this email between the lookup above and the insert.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          skip(student.index, student.name, student.email, 'emailExists');
          return;
        }
        throw error;
      }
    });

    const created = results.filter((result) => result.status === 'created').length;
    const response: ClassRosterBulkResponseDTO = {
      created,
      skipped: results.length - created,
      results,
    };
    res.status(200).json(response);
  }),
);

teacherClassRosterRouter.post(
  '/classes/:classId/students/:studentId/reset-password',
  asyncHandler(async (req, res) => {
    const cls = await requireOwnedClass(req.params.classId, req.user!, res);
    if (!cls) return;

    const student = await prisma.user.findFirst({
      where: { id: req.params.studentId, classId: cls.id, role: 'student' },
      select: { id: true, name: true, email: true },
    });
    if (!student) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }

    const generatedPassword = generatePassword();
    await prisma.user.update({
      where: { id: student.id },
      data: { passwordHash: await hashPassword(generatedPassword) },
    });
    const body: ClassStudentResetPasswordResponseDTO = {
      studentId: student.id,
      name: student.name,
      email: student.email,
      generatedPassword,
    };
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(body);
  }),
);

teacherClassRosterRouter.post(
  '/classes/:classId/students/:studentId/transfer',
  asyncHandler(async (req, res) => {
    const fromClass = await requireOwnedClass(req.params.classId, req.user!, res);
    if (!fromClass) return;

    const toClassId = (req.body as ClassStudentTransferRequest | undefined)?.toClassId;
    if (typeof toClassId !== 'string' || toClassId.trim() === '') {
      res.status(400).json({ error: '`toClassId` is required.' });
      return;
    }
    if (toClassId === fromClass.id) {
      res.status(400).json({ error: 'The student is already in this class.' });
      return;
    }

    const toClass = await requireOwnedClass(toClassId, req.user!, res);
    if (!toClass) return;

    const student = await prisma.user.findFirst({
      where: { id: req.params.studentId, classId: fromClass.id, role: 'student' },
      select: { id: true, name: true, email: true },
    });
    if (!student) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }

    await prisma.user.update({
      where: { id: student.id },
      data: { classId: toClass.id },
    });

    const body: ClassStudentTransferResponseDTO = {
      studentId: student.id,
      name: student.name,
      email: student.email,
      classId: toClass.id,
    };
    res.status(200).json(body);
  }),
);
