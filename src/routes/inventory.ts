import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/requireAuth';
import { trackingIdOf } from '../middleware/requestId';
import { audit, clientIp } from '../lib/audit';

const router = Router();
const SKU_RE = /^[A-Z0-9][A-Z0-9._-]{1,63}$/i;

/** List (admin sees all; others see SKUs touched by their documents — simplified to all for STAFF+). */
router.get('/', requireAuth, async (_req, res, next) => {
  try {
    const skus = await prisma.sku.findMany({ orderBy: { sku: 'asc' }, take: 500 });
    res.json({ status: 200, data: skus });
  } catch (err) {
    next(err);
  }
});

/** Upsert SKU (ADMIN/STAFF). Guards non-negative balances (mirrors DB CHECK). */
router.put('/:sku', requireAuth, requireRole('ADMIN', 'STAFF'), async (req, res, next) => {
  try {
    const auth = (req as AuthedRequest).auth;
    const sku = req.params.sku.toUpperCase();
    const { description, current_on_hand_balance, reserved_pending_allocation } = req.body ?? {};
    if (!SKU_RE.test(sku)) {
      res.status(400).json({ status: 400, error: 'Invalid SKU format.', tracking_id: trackingIdOf(req) });
      return;
    }
    const onHand = Number(current_on_hand_balance ?? 0);
    const reserved = Number(reserved_pending_allocation ?? 0);
    if (!Number.isInteger(onHand) || !Number.isInteger(reserved) || onHand < 0 || reserved < 0) {
      res.status(400).json({ status: 400, error: 'Balances must be non-negative integers.', tracking_id: trackingIdOf(req) });
      return;
    }
    const before = await prisma.sku.findUnique({ where: { sku } });
    const row = await prisma.sku.upsert({
      where: { sku },
      update: {
        description: typeof description === 'string' ? description : before?.description ?? sku,
        current_on_hand_balance: onHand,
        reserved_pending_allocation: reserved,
      },
      create: { sku, description: typeof description === 'string' && description ? description : sku, current_on_hand_balance: onHand, reserved_pending_allocation: reserved },
    });
    await audit({
      actorId: auth.sub, ip: clientIp(req), action: 'STOCK_ADJUSTMENT',
      oldState: before ? { sku, on_hand: before.current_on_hand_balance, reserved: before.reserved_pending_allocation } : null,
      newState: { sku, on_hand: row.current_on_hand_balance, reserved: row.reserved_pending_allocation },
    });
    res.json({ status: 200, data: row });
  } catch (err) {
    next(err);
  }
});

export default router;
