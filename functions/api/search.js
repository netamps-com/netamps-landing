/**
 * POST (or GET) /api/search — staff order search.
 *
 * Thin route over `./search/core.mjs`, which owns the ordering guarantee:
 * exact filters become SQL, free text is model-assisted only by SELECTING
 * from a pool the database already enumerated. See the core module for why.
 *
 * Both verbs are supported so the search is linkable, but the dashboard uses
 * POST: a buyer's email address has no business sitting in a URL that ends up
 * in request logs, browser history and referrer headers.
 */

import { verifySession } from './intake/auth';
import { dbReady } from './negotiate/store.mjs';
import { runSearch } from './search/core.mjs';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

/**
 * Best-effort SIEM row. Searching over buyer records is PII enumeration, so
 * it is recorded — but a logging failure must never fail the search itself.
 */
async function auditSearch(env, user, summary) {
  try {
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, timestamp TEXT, event_type TEXT, page TEXT, details TEXT, username TEXT, ip_address TEXT)'
    ).run();
    await env.DB.prepare(
      'INSERT INTO audit_logs (id, timestamp, event_type, page, details, username, ip_address) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
    ).bind(
      crypto.randomUUID(),
      new Date().toISOString(),
      'SEARCH',
      '/dashboard/search',
      JSON.stringify(summary).slice(0, 2000),
      user?.email || user?.username || 'unknown',
      null
    ).run();
  } catch (err) {
    console.error('[search] audit write failed (non-fatal):', err?.message);
  }
}

async function handle(request, env, readParams) {
  const user = await verifySession(env, request);
  if (!user) return json({ success: false, message: 'Unauthorized' }, 401);
  if (!dbReady(env)) return json({ success: false, message: 'Database unavailable.' }, 503);

  let raw;
  try {
    raw = await readParams();
  } catch {
    return json({ success: false, message: 'Invalid request body.' }, 400);
  }

  const result = await runSearch(env, raw);
  if (result.ok !== true) {
    return json(
      { success: false, message: result.message, errors: result.errors },
      result.status || 500
    );
  }

  const { ok, ...body } = result;
  void ok;
  await auditSearch(env, user, {
    mode: body.plan.mode,
    terms: body.plan.terms,
    filters: body.filters,
    poolSize: body.plan.poolSize,
    selection: body.plan.selection,
    modelUsed: body.plan.modelUsed,
    fallback: body.plan.fallback,
    total: body.total,
    returned: body.items.length
  });

  return json({ success: true, ...body });
}

const PARAM_KEYS = ['text', 'orderId', 'email', 'from', 'to', 'status', 'intent', 'limit', 'offset'];

async function fromJsonBody(request) {
  const t = await request.text();
  if (!t) return {};
  const parsed = JSON.parse(t);
  return parsed && typeof parsed === 'object' ? parsed : {};
}

async function fromQuery(request) {
  const sp = new URL(request.url).searchParams;
  const out = {};
  for (const k of PARAM_KEYS) {
    const v = sp.get(k);
    if (v !== null && v !== '') out[k] = v;
  }
  return out;
}

export async function onRequestPost({ request, env }) {
  try {
    return await handle(request, env, () => fromJsonBody(request));
  } catch (err) {
    console.error('[search] POST error:', err);
    return json({ success: false, message: 'Search failed.' }, 500);
  }
}

export async function onRequestGet({ request, env }) {
  try {
    return await handle(request, env, () => fromQuery(request));
  } catch (err) {
    console.error('[search] GET error:', err);
    return json({ success: false, message: 'Search failed.' }, 500);
  }
}
