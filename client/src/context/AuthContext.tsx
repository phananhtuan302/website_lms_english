/**
 * Session state (T-006): who's logged in, persisted across reloads via the JWT stored
 * in localStorage (see `lib/apiClient.ts`). `ProtectedRoute` and `Header` both read
 * this via `useAuth` (in `./useAuth.ts`); the context object itself lives in
 * `./authContextInstance.ts`. Split across three files so each one only exports a
 * single kind of thing (component / hook / context), which keeps Vite's fast-refresh
 * lint rule happy.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthResponse, AuthUser, LoginRequest, RegisterRequest, UpdateAvatarRequest } from '@platform/shared';
import {
  apiRequest,
  setStoredToken,
  getStoredToken,
  getStoredUser,
  setStoredUser,
  isRememberLoginEnabled,
} from '../lib/apiClient';
import { AuthContext, type AuthContextValue } from './authContextInstance';

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initialize user immediately from cached profile if present, preventing UI flicker/redirect
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser<AuthUser>());
  // If we already have token and cached user, don't block render with loading spinner
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    const token = getStoredToken();
    const cachedUser = getStoredUser<AuthUser>();
    return Boolean(token && !cachedUser);
  });

  // On mount, re-validate any stored token in the background against the server
  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setStoredUser(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    apiRequest<AuthUser>('/api/auth/me')
      .then((fetchedUser) => {
        if (!cancelled) {
          setUser(fetchedUser);
          setStoredUser(fetchedUser);
        }
      })
      .catch((err) => {
        // If 401/403 or network error: only clear if token is genuinely invalid
        if (!cancelled) {
          // If the token is rejected by the server, clear session
          const status = (err as { status?: number })?.status;
          if (status === 401 || status === 403) {
            setStoredToken(null);
            setStoredUser(null);
            setUser(null);
          }
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (credentials: LoginRequest, remember = isRememberLoginEnabled()) => {
    const response = await apiRequest<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    setStoredToken(response.token, remember);
    setStoredUser(response.user, remember);
    setUser(response.user);
    return response.user;
  }, []);

  const register = useCallback(async (data: RegisterRequest) => {
    const response = await apiRequest<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    setStoredToken(response.token, true);
    setStoredUser(response.user, true);
    setUser(response.user);
    return response.user;
  }, []);

  const adoptSession = useCallback((token: string, nextUser: AuthUser) => {
    setStoredToken(token, true);
    setStoredUser(nextUser, true);
    setUser(nextUser);
  }, []);

  const logout = useCallback(() => {
    setStoredToken(null);
    setStoredUser(null);
    setUser(null);
  }, []);

  const updateAvatar = useCallback(async (avatarUrl: string | null) => {
    const body: UpdateAvatarRequest = { avatarUrl };
    const updated = await apiRequest<AuthUser>('/api/auth/me/avatar', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    setUser(updated);
    setStoredUser(updated);
    return updated;
  }, []);

  const updateProfile = useCallback(
    async (data: {
      name?: string;
      firstName?: string | null;
      lastName?: string | null;
      birthday?: string | null;
      sex?: string | null;
      phoneNumber?: string | null;
      currentPassword?: string;
      newPassword?: string;
    }) => {
      const updated = await apiRequest<AuthUser>('/api/auth/me', {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      setUser(updated);
      setStoredUser(updated);
      return updated;
    },
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoading, login, register, adoptSession, logout, updateAvatar, updateProfile }),
    [user, isLoading, login, register, adoptSession, logout, updateAvatar, updateProfile],
  );


  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
