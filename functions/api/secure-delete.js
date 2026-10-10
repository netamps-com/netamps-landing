/**
 * POST /api/secure-delete
 *
 * Removes an evidence object (card removal, file removal, intent reset) so
 * R2 never accumulates orphaned uploads. Idempotent: missing keys still
 * return success. Keys are strictly validated — only evidence namespaces
 * (requests/…, evidence/…) can be deleted, never anything else.
 *
 * Body: { key }
 */

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

const SEG = '[A-Za-z0-9_-]{1,64}';
const KEY_RE = new RegExp(`^(requests/${SEG}/products/${SEG}/[A-Za-z0-9_.-]{1,200}|evidence/[A-Za-z0-9_.-]{1,200})$`);

export async function onRequestPost({ request, env }) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ success: false, message: 'Invalid request body.' }, 400);
    }

    const key = String(body.key || '');
    if (!KEY_RE.test(key)) {
      return json({ success: false, message: 'Unrecognized object key.' }, 400);
    }

    const buckets = [];
    if (env.PRODUCTION_BUCKET && typeof env.PRODUCTION_BUCKET.delete === 'function') buckets.push('PRODUCTION_BUCKET');
    if (env.QUARANTINE_BUCKET && typeof env.QUARANTINE_BUCKET.delete === 'function') buckets.push('QUARANTINE_BUCKET');
    if (buckets.length === 0) {
      return json({ success: false, message: 'Evidence storage is not attached.' }, 503);
    }

    const deleted = {};
    for (const name of buckets) {
      try {
        await env[name].delete(key);
        deleted[name === 'PRODUCTION_BUCKET' ? 'production' : 'quarantine'] = true;
      } catch (err) {
        console.error('[delete] Failed in', name, err);
        deleted[name === 'PRODUCTION_BUCKET' ? 'production' : 'quarantine'] = false;
      }
    }

    try {
      console.log(JSON.stringify({ siem: 'netamps-audit-v1', event: 'evidence.deleted', ts: new Date().toISOString(), object_key: key }));
    } catch {}

    return json({ success: true, deleted });
  } catch (err) {
    console.error('[delete] Internal error:', err);
    return json({ success: false, message: 'Delete failed. Please try again shortly.' }, 500);
  }
}
