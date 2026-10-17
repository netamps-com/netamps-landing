/**
 * CORS allowlist (priority-1 hardening).
 *
 * Why this exists: several endpoints previously answered with
 * `Access-Control-Allow-Origin: *`, which lets ANY website issue cross-origin
 * reads of those responses. Fine for a genuinely public status/health page,
 * dangerous for anything carrying user data.
 *
 * Policy:
 *  - DEFAULT is a strict allowlist of first-party origins (production site,
 *    the pages.dev origin, and localhost for development).
 *  - A route must EXPLICITLY opt into `*` via `applyCors(res, req, env, { public: true })`.
 *    Only the public read-only status/health routes do that.
 *  - `env.CORS_ORIGINS` (comma-separated) extends the allowlist for staging or
 *    additional first-party hostnames.
 *
 * Credentials are never combined with a wildcard origin (browsers reject it
 * anyway, and it is the classic misconfiguration).
 */

// First-party origins that may read same-origin API responses.
const DEFAULT_ORIGINS = [
  'https://netamps.com',
  'https://www.netamps.com',
  'https://netamps-landing.pages.dev',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

function allowedOrigins(env) {
  const extra = String(env?.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ORIGINS, ...extra]);
}

/**
 * Set CORS headers on a response.
 * @param {Headers} headers response headers (mutated in place)
 * @param {Request} request
 * @param {object} env
 * @param {{ public?: boolean, methods?: string, headers?: string, maxAge?: number, cacheControl?: string }} opts
 *        public: true ⇒ allow any origin (public, non-sensitive endpoints only)
 *        cacheControl: sets Cache-Control verbatim. NOTE `maxAge` above is the
 *        CORS preflight cache (Access-Control-Max-Age), NOT HTTP caching — pass
 *        `cacheControl` to control how long a response may be stored.
 */
export function applyCors(headers, request, env, opts = {}) {
  const {
    public: isPublic = false,
    methods = 'GET, POST, OPTIONS',
    allowedHeaders = 'Content-Type, Authorization',
    maxAge = 86400,
    cacheControl = null,
  } = opts;

  const origin = request.headers.get('Origin');

  // Independent of CORS: set before the public early-return so both branches
  // carry the caller's caching policy.
  if (cacheControl) {
    headers.set('Cache-Control', cacheControl);
  }

  if (isPublic) {
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', methods);
    headers.set('Access-Control-Allow-Headers', allowedHeaders);
    headers.set('Access-Control-Max-Age', String(maxAge));
    return headers;
  }

  if (origin && allowedOrigins(env).has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.append('Vary', 'Origin');
    headers.set('Access-Control-Allow-Methods', methods);
    headers.set('Access-Control-Allow-Headers', allowedHeaders);
    headers.set('Access-Control-Max-Age', String(maxAge));
  }
  // No matching origin ⇒ no CORS headers ⇒ the browser blocks the read.
  return headers;
}

/** Convenience: build a JSON response with CORS applied. */
export function corsJson(request, env, body, status = 200, opts = {}) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  applyCors(headers, request, env, opts);
  return new Response(JSON.stringify(body), { status, headers });
}

/** Preflight handler for routes that need it. */
export function corsPreflight(request, env, opts = {}) {
  const headers = new Headers();
  applyCors(headers, request, env, opts);
  return new Response(null, { status: 204, headers });
}

export const CORS_DEFAULTS = { methods: 'GET, POST, OPTIONS' };