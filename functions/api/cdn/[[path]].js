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
