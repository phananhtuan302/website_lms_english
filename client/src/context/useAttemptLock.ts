import { useContext } from 'react';
import { AttemptLockContext, type AttemptLockContextValue } from './attemptLockContextInstance';

/** Reads the current in-progress-attempt lock state (T-091). Must be called from within
 * `<AttemptLockProvider>` (mounted once in `App.tsx`, inside both `BrowserRouter` and
 * `AuthProvider`, wrapping `AppShell`). */
export function useAttemptLock(): AttemptLockContextValue {
  const ctx = useContext(AttemptLockContext);
  if (!ctx) {
    throw new Error('useAttemptLock must be used within an AttemptLockProvider');
  }
  return ctx;
}
