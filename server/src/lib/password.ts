/**
 * Password hashing helpers (T-005). bcrypt per TECH_STACK.md ("Auth: JWT + bcrypt").
 * Kept in one place so nothing else in the codebase ever handles a plaintext password
 * or picks its own salt-round count.
 */

import bcrypt from 'bcrypt';

// 12 rounds: a common balance of security vs. login latency; bcrypt's cost doubles
// per round so this is deliberately not pushed higher without a reason to.
const SALT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
