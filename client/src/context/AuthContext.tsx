/**
 * Session state (T-006): who's logged in, persisted across reloads via the JWT stored
 * in localStorage (see `lib/apiClient.ts`). `ProtectedRoute` and `Header` both read
 * this via `useAuth` (in `./useAuth.ts`); the context object itself lives in
 * `./authContextInstance.ts`. Split across three files so each one only exports a
 * single kind of thing (component / hook / context), which keeps Vite's fast-refresh
 * lint rule happy.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthResponse, AuthUser, LoginRequest, RegisterRequest } from '@platform/shared';
import { apiRequest, setStoredToken, getStoredToken } from '../lib/apiClient';
import { AuthContext, type AuthContextValue } from './authContextInstance';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  // Lazy initializer (not a setState call inside the effect below) so the "no stored
  // token" case never needs a render just to flip this back to false.
  const [isLoading, setIsLoading] = useState<boolean>(() => getStoredToken() !== null);

  // On mount, re-validate any stored token against the server (rather than trusting a
  // locally-decoded, possibly-expired payload) so a stale/expired token doesn't render
  // protected content and then fail on the first real API call.
  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      return;
    }

    let cancelled = false;

    apiRequest<AuthUser>('/api/auth/me')
      .then((fetchedUser) => {
        if (!cancelled) {
          setUser(fetchedUser);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStoredToken(null);
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

  const login = useCallback(async (credentials: LoginRequest) => {
    const response = await apiRequest<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    setStoredToken(response.token);
    setUser(response.user);
    return response.user;
  }, []);

  const register = useCallback(async (data: RegisterRequest) => {
    const response = await apiRequest<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    setStoredToken(response.token);
    setUser(response.user);
    return response.user;
  }, []);

  const logout = useCallback(() => {
    setStoredToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoading, login, register, logout }),
    [user, isLoading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
