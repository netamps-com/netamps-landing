/**
 * POST /api/track/extract
 *
 * Buyer-pasted carrier page text goes in; a canonical milestone extraction
 * comes out. Read-only in v1: it classifies, it never mutates orders.
 *
 * Auth: buyer session from httpOnly cookie `netamps_session`. The session
 * is scoped to an EMAIL. This endpoint is also an inference gate: without
 * auth it would be an open Workers AI oracle on arbitrary text, so unauthenticated
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

// NEW: session validation
function validateSession(env, cookieValue) {
  if (!cookieValue) return { ok: false, reason: 'session_missing' };
  try {
    const id = cookieValue.trim();
    if (!id) return { ok: false, reason: 'session_empty' };
    const row = env.DB.prepare(
      'SELECT email, expires_at, last_accessed FROM sessions WHERE id = ?1'
    ).bind(id).first();
    if (!row) return { ok: false, reason: 'session_invalid' };
    // Absolute timeout check
    if (new Date() > new Date(row.expires_at)) {
      // Auto-expire and return invalid
      env.DB.prepare('DELETE FROM sessions WHERE id = ?1').bind(id).run();
      return { ok: false, reason: 'session_expired' };
    }
    // Idle timeout check
    if (new Date() - new Date(row.last_accessed) > IDLE_TTL_MS) {
      return { ok: false, reason: 'session_idle_timeout' };
    }
    // Update last_accessed
    env.DB.prepare(
      'UPDATE sessions SET last_accessed = ?1 WHERE id = ?2'
    ).bind(new Date().toISOString(), id).run();
    return { ok: true, email: row.email };
  } catch (err) {
    console.error('[track] session validation error', err);
    return { ok: false, reason: 'session_error' };
  }
}

// Legacy: verifyBuyerToken kept for backward compatibility but no longer used
// in the extract flow; kept here so the module's import interface doesn't break.

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

// ── Rate limits (per-isolate, same convention as products/suggest.js) ────────
const RL_WINDOW_MS = 60 * 1000;
const RL_PER_IP = 30;
const RL_PER_SESSION = 10;
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

function readSessionId(request) {
  const cookie = request.headers.get('cookie') || '';
  const m = /(^|;)\s*netamps_session=([^;]*)/.exec(cookie);
  return m ? m[2] : '';
}

// ── Rate limits per session ──
function sessionRateLimited(key, cap) {
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

// ── D1 table initialization ────────────────────────────────────────────────
async function ensureSessionsTable(env) {
  if (process.env.SESS_TABLE_READY) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      email TEXT,
      expires_at TEXT,
      created_at TEXT,
      last_accessed TEXT
    )`
  ).run();
  process.env.SESS_TABLE_READY = '1'; // in-memory flag; next invocation re‑creates the worker
}

// ── Rate limits (per-isolate, same convention as products/suggest.js) ────────
const RL_WINDOW_MS = 60 * 1000;
const RL_PER_IP = 30;
const RL_PER_SESSION = 10;
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

function readSessionId(request) {
  const cookie = request.headers.get('cookie') || '';
  const m = /(^|;)\s*netamps_session=([^;]*)/.exec(cookie);
  return m ? m[2] : '';
}

// ── Session rate limits ──
function sessionRateLimited(key, cap) {
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

// ── Full request handler ───────────────────────────────────────────────────
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

    // NEW: ensure sessions table exists
    await ensureSessionsTable(env);

    // NEW: validate session from httpOnly cookie
    const session = validateSession(env, readSessionId(request));
    if (!session.ok) {
      const reasons = {
        session_missing: 'Session cookie required. Please log in again.',
        session_empty: 'Session cookie empty. Please log in again.',
        session_invalid: 'Session invalid. Please log in again.',
        session_expired: 'Session expired. Please log in again.',
        session_idle_timeout: 'Session timed out from inactivity. Please log in again.',
        session_error: 'Session validation error. Please try again.'
      };
      return json({ success: false, message: reasons[session.reason] || 'Session validation failed.', error: session.reason }, 401);
    }

    const sessionEmail = session.email;

    // NEW: per-session rate limiting
    if (sessionRateLimited(`session:${sessionEmail}`, RL_PER_SESSION)) {
      return json({ success: false, message: 'Too many extraction requests.' }, 429);
    }

    const ip = request.headers.get('cf-connecting-ip') ||
      (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    if (rateLimited(`ip:${ip}`, RL_PER_IP)) {
      return json({ success: false, message: 'Too many extraction requests.' }, 429);
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
    if (trackingId && rateLimited(`tid:${trackingId}`, RL_PER_SESSION)) {
      return json({ success: false, message: 'Too many extraction requests for this tracking ID.' }, 429);
    }

    // requestId, when given, must belong to the session's email — same
    // non-enumerating 404 as negotiate (this token cannot probe other buyers).
    if (requestId) {
      const order = await getOrderById(env, requestId);
      const owner = order?.email ? String(order.email).trim().toLowerCase() : null;
      if (!owner || owner !== sessionEmail) {
        return json({ success: false, message: 'Request not found.' }, 404);
      }
    }

    await ensureSessionsTable(env);

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
          verdict = { ...det, source: det.unmatched ? 'unmatched' : 'deterministic' };
        }
      } else {
        // Soft failure — NO_AI_BINDING, LLM_DISABLED, MODEL_FAILED, timeout:
        verdict = { ...det, source: det.unmatched ? 'unmatched' : 'deterministic' };
      }
    }

    const latencyMs = Date.now() - started;
    const { ambiguousBlocks: _drop, ...contract } = verdict;

    // ── 4. Persist verdict (best-effort; never fails the request) ──
    try {
      await env.DB.prepare(
        'INSERT OR REPLACE INTO track_milestone_extractions '
      ).bind(
        cacheId,
        trackingId,
        sessionEmail,
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