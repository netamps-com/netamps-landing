import { verifySession } from './intake/auth';

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
      await env.DB.prepare(
        'INSERT INTO audit_logs (id, timestamp, event_type, page, details, username, ip_address) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
      ).bind(
        String(log.id).slice(0, 64),
        String(log.timestamp).slice(0, 64),
        String(log.eventType).slice(0, 64),
        String(log.page || '').slice(0, 200),
        String(log.details || '').slice(0, 4000),
        String(log.user || '').slice(0, 254),
        String(log.ipAddress || '').slice(0, 64)
      ).run();
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
      return json({ success: true, logs: [], store: 'none' });
    }
    await ensureTable(env);
    // Server-side range/search so the viewer never needs rewriting at
    // volume. All inputs strictly shaped; anything else falls back to the
    // default window rather than erroring the whole read.
    let since = null;
    let q = null;
    let limit = 5000;
    try {
      const url = new URL(request.url);
      const sinceRaw = url.searchParams.get('since');
      if (sinceRaw && /^\d{4}-\d{2}-\d{2}/.test(sinceRaw)) since = sinceRaw.slice(0, 10);
      const qRaw = (url.searchParams.get('q') || '').trim().slice(0, 120);
      if (qRaw) q = `%${qRaw.replace(/[%_]/g, '')}%`;
      const limRaw = parseInt(url.searchParams.get('limit') || '', 10);
      if (Number.isInteger(limRaw) && limRaw > 0) limit = Math.min(limRaw, 5000);
    } catch {}
    let query = 'SELECT * FROM audit_logs';
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
    if (clauses.length > 0) query += ' WHERE ' + clauses.join(' AND ');
    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);
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
    return json({ success: true, logs: formattedLogs, store: 'd1' });
  } catch (err) {
    console.error('[logs] GET error:', err);
    return json({ success: false, message: 'Failed to read audit logs.' }, 500);
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
    await env.DB.prepare('DELETE FROM audit_logs').run();
    // Tombstone: the destruction is itself recorded, or clearing deletes
    // the evidence of clearing.
    try {
      await env.DB.prepare(
        'INSERT INTO audit_logs (id, timestamp, event_type, page, details, username, ip_address) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
      ).bind(
        crypto.randomUUID(), new Date().toISOString(), 'LOGS_CLEARED', 'Dashboard Page',
        JSON.stringify({ reason: reason || 'not stated' }), String(user.email || 'unknown').slice(0, 254),
        request.headers.get('cf-connecting-ip') || 'unknown'
      ).run();
    } catch {}
    return json({ success: true, message: 'Logs cleared successfully' });
  } catch (err) {
    console.error('[logs] DELETE error:', err);
    return json({ success: false, message: 'Failed to clear audit logs.' }, 500);
  }
}
