import { prisma } from '../prisma';
import { maskIp } from '../lib/money';
import type { AuditAction } from '@prisma/client';

/** Immutable audit write (spec §2). Old/new states must already be scrubbed/sized by callers. */
export async function audit(params: {
  actorId?: string | null;
  ip: string;
  action: AuditAction;
  oldState?: unknown;
  newState?: unknown;
}): Promise<void> {
  await prisma.auditLedger.create({
    data: {
      actor_id: params.actorId ?? null,
      ip_address: maskIp(params.ip),
      action_type: params.action,
      old_state: (params.oldState ?? null) as never,
      new_state: (params.newState ?? null) as never,
    },
  });
}

export function clientIp(req: { ip?: string; headers: Record<string, unknown> }): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  return req.ip ?? 'unknown';
}
