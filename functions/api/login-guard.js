/**
 * POST /api/login-guard — owner verification for held logins.
 *
 * No login session is required or accepted here: authority comes from the
 * challenge itself (unguessable ID) plus the OTP that only the owner's mailbox
 * holds. Actions:
 *   challenge-status  {challengeId} → {status, email(masked)} — polled by the
 *                       held login page; reveals nothing beyond the mask.
 *   owner-verify      {challengeId, code} → approves the held login on a
 *                       correct code (marks the device known; the user retries
 *                       and succeeds — no session is ever minted out-of-band).
 *                       3 wrong codes expire the challenge and block the IP.
 *   owner-deny        {challengeId} → denies and blocks the source IP 24h.
 *                       Harmless if invoked by the attacker: it only burns
 *                       their own attempt and their own IP.
 *
 * Zero npm imports. D1-only.
 */

import {
  ensureAuthzTables, netContext,
  challengeStatus, verifyOwnerChallenge, denyOwnerChallenge,
} from './authz/login-guard.mjs';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB || typeof env.DB.prepare !== 'function') {
      return json({ success: false, message: 'Returns database is not attached.' }, 503);
    }
    let body = {};
    try {
      body = await request.json() || {};
    } catch {
      return json({ success: false, message: 'Invalid request body' }, 400);
    }
    const action = String(body.action || 'challenge-status');
    const ALLOWED = new Set(['challenge-status', 'owner-verify', 'owner-deny']);
    if (!ALLOWED.has(action)) {
      return json({ success: false, message: 'Unknown action.' }, 400);
    }
    await ensureAuthzTables(env);
    const ctx = await netContext(request);

    if (action === 'challenge-status') {
      if (typeof body.challengeId !== 'string' || !body.challengeId) {
        return json({ success: false, message: '`challengeId` is required.' }, 400);
      }
      const r = await challengeStatus(env, body.challengeId);
      if (!r.ok) return json({ success: false, message: 'Challenge not found.' }, 404);
      return json({ success: true, status: r.status, email: r.email });
    }

    if (action === 'owner-verify') {
      if (typeof body.challengeId !== 'string' || !body.challengeId
        || typeof body.code !== 'string' || !body.code.trim()) {
        return json({ success: false, message: '`challengeId` and `code` are required.' }, 400);
      }
      const r = await verifyOwnerChallenge(env, { challengeId: body.challengeId, code: body.code, ctx });
      if (!r.ok) {
        const status = r.reason === 'NOT_FOUND' ? 404 : r.reason === 'LOCKED' ? 403 : 401;
        return json({ success: false, code: r.reason, remaining: r.remaining,
          message: r.reason === 'INVALID_CODE' ? 'Incorrect code.' : r.reason === 'LOCKED' ? 'Too many wrong codes. Challenge locked and source blocked.' : r.reason === 'EXPIRED' ? 'Challenge expired.' : 'Verification failed.' }, status);
      }
      return json({ success: true, message: 'Approved. The sign-in may now proceed — retry it on the login page.' });
    }

    if (action === 'owner-deny') {
      if (typeof body.challengeId !== 'string' || !body.challengeId) {
        return json({ success: false, message: '`challengeId` is required.' }, 400);
      }
      const r = await denyOwnerChallenge(env, { challengeId: body.challengeId, ctx });
      if (!r.ok) return json({ success: false, message: 'Challenge not found or already decided.' }, 404);
      return json({ success: true, message: 'Denied. The source IP is blocked for 24 hours.' });
    }

    return json({ success: false, message: 'Unknown action.' }, 400);
  } catch (err) {
    console.error('[login-guard] Internal error:', err);
    return json({ success: false, message: 'Request failed. Please try again shortly.' }, 500);
  }
}
