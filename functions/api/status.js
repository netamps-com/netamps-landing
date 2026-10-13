/**
 * GET /api/status
 *
 * Live system status endpoint. Runs on Cloudflare Pages Functions (Workers
 * runtime) so every response carries a fresh timestamp — unlike a statically
 * exported Next.js route, which would freeze data at build time.
 *
 * Honesty contract (no fabricated telemetry):
 *  - The service CATALOG (ids, names, categories, descriptions) is hardcoded
 *    inventory — that is the only hardcoded part, and it must be: these are
 *    names of things we own, not measurements.
 *  - Every status/latency is MEASURED per request by probing the real
 *    dependency. There are no uptime percentages anywhere: uptime requires
 *    history this endpoint does not keep. Clients must render latency +
 *    lastChecked, never a made-up %.
 *  - Degraded threshold: measured latency > 1500 ms. Any probe error (or a
 *    missing binding) is outage for that component — never silent green.
 *
 * NOTE: Do NOT re-create this as app/api/status/route.ts with edge/dynamic
 * config. This project deploys as a static export (`output: 'export'` in
 * next.config.mjs + `pages deploy out`), where dynamic Next routes are
 * silently dropped. All dynamic APIs belong here in functions/.
 */

const PROBE_TIMEOUT_MS = 5000;
const DEGRADED_LATENCY_MS = 1500;

// Hardcoded inventory — names of real dependencies, not measurements.
const CATALOG = [
  { id: 'core-fns', name: 'Pages Functions', category: 'Core Infrastructure', description: 'Serverless API runtime serving this response' },
  { id: 'core-d1', name: 'D1 Database (netamps-db)', category: 'Core Infrastructure', description: 'Primary datastore for requests, users, audit' },
  { id: 'core-email', name: 'Outbound Email (Resend API)', category: 'Core Infrastructure', description: 'Reachability of the mail delivery API (no credentials sent)' },
  { id: 'edge-r2e', name: 'Evidence Storage (R2)', category: 'Edge/CDN', description: 'Production object storage for attachments' },
  { id: 'edge-r2q', name: 'Quarantine Storage (R2)', category: 'Edge/CDN', description: 'Inbound object storage for uploads under scan' },
  { id: 'edge-ts', name: 'Bot Defense (Turnstile)', category: 'Edge/CDN', description: 'Reachability of the challenge verification endpoint' }
];

async function withTimeout(promise, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await promise(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

function classify(latency, err) {
  if (err) return 'outage';
  if (latency === null || latency === undefined) return 'outage';
  if (latency > DEGRADED_LATENCY_MS) return 'degraded';
  return 'operational';
}

async function probeD1(env) {
  const start = Date.now();
  try {
    if (!env.DB || typeof env.DB.prepare !== 'function') {
      return { latency: null, error: 'D1 binding not attached' };
    }
    await env.DB.prepare('SELECT 1').first();
    return { latency: Date.now() - start, error: null };
  } catch (err) {
    return { latency: null, error: String((err && err.message) || err) };
  }
}

async function probeR2(bucket, label) {
  const start = Date.now();
  try {
    if (!bucket || typeof bucket.list !== 'function') {
      return { latency: null, error: `${label} binding not attached` };
    }
    // list() on a (possibly empty) prefix proves binding + reachability
    // without requiring any canary object to exist.
    await bucket.list({ prefix: '__health__', limit: 1 });
    return { latency: Date.now() - start, error: null };
  } catch (err) {
    return { latency: null, error: String((err && err.message) || err) };
  }
}

async function probeHttp(url, init) {
  const start = Date.now();
  try {
    // Any HTTP response (even 4xx/5xx) proves reachability; only a network
    // failure (or timeout abort) is an outage. A 5xx is degraded, not down.
    const res = await withTimeout(
      (signal) => fetch(url, { ...init, signal }),
      PROBE_TIMEOUT_MS
    );
    const latency = Date.now() - start;
    if (res.status >= 500) return { latency, error: null, degraded: true };
    return { latency, error: null, degraded: false };
  } catch (err) {
    return { latency: null, error: String((err && err.message) || err), degraded: false };
  }
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const now = new Date().toISOString();

  const [d1, r2e, r2q, email, turnstile] = await Promise.all([
    probeD1(env),
    probeR2(env.PRODUCTION_BUCKET, 'Evidence R2'),
    probeR2(env.QUARANTINE_BUCKET, 'Quarantine R2'),
    // No credentials sent: an unauthenticated 401 still proves the API is up.
    probeHttp('https://api.resend.com/', { method: 'GET' }),
    // Empty verify body → 400 from a live endpoint; only network failure is outage.
    probeHttp('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST' })
  ]);

  const measured = { 'core-d1': d1, 'edge-r2e': r2e, 'edge-r2q': r2q, 'core-email': email, 'edge-ts': turnstile };

  const services = CATALOG.map((c) => {
    if (c.id === 'core-fns') {
      // This code is executing: the runtime is up by definition.
      return { ...c, status: 'operational', latency: 0, lastChecked: now };
    }
    const m = measured[c.id] || { latency: null, error: 'no probe' };
    const status = m.degraded ? 'degraded' : classify(m.latency, m.error);
    return {
      ...c,
      status,
      latency: m.latency,
      lastChecked: now,
      ...(m.error ? { note: m.error } : {})
    };
  });

  const overallStatus = services.some((s) => s.status === 'outage')
    ? 'outage'
    : services.some((s) => s.status === 'degraded')
    ? 'degraded'
    : services.some((s) => s.status === 'maintenance')
    ? 'maintenance'
    : 'operational';

  const operationalCount = services.filter((s) => s.status === 'operational').length;

  return new Response(
    JSON.stringify({
      timestamp: now,
      overallStatus,
      operationalCount,
      serviceCount: services.length,
      services
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    }
  );
}
