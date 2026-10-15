/**
 * GET /api/products/shadow — review the retrieval disagreement logs.
 *
 * Read-only, admin-gated. This is the evidence required before any cutover.
 *
 * Two experiments live here, deliberately reported SEPARATELY because they
 * answer different questions and a blend of them would be unreadable:
 *
 *   ?experiment=fts (default)  legacy cascade vs FTS5. The question is
 *                              RECALL — does FTS5 find rows the legacy path
 *                              misses, and are they correct?
 *   ?experiment=fusion         RRF + cross-encoder vs the live cascade. The
 *                              question is ORDER — does the new ranking
 *                              rearrange what is already being served?
 *
 *   /api/products/shadow                    -> FTS experiment
 *   /api/products/shadow?experiment=fusion  -> fusion experiment
 *   /api/products/shadow?limit=200          -> wider sample (either)
 */

import { verifySession } from '../intake/auth.js';
import { shadowSummary, fusionSummary } from './shadow.js';

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
    const experiment = (url.searchParams.get('experiment') || 'fts').toLowerCase();

    if (experiment === 'fusion') {
      return json({ success: true, experiment, ...(await fusionSummary(env, { limit })) });
    }
    if (experiment !== 'fts') {
      return json({
        success: false,
        message: "experiment must be 'fts' or 'fusion'."
      }, 400);
    }
    return json({ success: true, experiment, ...(await shadowSummary(env, { limit })) });
  } catch (err) {
    console.error('[products/shadow]', err);
    return json({ success: false, message: 'Shadow summary unavailable.' }, 500);
  }
}
