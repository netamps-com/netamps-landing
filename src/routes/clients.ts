import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/requireAuth';
import { trackingIdOf } from '../middleware/requestId';
import { audit, clientIp } from '../lib/audit';
import { encryptPii, decryptPii } from '../crypto/pii';

const router = Router();
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;

/** PII (tax id, payment details) is AES-256-GCM ciphertext at rest — never plaintext. */
router.post('/', requireAuth, requireRole('ADMIN', 'STAFF'), async (req, res, next) => {
  try {
    const auth = (req as AuthedRequest).auth;
    const { name, email, taxId, paymentDetails } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim() || typeof email !== 'string' || !EMAIL_RE.test(email)) {
      res.status(400).json({ status: 400, error: 'Valid name and email required.', tracking_id: trackingIdOf(req) });
      return;
    }
    const client = await prisma.client.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase(),
        taxIdEnc: typeof taxId === 'string' && taxId ? encryptPii(taxId) : null,
        paymentEnc: typeof paymentDetails === 'string' && paymentDetails ? encryptPii(paymentDetails) : null,
      },
      select: { id: true, name: true, email: true, createdAt: true },
    });
    await audit({ actorId: auth.sub, ip: clientIp(req), action: 'DOCUMENT_MUTATION', newState: { event: 'client.create', id: client.id } });
    res.status(201).json({ status: 201, data: client });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const auth = (req as AuthedRequest).auth;
    const client = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!client) {
      res.status(404).json({ status: 404, error: 'Client not found.', tracking_id: trackingIdOf(req) });
      return;
    }
    // Only ADMIN/STAFF or the owning email may view decrypted PII.
    const canDecrypt = auth.role !== 'USER' || client.email === auth.email;
    res.json({
      status: 200,
      data: {
        id: client.id,
        name: client.name,
        email: client.email,
        taxId: canDecrypt && client.taxIdEnc ? decryptPii(client.taxIdEnc) : undefined,
        hasPaymentMethod: Boolean(client.paymentEnc),
        createdAt: client.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
