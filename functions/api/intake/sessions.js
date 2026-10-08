import { verifySession } from './auth';

export async function onRequestGet({ request, env }) {
  try {
    const user = await verifySession(env, request);
    if (!user) {
      return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    const ownerEmail = user.email;

    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    // 2. Fetch logic (Admin vs User)
    const isAdmin = user.role === 'admin' || ownerEmail === 'admin@netamps.com';

    let query;
    let params;

    if (id) {
      if (isAdmin) {
        query = 'SELECT * FROM intake_sessions WHERE id = ?';
        params = [id];
      } else {
        query = 'SELECT * FROM intake_sessions WHERE id = ? AND owner_email = ?';
        params = [id, ownerEmail];
      }
      
      if (env.CACHE_KV) {
        const cachedStr = await env.CACHE_KV.get(`session:${id}`);
        if (cachedStr) {
          const cachedSession = JSON.parse(cachedStr);
          if (isAdmin || cachedSession.owner_email === ownerEmail) {
            return new Response(JSON.stringify({ success: true, session: cachedSession }), { headers: { 'Content-Type': 'application/json' } });
          }
        }
      }
      
      const { results } = await env.DB.prepare(query).bind(...params).all();
      
      if (results.length === 0) {
        return new Response(JSON.stringify({ success: false, message: 'Not found or forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
      }
      
      const sessionRow = results[0];
      const assetsQuery = await env.DB.prepare('SELECT data FROM intake_assets WHERE session_id = ? ORDER BY row_no ASC').bind(id).all();
      const rows = assetsQuery.results.map(r => {
        try { return JSON.parse(r.data); } catch { return {}; }
      });
      
      const payload = {
        mapping: sessionRow.mapping ? JSON.parse(sessionRow.mapping) : {},
        rows: rows
      };
      
      const fullSession = { ...sessionRow, data: payload };
      
      if (env.CACHE_KV) {
        await env.CACHE_KV.put(`session:${id}`, JSON.stringify(fullSession), { expirationTtl: 3600 });
      }
      
      return new Response(JSON.stringify({ success: true, session: fullSession }), { headers: { 'Content-Type': 'application/json' } });
    } else {
      if (isAdmin) {
        query = 'SELECT id, owner_email, status, created_at FROM intake_sessions ORDER BY created_at DESC';
        params = [];
      } else {
        query = 'SELECT id, owner_email, status, created_at FROM intake_sessions WHERE owner_email = ? ORDER BY created_at DESC';
        params = [ownerEmail];
      }
      
      const { results } = await env.DB.prepare(query).bind(...params).all();
      return new Response(JSON.stringify({ success: true, sessions: results }), { headers: { 'Content-Type': 'application/json' } });
    }
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const user = await verifySession(env, request);
    if (!user) {
      return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    const ownerEmail = user.email;
    const isAdmin = user.role === 'admin';

    const body = await request.json();
    const { id, data, status } = body;

    if (!id || !data) {
      return new Response(JSON.stringify({ success: false, message: 'Missing required fields' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Ownership guard on update (BOLA): an existing session owned by someone
    // else can only be overwritten by an admin. Missing table → guard skipped,
    // upsert below creates it owned by the caller (correct either way).

    // Ensure tables exist (for environments where schema.sql isn't run automatically)
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS intake_sessions (
          id TEXT PRIMARY KEY,
          owner_email TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'DRAFT',
          mapping TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS intake_assets (
          session_id TEXT NOT NULL,
          row_no INTEGER NOT NULL,
          data TEXT NOT NULL,
          PRIMARY KEY (session_id, row_no)
      )
    `).run();

    const mappingStr = data.mapping ? JSON.stringify(data.mapping) : '{}';

    try {
      const existing = await env.DB.prepare('SELECT owner_email FROM intake_sessions WHERE id = ?1').bind(id).first();
      if (existing && existing.owner_email !== ownerEmail && !isAdmin) {
        return new Response(JSON.stringify({ success: false, message: 'Not found or forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
      }
    } catch {
      // Table may not exist yet — upsert below creates it owned by the caller.
    }

    await env.DB.prepare(
      'INSERT INTO intake_sessions (id, owner_email, status, mapping) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET mapping=excluded.mapping, status=excluded.status, updated_at=CURRENT_TIMESTAMP'
    ).bind(id, ownerEmail, status || 'DRAFT', mappingStr).run();

    // Invalidate cache since we are updating
    if (env.CACHE_KV) {
      await env.CACHE_KV.delete(`session:${id}`);
    }

    // Insert assets
    if (data.rows && Array.isArray(data.rows)) {
      // Queue messages are capped at 128 KiB, so large payloads are split into
      // small chunk messages ({rows, base}) the consumer inserts idempotently.
      // Queue path is best-effort with inline-D1 fallback, never fatal.
      let queued = false;
      if (data.rows.length > 500 && env.INTAKE_QUEUE && typeof env.INTAKE_QUEUE.send === 'function') {
        try {
          const CHUNK = 50;
          for (let base = 0; base < data.rows.length; base += CHUNK) {
            await env.INTAKE_QUEUE.send({ sessionId: id, ownerEmail, rows: data.rows.slice(base, base + CHUNK), base });
          }
          queued = true;
        } catch {
          queued = false;
        }
      }
      if (!queued) {
        // D1 batches for performance
        const stmt = env.DB.prepare('INSERT INTO intake_assets (session_id, row_no, data) VALUES (?, ?, ?) ON CONFLICT(session_id, row_no) DO UPDATE SET data=excluded.data');
        const batch = data.rows.map((row, idx) => stmt.bind(id, idx, JSON.stringify(row)));
        if (batch.length > 0) {
          // max batch size for D1 is 100, chunk it if large
          for (let i = 0; i < batch.length; i += 100) {
            await env.DB.batch(batch.slice(i, i + 100));
          }
        }
      }
      }
    }

    // A5 Guardrails: Log event (real audit_logs schema:
    // id, timestamp, event_type, page, details, username, ip_address)
    try {
      await env.DB.prepare(
        'INSERT INTO audit_logs (id, timestamp, event_type, page, details, username, ip_address) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
      ).bind(
        crypto.randomUUID(),
        new Date().toISOString(),
        status === 'EXPORTED' ? 'EXPORT' : 'INSPECT',
        'Intake Session',
        JSON.stringify({ session: id, row_count: Array.isArray(data.rows) ? data.rows.length : 0 }),
        ownerEmail,
        request.headers.get('cf-connecting-ip') || 'unknown'
      ).run();
    } catch(e) {}

    return new Response(JSON.stringify({ success: true, id }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
