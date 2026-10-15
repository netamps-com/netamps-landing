import type { NextFunction, Request, Response } from 'express';
import type { TLSSocket } from 'node:tls';
import { config } from '../config';
import { trackingIdOf } from './requestId';

const DEPRECATED = new Set(['TLSv1', 'TLSv1.1', 'TLSv1.2']);

/**
 * TLS 1.3 enforcement for DIRECT exposure (spec §1).
 * Behind a terminating LB/proxy (TRUST_PROXY=1, plain HTTP upstream) there is no
 * TLS socket to inspect — enforcement then belongs to the LB listener config,
 * so this middleware no-ops instead of false-blocking.
 */
export function enforceTls13(req: Request, res: Response, next: NextFunction): void {
  if (!config.enforceTls13Direct) return next();
  const sock = req.socket as TLSSocket;
  const proto = typeof sock.getProtocol === 'function' ? sock.getProtocol() : undefined;
  if (!proto) return next(); // not a direct TLS socket (e.g. behind LB) — LB enforces
  if (!proto || DEPRECATED.has(proto)) {
    res.status(426).json({
      status: 426,
      error: 'Insecure transport rejected: TLS 1.3 or newer is required.',
      tracking_id: trackingIdOf(req),
    });
    return;
  }
  next();
}
