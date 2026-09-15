/**
 * In-progress-attempt lock (T-091): while a student has ANY `Attempt` with
 * `status: 'inProgress'` (any `Test.testType` — self-practice, live session, Unit Test,
 * Vocabulary Check; NOT T-089's "Tự kiểm tra" self-check quiz or flashcard/Grammar
 * exercises, none of which create a real `Attempt` row), they must not be able to
 * navigate away from that attempt's take-test screen or log out — see
 * `docs/BACKLOG.md`'s T-091 for the full customer-reported requirement.
 *
 * Split into three files (component / context object / hook) for the same
 * fast-refresh-lint reason `AuthContext`/`authContextInstance`/`useAuth` are split.
 *
 * Detection is SERVER-DERIVED, not a client-only flag (AC3): `studentApi.listMyAttempts()`
 * (the existing `GET /api/attempts`, already returns every attempt's `status` and
 * `attemptId` — no new endpoint) is re-checked on every route change, keyed off
 * `useLocation()`'s `pathname`. That makes the lock correctly survive page reloads, new
 * tabs, and even an attempt started from a different device/session for the same
 * student — there's deliberately no purely-local way to escape it.
 *
 * This must render INSIDE `BrowserRouter` (needs `useLocation`/`useNavigate`) and
 * INSIDE `AuthProvider` (needs `useAuth()`'s `user.role`), and must wrap both `Header`
 * (inside `AppShell`) and the routed page content, since both need the same lock state —
 * see `App.tsx` for the actual nesting.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth';
import { studentApi } from '../lib/studentApi';
import { AttemptLockContext, type AttemptLockContextValue } from './attemptLockContextInstance';

function lockedPathFor(attemptId: string): string {
  return `/student/attempts/${attemptId}`;
}

export function AttemptLockProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [lockedAttemptId, setLockedAttemptId] = useState<string | null>(null);

  // Teachers/admins are never locked (AC5) — skipped entirely, not just hidden in the
  // UI, so there's no unnecessary `listMyAttempts` call for non-student roles either.
  const isStudent = user?.role === 'student';

  // Derived, not reset via an effect (React's own "you don't need an effect for this"
  // guidance, and avoids a synchronous `setState`-in-effect lint violation besides):
  // whatever `lockedAttemptId` last resolved to for a *student* session, a non-student
  // is simply never treated as locked, full stop — no separate reset path needed for
  // e.g. a stale value from before a role somehow changed.
  const effectiveLockedAttemptId = isStudent ? lockedAttemptId : null;

  // Re-check on every route change (AC1/AC3 "re-check... so the lock correctly persists
  // across page reloads") — `location.pathname` as the effect dependency, not a one-time
  // check on mount, so navigating (including the forced redirect below) always reflects
  // the current server state. The fetch's `.then`/`.catch` is inlined directly here
  // (rather than calling the `refreshLock` callback below by reference) because
  // `react-hooks/set-state-in-effect` can't see through an indirect function call to
  // confirm its `setState` is deferred — same reasoning as `useTeacherClasses.ts`'s
  // identical pattern.
  useEffect(() => {
    // No synchronous `setState` for the `!isStudent` case — `effectiveLockedAttemptId`
    // above already treats a non-student as unlocked regardless of raw state, so there
    // is nothing to reset here.
    if (!isStudent) return;
    studentApi
      .listMyAttempts()
      .then((attempts) => {
        const inProgress = attempts.find((attempt) => attempt.status === 'inProgress');
        setLockedAttemptId(inProgress ? inProgress.attemptId : null);
      })
      .catch(() => {
        // Best-effort: a transient failure to check leaves the previously-known lock
        // state alone rather than guessing — never silently unlocks just because a
        // network blip made the check fail.
      });
  }, [location.pathname, isStudent]);

  // Exposed so a caller that already knows the server-side state just changed (e.g.
  // right after a submit) can confirm it immediately rather than waiting for the next
  // route change. A plain callback, never itself invoked from inside a `useEffect`, so
  // (unlike the effect above) it's free to use async/await without tripping
  // `react-hooks/set-state-in-effect`.
  const refreshLock = useCallback(async () => {
    if (!isStudent) return;
    try {
      const attempts = await studentApi.listMyAttempts();
      const inProgress = attempts.find((attempt) => attempt.status === 'inProgress');
      setLockedAttemptId(inProgress ? inProgress.attemptId : null);
    } catch {
      // Best-effort, same reasoning as the effect above.
    }
  }, [isStudent]);

  const clearLock = useCallback(() => {
    setLockedAttemptId(null);
  }, []);

  // Route-level force-redirect (AC2): fires on typing a URL, browser back/forward, or
  // any other client-side navigation, because it's an effect reacting to
  // `location.pathname` itself — not just a disabled button — so a determined student
  // navigating around the nav UI still gets bounced back. `replace: true` per AC2 (no
  // new history entry, so back/forward can't be used to bounce between the lock and
  // wherever they tried to go).
  useEffect(() => {
    if (!effectiveLockedAttemptId) return;
    const target = lockedPathFor(effectiveLockedAttemptId);
    if (location.pathname !== target) {
      navigate(target, { replace: true });
    }
  }, [effectiveLockedAttemptId, location.pathname, navigate]);

  const value = useMemo<AttemptLockContextValue>(
    () => ({ lockedAttemptId: effectiveLockedAttemptId, clearLock, refreshLock }),
    [effectiveLockedAttemptId, clearLock, refreshLock],
  );

  return <AttemptLockContext.Provider value={value}>{children}</AttemptLockContext.Provider>;
}
