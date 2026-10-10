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
  login: (credentials: LoginRequest, remember?: boolean) => Promise<AuthUser>;
  register: (data: RegisterRequest) => Promise<AuthUser>;
  /** 2026-10: adopts an already-issued token/user pair as the current session — used by
   * the no-account guest QR-session join (`JoinPage.tsx`), whose own API call
   * (`studentApi.joinSessionAsGuest`) already did the "create an identity, get a JWT"
   * work; this just stores it, same as `login`/`register` do after THEIR own call. */
  adoptSession: (token: string, user: AuthUser) => void;
  logout: () => void;
  /** Sets or clears (`null`) the current user's own profile photo and updates local session
   * state so the UI reflects it immediately. */
  updateAvatar: (avatarUrl: string | null) => Promise<AuthUser>;
  /** Updates the current user's own profile (name, personal details, and optionally password). */
  updateProfile: (data: {
    name?: string;
    firstName?: string | null;
    lastName?: string | null;
    birthday?: string | null;
    sex?: string | null;
    phoneNumber?: string | null;
    currentPassword?: string;
    newPassword?: string;
  }) => Promise<AuthUser>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
