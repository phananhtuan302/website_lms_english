/**
 * The raw `React.Context` object for the in-progress-attempt lock (T-091), kept in its
 * own file — separate from `AttemptLockContext.tsx`'s provider component and
 * `useAttemptLock.ts`'s hook — for the same reason `authContextInstance.ts` is split out
 * from `AuthContext.tsx`: every file under `src/context` exports exactly one kind of
 * thing, which satisfies the `react-refresh/only-export-components` lint rule.
 */

import { createContext } from 'react';

export interface AttemptLockContextValue {
  /** The `Attempt.id` of the student's current `status: 'inProgress'` attempt, or
   * `null` if they have none (or aren't a student). Server-derived (`GET /api/attempts`
   * via `studentApi.listMyAttempts()`), never a client-only flag — see
   * `AttemptLockContext.tsx`'s doc comment. */
  lockedAttemptId: string | null;
  /** Optimistically, synchronously clears the local lock state. `TakeTestPage.tsx`
   * calls this the moment its submit call succeeds, rather than waiting for the next
   * route-change re-check to catch up — see that file's `handleSubmit` for the race
   * condition this avoids. */
  clearLock: () => void;
  /** Re-runs the server-derived check immediately (normally triggered automatically on
   * every route change — see the provider's effect). Exposed so callers that already
   * know the lock state changed (e.g. right after a submit) can confirm it without
   * waiting for the next navigation. */
  refreshLock: () => Promise<void>;
}

export const AttemptLockContext = createContext<AttemptLockContextValue | undefined>(undefined);
