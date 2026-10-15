import helmet from 'helmet';
import type { Express } from 'express';

/** OWASP-compliant header stack (spec §1). */
export function applySecurityHeaders(app: Express): void {
  app.use(
    helmet({
      hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
      contentSecurityPolicy: { directives: { defaultSrc: ["'self'"] } },
      frameguard: { action: 'deny' },
      noSniff: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'same-origin' },
    })
  );
  app.disable('x-powered-by');
}
