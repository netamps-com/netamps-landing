/**
 * /api/logs — website audit-log store and reader.
 *
 * Workers-compatible by design: ZERO npm imports. D1 (DB binding) is the
 * queryable store the dashboard reads; the native R2 binding (LOGS_BUCKET)
 * is an optional cold archive. Postgres-over-TCP and SigV4 helper libraries
 * are IMPOSSIBLE here (no TCP, and unlisted deps break `npm ci` bundling) —
 * do not re-add them.
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

export async function onRequestGet({ env }) {
  try {
    if (!env.DB || typeof env.DB.prepare !== 'function') {
      return json({ success: true, logs: [] });
    }
    await ensureTable(env);
    const { results } = await env.DB.prepare(
      'SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 5000'
    ).all();
    const formattedLogs = (results || []).map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      eventType: row.event_type,
      page: row.page,
      details: row.details,
      user: row.username,
      ipAddress: row.ip_address
    }));
    return json({ success: true, logs: formattedLogs });
  } catch (err) {
    console.error('[logs] GET error:', err);
    return json({ success: false, message: 'Failed to read audit logs.' }, 500);
  }
}

export async function onRequestDelete({ env }) {
  try {
    if (!env.DB || typeof env.DB.prepare !== 'function') {
      return json({ success: false, message: 'DB not connected' }, 500);
    }
    await ensureTable(env);
    await env.DB.prepare('DELETE FROM audit_logs').run();
    return json({ success: true, message: 'Logs cleared successfully' });
  } catch (err) {
    console.error('[logs] DELETE error:', err);
    return json({ success: false, message: 'Failed to clear audit logs.' }, 500);
  }
}
