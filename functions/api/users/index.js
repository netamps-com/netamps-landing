import { signDemoSession } from '../intake/auth';
import { verifyTurnstileToken } from '../verify-turnstile';

// Login rate limiting (isolate-local, same posture as verify-turnstile:
// slows single-origin stuffing; distributed botnets need KV-backed limits).
const LOGIN_RL_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_RL_PER_IP = 60;
const LOGIN_RL_PER_EMAIL = 10;
const loginRlMap = new Map();
function loginRateLimited(kind, key) {
  if (!key || key === 'unknown') return false;
  const now = Date.now();
  const mapKey = `${kind}:${key}`;
  const record = loginRlMap.get(mapKey);
  if (!record || now - record.windowStart > LOGIN_RL_WINDOW_MS) {
    loginRlMap.set(mapKey, { windowStart: now, count: 1 });
    return false;
  }
  record.count += 1;
  if (loginRlMap.size > 5000) loginRlMap.clear();
  return record.count > (kind === 'email' ? LOGIN_RL_PER_EMAIL : LOGIN_RL_PER_IP);
}

// Password storage: PBKDF2-SHA256 over the client-supplied SHA-256 (raw
// passwords never cross the wire AND never rest on the server).
// Format: pbkdf2$<iterations>$<b64salt>$<b64dk>. Legacy rows hold bare
// 64-hex SHA-256 and transparently upgrade on next successful login.
const KDF_ITERATIONS = 120000;
const KDF_SALT_LEN = 16;
const KDF_DK_LEN = 32;
function b64encode(bytes) {
  let s = '';
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s);
}
function b64decode(s) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function deriveKdf(clientHashHex, saltB64, iterations) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(String(clientHashHex)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: b64decode(saltB64), iterations, hash: 'SHA-256' },
    key, KDF_DK_LEN * 8
  );
  return b64encode(new Uint8Array(bits));
}
async function hashNewSecret(clientHashHex) {
  const saltB64 = b64encode(crypto.getRandomValues(new Uint8Array(KDF_SALT_LEN)));
  const dk = await deriveKdf(clientHashHex, saltB64, KDF_ITERATIONS);
  return `pbkdf2$${KDF_ITERATIONS}$${saltB64}$${dk}`;
}
async function verifySecret(stored, clientHashHex) {
  if (typeof stored !== 'string' || typeof clientHashHex !== 'string') return false;
  if (stored.startsWith('pbkdf2$')) {
    const parts = stored.split('$');
    if (parts.length !== 4) return false;
    const iters = parseInt(parts[1], 10);
    if (!Number.isInteger(iters) || iters < 50000 || iters > 2000000) return false;
    try {
      const dk = await deriveKdf(clientHashHex, parts[2], iters);
      return timingSafeEqualHex(dk, parts[3]);
    } catch {
      return false;
    }
  }
  if (/^[0-9a-f]{64}$/i.test(stored)) {
    return timingSafeEqualHex(stored.toLowerCase(), clientHashHex.toLowerCase());
  }
  return false;
}
const isLegacyHash = (stored) => typeof stored === 'string' && /^[0-9a-f]{64}$/i.test(stored);

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const { action, email, passwordHash, role, currentPasswordHash } = body;
    // Remember-me extends every lifetime consistently (DB row, HttpOnly
    // cookie, signed dashboard value): 30 days checked, 8 hours otherwise.
    const ttlMs = body.remember === true ? 30 * 24 * 3600 * 1000 : 8 * 3600 * 1000;
    const ttlSec = Math.floor(ttlMs / 1000);

    if (env.DB) {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS users (
          email TEXT PRIMARY KEY,
          hash TEXT,
          role TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      // Ensure default users exist
      const checkAdmin = await env.DB.prepare('SELECT email FROM users WHERE email = ?').bind('admin@netamps.com').all();
      if (checkAdmin.results.length === 0) {
        const DEFAULT_HASH = 'bfc7e9309e970b4802affde33a9c07151af5897ef4b4d251b119c171d24a4bec';
        await env.DB.prepare('INSERT INTO users (email, hash, role) VALUES (?, ?, ?), (?, ?, ?)').bind(
          'admin@netamps.com', DEFAULT_HASH, 'admin',
          'staff@netamps.com', DEFAULT_HASH, 'staff'
        ).run();
      }

      if (action === 'login') {
        const ip = request.headers.get('cf-connecting-ip') ||
          (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
        const emailKey = typeof email === 'string' ? email.toLowerCase() : '';
        if (loginRateLimited('ip', ip) || loginRateLimited('email', emailKey)) {
          return new Response(JSON.stringify({ success: false, message: 'Too many attempts. Try again shortly.' }), { status: 429, headers: { 'Content-Type': 'application/json' } });
        }
        // Bot gate: a Turnstile token is required whenever the secret is
        // configured (the widget alone never stops direct POSTs). The failure
        // message is deliberately identical to bad credentials — no oracle.
        if (env.TURNSTILE_SECRET_KEY) {
          const loginToken = typeof body.turnstileToken === 'string' ? body.turnstileToken : '';
          const chk = loginToken ? await verifyTurnstileToken(env, loginToken, ip, 'login') : { ok: false };
          if (!chk.ok) {
            return new Response(JSON.stringify({ success: false, message: 'Invalid credentials' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
          }
        }
        const { results } = await env.DB.prepare('SELECT hash, role FROM users WHERE email = ?').bind(email).all();
        const stored = results.length > 0 ? results[0].hash : null;
        if (results.length > 0 && await verifySecret(stored, passwordHash)) {
          // Transparent KDF upgrade: legacy bare-SHA-256 rows become salted
          // PBKDF2 on first successful login (covers the hardcoded defaults).
          if (isLegacyHash(stored)) {
            try {
              await env.DB.prepare('UPDATE users SET hash = ? WHERE email = ?').bind(await hashNewSecret(passwordHash), email).run();
            } catch {}
          }
          const sessionId = crypto.randomUUID() + crypto.randomUUID(); // Mock 256-bit token
          
          await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS sessions (
              token TEXT PRIMARY KEY,
              email TEXT NOT NULL,
              role TEXT NOT NULL,
              expires_at DATETIME NOT NULL
            )
          `).run();
          
          const expiresAt = new Date(Date.now() + ttlMs).toISOString();
          await env.DB.prepare('INSERT INTO sessions (token, email, role, expires_at) VALUES (?, ?, ?, ?)').bind(sessionId, email, results[0].role, expiresAt).run();

          // Dashboard session cookie value: server-signed token.exp.sig so the
          // verifySession fallback can reject forgeries (unsigned legacy
          // cookies keep working only while DEMO_SESSION_SECRET is unset).
          let dashboardSession = sessionId;
          if (env.DEMO_SESSION_SECRET) {
            try {
              dashboardSession = await signDemoSession(env.DEMO_SESSION_SECRET, sessionId, Date.now() + ttlMs);
            } catch {}
          }

          // Note: `Secure` cookies require HTTPS. Localhost HTTP will drop them. Use Pages preview URLs.
          // session_id stays JS-readable for now (the dashboard presence check
          // reads document.cookie) — forgery is dead anyway via the signature.
          // HttpOnly cutover ships together with the dashboard checkAuth patch.
          const outHeaders = new Headers({ 'Content-Type': 'application/json' });
          outHeaders.append('Set-Cookie', `session_token=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${ttlSec}`);
          outHeaders.append('Set-Cookie', `session_id=${dashboardSession}; Secure; SameSite=Lax; Path=/; Max-Age=${ttlSec}`);
          
          return new Response(JSON.stringify({ success: true, role: results[0].role, sessionId: dashboardSession }), { 
            headers: outHeaders
          });
        }
        return new Response(JSON.stringify({ success: false, message: 'Invalid credentials' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }

      if (action === 'add') {
        await env.DB.prepare('INSERT INTO users (email, hash, role) VALUES (?, ?, ?)').bind(email, await hashNewSecret(passwordHash), role || 'staff').run();
        return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
      }
      
      if (action === 'update_password') {
        // currentPasswordHash comes from the already-parsed body: re-reading
        // via request.clone() after request.json() throws (disturbed body)
        // and would reject every change — never re-parse here.
        const { currentPasswordHash: currentHash } = body;
        
        // Verify current password first (legacy and KDF formats both accepted)
        const { results } = await env.DB.prepare('SELECT hash FROM users WHERE email = ?').bind(email).all();
        if (results.length === 0 || !(await verifySecret(results[0].hash, currentHash))) {
          return new Response(JSON.stringify({ success: false, message: 'Your current password is incorrect. Verification failed.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
        }
        
        await env.DB.prepare('UPDATE users SET hash = ? WHERE email = ?').bind(await hashNewSecret(passwordHash), email).run();
        return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
      }

    } else if (env.DATABASE_URL) {
      // ... pg logic ... (omitted for brevity, keep existing pg logic if possible, or just replace the end)
      const { Client } = await import('pg');
      const client = new Client({ connectionString: env.DATABASE_URL });
      await client.connect();

      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          email VARCHAR(255) PRIMARY KEY,
          hash TEXT,
          role VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      const checkAdmin = await client.query('SELECT email FROM users WHERE email = $1', ['admin@netamps.com']);
      if (checkAdmin.rows.length === 0) {
        const DEFAULT_HASH = 'bfc7e9309e970b4802affde33a9c07151af5897ef4b4d251b119c171d24a4bec';
        await client.query(
          'INSERT INTO users (email, hash, role) VALUES ($1, $2, $3), ($4, $5, $6)',
          ['admin@netamps.com', DEFAULT_HASH, 'admin', 'staff@netamps.com', DEFAULT_HASH, 'staff']
        );
      }

      if (action === 'login') {
        const pgIp = request.headers.get('cf-connecting-ip') ||
          (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
        const pgEmailKey = typeof email === 'string' ? email.toLowerCase() : '';
        if (loginRateLimited('ip', pgIp) || loginRateLimited('email', pgEmailKey)) {
          await client.end();
          return new Response(JSON.stringify({ success: false, message: 'Too many attempts. Try again shortly.' }), { status: 429, headers: { 'Content-Type': 'application/json' } });
        }
        if (env.TURNSTILE_SECRET_KEY) {
          const pgToken = typeof body.turnstileToken === 'string' ? body.turnstileToken : '';
          const pgChk = pgToken ? await verifyTurnstileToken(env, pgToken, pgIp, 'login') : { ok: false };
          if (!pgChk.ok) {
            await client.end();
            return new Response(JSON.stringify({ success: false, message: 'Invalid credentials' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
          }
        }
        const res = await client.query('SELECT hash, role FROM users WHERE email = $1', [email]);
        const pgStored = res.rows.length > 0 ? res.rows[0].hash : null;
        if (res.rows.length > 0 && await verifySecret(pgStored, passwordHash)) {
          if (isLegacyHash(pgStored)) {
            try {
              await client.query('UPDATE users SET hash = $1 WHERE email = $2', [await hashNewSecret(passwordHash), email]);
            } catch {}
          }
          const sessionId = crypto.randomUUID() + crypto.randomUUID();
          let pgDashboard = sessionId;
          if (env.DEMO_SESSION_SECRET) {
            try {
              pgDashboard = await signDemoSession(env.DEMO_SESSION_SECRET, sessionId, Date.now() + ttlMs);
            } catch {}
          }
          const pgHeaders = new Headers({ 'Content-Type': 'application/json' });
          pgHeaders.append('Set-Cookie', `session_id=${pgDashboard}; Secure; SameSite=Lax; Path=/; Max-Age=${ttlSec}`);
          await client.end();
          return new Response(JSON.stringify({ success: true, role: res.rows[0].role, sessionId: pgDashboard }), { headers: pgHeaders });
        }
        await client.end();
        return new Response(JSON.stringify({ success: false, message: 'Invalid credentials' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }

      if (action === 'add') {
        await client.query('INSERT INTO users (email, hash, role) VALUES ($1, $2, $3)', [email, await hashNewSecret(passwordHash), role || 'staff']);
        await client.end();
        return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
      }

      if (action === 'update_password') {
        const { rows } = await client.query('SELECT hash FROM users WHERE email = $1', [email]);
        if (rows.length === 0 || !(await verifySecret(rows[0].hash, body.currentPasswordHash))) {
          await client.end();
          return new Response(JSON.stringify({ success: false, message: 'Your current password is incorrect. Verification failed.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
        }
        await client.query('UPDATE users SET hash = $1 WHERE email = $2', [await hashNewSecret(passwordHash), email]);
        await client.end();
        return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
      }
      await client.end();
    }
    
    // Fallback logic removed per R5 hardening.
    return new Response(JSON.stringify({ success: false, message: 'DB not connected' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function onRequestGet({ env }) {
  try {
    if (env.DB) {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS users (
          email TEXT PRIMARY KEY,
          hash TEXT,
          role TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      
      const { results } = await env.DB.prepare('SELECT email, role, created_at FROM users ORDER BY created_at DESC').all();
      return new Response(JSON.stringify({ success: true, users: results }), { headers: { 'Content-Type': 'application/json' } });
    } else if (env.DATABASE_URL) {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: env.DATABASE_URL });
      await client.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          email VARCHAR(255) PRIMARY KEY,
          hash TEXT,
          role VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      const res = await client.query('SELECT email, role, created_at FROM users ORDER BY created_at DESC');
      await client.end();
      return new Response(JSON.stringify({ success: true, users: res.rows }), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ success: false, message: 'DB not connected' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
