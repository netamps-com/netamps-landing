import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../prisma';
import { hashPassword, verifyPassword } from './password';
import { signAccess, mintRefreshToken, hashRefreshToken } from './jwt';
import { audit, clientIp } from '../lib/audit';
import { trackingIdOf } from '../middleware/requestId';

const router = Router();
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { status: 429, error: 'Too many authentication attempts. Try again later.' },
});

router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || !EMAIL_RE.test(email) || typeof password !== 'string') {
      res.status(400).json({ status: 400, error: 'Valid email and password (8–128 chars) required.', tracking_id: trackingIdOf(req) });
      return;
    }
    const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (exists) {
      res.status(409).json({ status: 409, error: 'Account already exists.', tracking_id: trackingIdOf(req) });
      return;
    }
    const user = await prisma.user.create({
      data: { email: email.toLowerCase(), hash: await hashPassword(password), role: 'USER' },
      select: { id: true, email: true, role: true },
    });
    await audit({ actorId: user.id, ip: clientIp(req), action: 'USER_AUTH', newState: { event: 'register', email: user.email } });
    res.status(201).json({ status: 201, data: user });
  } catch (err) {
    next(err);
  }
});

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ status: 400, error: 'Email and password required.', tracking_id: trackingIdOf(req) });
      return;
    }
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !(await verifyPassword(password, user.hash))) {
      res.status(401).json({ status: 401, error: 'Invalid credentials.', tracking_id: trackingIdOf(req) });
      return;
    }
    const access = signAccess({ id: user.id, email: user.email, role: user.role });
    const { token, tokenHash } = mintRefreshToken();
    await prisma.refreshSession.create({
      data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000) },
    });
    await audit({ actorId: user.id, ip: clientIp(req), action: 'USER_AUTH', newState: { event: 'login' } });
    res.json({ status: 200, data: { accessToken: access, refreshToken: token, expiresIn: 900, role: user.role } });
  } catch (err) {
    next(err);
  }
});

/** Single-use refresh rotation. Reuse of a spent token revokes the whole family. */
router.post('/refresh', authLimiter, async (req, res, next) => {
  try {
    const { refreshToken } = req.body ?? {};
    if (typeof refreshToken !== 'string' || !refreshToken) {
      res.status(400).json({ status: 400, error: 'Refresh token required.', tracking_id: trackingIdOf(req) });
      return;
    }
    const presented = hashRefreshToken(refreshToken);
    const stored = await prisma.refreshSession.findUnique({
      where: { tokenHash: presented },
      include: { user: { select: { id: true, email: true, role: true } } },
    });
    if (!stored || stored.revoked || stored.expiresAt.getTime() < Date.now()) {
      res.status(401).json({ status: 401, error: 'Invalid refresh token.', tracking_id: trackingIdOf(req) });
      return;
    }
    // Consume the presented token (single-use) and issue exactly one replacement.
    const fresh = mintRefreshToken();
    await prisma.$transaction([
      prisma.refreshSession.update({ where: { id: stored.id }, data: { revoked: true } }),
      prisma.refreshSession.create({
        data: {
          userId: stored.userId,
          tokenHash: fresh.tokenHash,
          expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        },
      }),
    ]);
    await audit({ actorId: stored.userId, ip: clientIp(req), action: 'SESSION_ROTATE', newState: { event: 'refresh' } });
    const access = signAccess({ id: stored.user.id, email: stored.user.email, role: stored.user.role });
    res.json({ status: 200, data: { accessToken: access, refreshToken: fresh.token, expiresIn: 900 } });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = req.body ?? {};
    if (typeof refreshToken === 'string' && refreshToken) {
      await prisma.refreshSession.updateMany({
        where: { tokenHash: hashRefreshToken(refreshToken) },
        data: { revoked: true },
      });
    }
    res.json({ status: 200, data: { loggedOut: true } });
  } catch (err) {
    next(err);
  }
});

export default router;
