/**
 * The raw `React.Context` object, kept in its own file (separate from `AuthContext.tsx`'s
 * `AuthProvider` component and `useAuth.ts`'s hook) purely so every file under
 * `src/context` exports exactly one kind of thing — satisfies the
 * `react-refresh/only-export-components` lint rule, which otherwise warns when a
 * component file also exports a non-component value.
 */

import { createContext } from 'react';
import type { AuthUser, LoginRequest, RegisterRequest } from '@platform/shared';

export interface AuthContextValue {
  user: AuthUser | null;
  /** True until the initial "is there a valid stored token" check resolves. Route
   * guards must wait for this before deciding to redirect, or a logged-in user would
   * flash through the login redirect on every full page reload. */
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<AuthUser>;
  register: (data: RegisterRequest) => Promise<AuthUser>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
