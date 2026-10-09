/**
 * Global Pages Functions middleware.
 *
 * Purpose: keep the internal testing origin (*.pages.dev) out of the public
 * domain while leaving production (netamps.com) completely untouched.
 *
 *  - Always adds X-Robots-Tag: noindex on *.pages.dev so the dev URL can
 *    never appear in search results, even if someone links to it.
 *  - When the DEV_GATE_PASSWORD secret is set, *.pages.dev additionally
 *    requires HTTP Basic Auth (user: netamps). Production is never gated.
 *
 * Set DEV_GATE_PASSWORD in Pages → Settings → Environment variables
 * (Secret, Production + Preview). ASCII-only password.
 */

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const isDevHost = url.hostname.endsWith('.pages.dev');

  if (!isDevHost) {
    return next(); // production: zero behavior change
  }

  const gatePassword = env.DEV_GATE_PASSWORD;
  if (gatePassword) {
    let provided = '';
    try {
      provided = request.headers.get('authorization') || '';
    } catch {
      provided = '';
    }
    let expected = '';
    try {
      expected = 'Basic ' + btoa(`netamps:${gatePassword}`);
    } catch {
      expected = '';
    }
    if (!expected || !timingSafeEqual(provided, expected)) {
      return new Response('Restricted: internal testing environment.', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="Netamps internal testing"',
          'X-Robots-Tag': 'noindex, nofollow, noarchive',
          'Cache-Control': 'no-store'
        }
      });
    }
  }

  const res = await next();
  const headers = new Headers(res.headers);
  headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers
  });
}
