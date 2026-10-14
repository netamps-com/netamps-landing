/**
 * POST /api/secure-reconcile
 *
 * Verify that every attachment reference on an order still resolves to an object
 * in storage, and — only when the operator explicitly asks — prune the dead
 * references so the record stops claiming files it cannot serve.
 *
 * This endpoint was referenced by the dashboard ("Verify attachment keys")
 * before it existed, so the button surfaced a raw JSON.parse crash. It is
 * implemented now, report-first and fail-closed.
 *
 * Auth: admin session only (same gate as the other admin actions).
 * Storage: R2 bindings consulted in the CDN order — PRODUCTION → QUARANTINE →
 * EVIDENCE. `head()` is used so verification never downloads an object.
 */

import { verifySession } from './intake/auth';
import { serializeOrderRow, dbReady } from './negotiate/store.mjs';
import { reconcileOrder } from './reconcile/logic.mjs';

const MAX_REPORT = 200; // cap rows echoed back to the UI

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function isAdmin(user) {
  return !!user && (user.role === 'admin' || user.email === 'admin@netamps.com');
}

/** Buckets consulted in the same order the CDN uses. Absent bindings are skipped. */
function candidateBuckets(env) {
  const out = [];
  if (env.PRODUCTION_BUCKET && typeof env.PRODUCTION_BUCKET.get === 'function') out.push(env.PRODUCTION_BUCKET);
  if (env.QUARANTINE_BUCKET && typeof env.QUARANTINE_BUCKET.get === 'function') out.push(env.QUARANTINE_BUCKET);
  if (env.EVIDENCE_BUCKET && typeof env.EVIDENCE_BUCKET.get === 'function') out.push(env.EVIDENCE_BUCKET);
  return out;
}

/** True when the key exists in ANY bound bucket. Never throws. */
async function makeExists(buckets) {
  return async (key) => {
    for (const b of buckets) {
      try {
        if (typeof b.head === 'function') {
          if (await b.head(key)) return true;
        } else if (typeof b.get === 'function') {
          if (await b.get(key)) return true;
        }
      } catch { /* a bucket error is treated as "not here" — other buckets still decide */ }
    }
    return false;
  };
}

async function auditToD1(env, { event, requestId, actor, detail }) {
  try {
    await env.DB.prepare(
      `INSERT INTO audit_logs (id, timestamp, event_type, page, details, username, ip_address)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
    ).bind(
      crypto.randomUUID(), new Date().toISOString(), event, 'Dashboard — Key Reconciliation',
      JSON.stringify({ requestId, ...detail }), actor || 'unknown', 'unknown'
    ).run();
  } catch { /* audit must never break the operation */ }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!dbReady(env)) {
      return json({ success: false, message: 'Returns database is not attached.' }, 503);
    }
    const user = await verifySession(env, request);
    if (!user || !isAdmin(user)) {
      return json({ success: false, message: 'Forbidden' }, 403);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ success: false, message: 'Invalid request body' }, 400);
    }

    const requestId = typeof body.requestId === 'string' ? body.requestId.trim().toUpperCase() : '';
    if (!requestId || !/^[SB]-[A-Z0-9-]{3,64}$/.test(requestId)) {
      return json({ success: false, message: 'A valid request ID is required.' }, 400);
    }
    const prune = body.prune === true;

    const row = await env.DB.prepare('SELECT * FROM returns WHERE id = ?').bind(requestId).first();
    const order = serializeOrderRow(row);
    if (!order) {
      return json({ success: false, message: 'Request not found.' }, 404);
    }

    const buckets = candidateBuckets(env);
    const exists = await makeExists(buckets);
    const { report, nextOrder, dead } = reconcileOrder(order, exists);

    let prunedKeys = [];
    if (prune && dead.size > 0 && nextOrder) {
      await env.DB.prepare('UPDATE returns SET products = ?, attachedFiles = ? WHERE id = ?')
        .bind(JSON.stringify(nextOrder.products || []), JSON.stringify(nextOrder.attachedFiles || []), order.id)
        .run();
      prunedKeys = Array.from(dead);
      await auditToD1(env, {
        event: 'EVIDENCE_PRUNED',
        requestId: order.id,
        actor: user.email,
        detail: { prunedKeys, remaining: (nextOrder.attachedFiles || []).length, manifestStale: report.manifestStale }
      });
    } else if (!prune && dead.size > 0) {
      await auditToD1(env, {
        event: 'EVIDENCE_RECONCILED',
        requestId: order.id,
        actor: user.email,
        detail: { missing: Array.from(dead), missingCount: dead.size }
      });
    }

    const reportOut = {
      requestId: order.id,
      buckets: buckets.length,
      checked: report.checked,
      ok: report.ok,
      missing: report.missing.slice(0, MAX_REPORT),
      malformed: report.malformed.slice(0, MAX_REPORT),
      inline: report.inline,
      pruned: prunedKeys,
      manifestStale: report.manifestStale
    };

    return json({ success: true, reports: [reportOut] });
  } catch (err) {
    console.error('[reconcile] error:', err);
    return json({ success: false, message: 'Reconciliation failed. Please try again shortly.' }, 500);
  }
}
