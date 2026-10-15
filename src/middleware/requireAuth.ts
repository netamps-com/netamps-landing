import type { NextFunction, Request, Response } from 'express';
import { verifyAccess, type AccessClaims } from '../auth/jwt';
import { trackingIdOf } from './requestId';

export interface AuthedRequest extends Request {
  auth: AccessClaims;
}

function bearer(req: Request): string | null {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim();
}

/** Any authenticated principal. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = bearer(req);
  if (!token) {
    res.status(401).json({ status: 401, error: 'Authentication required.', tracking_id: trackingIdOf(req) });
    return;
  }
  try {
    (req as AuthedRequest).auth = verifyAccess(token);
    next();
  } catch {
    res.status(401).json({ status: 401, error: 'Invalid or expired credentials.', tracking_id: trackingIdOf(req) });
  }
}

/** Role-gated (default ADMIN-only). Use AFTER requireAuth. */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const auth = (req as AuthedRequest).auth;
    if (!auth || !roles.includes(auth.role)) {
      res.status(403).json({ status: 403, error: 'Insufficient privileges.', tracking_id: trackingIdOf(req) });
      return;
    }
    next();
  };
}
