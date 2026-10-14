import { verifySession } from './intake/auth';
import { normalizeStatus, isClosed, STATUS } from './negotiate/core.mjs';
import { sendConfirmationEmail } from './email/confirm.js';
import { indexLinesFor, ensureMatchTables } from './match.js';
import { loadCatalog } from './products/suggest.js';

// Phase-1 match index maintenance (shared with match.js — one line
// definition via indexLinesFor, no drift). DELETE + INSERT per order keeps
// retries idempotent. Throws on failure: callers compensate (see POST).
export async function writeMatchLines(env, orderId, intent, products, pricingBasis) {
  const lines = indexLinesFor({ id: orderId, intent, products, pricingBasis });
  if (env.DB && typeof env.DB.prepare === 'function') {
    await ensureMatchTables(env);
    await env.DB.prepare('DELETE FROM match_lines WHERE order_id = ?').bind(orderId).run();
    for (const ln of lines) {
      await env.DB.prepare(
        'INSERT INTO match_lines (order_id, line_idx, side, norm_name, norm_model, raw_cat, raw_det, qty, ask_paise) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)'
      ).bind(ln.order_id, ln.line_idx, ln.side, ln.norm_name, ln.norm_model, ln.raw_cat, ln.raw_det, ln.qty, ln.ask_paise).run();
    }
  } else if (env.DATABASE_URL) {
    const { Client } = await import('pg');
    const client = new Client({ connectionString: env.DATABASE_URL });
    await client.connect();
    try {
      await client.query(`CREATE TABLE IF NOT EXISTS match_lines (
        order_id TEXT NOT NULL, line_idx INTEGER NOT NULL, side TEXT NOT NULL,
        norm_name TEXT NOT NULL, norm_model TEXT NOT NULL,
        raw_cat TEXT NOT NULL, raw_det TEXT NOT NULL,
        qty INTEGER NOT NULL, ask_paise NUMERIC,
        PRIMARY KEY (order_id, line_idx)
      )`);
      try { await client.query('CREATE INDEX IF NOT EXISTS idx_match_lines_key ON match_lines(side, norm_name, norm_model)'); } catch {}
      await client.query('DELETE FROM match_lines WHERE order_id = $1', [orderId]);
      for (const ln of lines) {
        await client.query(
          'INSERT INTO match_lines (order_id, line_idx, side, norm_name, norm_model, raw_cat, raw_det, qty, ask_paise) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
          [ln.order_id, ln.line_idx, ln.side, ln.norm_name, ln.norm_model, ln.raw_cat, ln.raw_det, ln.qty, ln.ask_paise]
        );
      }
    } finally {
      await client.end();
    }
  }
  return lines.length;
}

/**
 * Tier-2 normalization switch. Default OFF — enrichment is opt-in until the
 * operator has reviewed shadow-mode output. Uses the same match_meta key/value
 * gate the indexed matcher already uses (no new flag mechanism).
 */
async function normalizeEnabled(env) {
  if (!env.DB || typeof env.DB.prepare !== 'function') return false;
  try {
    const row = await env.DB
      .prepare("SELECT value FROM match_meta WHERE key = 'norm_enabled'")
      .bind()
      .first();
    return !!row && row.value === '1';
  } catch {
    return false;
  }
}

/**
 * Queue-first with inline fallback — mirrors the intake precedent
 * (intake/sessions.js). Fire-and-forget via context.waitUntil: the visitor's
 * response never waits on the model, and a normalization failure can never
 * fail, delay, or roll back a submission.
 */
function scheduleNormalization(context, env, order) {
  const work = (async () => {
    if (env.NORMALIZE_QUEUE && typeof env.NORMALIZE_QUEUE.send === 'function') {
      await env.NORMALIZE_QUEUE.send({ requestId: order.requestId });
      return;
    }
    const { normalizeOrder } = await import('./normalize/line.js');
    const summary = await normalizeOrder(env, order);
    console.log('[returns] normalization complete', JSON.stringify(summary));

    // External no-match enrichment (hint-only, async, quarantined).
    // Runs AFTER normalization, still inside waitUntil, so zero user latency.
    // Gated by match_meta 'enrich_enabled' (default OFF). Never throws into
    // the request path; a failure leaves user text untouched and matchable.
    try {
      const { enrichEnabled, enrichUnmatchedLines } = await import('./products/enrich.js');
      if (await enrichEnabled(env)) {
        const es = await enrichUnmatchedLines(env, { requestId: order.requestId, intent: order.intent });
        console.log('[returns] enrichment complete', JSON.stringify(es));
      }
    } catch (err) {
      console.error('[enrich] scheduled enrichment failed', order?.requestId, err?.message);
    }
  })().catch((err) => {
    // Enrichment is strictly additive; a failure here leaves every line on its
    // raw match key, which is still fully matchable.
    console.error('[normalize] scheduled normalization failed', order?.requestId, err?.message);
  });

  if (context && typeof context.waitUntil === 'function') {
    context.waitUntil(work);
  }
}

