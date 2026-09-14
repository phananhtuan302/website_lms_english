/**
 * Join-token and manual-fallback-code generators for QR-join sessions (T-010).
 */

import { randomBytes, randomInt } from 'crypto';

/** Long, effectively-unguessable token embedded in the QR code's join URL. 32 hex
 * chars (16 random bytes) — plenty of entropy; it doesn't need to be human-typeable
 * since the whole point of the QR code is that nobody types it. */
export function generateJoinToken(): string {
  return randomBytes(16).toString('hex');
}

// Excludes visually-ambiguous characters (0/O, 1/I/L) so a student typing the fallback
// code from a projector screen doesn't get tripped up.
const MANUAL_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const MANUAL_CODE_LENGTH = 6;

/** Short human-typeable fallback code shown alongside the QR image, for the "camera
 * won't scan" case. */
export function generateManualCode(): string {
  let code = '';
  for (let i = 0; i < MANUAL_CODE_LENGTH; i++) {
    code += MANUAL_CODE_ALPHABET[randomInt(MANUAL_CODE_ALPHABET.length)];
  }
  return code;
}
