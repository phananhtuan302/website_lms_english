/**
 * Placeholder protected routes (T-005) used only to prove the role-based middleware
 * works end to end: a teacher-only route and a student-only route. Real teacher/student
 * routes arrive with their own features (T-008 test authoring, T-012 test-taking, ...)
 * and should NOT be added here — this file exists purely so T-005's acceptance
 * criteria ("hit a mock teacher-only route as student, expect 403 / as teacher, expect
 * 200") has something concrete to hit, and can be deleted once real protected routes
 * exist to demonstrate the same middleware.
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';

export const demoRouter = Router();

demoRouter.get('/teacher-only', requireAuth, requireRole('teacher'), (req, res) => {
  res.status(200).json({ message: `Hello teacher ${req.user!.email}.` });
});

demoRouter.get('/student-only', requireAuth, requireRole('student'), (req, res) => {
  res.status(200).json({ message: `Hello student ${req.user!.email}.` });
});
