/**
 * Encrypts/decrypts small secrets (currently: the admin-supplied AI grading API key,
 * `Settings.essayGradingApiKeyEncrypted`) before they're stored in the database, so a DB
 * dump/leak doesn't hand over a usable third-party API key in plaintext. The key is
 * derived from `JWT_SECRET` (already a required env var — see `config/env.ts`) rather
 * than introducing a second required secret just for this.
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function deriveKey(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET must be set to encrypt/decrypt stored secrets.');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

/** Returns `iv.authTag.ciphertext`, each segment base64. */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, deriveKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join('.');
}

export function decryptSecret(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Malformed encrypted secret (expected "iv.authTag.ciphertext").');
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, deriveKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return plaintext.toString('utf8');
}
