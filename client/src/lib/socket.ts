/**
 * Client-side Socket.IO connection helper (T-016), consuming the realtime infra T-015
 * already built server-side (`server/src/realtime/sessionRealtime.ts`). One place that
 * knows how to authenticate a socket — same JWT the REST client already attaches as a
 * `Bearer` header (`apiClient.ts`), just handed over via the handshake's `auth.token`
 * field instead, exactly as `sessionRealtime.ts`'s `io.use` middleware expects.
 *
 * Two consumers:
 * - `TakeTestPage.tsx` (student): connects, emits `student:join`, then `student:progress`
 *   on navigation/answer changes.
 * - `TeacherLiveSessionPage.tsx` (teacher): connects, emits `teacher:join`, listens for
 *   `student:progress` / `session:closed`.
 *
 * Each caller owns the lifecycle of the socket it creates (connect on mount, `.disconnect()`
 * on unmount) — this module only knows how to construct one correctly, it doesn't manage
 * a shared/singleton connection, since the teacher and student roles never share a tab.
 */

import { io, type Socket } from 'socket.io-client';
import { API_BASE_URL, getStoredToken } from './apiClient';

/** Throws if there's no stored token — every caller of this only runs behind a
 * `ProtectedRoute`, so a missing token here means session state is already broken in a
 * way a socket connection can't fix; better to fail loudly than to silently attempt an
 * unauthenticated handshake that the server will reject anyway. */
export function createSessionSocket(): Socket {
  const token = getStoredToken();
  if (!token) {
    throw new Error('Cannot open a realtime connection while logged out.');
  }
  return io(API_BASE_URL, {
    auth: { token },
    transports: ['websocket'],
  });
}
