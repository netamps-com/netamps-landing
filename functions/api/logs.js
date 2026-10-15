import { verifySession } from './intake/auth';
import { appendChainedAudit, ensureAuditChain, verifyChain, detectAnomalies } from '../_lib/audit-chain.js';

/**
 * /api/logs — website audit-log store and reader.
 *
 * Workers-compatible by design: ZERO npm imports. D1 (DB binding) is the
 * queryable store the dashboard reads; the native R2 binding (LOGS_BUCKET)
 * is an optional cold archive. Postgres-over-TCP and SigV4 helper libraries
 * are IMPOSSIBLE here (no TCP, and unlisted deps break `npm ci` bundling) —
 * do not re-add them.
 *
 * Auth posture (deliberate split):
 *  - POST stays open: public pages (returns OTP flow) emit audit events
 *    fire-and-forget; gating it would silently drop their trail. Payload is
 *    length-capped and append-only — the worst abuse is log spam, which the
 *    admin viewer + retention prune absorbs.
 *  - GET requires any authenticated session: rows carry usernames, IPs and
 *    details that must never serve the open internet.
 *  - DELETE requires admin: wiping the audit trail is irreversible.
 *
 * Required binding (Pages → Settings → Functions):
 *   DB  D1 database binding (same database the OTP module uses is fine)
 */

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function ensureTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS audit_logs (
       id TEXT PRIMARY KEY,
       timestamp TEXT,
       event_type TEXT,
       page TEXT,
       details TEXT,
       username TEXT,
       ip_address TEXT
     )`
  ).run();
  // Index for 1M-row pagination performance (timestamp DESC sort)
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_logs(timestamp DESC)'
  ).run();
  // Tamper-evidence columns (idempotent; legacy rows stay NULL = genesis state)
  await ensureAuditChain(env);
}

export async function onRequestPost({ request, env }) {
  try {
    let log;
    try {
      log = await request.json();
    } catch {
      return json({ success: false, message: 'Invalid request body' }, 400);
    }

    if (!log || typeof log !== 'object' || !log.id || !log.timestamp || !log.eventType) {
      return json({ success: false, message: 'id, timestamp and eventType are required' }, 400);
    }

    if (env.DB) {
      await ensureTable(env);
      // Hash-chained append (tamper-evident; falls back to a plain insert if
      // the chain cannot be computed so an audit event is never lost).
      await appendChainedAudit(env, {
        id: String(log.id).slice(0, 64),
        timestamp: String(log.timestamp).slice(0, 64),
        event_type: String(log.eventType).slice(0, 64),
        page: String(log.page || '').slice(0, 200),
        details: String(log.details || '').slice(0, 4000),
        username: String(log.user || '').slice(0, 254),
        ip_address: String(log.ipAddress || '').slice(0, 64)
      });
    } else {
      console.warn('[logs] No DB binding; audit event accepted to local fallback only.');
    }

    // Optional cold archive via native R2 binding (no credentials needed in code)
    if (env.LOGS_BUCKET && typeof env.LOGS_BUCKET.put === 'function') {
      try {
        await env.LOGS_BUCKET.put(`logs/${String(log.id).slice(0, 64)}.json`, JSON.stringify(log));
      } catch (err) {
        console.error('[logs] R2 archive failed (non-fatal):', err);
      }
    }

    return json({ success: true });
  } catch (err) {
    console.error('[logs] POST error:', err);
    return json({ success: false, message: 'Failed to store audit log.' }, 500);
  }
}

export async function onRequestGet({ request, env }) {
  try {
    const user = await verifySession(env, request);
    if (!user) {
      return json({ success: false, message: 'Unauthorized' }, 401);
    }
    if (!env.DB || typeof env.DB.prepare !== 'function') {
      return json({ success: true, logs: [], total: 0, store: 'none' });
    }
    await ensureTable(env);
    // Server-side range/search/pagination so the viewer scales to 1M+ rows.
    // All inputs strictly shaped; anything else falls back to the default window
    // rather than erroring the whole read.
    let since = null;
    let q = null;
    let limit = 100;
    let offset = 0;
    try {
      const url = new URL(request.url);
      const sinceRaw = url.searchParams.get('since');
      if (sinceRaw && /^\d{4}-\d{2}-\d{2}/.test(sinceRaw)) since = sinceRaw.slice(0, 10);
      const qRaw = (url.searchParams.get('q') || '').trim().slice(0, 120);
      if (qRaw) q = `%${qRaw.replace(/[%_]/g, '')}%`;
      const limRaw = parseInt(url.searchParams.get('limit') || '', 10);
      if (Number.isInteger(limRaw) && limRaw > 0) limit = Math.min(limRaw, 5000);
      const offRaw = parseInt(url.searchParams.get('offset') || '', 10);
      if (Number.isInteger(offRaw) && offRaw >= 0) offset = Math.min(offRaw, 1000000);
    } catch {}
    let query = 'SELECT * FROM audit_logs';
    let countQuery = 'SELECT COUNT(*) as total FROM audit_logs';
    const clauses = [];
    const params = [];
    if (since) {
      clauses.push('timestamp >= ?');
      params.push(since);
    }
    if (q) {
      clauses.push('(event_type LIKE ? OR details LIKE ? OR username LIKE ? OR page LIKE ?)');
      params.push(q, q, q, q);
    }
    if (clauses.length > 0) {
      const where = ' WHERE ' + clauses.join(' AND ');
      query += where;
      countQuery += where;
    }
    // Total count (same WHERE clause — counter and page can never disagree)
    const countRes = await env.DB.prepare(countQuery).bind(...params).first();
    const total = countRes && typeof countRes.total === 'number' ? countRes.total : 0;
    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const { results } = await env.DB.prepare(query).bind(...params).all();
    const formattedLogs = (results || []).map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      eventType: row.event_type,
      page: row.page,
      details: row.details,
      user: row.username,
      ipAddress: row.ip_address
    }));
    return json({ success: true, logs: formattedLogs, total, store: 'd1', limit, offset });
  } catch (err) {
    console.error('[logs] GET error:', err);
    return json({ success: false, message: 'Failed to read audit logs.' }, 500);
  }
}

/**
 * GET /api/logs/verify — admin-only integrity check.
 *
 * Proves the audit trail has not been edited or truncated: walks the hash chain,
 * reports the first break, and returns anomaly findings (SOC 2 CC7.2).
 */
export async function onRequestGetIntegrity({ request, env }) {
  try {
    const user = await verifySession(env, request);
    const isAdmin = user && (user.role === 'admin' || user.email === 'admin@netamps.com');
    if (!user) return json({ success: false, message: 'Unauthorized' }, 401);
    if (!isAdmin) return json({ success: false, message: 'Forbidden' }, 403);

    await ensureTable(env);
    const chain = await verifyChain(env);
    const anomalies = await detectAnomalies(env);

    // A detected break or high-severity anomaly is logged so the tampering
    // attempt is itself part of the (new) chain.
    if (!chain.valid || anomalies.some((a) => a.severity === 'high')) {
      try {
        await appendChainedAudit(env, {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          event_type: chain.valid ? 'AUDIT_ANOMALY' : 'AUDIT_TAMPER_DETECTED',
          page: 'Dashboard Page',
          details: JSON.stringify({ chain, anomalies }).slice(0, 4000),
          username: String(user.email || 'unknown').slice(0, 254),
          ip_address: (request.headers.get('cf-connecting-ip') || 'unknown').slice(0, 64)
        });
      } catch {}
    }

    return json({
      success: true,
      chain: {
        valid: chain.valid,
        verifiedRows: chain.checked,
        legacyUnhashedRows: chain.legacy,
        brokenAt: chain.brokenAt,
        reason: chain.reason,
        headHash: chain.head
      },
      anomalies
    });
  } catch (err) {
    console.error('[logs] integrity check error:', err);
    return json({ success: false, message: 'Failed to verify audit integrity.' }, 500);
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    const user = await verifySession(env, request);
    const isAdmin = user && (user.role === 'admin' || user.email === 'admin@netamps.com');
    if (!isAdmin) {
      return json({ success: false, message: 'Forbidden' }, 403);
    }
    if (!env.DB || typeof env.DB.prepare !== 'function') {
      return json({ success: false, message: 'DB not connected' }, 500);
    }
    let reason = '';
    try {
      const body = await request.json().catch(() => ({}));
      if (body && typeof body.reason === 'string') reason = body.reason.slice(0, 280);
    } catch {}
    await ensureTable(env);
    // Purging the log BREAKS the chain by definition. The tombstone records the
    // destruction (appended to the new, post-purge chain head) and the
    // truncation becomes permanently provable rather than invisible.
    const rowsBefore = await env.DB.prepare('SELECT COUNT(*) as c FROM audit_logs').first().catch(() => null);
    await env.DB.prepare('DELETE FROM audit_logs').run();
    // Tombstone: the destruction is itself recorded, or clearing deletes
    // the evidence of clearing.
    try {
      await appendChainedAudit(env, {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        event_type: 'LOGS_CLEARED',
        page: 'Dashboard Page',
        details: JSON.stringify({
          reason: reason || 'not stated',
          purgedRows: rowsBefore && typeof rowsBefore.c === 'number' ? rowsBefore.c : null,
          note: 'chain truncated here by an authorized purge'
        }).slice(0, 4000),
        username: String(user.email || 'unknown').slice(0, 254),
        ip_address: String(request.headers.get('cf-connecting-ip') || 'unknown').slice(0, 64)
      });
    } catch {}
    return json({ success: true, message: 'Logs cleared successfully' });
  } catch (err) {
    console.error('[logs] DELETE error:', err);
    return json({ success: false, message: 'Failed to clear audit logs.' }, 500);
  }
}
