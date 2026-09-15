/**
 * Small fetch wrapper (T-006) — the one place that knows the API base URL, attaches the
 * stored JWT to every request, and normalizes error handling. Nothing else in the
 * client should call `fetch` against the API directly.
 */

// Exported (T-016) so `lib/socket.ts` connects Socket.IO to the exact same origin as
// every REST call, instead of re-deriving/duplicating the "where's the API" logic.
//
// Defaults to '' (same-origin as the page) rather than a hardcoded `http://localhost:4000`
// — fixed 2026-09-15 after a real customer-reported failure (`TypeError: Failed to
// fetch`, no CORS message at all) traced to a remote/sandboxed dev setup where only the
// client's own port is forwarded to the user's actual browser, so a literal
// `localhost:4000` in client JS pointed at the wrong machine's port 4000. `vite.config.ts`
// proxies `/api` and `/socket.io` from the client's own port to the real API server, so
// same-origin relative paths always resolve correctly regardless of what's forwarded.
// Set `VITE_API_BASE_URL` explicitly only when the client and API are genuinely served
// from different origins (e.g. a future production deployment without a shared proxy).
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

const TOKEN_STORAGE_KEY = 'auth_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

/** Thrown for any non-2xx response so callers can branch on `status` and show the
 * server's own (English) error message rather than a generic failure. */
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Calls `${API_BASE_URL}${path}`, attaching `Authorization: Bearer <token>` when a
 * token is stored. JSON in, JSON out. Throws `ApiError` on any non-2xx response.
 */
export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  const contentType = res.headers.get('content-type') ?? '';
  const body: unknown = contentType.includes('application/json') ? await res.json() : undefined;

  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : `Request failed with status ${res.status}.`;
    throw new ApiError(res.status, message);
  }

  return body as T;
}