/**
 * BUY → SELL best-match candidates (advisory, cached, flag-gated).
 *
 * Runs in the same async post-submit window as normalization — never in the
 * request path, so the submitter never waits. Completely independent of the
 * exact matcher: it only ever writes the `match_candidates` cache. Gated by
 * match_meta `candidates_enabled` (default OFF), checked inside the module so
 * the flag can also be flipped off without a deploy.
 */
function scheduleCandidateGeneration(context, env, order) {
  const work = (async () => {
    const { candidatesEnabled, generateCandidatesForOrder } = await import('./matching/ranker.js');
    if (!(await candidatesEnabled(env))) return;
    const summary = await generateCandidatesForOrder(env, { requestId: order.requestId });
    console.log('[returns] candidate generation complete', JSON.stringify(summary));
  })().catch((err) => {
    // Advisory only: a failure here can never affect the order or its matches.
    console.error('[match-rank] scheduled candidate generation failed', order?.requestId, err?.message);
  });
  if (context && typeof context.waitUntil === 'function') {
    context.waitUntil(work);
  }
}

async function purgeMatchLines(env, orderId) {
  // Best-effort: index hygiene must never fail a deletion.
  try {
    if (env.DB && typeof env.DB.prepare === 'function') {
      await env.DB.prepare('DELETE FROM match_lines WHERE order_id = ?').bind(orderId).run();
    } else if (env.DATABASE_URL) {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: env.DATABASE_URL });
      await client.connect();
      try {
        await client.query('DELETE FROM match_lines WHERE order_id = $1', [orderId]);
      } finally {
        await client.end();
      }
    }
  } catch {}
}

