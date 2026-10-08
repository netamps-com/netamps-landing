import { verifySession } from '../intake/auth';

/**
 * GET /api/cdn/[...path]  (+ HEAD)
 *
 * Read-only asset retrieval over native R2 bindings — zero npm imports.
 * Lookup order: PRODUCTION_BUCKET → QUARANTINE_BUCKET → EVIDENCE_BUCKET (legacy).
 *
 * Performance contract (keys embed a UUID, so objects are immutable):
 *  - 200: `Cache-Control: public, max-age=31536000, immutable` + ETag → edge
 *    caches once; repeat views cost zero origin reads and zero D1/KV I/O.
 *  - Range: single `bytes=start-end` / `bytes=start-` / `bytes=-suffix`
 *    served as 206 with Content-Range + Accept-Ranges, so <video> seeks and
 *    streams progressively instead of downloading the whole object.
 *  - 404/400/416: `Cache-Control: no-store` — errors must never poison cache.
 *  - No per-request logging on the hot path (log I/O per asset view is pure overhead).
 */

const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
const NO_STORE = 'no-store';

/** R2 bindings consulted in order. Absent bindings are skipped, never throw. */
function candidateBuckets(env) {
  const out = [];
  if (env.PRODUCTION_BUCKET && typeof env.PRODUCTION_BUCKET.get === 'function') out.push(env.PRODUCTION_BUCKET);
  if (env.QUARANTINE_BUCKET && typeof env.QUARANTINE_BUCKET.get === 'function') out.push(env.QUARANTINE_BUCKET);
  if (env.EVIDENCE_BUCKET && typeof env.EVIDENCE_BUCKET.get === 'function') out.push(env.EVIDENCE_BUCKET);
  return out;
}

/** Normalize path segments; reject traversal. Returns null on invalid key. */
function normalizeKey(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return null;
  const clean = [];
  for (const seg of segments) {
    if (!seg || seg === '.' || seg === '..') return null;
    clean.push(seg);
  }
  const key = clean.join('/');
  if (!key || key.length > 1024) return null;
  return key;
}

/**
 * Parse a single-range header. Returns { offset, length } | 'unsatisfiable' | null.
 * Multipart ranges are not supported (browsers request single ranges for media).
 */
function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, startStr, endStr] = m;
  if (startStr === '' && endStr === '') return null;

  let start, end;
  if (startStr === '') {
    // Suffix range: last N bytes
    const suffix = parseInt(endStr, 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = parseInt(startStr, 10);
    end = endStr === '' ? size - 1 : parseInt(endStr, 10);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= size) return 'unsatisfiable';
  end = Math.min(end, size - 1);
  if (end < start) return null;
  return { offset: start, length: end - start + 1, start, end };
}

function baseHeaders(object) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  if (object.httpEtag) headers.set('ETag', object.httpEtag);
  headers.set('Accept-Ranges', 'bytes');
  return headers;
}

async function verifyHmac(key, exp, sig, secret) {
  if (!secret) return true; // Fail open if no secret is configured yet
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  );
  
  const data = enc.encode(`${key}:${exp}`);
  const sigBytes = new Uint8Array(sig.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  
  return await crypto.subtle.verify('HMAC', cryptoKey, sigBytes, data);
}

