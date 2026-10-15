/**
 * POST /api/track/extract
 *
 * Buyer-pasted carrier page text goes in; a canonical milestone extraction
 * comes out. Read-only in v1: it classifies, it never mutates orders.
 *
 * Auth: buyer token from /api/track/verify-otp (`x-buyer-token` or
 * `Authorization: Bearer`), same convention as ../negotiate. The token is
 * scoped to an EMAIL. This endpoint is also an inference gate: without auth
 * it would be an open Workers AI oracle on arbitrary text, so unauthenticated
 * callers get 401 before any work happens.
 *
 * Cost control, in order:
 *   1. Content-addressed verdict cache (sha256 of trackingId + page text, 1h
 *      TTL): a repasted page costs zero inference and zero classification.
 *   2. Deterministic-first: `extractDeterministic` answers clear pages with no
 *      model call at all. The model is consulted only when ambiguous blocks
 *      remain, confidence is low, or nothing classified.
 *   3. Single small-model attempt (tier 'small', 3.5s budget). Soft failure —
 *      the deterministic result or `unmatched` is always a valid outcome.
 *
 * Contract: { success, source, trackingId, currentMilestone, unmatched,
 *   events, exceptionReason, confidence, reason, needsReview, cached }
 * `source`: 'cache' | 'deterministic' | 'llm' | 'llm-fallback' | 'unmatched'.
 */

import {
  MILESTONE_VERSION,
  extractDeterministic,
  buildMilestoneSystem,
  buildMilestoneUser,
  validateLlmPayload,
  mergeExtractions
} from './milestones.mjs';
import { runJson } from '../llm/client.mjs';
import { dbReady, getOrderById, verifyBuyerToken } from '../negotiate/store.mjs';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

// ── Rate limits (per-isolate, same convention as products/suggest.js) ────────
const RL_WINDOW_MS = 60 * 1000;
const RL_PER_IP = 30;
const RL_PER_TRACKING = 10;
const rlMap = new Map(); // key -> { windowStart, count }

function rateLimited(key, cap) {
  if (!key) return false;
  const now = Date.now();
  const rec = rlMap.get(key);
  if (!rec || now - rec.windowStart > RL_WINDOW_MS) {
    rlMap.set(key, { windowStart: now, count: 1 });
    return false;
  }
  rec.count += 1;
  if (rlMap.size > 5000) rlMap.clear();
  return rec.count > cap;
}

function readToken(request) {
  const direct = request.headers.get('x-buyer-token') || request.headers.get('x-order-token');
  if (direct) return direct.trim();
  const auth = request.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return m ? m[1].trim() : '';
}

let extractTablesReady = false;

async function ensureExtractTables(env) {
  if (extractTablesReady) return;
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS track_milestone_extractions (' +
      'id TEXT PRIMARY KEY,' +            // sha256(trackingId + pageText)
      'tracking_id TEXT,' +
      'email TEXT,' +                     // buyer mailbox that submitted it
      'current_milestone INTEGER,' +       // NULL when unmatched
      'unmatched INTEGER,' +
      'body TEXT,' +                      // full contract JSON
      'source TEXT,' +
      'model TEXT,' +
      'latency_ms INTEGER,' +
      'created_at TEXT' +
    ')'
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_track_milestone_tracking ON track_milestone_extractions(tracking_id, created_at)'
  ).run();
  extractTablesReady = true;
}

async function sha256Hex(s) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const CACHE_TTL_SQL = "datetime('now', '-1 hour')";