export async function onRequestPost({ request, env, context }) {
  try {
    const returnReq = await request.json();

    // ── Schema gate (mirrors the intake workbench validator — keep the logic
    // identical; this file cannot import TS. Fail-closed 422, never coercion.
    // The returns form always submits numeric qty ≥ 1 + OTP-verified email, so
    // legitimate flows pass; bulk override-commits surface per-item 422s. ──
    const badRequest = (message) => new Response(JSON.stringify({ success: false, message }), {
      status: 422, headers: { 'Content-Type': 'application/json' }
    });
    const EMAIL_RE_RETURNS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!returnReq || typeof returnReq !== 'object') return badRequest('Invalid request body.');
    if (typeof returnReq.id !== 'string' || returnReq.id.trim() === '' || returnReq.id.length > 128) {
      return badRequest('Request id is required.');
    }
    if (typeof returnReq.intent !== 'string' || !/^(sell|buy)$/i.test(returnReq.intent.trim())) {
      return badRequest('Intent must be sell or buy.');
    }
    if (typeof returnReq.email !== 'string' || !EMAIL_RE_RETURNS.test(returnReq.email.trim())) {
      return badRequest('A valid email is required.');
    }
    if (typeof returnReq.name !== 'string' || returnReq.name.trim() === '') {
      return badRequest('Client name is required.');
    }
    if (!Array.isArray(returnReq.products) || returnReq.products.length === 0) {
      return badRequest('At least one product line is required.');
    }
    if (returnReq.products.length > 10000) {
      return badRequest('Too many product lines.');
    }
    for (let i = 0; i < returnReq.products.length; i++) {
      const p = returnReq.products[i];
      if (!p || typeof p !== 'object') return badRequest(`Product line ${i + 1} is malformed.`);
      if (!Number.isInteger(p.quantity) || p.quantity <= 0 || !Number.isSafeInteger(p.quantity)) {
        return badRequest(`Product line ${i + 1}: quantity must be a positive safe integer.`);
      }
      // BUY precision shell: every line carries category + non-empty details.
      // Custom (unverified) lines satisfy this like any other — they are
      // flagged via `verification`, never rejected here.
      if (returnReq.intent === 'buy') {
        if (typeof p.category !== 'string' || p.category.trim() === '') {
          return badRequest(`Product line ${i + 1}: an equipment category is required.`);
        }
        if (typeof p.details !== 'string' || p.details.trim() === '') {
          return badRequest(`Product line ${i + 1}: details & specs are required.`);
        }
      }
    }

    // The model suggests, the catalog decides — re-validate any claimed
    // catalog id at submit time. A poisoned/stale id (absent from the
    // catalog) is DROPPED server-side: the line demotes to Custom
    // (unverified) instead of failing the request or passing as verified.
    if (returnReq.intent === 'buy') {
      let validIds = null;
      try {
        validIds = new Set((await loadCatalog(env)).map((e) => e.id));
      } catch { validIds = null; } // catalog unavailable → fail to Custom, not verified
      for (const p of returnReq.products) {
        const claimed = typeof p.catalogId === 'string' ? p.catalogId.trim() : '';
        if (claimed && validIds && validIds.has(claimed)) {
          p.catalogId = claimed;
          p.verification = 'catalog';
        } else {
          delete p.catalogId;
          p.verification = 'custom';
        }
      }
    }
    if (returnReq.pricingBasis === 'lot' && returnReq.lotConsiderationPaise !== null && returnReq.lotConsiderationPaise !== undefined) {
      if (!Number.isInteger(returnReq.lotConsiderationPaise) || returnReq.lotConsiderationPaise < 0) {
        return badRequest('Lot consideration must be integer paise or null.');
      }
    }

    // Money contract: evaluated prices are paise integers (pricePaise).
    // Legacy records carry rupee floats in `price` — converted once here,
    // never mixed with paise values in the same sum.
    const evalPaiseOf = (p) => {
      if (p && Number.isInteger(p.pricePaise) && p.pricePaise >= 0) return p.pricePaise;
      const legacy = Number(p && p.price);
      if (!Number.isFinite(legacy) || legacy < 0) return 0;
      return Math.round(legacy * 100);
    };
    const pricingBasis = returnReq.pricingBasis === 'lot' ? 'lot' : 'per_product';
    const lotPaise = Number.isInteger(returnReq.lotConsiderationPaise) && returnReq.lotConsiderationPaise >= 0
      ? returnReq.lotConsiderationPaise : null;

    let totalAmount = 0;
    (returnReq.products || []).forEach(p => {
       totalAmount += evalPaiseOf(p) * (Number(p.quantity) || 1);
    });

    if (env.DB) {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS returns (
          id TEXT PRIMARY KEY,
          intent TEXT,
          name TEXT,
          company TEXT,
          email TEXT,
          phone TEXT,
          products TEXT,
          attachedFiles TEXT,
          emailDeliveryStatus TEXT,
          date TEXT,
          status TEXT,
          totalAmount REAL,
          manifest TEXT,
          pricingBasis TEXT,
          lotConsiderationPaise INTEGER
        )
      `).run();
      
      try { await env.DB.prepare('ALTER TABLE returns ADD COLUMN totalAmount REAL').run(); } catch(e){}
      try { await env.DB.prepare('ALTER TABLE returns ADD COLUMN manifest TEXT').run(); } catch(e){}
      try { await env.DB.prepare('ALTER TABLE returns ADD COLUMN pricingBasis TEXT').run(); } catch(e){}
      try { await env.DB.prepare('ALTER TABLE returns ADD COLUMN lotConsiderationPaise INTEGER').run(); } catch(e){}

      await env.DB.prepare(
        'INSERT INTO returns (id, intent, name, company, email, phone, products, attachedFiles, emailDeliveryStatus, date, status, totalAmount, manifest, pricingBasis, lotConsiderationPaise) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        returnReq.id, 
        returnReq.intent, 
        returnReq.name, 
        returnReq.company, 
        returnReq.email, 
        returnReq.phone, 
        JSON.stringify(returnReq.products || []), 
        JSON.stringify(returnReq.attachedFiles || []), 
        returnReq.emailDeliveryStatus || '', 
        returnReq.date, 
        returnReq.status,
        totalAmount,
        returnReq.manifest ? JSON.stringify(returnReq.manifest) : null,
        pricingBasis,
        lotPaise
      ).run();

      // Phase-1 match index: mirror this order's matchable lines. Fail-closed
      // with compensation — a submission whose lines cannot be indexed throws
      // (after removing the just-inserted row) rather than recording into a
      // state the indexed matcher would silently miss. The outer catch turns
      // this into a 500, distinct from 422 validation refusals.
      try {
        await writeMatchLines(env, returnReq.id, returnReq.intent, returnReq.products || [], pricingBasis);
      } catch (lineErr) {
        try { await env.DB.prepare('DELETE FROM returns WHERE id = ?').bind(returnReq.id).run(); } catch {}
        try { await env.DB.prepare('DELETE FROM match_lines WHERE order_id = ?').bind(returnReq.id).run(); } catch {}
        console.error('[returns] Match-index write failed; submission rolled back:', lineErr);
        throw new Error('Failed to index the request for matching. Nothing was recorded — retry.');
      }
    } else if (env.DATABASE_URL) {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: env.DATABASE_URL });
      await client.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS returns (
          id VARCHAR(255) PRIMARY KEY,
          intent VARCHAR(50),
          name VARCHAR(255),
          company VARCHAR(255),
          email VARCHAR(255),
          phone VARCHAR(50),
          products TEXT,
          attachedFiles TEXT,
          emailDeliveryStatus VARCHAR(50),
          date VARCHAR(100),
          status VARCHAR(50),
          totalamount NUMERIC,
          manifest TEXT,
          pricingbasis TEXT,
          lotconsiderationpaise NUMERIC
        )
      `);
      try { await client.query('ALTER TABLE returns ADD COLUMN totalamount NUMERIC'); } catch(e){}
      try { await client.query('ALTER TABLE returns ADD COLUMN manifest TEXT'); } catch(e){}
      try { await client.query('ALTER TABLE returns ADD COLUMN pricingbasis TEXT'); } catch(e){}
      try { await client.query('ALTER TABLE returns ADD COLUMN lotconsiderationpaise NUMERIC'); } catch(e){}

      const pgPricingBasis = returnReq.pricingBasis === 'lot' ? 'lot' : 'per_product';
      const pgLotPaise = Number.isInteger(returnReq.lotConsiderationPaise) && returnReq.lotConsiderationPaise >= 0
        ? returnReq.lotConsiderationPaise : null;
      await client.query(
        'INSERT INTO returns (id, intent, name, company, email, phone, products, attachedFiles, emailDeliveryStatus, date, status, totalamount, manifest, pricingbasis, lotconsiderationpaise) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)',
        [
          returnReq.id, returnReq.intent, returnReq.name, returnReq.company, returnReq.email, returnReq.phone,
          JSON.stringify(returnReq.products || []), JSON.stringify(returnReq.attachedFiles || []),
          returnReq.emailDeliveryStatus || '', returnReq.date, returnReq.status, totalAmount,
          returnReq.manifest ? JSON.stringify(returnReq.manifest) : null, pgPricingBasis, pgLotPaise
        ]
      );
      // Phase-1 match index (PG mirror): same fail-closed compensation as D1.
      try {
        await writeMatchLines(env, returnReq.id, returnReq.intent, returnReq.products || [], pricingBasis);
      } catch (lineErr) {
        try { await client.query('DELETE FROM returns WHERE id = $1', [returnReq.id]); } catch {}
        try { await client.query('DELETE FROM match_lines WHERE order_id = $1', [returnReq.id]); } catch {}
        console.error('[returns] Match-index write failed; submission rolled back:', lineErr);
        try { await client.end(); } catch {}
        throw new Error('Failed to index the request for matching. Nothing was recorded — retry.');
      }
      await client.end();
    }

    // Submission confirmation (step 7 of the ordered pipeline): best-effort
    // post-insert send. Mail failure never fails the submission — the outcome
    // persists as confirmemailstatus for the dashboard badge + resend action.
    // A refused insert never reaches here, so phantom emails are impossible.
    let confirmEmail = 'queued';
    try {
      const result = await sendConfirmationEmail(env, {
        id: returnReq.id,
        intent: returnReq.intent,
        name: returnReq.name,
        company: returnReq.company,
        email: returnReq.email,
        phone: returnReq.phone,
        products: returnReq.products || [],
        pricingBasis,
        lotConsiderationPaise: lotPaise,
        date: returnReq.date,
        status: returnReq.status
      });
      confirmEmail = result.status;
    } catch {
      confirmEmail = 'failed';
    }

    // Tier-2 enrichment (D1 async): scheduled AFTER the row is committed and
    // indexed, so the visitor is already unblocked. Additive by construction —
    // it never rewrites the stored order and never touches match keys here.
    // Promotion to normalized keys is a separate, still-unimplemented step.
    if (await normalizeEnabled(env)) {
      scheduleNormalization(context, env, {
        requestId: returnReq.id,
        intent: returnReq.intent,
        products: returnReq.products || []
      });
    }

    // BUY → SELL best-match candidates: compute + cache, advisory only. Runs
    // async and independently of normalization (its own flag). Only BUY orders
    // produce candidates; a new SELL order instead bumps sell_book_version so
    // existing caches are seen as stale.
    if (String(returnReq.intent).toLowerCase() === 'buy') {
      scheduleCandidateGeneration(context, env, {
        requestId: returnReq.id,
        intent: returnReq.intent
      });
    } else {
      try {
        const { bumpSellBookVersion } = await import('./matching/ranker.js');
        await bumpSellBookVersion(env);
      } catch (err) {
        console.error('[match-rank] sell-book version bump failed', err?.message);
      }
    }

    return new Response(JSON.stringify({ success: true, confirmEmail }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function onRequestGet({ request, env }) {
  try {
    // Scoped tracking lookup: ?id=S-…/B-… returns exactly one record (or
    // fail-closed 400/404) so public tracking never downloads the whole
    // table. Full list only when no id is given (staff surfaces).
    let lookupId = null;
    try {
      const q = new URL(request.url).searchParams.get('id');
      if (q !== null) {
        const id = String(q).trim().toUpperCase();
        if (id === '' || !/^[SB]-[A-Z0-9-]{3,64}$/.test(id)) {
          return new Response(JSON.stringify({ success: false, message: 'Invalid tracking ID format.' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
        }
        lookupId = id;
      }
    } catch {
      lookupId = null;
    }
    // List mode serves the full customer table (names, emails, phones,
    // prices) — authenticated sessions only, never the open internet.
    // Scoped ?id= lookup stays public: IDs are unguessable with fail-closed
    // format gating, and buyers track without logging in.
    if (!lookupId) {
      const user = await verifySession(env, request);
      if (!user) {
        return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      }
    }
    if (env.DB) {
      // create table if not exists just in case it's empty
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS returns (
          id TEXT PRIMARY KEY,
          intent TEXT,
          name TEXT,
          company TEXT,
          email TEXT,
          phone TEXT,
          products TEXT,
          attachedFiles TEXT,
          emailDeliveryStatus TEXT,
          date TEXT,
          status TEXT
        )
      `).run();

      const { results } = lookupId
        ? await env.DB.prepare('SELECT * FROM returns WHERE id = ?').bind(lookupId).all()
        : await env.DB.prepare('SELECT * FROM returns ORDER BY date DESC').all();
      
      const parseManifest = (raw) => {
        if (!raw) return null;
        try { return JSON.parse(raw); } catch { return null; }
      };
      const parseFinalPrice = (raw) => {
        if (!raw) return null;
        try {
          const fp = JSON.parse(raw);
          if (fp && Number.isInteger(fp.version) && Number.isInteger(fp.totalPaise)) return fp;
          return null;
        } catch { return null; }
      };
      const returns = results.map(row => ({
        id: row.id,
        intent: row.intent,
        name: row.name,
        company: row.company,
        email: row.email,
        phone: row.phone,
        products: JSON.parse(row.products || '[]'),
        attachedFiles: JSON.parse(row.attachedFiles || '[]'),
        emailDeliveryStatus: row.emailDeliveryStatus || undefined,
        date: row.date,
        status: row.status,
        totalAmount: Number(row.totalAmount || row.totalamount || 0),
        pricingBasis: row.pricingBasis === 'lot' ? 'lot' : 'per_product',
        lotConsiderationPaise: Number.isInteger(row.lotConsiderationPaise) ? row.lotConsiderationPaise : null,
        manifest: parseManifest(row.manifest),
        finalPrice: parseFinalPrice(row.finalPrice),
        priceHistory: []
      }));
      // Attach append-only price history (best-effort; missing table = no history, never a read failure).
      try {
        const ids = returns.map(r => r.id);
        if (ids.length > 0) {
          const placeholders = ids.map(() => '?').join(',');
          const hist = await env.DB.prepare(
            `SELECT request_id, product_id, old_paise, new_paise, actor, at FROM price_history WHERE request_id IN (${placeholders}) ORDER BY at ASC`
          ).bind(...ids).all().catch(() => ({ results: [] }));
          const byReq = new Map();
          for (const h of ((hist && hist.results) || [])) {
            const arr = byReq.get(h.request_id) || [];
            arr.push({ productId: h.product_id, oldPaise: h.old_paise, newPaise: h.new_paise, actor: h.actor, at: h.at });
            byReq.set(h.request_id, arr);
          }
          for (const r of returns) r.priceHistory = byReq.get(r.id) || [];
        }
      } catch {}
      if (lookupId) {
        const hit = returns.find((r) => String(r.id).toUpperCase() === lookupId);
        if (!hit) {
          return new Response(JSON.stringify({ success: false, message: 'Request not found.' }), { status: 404, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } });
        }
        return new Response(JSON.stringify({ success: true, return: hit }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } });
      }
      return new Response(JSON.stringify({ success: true, returns }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } });
    } else if (env.DATABASE_URL) {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: env.DATABASE_URL });
      await client.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS returns (
          id VARCHAR(255) PRIMARY KEY,
          intent VARCHAR(50),
          name VARCHAR(255),
          company VARCHAR(255),
          email VARCHAR(255),
          phone VARCHAR(50),
          products TEXT,
          attachedFiles TEXT,
          emailDeliveryStatus VARCHAR(50),
          date VARCHAR(100),
          status VARCHAR(50)
        )
      `);
      const { rows } = lookupId
        ? await client.query('SELECT * FROM returns WHERE id = $1', [lookupId])
        : await client.query('SELECT * FROM returns ORDER BY date DESC');
      await client.end();
      const parseManifestPg = (raw) => {
        if (!raw) return null;
        try { return JSON.parse(raw); } catch { return null; }
      };
      const parseFinalPricePg = (raw) => {
        if (!raw) return null;
        try {
          const fp = JSON.parse(raw);
          if (fp && Number.isInteger(fp.version) && Number.isInteger(fp.totalPaise)) return fp;
          return null;
        } catch { return null; }
      };
      const returns = rows.map(row => ({
        id: row.id,
        intent: row.intent,
        name: row.name,
        company: row.company,
        email: row.email,
        phone: row.phone,
        products: JSON.parse(row.products || '[]'),
        attachedFiles: JSON.parse(row.attachedfiles || row.attachedFiles || '[]'),
        emailDeliveryStatus: row.emaildeliverystatus || row.emailDeliveryStatus || undefined,
        date: row.date,
        status: row.status,
        totalAmount: Number(row.totalAmount || row.totalamount || 0),
        pricingBasis: row.pricingbasis === 'lot' ? 'lot' : 'per_product',
        lotConsiderationPaise: (row.lotconsiderationpaise === null || row.lotconsiderationpaise === undefined)
          ? null
          : (Number.isInteger(Number(row.lotconsiderationpaise)) ? Number(row.lotconsiderationpaise) : null),
        manifest: parseManifestPg(row.manifest),
        finalPrice: parseFinalPricePg(row.finalprice)
      }));
      if (lookupId) {
        const hit = returns.find((r) => String(r.id).toUpperCase() === lookupId);
        if (!hit) {
          return new Response(JSON.stringify({ success: false, message: 'Request not found.' }), { status: 404, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } });
        }
        return new Response(JSON.stringify({ success: true, return: hit }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } });
      }
      return new Response(JSON.stringify({ success: true, returns }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } });
    }
    return new Response(JSON.stringify({ success: true, returns: [] }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function onRequestPut({ request, env }) {
  try {
    const update = await request.json();
    if (!update.id) throw new Error('ID required');

    // ── Status writes are guarded, not free-form ────────────────────────────
    // The lifecycle is a CLOSED vocabulary — only the rungs exist, so a typo
    // can never park an order somewhere the UI cannot render. And the closing
    // rung is reserved outright: "Order Deal Approved" is written exclusively
    // by the negotiation module's approve action, which freezes the final price
    // in the same breath. A bare status write would close a deal with no price
    // behind it, and would bypass the one-button rule that holds for BUY and
    // SELL alike.
    if (update.action === 'status') {
      const ALLOWED_STATUS = new Set([
        STATUS.PENDING, STATUS.ACCEPTED, STATUS.IN_PROGRESS, STATUS.AGREED,
        STATUS.DECLINED, STATUS.DEAL,
        'Approved', 'Rejected' // pre-lifecycle spellings still on older rows
      ]);
      if (typeof update.status !== 'string' || !ALLOWED_STATUS.has(update.status)) {
        return new Response(JSON.stringify({ success: false, message: 'Invalid status.' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      if (update.status === STATUS.DEAL) {
        return new Response(JSON.stringify({
          success: false,
          message: `A deal may only be closed with “${STATUS.DEAL}” from the Negotiations tab, where the final price is recorded alongside it.`
        }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // FinalPriceSnapshot validation: malformed snapshots are rejected, never
    // partially stored. Status and snapshot write atomically in one UPDATE.
    const validFinalPrice = (fp) => {
      if (fp === null || fp === undefined) return null;
      if (!fp || typeof fp !== 'object') throw new Error('Invalid finalPrice snapshot');
      if (!Number.isInteger(fp.version) || fp.version < 1) throw new Error('Invalid finalPrice snapshot');
      if (!Number.isInteger(fp.totalPaise) || fp.totalPaise < 0) throw new Error('Invalid finalPrice snapshot');
      if (!['evaluated', 'consideration', 'negotiated'].includes(fp.basis)) throw new Error('Invalid finalPrice snapshot');
      if (typeof fp.decidedAt !== 'string' || typeof fp.decidedBy !== 'string') throw new Error('Invalid finalPrice snapshot');
      if (!Array.isArray(fp.lines)) throw new Error('Invalid finalPrice snapshot');
      for (const l of fp.lines) {
        if (!l || typeof l.productId !== 'string') throw new Error('Invalid finalPrice snapshot');
        for (const k of ['askPaise', 'evaluatedPaise', 'settledPaise']) {
          if (l[k] !== null && !(Number.isInteger(l[k]) && l[k] >= 0)) throw new Error('Invalid finalPrice snapshot');
        }
      }
      if (fp.manifestHashAtApproval !== null && fp.manifestHashAtApproval !== undefined && typeof fp.manifestHashAtApproval !== 'string') {
        throw new Error('Invalid finalPrice snapshot');
      }
      return {
        version: fp.version,
        decidedAt: fp.decidedAt,
        decidedBy: fp.decidedBy,
        basis: fp.basis,
        totalPaise: fp.totalPaise,
        lines: fp.lines,
        manifestHashAtApproval: fp.manifestHashAtApproval ?? null
      };
    };

    if (env.DB) {
      try { await env.DB.prepare('ALTER TABLE returns ADD COLUMN finalPrice TEXT').run(); } catch(e){}
      // Permanent price audit trail: one append-only row per deal approval (the
      // FINAL price, with actor + timestamp). Never updated or deleted, and
      // never written for an intermediate edit — those live in the thread.
      try {
        await env.DB.prepare(
          `CREATE TABLE IF NOT EXISTS price_history (
            id TEXT PRIMARY KEY,
            request_id TEXT,
            product_id TEXT,
            old_paise INTEGER,
            new_paise INTEGER,
            actor TEXT,
            at TEXT
          )`
        ).run();
        await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_price_history_req ON price_history(request_id)').run();
      } catch(e){}
      // Audit posture: price_history records the FINAL price only. Intermediate
      // evaluated-price edits are negotiation fuel, not decisions — they live in
      // the thread (negotiation_rounds), never in the permanent trail.
      // A terminal rung is also permanent: a stale tab may not overwrite an
      // already-decided request.
      if (update.action === 'status') {
        try {
          const current = await env.DB.prepare('SELECT status FROM returns WHERE id = ?').bind(update.id).first();
          if (current && isClosed(normalizeStatus(current.status))) {
            return new Response(JSON.stringify({
              success: false,
              message: `This request is already “${normalizeStatus(current.status)}” and cannot be moved again.`
            }), { status: 409, headers: { 'Content-Type': 'application/json' } });
          }
        } catch { /* no row/table → the UPDATE simply matches nothing */ }
      }
      if (update.action === 'status') {
        if (update.finalPrice !== undefined) {
          const fp = validFinalPrice(update.finalPrice);
          let prevTotalPaise = null;
          try {
            const prev = await env.DB.prepare('SELECT finalPrice FROM returns WHERE id = ?').bind(update.id).first();
            const parsed = prev && prev.finalPrice ? JSON.parse(prev.finalPrice) : null;
            if (parsed && Number.isInteger(parsed.totalPaise)) prevTotalPaise = parsed.totalPaise;
          } catch(e){}
          await env.DB.prepare('UPDATE returns SET status = ?, finalPrice = ? WHERE id = ?').bind(update.status, fp ? JSON.stringify(fp) : null, update.id).run();
          if (fp) { // exactly one permanent row per approval: the deal price
            try {
              let actor = 'unknown';
              try {
                const sessionUser = await verifySession(env, request);
                if (sessionUser && sessionUser.email) actor = String(sessionUser.email).slice(0, 254);
              } catch {}
              await env.DB.prepare(
                'INSERT INTO price_history (id, request_id, product_id, old_paise, new_paise, actor, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
              ).bind(crypto.randomUUID(), update.id, null, prevTotalPaise, fp.totalPaise, actor, new Date().toISOString()).run();
            } catch(e){}
          }
        } else {
          await env.DB.prepare('UPDATE returns SET status = ? WHERE id = ?').bind(update.status, update.id).run();
        }
      } else if (update.action === 'emailDelivery') {
        await env.DB.prepare('UPDATE returns SET emailDeliveryStatus = ? WHERE id = ?').bind(update.emailDeliveryStatus, update.id).run();
      } else if (update.action === 'price') {
        // Evaluated-price edit. NO audit row is written here, by design: an
        // intermediate figure is not a decision. The permanent trail holds the
        // final price (written once, on approval); every step along the way is
        // captured in the negotiation thread instead.
        const { results } = await env.DB.prepare('SELECT products FROM returns WHERE id = ?').bind(update.id).all();
        if (results.length > 0) {
          const products = JSON.parse(results[0].products || '[]');
          const updatedProducts = products.map(p => {
            if (p.id !== update.productId) return p;
            const next = { ...p };
            if (update.pricePaise === null || update.pricePaise === undefined) {
              delete next.pricePaise;
            } else if (Number.isInteger(update.pricePaise) && update.pricePaise >= 0) {
              next.pricePaise = update.pricePaise;
            }
            return next;
          });
          const evalPaiseOf = (p) => {
            if (Number.isInteger(p.pricePaise) && p.pricePaise >= 0) return p.pricePaise;
            const legacy = Number(p.price);
            if (!Number.isFinite(legacy) || legacy < 0) return 0;
            return Math.round(legacy * 100);
          };
          let totalAmount = 0;
          updatedProducts.forEach(p => { totalAmount += evalPaiseOf(p) * (Number(p.quantity) || 1); });
          try { await env.DB.prepare('ALTER TABLE returns ADD COLUMN totalAmount REAL').run(); } catch(e){}
          await env.DB.prepare('UPDATE returns SET products = ?, totalAmount = ? WHERE id = ?').bind(JSON.stringify(updatedProducts), totalAmount, update.id).run();
        }
      }
    } else if (env.DATABASE_URL) {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: env.DATABASE_URL });
      await client.connect();
      try { await client.query('ALTER TABLE returns ADD COLUMN finalprice TEXT'); } catch(e){}
      try {
        await client.query(`CREATE TABLE IF NOT EXISTS price_history (
          id TEXT PRIMARY KEY, request_id TEXT, product_id TEXT,
          old_paise NUMERIC, new_paise NUMERIC, actor TEXT, at TEXT
        )`);
        await client.query('CREATE INDEX IF NOT EXISTS idx_price_history_req ON price_history(request_id)');
      } catch(e){}
      // Audit posture (mirrors the D1 branch): FINAL price only, terminal rung
      // is permanent.
      if (update.action === 'status') {
        try {
          const currentPg = await client.query('SELECT status FROM returns WHERE id = $1', [update.id]);
          const curStatus = currentPg.rows && currentPg.rows[0] && currentPg.rows[0].status;
          if (curStatus && isClosed(normalizeStatus(curStatus))) {
            return new Response(JSON.stringify({
              success: false,
              message: `This request is already “${normalizeStatus(curStatus)}” and cannot be moved again.`
            }), { status: 409, headers: { 'Content-Type': 'application/json' } });
          }
        } catch { /* no row/table → the UPDATE simply matches nothing */ }
      }
      if (update.action === 'status') {
        if (update.finalPrice !== undefined) {
          const fp = validFinalPrice(update.finalPrice);
          let prevTotalPaisePg = null;
          try {
            const prevRows = await client.query('SELECT finalprice FROM returns WHERE id = $1', [update.id]);
            const parsedPrev = prevRows.rows && prevRows.rows[0] && prevRows.rows[0].finalprice
              ? JSON.parse(prevRows.rows[0].finalprice) : null;
            if (parsedPrev && Number.isInteger(parsedPrev.totalPaise)) prevTotalPaisePg = parsedPrev.totalPaise;
          } catch(e){}
          await client.query('UPDATE returns SET status = $1, finalprice = $2 WHERE id = $3', [update.status, fp ? JSON.stringify(fp) : null, update.id]);
          if (fp) {
            try {
              let actorFinalPg = 'unknown';
              try {
                const sessionUser = await verifySession(env, request);
                if (sessionUser && sessionUser.email) actorFinalPg = String(sessionUser.email).slice(0, 254);
              } catch {}
              await client.query(
                'INSERT INTO price_history (id, request_id, product_id, old_paise, new_paise, actor, at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                [crypto.randomUUID(), update.id, null, prevTotalPaisePg, fp.totalPaise, actorFinalPg, new Date().toISOString()]
              );
            } catch(e){}
          }
        } else {
          await client.query('UPDATE returns SET status = $1 WHERE id = $2', [update.status, update.id]);
        }
      } else if (update.action === 'emailDelivery') {
        await client.query('UPDATE returns SET emailDeliveryStatus = $1 WHERE id = $2', [update.emailDeliveryStatus, update.id]);
      } else if (update.action === 'price') {
        // Evaluated-price edit — no audit row (final-price-only trail; see D1 branch).
        const { rows } = await client.query('SELECT products FROM returns WHERE id = $1', [update.id]);
        if (rows.length > 0) {
          const products = JSON.parse(rows[0].products || '[]');
          const updatedProducts = products.map(p => {
            if (p.id !== update.productId) return p;
            const next = { ...p };
            if (update.pricePaise === null || update.pricePaise === undefined) {
              delete next.pricePaise;
            } else if (Number.isInteger(update.pricePaise) && update.pricePaise >= 0) {
              next.pricePaise = update.pricePaise;
            }
            return next;
          });
          const evalPaiseOfPg = (p) => {
            if (Number.isInteger(p.pricePaise) && p.pricePaise >= 0) return p.pricePaise;
            const legacy = Number(p.price);
            if (!Number.isFinite(legacy) || legacy < 0) return 0;
            return Math.round(legacy * 100);
          };
          let totalAmount = 0;
          updatedProducts.forEach(p => { totalAmount += evalPaiseOfPg(p) * (Number(p.quantity) || 1); });
          try { await client.query('ALTER TABLE returns ADD COLUMN totalamount NUMERIC'); } catch(e){}
          await client.query('UPDATE returns SET products = $1, totalamount = $2 WHERE id = $3', [JSON.stringify(updatedProducts), totalAmount, update.id]);
        }
      }
      await client.end();
    }
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) throw new Error('ID required');

    if (env.DB) {
      await env.DB.prepare('DELETE FROM returns WHERE id = ?').bind(id).run();
      // Phase-1 match index hygiene: purge lines so deleted orders can never
      // match (best-effort — never fails the deletion).
      await purgeMatchLines(env, id);
    } else if (env.DATABASE_URL) {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: env.DATABASE_URL });
      await client.connect();
      await client.query('DELETE FROM returns WHERE id = $1', [id]);
      await client.end();
      await purgeMatchLines(env, id);
    }
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
