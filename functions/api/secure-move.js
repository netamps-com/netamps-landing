/**
 * POST /api/secure-move
 *
 * Moves an already-uploaded evidence file into its owning product's
 * namespace when a staged file gets (re-)linked to a product card.
 * Same attachmentId is preserved so history never forks.
 *
 * Body: { oldKey, productId, requestId, attachmentId }
 *  - oldKey must live under requests/{requestId}/… (same request scope only).
 *  - Move is a stream copy (readable body piped to put) + delete of the old
 *    key, in every bucket that holds it. No full-file buffering in the Worker.
 */

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

const SEG = '[A-Za-z0-9_-]{1,64}';
const KEY_RE = new RegExp(`^requests/${SEG}/products/${SEG}/[A-Za-z0-9_.-]{1,200}$`);

export async function onRequestPost({ request, env }) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ success: false, error: 'BAD_REQUEST', message: 'Invalid request body.' }, 400);
    }

    const oldKey = String(body.oldKey || '');
    const productId = String(body.productId || '');
    const requestId = String(body.requestId || '');
    const attachmentId = String(body.attachmentId || '');

    if (!KEY_RE.test(oldKey)) {
      return json({ success: false, error: 'BAD_KEY', message: 'Unrecognized object key.' }, 400);
    }
    if (!new RegExp(`^${SEG}$`).test(productId) || productId === 'unassigned') {
      return json({ success: false, message: 'A linked product is required to move a file.' }, 400);
    }
    if (!new RegExp(`^${SEG}$`).test(requestId)) {
      return json({ success: false, message: 'Invalid request scope.' }, 400);
    }
    if (!new RegExp(`^${SEG}$`).test(attachmentId)) {
      return json({ success: false, message: 'Invalid attachment reference.' }, 400);
    }
    if (!oldKey.startsWith(`requests/${requestId}/`)) {
      return json({ success: false, error: 'SCOPE_VIOLATION', message: 'File does not belong to this request.' }, 403);
    }

    const buckets = [];
    if (env.PRODUCTION_BUCKET && typeof env.PRODUCTION_BUCKET.get === 'function') buckets.push(env.PRODUCTION_BUCKET);
    if (env.QUARANTINE_BUCKET && typeof env.QUARANTINE_BUCKET.get === 'function') buckets.push(env.QUARANTINE_BUCKET);
    if (buckets.length === 0) {
      return json({ success: false, error: 'STORAGE_UNBOUND', message: 'Evidence storage is not attached.' }, 503);
    }

    const ext = oldKey.includes('.') ? oldKey.split('.').pop().toLowerCase() : 'bin';
    const newKey = `requests/${requestId}/products/${productId}/${attachmentId}.${ext}`;
    if (newKey === oldKey) {
      return json({ success: true, moved: false, newKey, assetUrl: `/api/cdn/${newKey}` });
    }

    let moved = false;
    for (const bucket of buckets) {
      let object = null;
      try {
        object = await bucket.get(oldKey);
      } catch {
        continue;
      }
      if (!object) continue;
      const headers = {};
      try {
        object.writeHttpMetadata(headers);
      } catch {}
      const customMetadata = { ...(object.customMetadata || {}), 'x-product-id': productId };
      await bucket.put(newKey, object.body, {
        httpMetadata: Object.keys(headers).length ? headers : { contentType: object.httpMetadata?.contentType || 'application/octet-stream' },
        customMetadata
      });
      await bucket.delete(oldKey);
      moved = true;
    }

    if (!moved) {
      return json({ success: false, error: 'NOT_FOUND', message: 'Source file no longer exists.' }, 404);
    }

    try {
      console.log(JSON.stringify({ siem: 'netamps-audit-v1', event: 'evidence.moved', ts: new Date().toISOString(), old_key: oldKey, new_key: newKey }));
    } catch {}

    return json({ success: true, moved: true, newKey, assetUrl: `/api/cdn/${newKey}` });
  } catch (err) {
    console.error('[move] Internal error:', err);
    return json({ success: false, error: 'INTERNAL_ERROR', message: 'Move failed. Please try again shortly.' }, 500);
  }
}
