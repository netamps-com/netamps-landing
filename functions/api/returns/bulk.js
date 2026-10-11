import { onRequestPost as postReturn } from '../returns.js';

/**
 * POST /api/returns/bulk
 *
 * Bulk commit for intake batches: { requests: [...] } → per-item results.
 * Every item runs through the single-item handler (one validation + insert
 * code path — no divergent logic). Fail-closed per item; the batch itself
 * always returns 200 with { okIds, failed } unless the envelope is malformed.
 *
 * The intake client prefers this route (one round trip) and falls back to
 * sequential singles when it is unavailable (older deployments).
 */

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

export async function onRequestPost({ request, env }) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ success: false, message: 'Invalid request body' }, 400);
    }
    const list = body && Array.isArray(body.requests) ? body.requests : null;
    if (!list) return json({ success: false, message: 'requests array required' }, 400);
    if (list.length > 10000) return json({ success: false, message: 'Too many requests.' }, 413);

    const okIds = [];
    const failed = [];
    for (const req of list) {
      const id = req && typeof req.id === 'string' ? req.id : '(missing-id)';
      try {
        const res = await postReturn({
          request: new Request('https://bulk.internal/api/returns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req)
          }),
          env
        });
        let data = null;
        try {
          data = await res.json();
        } catch {
          failed.push({ id, error: 'Server returned an invalid response.' });
          continue;
        }
        if (res.ok && data && data.success) okIds.push(id);
        else failed.push({ id, error: (data && data.message) || `Server refused (HTTP ${res.status}).` });
      } catch (err) {
        failed.push({ id, error: 'Commit failed.' });
      }
    }
    return json({ success: true, okIds, failed });
  } catch (err) {
    return json({ success: false, message: 'Bulk commit failed. Please try again shortly.' }, 500);
  }
}
