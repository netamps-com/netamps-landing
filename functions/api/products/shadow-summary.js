/**
 * GET /api/products/shadow — review the legacy-vs-FTS5 disagreement log.
 *
 * Read-only, admin-gated. This is the evidence required before cutover
 * (docs/catalog-retrieval-etl.md §10 step 3): it shows whether FTS5's extra
 * recall is CORRECT or merely broader.
 *
 *   /api/products/shadow              -> aggregate verdict + recent queries
 *   /api/products/shadow?limit=200    -> wider sample
 */

import { verifySession } from '../intake/auth.js';
import { shadowSummary } from './shadow.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

export async function onRequestGet({ request, env }) {
  try {
    const user = await verifySession(request, env);
    if (!user || (user.role !== 'admin' && user.email !== 'admin@netamps.com')) {
      return json({ success: false, message: 'Forbidden' }, 403);
    }

    const url = new URL(request.url);
    const raw = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
    const limit = Math.min(500, Math.max(1, Number.isFinite(raw) && raw > 0 ? raw : 50));

    const summary = await shadowSummary(env, { limit });
    return json({ success: true, ...summary });
  } catch (err) {
    console.error('[products/shadow]', err);
    return json({ success: false, message: 'Shadow summary unavailable.' }, 500);
  }
}
