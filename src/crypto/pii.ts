import crypto from 'node:crypto';
import { config } from '../config';

const PREFIX = 'v1';

function getKey(): Buffer {
  const raw = config.dataEncryptionKeyB64;
  if (!raw) throw new Error('DATA_ENCRYPTION_KEY_B64 is not configured');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('DATA_ENCRYPTION_KEY_B64 must decode to 32 bytes (AES-256)');
  return key;
}

/** AES-256-GCM column encryption. Output: `v1:<iv-b64>:<cipher-b64>:<tag-b64>`. */
export function encryptPii(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('base64'), enc.toString('base64'), tag.toString('base64')].join(':');
}

/** Returns '' on any failure shape (corrupt/forged input must never throw PII outward). */
export function decryptPii(payload: string): string {
  try {
    const [ver, ivB64, encB64, tagB64] = payload.split(':');
    if (ver !== PREFIX || !ivB64 || !encB64 || !tagB64) return '';
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(encB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}
