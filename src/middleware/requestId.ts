import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export interface RequestWithId extends Request {
  requestId: string;
}

export function requestId(req: Request, _res: Response, next: NextFunction): void {
  (req as RequestWithId).requestId = randomUUID();
  next();
}

export function trackingIdOf(req: Request): string {
  return (req as RequestWithId).requestId ?? randomUUID();
}