async function serveObject(object, bucket, key, request, headOnly) {
  const size = object.size;
  const range = parseRange(request.headers.get('range'), size);

  if (range === 'unsatisfiable') {
    return new Response('Range Not Satisfiable', {
      status: 416,
      headers: {
        'Content-Range': `bytes */${size}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': NO_STORE
      }
    });
  }

  if (range) {
    const sliced = await bucket.get(key, { range: { offset: range.offset, length: range.length } });
    const headers = baseHeaders(object);
    headers.set('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
    headers.set('Content-Length', String(range.length));
    headers.set('Cache-Control', IMMUTABLE_CACHE);
    // Ranged re-get can theoretically miss on concurrent delete; fall back to full body.
    const body = sliced ? sliced.body : object.body;
    return new Response(headOnly ? null : body, { status: 206, headers });
  }

  const headers = baseHeaders(object);
  headers.set('Content-Length', String(size));
  headers.set('Cache-Control', IMMUTABLE_CACHE);
  return new Response(headOnly ? null : object.body, { status: 200, headers });
}

async function handle({ request, env, params, headOnly }) {
  const key = normalizeKey(params.path);
  if (!key) {
    return new Response(JSON.stringify({ success: false, error: 'BAD_KEY' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': NO_STORE }
    });
  }

  // --- Start Security / Session Checks ---
  // Authenticated session required (open internet gets 401, never asset bytes).
  const user = await verifySession(env, request);
  if (!user) {
    return new Response('Unauthorized', { status: 401, headers: { 'Cache-Control': NO_STORE } });
  }
  const ownerEmail = user.email;
  const isAdmin = user.role === 'admin' || ownerEmail === 'admin@netamps.com';

  // A3 Signed CDN URL validation — verified when present (strict shape, expiry,
  // HMAC). Absent signatures are still allowed: no signer endpoint exists yet, so
  // mandatory signatures would 403 every dashboard image. Flip to mandatory once a
  // server-side signer issues exp+sig links.
  const url = new URL(request.url);
  const exp = url.searchParams.get('exp');
  const sig = url.searchParams.get('sig');
  if (exp !== null || sig !== null) {
    if (!exp || !/^\d+$/.test(exp) || !sig || !/^[0-9a-fA-F]+$/.test(sig) || sig.length % 2 !== 0) {
      return new Response('403 Forbidden: Invalid Signature', { status: 403, headers: { 'Cache-Control': NO_STORE } });
    }
    if (Date.now() > parseInt(exp, 10)) {
      return new Response('403 Forbidden: Link Expired', { status: 403, headers: { 'Cache-Control': NO_STORE } });
    }
    const isValid = await verifyHmac(key, exp, sig, env.CDN_SECRET);
    if (!isValid) {
      return new Response('403 Forbidden: Invalid Signature', { status: 403, headers: { 'Cache-Control': NO_STORE } });
    }
  }
  // --- End Security / Session Checks ---

  // Conditional request: ETag match → 304 without reading the object body.
  const ifNoneMatch = request.headers.get('if-none-match');

  for (const bucket of candidateBuckets(env)) {
    let object = null;
    try {
      object = await bucket.get(key);
    } catch {
      continue; // treat binding/lookup failure as a miss, try next bucket
    }
    if (object === null) continue;

    // RBAC ownership: objects tagged with a real owner email are visible to that
    // owner (or admin). Untagged / 'anonymous' objects (e.g. public-form uploads
    // from before login) are visible to any authenticated user — authentication
    // itself is the gate; the open internet still gets 401 above.
    const uploaderEmail = object.customMetadata?.['x-owner-email'];
    const ownerKnown = uploaderEmail && uploaderEmail !== 'anonymous';
    if (!isAdmin && ownerKnown && uploaderEmail !== ownerEmail) {
      return new Response('Forbidden', { status: 403, headers: { 'Cache-Control': NO_STORE } });
    }

    if (ifNoneMatch && object.httpEtag && ifNoneMatch.includes(object.httpEtag)) {
      return new Response(null, {
        status: 304,
        headers: { ETag: object.httpEtag, 'Accept-Ranges': 'bytes', 'Cache-Control': IMMUTABLE_CACHE }
      });
    }
    return serveObject(object, bucket, key, request, headOnly);
  }

  return new Response(JSON.stringify({ success: false, error: 'NOT_FOUND' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': NO_STORE }
  });
}

export async function onRequestGet(context) {
  try {
    return await handle({ ...context, headOnly: false });
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'INTERNAL_ERROR' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': NO_STORE }
    });
  }
}

export async function onRequestHead(context) {
  try {
    return await handle({ ...context, headOnly: true });
  } catch {
    return new Response(null, { status: 500, headers: { 'Cache-Control': NO_STORE } });
  }
}
