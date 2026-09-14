import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from './authContextInstance';

/** Reads the current session. Must be called from within `<AuthProvider>` (mounted
 * once, near the root, in `App.tsx`). */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
