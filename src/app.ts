import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { requestId } from './middleware/requestId';
import { applySecurityHeaders } from './middleware/security';
import { enforceTls13 } from './middleware/tls';
import { globalErrorHandler, notFoundHandler } from './middleware/errorHandler';
import health from './routes/health';
import auth from './auth/routes';
import documents from './routes/documents';
import inventory from './routes/inventory';
import intakeImport from './routes/import';
import exportRoutes from './routes/export';
import printRoutes from './routes/print';
import clients from './routes/clients';

export function createApp() {
  const app = express();
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use(requestId);
  applySecurityHeaders(app);
  app.use(enforceTls13);
  app.use(express.json({ limit: '2mb' }));
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true); // same-origin / curl / health probes
        if (config.corsOrigins.length === 0) return cb(null, false);
        return config.corsOrigins.includes(origin) ? cb(null, true) : cb(null, false);
      },
      credentials: false,
      maxAge: 600,
    })
  );

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  });

  app.use('/health', health);
  app.use('/api/v1/auth', auth);
  app.use('/api/v1/documents', apiLimiter, documents);
  app.use('/api/v1/inventory', apiLimiter, inventory);
  app.use('/api/v1/import', apiLimiter, intakeImport);
  app.use('/api/v1/export', apiLimiter, exportRoutes);
  app.use('/api/v1/print', apiLimiter, printRoutes);
  app.use('/api/v1/clients', apiLimiter, clients);

  app.use(notFoundHandler);
  app.use(globalErrorHandler);
  return app;
}
