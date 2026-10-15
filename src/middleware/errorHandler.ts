import type { NextFunction, Request, Response } from 'express';
import { trackingIdOf } from './requestId';
import { scrubForLogs } from '../lib/sanitize';

/**
 * Centralized exception boundary (spec §7). No raw engine stacks, Prisma codes,
 * or SQL text ever reach the client. Internal detail goes to stderr, scrubbed.
 */
export function globalErrorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const trackingId = trackingIdOf(req);
  // eslint-disable-next-line no-console
  console.error(`[${trackingId}]`, scrubForLogs(err instanceof Error ? { message: err.message, stack: err.stack } : err));

  if (res.headersSent) return;
  // Intentional client errors thrown with { status } keep their code; everything else is 500.
  const raw = (err as { status?: unknown }).status;
  const status = typeof raw === 'number' && raw >= 400 && raw < 600 ? raw : 500;
  const message =
    status < 500 && err instanceof Error && err.message
      ? err.message
      : 'Internal processing error. Reference the tracking ID with support.';
  res.status(status).json({ status, error: message, tracking_id: trackingId });
}

/** 404 envelope for unknown routes (same shape, no fingerprinting). */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    status: 404,
    error: 'Resource not found.',
    tracking_id: trackingIdOf(req),
  });
}
