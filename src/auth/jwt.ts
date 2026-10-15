import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config';

function pem(b64: string, label: string): string {
  if (!b64) throw new Error(`${label} is not configured`);
  return Buffer.from(b64, 'base64').toString('utf8');
}

export interface AccessClaims {
  sub: string;
  email: string;
  role: string;
}

/** RS256 access token, 15-minute expiry (spec §1). */
export function signAccess(user: { id: string; email: string; role: string }): string {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role } satisfies AccessClaims,
    pem(config.jwtPrivateKeyB64, 'JWT_PRIVATE_KEY_B64'),
    { algorithm: 'RS256', expiresIn: config.jwtAccessTtlSec }
  );
}

export function verifyAccess(token: string): AccessClaims {
  const decoded = jwt.verify(token, pem(config.jwtPublicKeyB64, 'JWT_PUBLIC_KEY_B64'), {
    algorithms: ['RS256'],
  });
  if (typeof decoded === 'string' || !decoded.sub) throw new Error('Invalid access token');
  const d = decoded as Record<string, unknown>;
  return { sub: String(d.sub), email: String(d.email ?? ''), role: String(d.role ?? 'USER') };
}

/** Opaque 256-bit refresh token (returned once); only sha256 is stored. */
export function mintRefreshToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
