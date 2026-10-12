import { verifySession } from '../intake/auth.js';

/**
 * GET /api/health/crypto — admin-only runtime capability probe.
 *
 * Answers exactly one question with evidence instead of theories: which
 * cryptographic primitives work inside THIS production isolate? Each check
 * runs and reports { ok, ms } — no secrets, no key material, no parameters
 * echoed. Used to diagnose KDF failures (argon2id vs PBKDF2 vs HMAC) where
 * local harnesses pass but production throws.
 *
 * Admin-gated like the log reader: capability results are operational
 * internals, not public information.
 */

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

async function probe(name, fn) {
  const start = Date.now();
  try {
    await fn();
    return { ok: true, ms: Date.now() - start };
  } catch (err) {
    return { ok: false, ms: Date.now() - start, error: err && err.name ? err.name : typeof err };
  }
}

export async function onRequestGet({ request, env }) {
  try {
    const user = await verifySession(env, request);
    const isAdmin = user && (user.role === 'admin' || user.email === 'admin@netamps.com');
    if (!isAdmin) {
      return json({ success: false, message: 'Forbidden' }, 403);
    }

    const results = {};
    results.randomValues = await probe('randomValues', async () => {
      const b = crypto.getRandomValues(new Uint8Array(16));
      if (b.length !== 16) throw new Error('short-read');
    });
    results.subtleDigest = await probe('subtleDigest', async () => {
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode('probe'));
    });
    results.hmac = await probe('hmac', async () => {
      const k = await crypto.subtle.importKey('raw', new TextEncoder().encode('probe-key-0123456789'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      await crypto.subtle.sign('HMAC', k, new TextEncoder().encode('probe-data'));
    });
    results.pbkdf2 = await probe('pbkdf2', async () => {
      const k = await crypto.subtle.importKey('raw', new TextEncoder().encode('probe-password-material'), 'PBKDF2', false, ['deriveBits']);
      await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: crypto.getRandomValues(new Uint8Array(16)), iterations: 120000, hash: 'SHA-256' }, k, 256);
    });
    results.argon2id = await probe('argon2id', async () => {
      const mod = await import('hash-wasm');
      if (typeof mod.argon2id !== 'function') throw new Error('export-missing');
      const h = await mod.argon2id({
        password: 'probe-material-0123456789abcdef',
        salt: crypto.getRandomValues(new Uint8Array(16)),
        parallelism: 1, iterations: 3, memorySize: 19456, hashLength: 32,
        outputType: 'encoded'
      });
      if (typeof h !== 'string' || !h.startsWith('$argon2id$')) throw new Error('bad-output');
      const ok = await mod.argon2Verify({ password: 'probe-material-0123456789abcdef', hash: h });
      if (ok !== true) throw new Error('verify-mismatch');
    });

    const allOk = Object.values(results).every((r) => r.ok);
    return json({ success: true, allOk, results });
  } catch (err) {
    return json({ success: false, message: 'Probe failed.' }, 500);
  }
}
