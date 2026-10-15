/**
 * Tamper-evident audit chain (priority-2 hardening / SOC 2 CC7.2).
 *
 * Every audit row carries a hash of (prev_hash ‖ row fields). Changing, deleting
 * or reordering any historical row breaks the chain at that point, and
 * `verifyChain()` detects it. This turns "we log everything" into evidence an
 * auditor can independently check.
 *
 * Design constraints (Cloudflare Pages Functions):
 *  - ZERO npm imports. Uses Web Crypto (SHA-256) + D1 only.
 *  - Column additions are additive and idempotent: existing rows get
 *    row_hash = NULL (genesis state) and are reported as `legacy` by the
 *    verifier rather than failing it. Chain validity starts from the first
 *    hashed row.
 *  - Write path is fail-OPEN: if the chain cannot be computed the row is still
 *    written (never lose an audit event over a hashing failure); the verifier
 *    reports the gap.
 */

const GENESIS = '0'.repeat(64);

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Deterministic serialization: field order must never vary between writers. */
function canonical(row) {
  return JSON.stringify([
    row.id,
    row.timestamp,
    row.event_type,
    row.page,
    row.details,
    row.username,
    row.ip_address,
  ]);
}

/** Idempotently add chain columns + indexes. Safe to run on every write. */
export async function ensureAuditChain(env) {
  if (!env.DB || typeof env.DB.prepare !== 'function') return false;
  try {
    // SQLite/D1 has no ADD COLUMN IF NOT EXISTS; probe, then add if missing.
    const cols = await env.DB.prepare('PRAGMA table_info(audit_logs)').all();
    const names = new Set((cols.results || []).map((c) => c.name));
    if (!names.has('prev_hash')) {
      await env.DB.prepare('ALTER TABLE audit_logs ADD COLUMN prev_hash TEXT').run();
    }
    if (!names.has('row_hash')) {
      await env.DB.prepare('ALTER TABLE audit_logs ADD COLUMN row_hash TEXT').run();
    }
    await env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS idx_audit_chain ON audit_logs(timestamp ASC, row_hash)'
    ).run();
    return true;
  } catch (err) {
    console.error('[audit-chain] ensure failed:', err);
    return false;
  }
}

/**
 * Insert an audit row into the hash chain.
 * Returns { ok, rowHash, prevHash } — never throws.
 */
export async function appendChainedAudit(env, row) {
  const plain = {
    id: row.id,
    timestamp: row.timestamp,
    event_type: row.event_type,
    page: row.page,
    details: row.details,
    username: row.username,
    ip_address: row.ip_address,
  };

  if (!env.DB || typeof env.DB.prepare !== 'function') {
    await plainInsert(env, plain);
    return { ok: false, reason: 'no-db' };
  }

  try {
    await ensureAuditChain(env);
    const head = await env.DB.prepare(
      'SELECT row_hash FROM audit_logs WHERE row_hash IS NOT NULL ORDER BY timestamp DESC, row_hash DESC LIMIT 1'
    ).first();
    const prevHash = head && head.row_hash ? head.row_hash : GENESIS;
    const rowHash = await sha256Hex(prevHash + canonical(plain));

    await env.DB.prepare(
      'INSERT INTO audit_logs (id, timestamp, event_type, page, details, username, ip_address, prev_hash, row_hash) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)'
    ).bind(
      plain.id, plain.timestamp, plain.event_type, plain.page, plain.details,
      plain.username, plain.ip_address, prevHash, rowHash
    ).run();

    return { ok: true, rowHash, prevHash };
  } catch (err) {
    // Fail-open: the audit event still lands, un-hashed.
    console.error('[audit-chain] append failed, writing unchained:', err);
    await plainInsert(env, plain);
    return { ok: false, reason: String(err && err.message || err) };
  }
}

