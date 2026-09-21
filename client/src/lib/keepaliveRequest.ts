import { API_BASE_URL, getStoredToken } from './apiClient';

/**
 * Fire-and-forget JSON request that the browser keeps alive while the page is being closed or
 * reloaded (`keepalive`). Only used as the very last attempt to save an edit that is still
 * waiting (see `useSerialSaver`'s `saveOnUnload`); it never reports a result.
 */
export function sendKeepalive(method: 'PATCH' | 'PUT' | 'POST', path: string, body: unknown): void {
  const token = getStoredToken();
  void fetch(`${API_BASE_URL}${path}`, {
    method,
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}
