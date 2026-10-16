/**
 * POST /api/track/logout
 *
 * Server-side session revocation. Deletes the session row from D1 and
 * sends a Set-Cookie header to clear the client's browser cookie.
 *
 * Response: { success: true }
 */

import { dbReady } from '../negotiate/store.mjs';

const COOKIE_NAME = 'netamps_session';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // Clear the cookie immediately
      'Set-Cookie': `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`
    }
  });
}

export async function onRequestPost({ request, env }) {
  try {
    if (!dbReady(env)) {
      return json({ success: false, message: 'Tracking is temporarily unavailable.' }, 503);
    }

    // Read the current cookie value to identify the session
    const cookie = request.headers.get('cookie') || '';
    const m = /(^|;)\s*netamps_session=([^;]*)/.exec(cookie);
    const sessionId = m ? m[2] : null;

    // Delete the session from D1 (best-effort; never fails the request)
    if (sessionId) {
      await env.DB.prepare(
        'DELETE FROM sessions WHERE id = ?1'
      ).bind(sessionId).run();
    }

    // Even if no session row existed, still clear the client cookie
    return json({ success: true });
  } catch (err) {
    console.error('[track] logout error', err);
    return json({ success: false, message: 'Logout failed.' }, 500);
  }
}