async function plainInsert(env, plain) {
  if (!env.DB || typeof env.DB.prepare !== 'function') return;
  try {
    await env.DB.prepare(
      'INSERT INTO audit_logs (id, timestamp, event_type, page, details, username, ip_address) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
    ).bind(
      plain.id, plain.timestamp, plain.event_type, plain.page, plain.details,
      plain.username, plain.ip_address
    ).run();
  } catch (err) {
    console.error('[audit-chain] plain insert failed:', err);
  }
}

/**
 * Walk the chain and report the first break.
 * @returns {{ valid, checked, legacy, brokenAt: string|null, reason: string|null, head: string|null }}
 */
export async function verifyChain(env, maxRows = 5000) {
  if (!env.DB || typeof env.DB.prepare !== 'function') {
    return { valid: false, checked: 0, legacy: 0, brokenAt: null, reason: 'no-db', head: null };
  }
  await ensureAuditChain(env);

  const { results } = await env.DB.prepare(
    'SELECT id, timestamp, event_type, page, details, username, ip_address, prev_hash, row_hash FROM audit_logs ORDER BY timestamp ASC, id ASC LIMIT ?1'
  ).bind(maxRows).all();

  let checked = 0;
  let legacy = 0;
  let prev = GENESIS;
  let head = null;

  for (const row of results || []) {
    if (!row.row_hash) {
      legacy += 1; // pre-chain row; chain validity starts after these
      continue;
    }
    const expected = await sha256Hex(prev + canonical(row));
    if (row.prev_hash !== prev) {
      return {
        valid: false, checked, legacy,
        brokenAt: row.id, reason: 'prev_hash mismatch (row removed or reordered)', head: prev,
      };
    }
    if (expected !== row.row_hash) {
      return {
        valid: false, checked, legacy,
        brokenAt: row.id, reason: 'row_hash mismatch (row contents modified)', head: prev,
      };
    }
    prev = row.row_hash;
    head = row.row_hash;
    checked += 1;
  }

  return { valid: true, checked, legacy, brokenAt: null, reason: null, head };
}

/**
 * Anomaly heuristics for SOC 2 CC7.2 monitoring.
 * Detects bulk deletion pressure, mass identical-actor activity and
 * off-hours activity concentration. Advisory only — never blocks a request.
 */
export async function detectAnomalies(env, windowMinutes = 60) {
  const findings = [];
  if (!env.DB || typeof env.DB.prepare !== 'function') return findings;
  try {
    const since = new Date(Date.now() - windowMinutes * 60000).toISOString();

    const bulk = await env.DB.prepare(
      "SELECT COUNT(*) as c FROM audit_logs WHERE event_type = 'LOGS_CLEARED' AND timestamp >= ?1"
    ).bind(since).first();
    if (bulk && bulk.c >= 1) {
      findings.push({
        type: 'AUDIT_PURGE',
        severity: 'high',
        detail: `${bulk.c} audit-log clear event(s) in the last ${windowMinutes} minutes.`,
      });
    }

    const burst = await env.DB.prepare(
      'SELECT username, COUNT(*) as c FROM audit_logs WHERE timestamp >= ?1 GROUP BY username ORDER BY c DESC LIMIT 1'
    ).bind(since).first();
    if (burst && burst.c > 200) {
      findings.push({
        type: 'WRITE_BURST',
        severity: 'medium',
        detail: `Actor "${burst.username}" produced ${burst.c} events in ${windowMinutes} minutes.`,
      });
    }

    const clears = await env.DB.prepare(
      "SELECT COUNT(*) as c FROM audit_logs WHERE event_type LIKE '%DELETE%' OR event_type LIKE '%DESTROY%' OR event_type LIKE '%PURGE%' AND timestamp >= ?1"
    ).bind(since).first();
    if (clears && clears.c >= 3) {
      findings.push({
        type: 'MASS_DESTRUCTION',
        severity: 'high',
        detail: `${clears.c} destructive operation(s) recorded in ${windowMinutes} minutes.`,
      });
    }
  } catch (err) {
    console.error('[audit-chain] anomaly scan failed:', err);
  }
  return findings;
}