export async function onRequestPost({ request, env }) {
  try {
    if (!dbReady(env)) {
      return json({ success: false, message: 'Tracking is temporarily unavailable.' }, 503);
    }

    const ip = request.headers.get('cf-connecting-ip') ||
      (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
      'unknown';
    if (rateLimited(`ip:${ip}`, RL_PER_IP)) {
      return json({ success: false, message: 'Too many extraction requests.' }, 429);
    }

    // Auth first: no token, no inference spend. Same 401 shape as negotiate.
    const session = await verifyBuyerToken(env, readToken(request));
    if (!session) {
      return json({ success: false, message: 'Your verification has expired. Please verify again.' }, 401);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ success: false, message: 'Invalid request body.' }, 400);
    }

    const pageText = typeof body.pageText === 'string' ? body.pageText : '';
    const trackingId = typeof body.trackingId === 'string' ? body.trackingId.trim().slice(0, 64) : null;
    const requestId = typeof body.requestId === 'string' ? body.requestId.trim().slice(0, 32) : '';
    let referenceDate = new Date().toISOString();
    if (typeof body.referenceDate === 'string' && body.referenceDate) {
      const d = new Date(body.referenceDate);
      if (Number.isNaN(d.getTime())) {
        return json({ success: false, message: 'referenceDate must be ISO-8601.' }, 400);
      }
      referenceDate = d.toISOString();
    }

    if (!pageText || pageText.length < 10) {
      return json({ success: false, message: 'pageText is required (paste the carrier tracking page text).' }, 400);
    }
    if (pageText.length > 20000) {
      return json({ success: false, message: 'pageText exceeds the 20,000 character limit.' }, 400);
    }
    if (trackingId && rateLimited(`tid:${trackingId}`, RL_PER_TRACKING)) {
      return json({ success: false, message: 'Too many extraction requests for this tracking ID.' }, 429);
    }

    // requestId, when given, must belong to the token's email — same
    // non-enumerating 404 as negotiate (this token cannot probe other buyers).
    if (requestId) {
      const order = await getOrderById(env, requestId);
      const owner = order?.email ? String(order.email).trim().toLowerCase() : null;
      if (!owner || owner !== session.email) {
        return json({ success: false, message: 'Request not found.' }, 404);
      }
    }

    await ensureExtractTables(env);

    // ── 1. Verdict cache: identical paste costs nothing ──
    const cacheId = await sha256Hex(`${trackingId || ''}|${pageText}`);
    try {
      const cached = await env.DB.prepare(
        `SELECT body, source FROM track_milestone_extractions WHERE id = ?1 AND created_at > ${CACHE_TTL_SQL}`
      ).bind(cacheId).first();
      if (cached?.body) {
        const verdict = JSON.parse(cached.body);
        return json({ success: true, source: 'cache', cached: true, ...verdict });
      }
    } catch { /* cache miss or corrupt row — classify fresh */ }

    // ── 2. Deterministic-first: clear pages never reach inference ──
    const started = Date.now();
    const det = extractDeterministic(pageText, { referenceDate, trackingId });

    const needsModel =
      det.unmatched || det.ambiguousBlocks.length > 0 || det.confidence < 0.75;

    let verdict = { ...det, source: det.unmatched ? 'unmatched' : 'deterministic' };
    let model = null;

    // ── 3. Model fallback: disambiguate ONLY the undecided blocks ──
    if (needsModel) {
      const res = await runJson(env, {
        feature: 'track_milestone',
        promptVersion: MILESTONE_VERSION,
        tier: 'small',
        temperature: 0,
        maxTokens: 256,
        timeoutMs: 3500,
        system: buildMilestoneSystem(),
        user: buildMilestoneUser(det.ambiguousBlocks, { referenceDate, trackingId })
      });
      if (res?.ok === true && res.payload !== undefined && res.payload !== null) {
        const text = typeof res.payload === 'string' ? res.payload : JSON.stringify(res.payload);
        let reparsed = res.payload;
        if (typeof res.payload !== 'object') {
          try { reparsed = JSON.parse(text); } catch { reparsed = null; }
        }
        const checked = validateLlmPayload(reparsed, pageText, { referenceDate });
        if (checked.ok && checked.events.length > 0) {
          model = res.model || null;
          const merged = mergeExtractions(det, checked.events, { referenceDate });
          verdict = { ...merged, source: 'llm' };
        } else if (!checked.ok) {
          console.error('[track] milestone model verdict rejected', checked.reason);
          verdict = { ...det, source: 'llm-fallback' };
        } else {
          // Model honestly abstained: keep the deterministic verdict as-is.
          verdict = { ...det, source: det.unmatched ? 'unmatched' : 'deterministic' };
        }
      } else {
        // Soft failure — NO_AI_BINDING, LLM_DISABLED, MODEL_FAILED, timeout:
        // the deterministic verdict stands exactly as computed.
        verdict = { ...det, source: det.unmatched ? 'unmatched' : 'deterministic' };
      }
    }

    const latencyMs = Date.now() - started;
    const { ambiguousBlocks: _drop, ...contract } = verdict;

    // ── 4. Persist verdict (best-effort; never fails the request) ──
    try {
      await env.DB.prepare(
        'INSERT OR REPLACE INTO track_milestone_extractions ' +
        '(id, tracking_id, email, current_milestone, unmatched, body, source, model, latency_ms, created_at) ' +
        'VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)'
      ).bind(
        cacheId,
        trackingId,
        session.email,
        contract.currentMilestone,
        contract.unmatched ? 1 : 0,
        JSON.stringify(contract),
        contract.source,
        model,
        latencyMs,
        new Date().toISOString()
      ).run();
    } catch (err) {
      console.error('[track] extract persist failed', err?.message);
    }

    return json({ success: true, cached: false, ...contract });
  } catch (err) {
    console.error('[track] extract error:', err);
    return json({ success: false, message: 'Extraction service unavailable.' }, 500);
  }
}
