/**
 * POST /api/email/events
 *
 * Resend webhook receiver (bounce / complaint / delivery events).
 * This is what makes "sent" honest: Resend's 200 means accepted, not
 * delivered. Events here flip the record to delivered, or suppress the
 * address (hard bounce / complaint) so future sends refuse fast instead of
 * burning the domain's reputation one retry at a time.
 *
 * Verification: Svix HMAC (svix-id / svix-signature / svix-timestamp) with
 * EMAIL_WEBHOOK_SECRET. Dormant-safe: without the secret, events are
 * accepted but only logged (never applied) — configure the secret to arm.
 *
 * Handled event types: email.bounced, email.complained, email.delivered.
 * Everything else is acknowledged and ignored (new Resend types must never
 * 500 the webhook — that triggers redelivery storms).
 */

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function b64ToBytes(s) {
  const clean = String(s || '').replace(/\s+/g, '');
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function verifySvix(secret, id, timestamp, payloadText, signatureHeader) {
  try {
    if (!secret || !id || !timestamp || !payloadText || !signatureHeader) return false;
    const now = Math.floor(Date.now() / 1000);
    const ts = parseInt(timestamp, 10);
    if (!Number.isInteger(ts) || Math.abs(now - ts) > 5 * 60) return false; // replay window
    const keyMaterial = String(secret).startsWith('whsec_') ? String(secret).slice(6) : String(secret);
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', b64ToBytes(keyMaterial), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const data = enc.encode(`${id}.${timestamp}.${payloadText}`);
    const candidates = String(signatureHeader).split(' ');
    for (const c of candidates) {
      const parts = c.split(',');
      if (parts.length !== 2 || parts[0] !== 'v1') continue;
      const sig = b64ToBytes(parts[1]);
      if (await crypto.subtle.verify('HMAC', key, sig, data)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function auditEvent(env, event, details, username) {
  try {
    if (!env.DB || typeof env.DB.prepare !== 'function') return;
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, timestamp TEXT, event_type TEXT, page TEXT, details TEXT, username TEXT, ip_address TEXT)'
    ).run();
    await env.DB.prepare(
      'INSERT INTO audit_logs (id, timestamp, event_type, page, details, username, ip_address) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
    ).bind(
      crypto.randomUUID(), new Date().toISOString(), event, 'Email Webhook',
      JSON.stringify(details), String(username || 'resend').slice(0, 254), 'webhook'
    ).run();
  } catch {}
}

async function suppress(env, email, reason) {
  try {
    if (!env.DB || typeof env.DB.prepare !== 'function') return false;
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS email_suppressions (email TEXT PRIMARY KEY, reason TEXT, created_at TEXT)'
    ).run();
    await env.DB.prepare(
      'INSERT INTO email_suppressions (email, reason, created_at) VALUES (?1, ?2, ?3) ON CONFLICT(email) DO UPDATE SET reason=excluded.reason'
    ).bind(String(email).toLowerCase(), reason, new Date().toISOString()).run();
    return true;
  } catch {
    return false;
  }
}

async function markReturnDelivery(env, requestId, status) {
  try {
    if (!env.DB || typeof env.DB.prepare !== 'function') return;
    await env.DB.prepare('UPDATE returns SET emailDeliveryStatus = ? WHERE id = ?').bind(status, requestId).run();
  } catch {}
}

function tagOf(tags, name) {
  if (!Array.isArray(tags)) return null;
  const hit = tags.find((t) => t && t.name === name);
  return hit && typeof hit.value === 'string' ? hit.value : null;
}

export async function onRequestPost({ request, env }) {
  let payloadText = '';
  try {
    payloadText = await request.text();
  } catch {
    return json({ success: false, message: 'Invalid request body' }, 400);
  }
  let event;
  try {
    event = JSON.parse(payloadText);
  } catch {
    return json({ success: false, message: 'Invalid request body' }, 400);
  }

  const headers = request.headers;
  const secret = env.EMAIL_WEBHOOK_SECRET;
  const verified = await verifySvix(
    secret,
    headers.get('svix-id'),
    headers.get('svix-timestamp'),
    payloadText,
    headers.get('svix-signature')
  );
  if (!verified) {
    if (secret) {
      return json({ success: false, message: 'Invalid signature' }, 401);
    }
    console.warn('[email-events] Accepted unverified (no EMAIL_WEBHOOK_SECRET configured — events logged only, never applied)');
  }
  const apply = verified;

  const type = event && event.type;
  const data = (event && event.data) || {};
  const to = data.to || data.email || null;
  const requestId = tagOf(data.tags, 'request');
  const kind = tagOf(data.tags, 'kind');

  if (type === 'email.bounced' || type === 'email.complained') {
    const reason = type === 'email.complained' ? 'complaint' : 'hard-bounce';
    if (apply && to) await suppress(env, to, reason);
    if (apply && requestId && kind === 'owner-push') await markReturnDelivery(env, requestId, 'failed');
    await auditEvent(env, type === 'email.complained' ? 'EMAIL_COMPLAINT' : 'EMAIL_BOUNCED', { to, requestId, kind, applied: apply }, to);
    return json({ success: true });
  }

  if (type === 'email.delivered') {
    if (apply && requestId && kind === 'owner-push') await markReturnDelivery(env, requestId, 'sent');
    await auditEvent(env, 'EMAIL_DELIVERED', { to, requestId, kind, applied: apply }, to);
    return json({ success: true });
  }

  return json({ success: true });
}
