/**
 * "Unread" memory for the student notification bell (T-109): the moment the student last
 * opened (or closed) the bell, kept in this browser's `localStorage` under a key that includes
 * the user id, so two students sharing a browser never see each other's read state. Nothing is
 * stored on the server.
 *
 * Storage can be missing or throwing (private windows, blocked site data), so every access is
 * wrapped in try/catch and reports `available: false` instead — the bell then shows no unread
 * badge at all rather than a badge that can never be cleared.
 */

const KEY_PREFIX = 'student.notifications.lastSeen.';

export interface LastSeenState {
  /** `false` when storage could not be read/written — the caller shows no unread badge. */
  available: boolean;
  /** Epoch ms of the last time the bell was looked at; `0` when it never was. */
  at: number;
}

export function readLastSeen(userId: string): LastSeenState {
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + userId);
    const value = raw === null ? 0 : Number(raw);
    return { available: true, at: Number.isFinite(value) ? value : 0 };
  } catch {
    return { available: false, at: 0 };
  }
}

/** Returns whether the value was really stored. */
export function writeLastSeen(userId: string, at: number): boolean {
  try {
    window.localStorage.setItem(KEY_PREFIX + userId, String(at));
    return true;
  } catch {
    return false;
  }
}
