import { Router } from 'express';
import { prisma } from '../prisma';
import { config } from '../config';
import { trackingIdOf } from '../middleware/requestId';

const router = Router();

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('probe timeout')), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

/**
 * GET /health — unauthenticated, ultra-low-latency (spec §6).
 * 200 {status:'UP',…} when DB (+cache if configured) respond; else 503 for orchestrator failover.
 */
router.get('/', async (req, res) => {
  const started = Date.now();
  let database: 'healthy' | 'unhealthy' = 'unhealthy';
  let cache: 'healthy' | 'unhealthy' | 'not-configured' = 'not-configured';

  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, 3000);
    database = 'healthy';
  } catch {
    database = 'unhealthy';
  }

  if (config.redisUrl) {
    try {
      const { default: IORedis } = await import('ioredis');
      const r = new IORedis(config.redisUrl, { maxRetriesPerRequest: 1, enableReadyCheck: true });
      await withTimeout(r.ping(), 2000);
      cache = 'healthy';
      r.disconnect();
    } catch {
      cache = 'unhealthy';
    }
  }

  const mem = process.memoryUsage();
  const payload = {
    status: database === 'healthy' && cache !== 'unhealthy' ? 'UP' : 'DOWN',
    timestamp: new Date().toISOString(),
    latency_ms: Date.now() - started,
    services: { database, cache },
    system: {
      heap_used_mb: Math.round(mem.heapUsed / 1048576),
      heap_total_mb: Math.round(mem.heapTotal / 1048576),
      rss_mb: Math.round(mem.rss / 1048576),
      uptime_s: Math.round(process.uptime()),
      node: process.version,
    },
  };
  void trackingIdOf(req);
  res.setHeader('X-Tracking-Id', trackingIdOf(req));
  if (payload.status === 'UP') {
    res.json(payload);
  } else {
    res.status(503).json(payload);
  }
});

export default router;
