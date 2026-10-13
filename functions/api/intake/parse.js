import { verifySession } from './auth';

/**
 * POST /api/intake/parse — R2-backed server parse for staged files.
 *
 * Parses bytes R2 already holds (via the secure-upload pipeline) so the
 * browser never materializes bulk files. Two actions:
 *  - list:  { scope } → csv/json/xlsx keys under requests/{scope}/ with sizes
 *  - parse: { key, maxRows? } → { cols, rows (preview), totalRows, ... }
 *
 * Contract mirrors the workbench client pipeline byte-for-byte (same SheetJS
 * options, same guards, same rejection wording): zero-rows / ragged>5% /
 * duplicate-headers / 10k-row-cap reject with 422 + reason, never 200-empty.
 * Schema tier + row validation stay client-side; this endpoint is parse +
 * structural guards only.
 *
 * Bounds (Workers honesty): PARSE_MAX_BYTES caps one buffered object well
 * below worker memory; maxRows caps the preview (totalRows always exact).
 * Session-gated throughout (staged files carry PII). Zero npm imports in
 * this file — SheetJS loads dynamically so a bundler/runtime failure degrades
 * to 503, never to a deploy-time break of sibling functions.
 */

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

const SEG = '[A-Za-z0-9_-]{1,64}';
const KEY_RE = new RegExp(`^requests/${SEG}/products/${SEG}/[A-Za-z0-9_.-]{1,200}$`);
const SCOPE_RE = /^[A-Za-z0-9_-]{1,64}$/;
const PARSE_EXTS = new Set(['csv', 'json', 'xlsx']);
const PARSE_MAX_BYTES = 8 * 1024 * 1024; // 8 MB per buffered object
const DEFAULT_PREVIEW_ROWS = 500;
const MAX_PREVIEW_ROWS = 2000;
const MAX_IMPORT_ROWS = 10000; // mirrors the workbench row cap

// ── Pure ports from app/intake/page.tsx (keep byte-identical; noted there) ──
const normalizeHeader = (h) => String(h ?? '').replace(/^﻿/, '').trim().toLowerCase();

function findDuplicateHeaders(headers) {
  const norm = headers.map(normalizeHeader);
  const seen = new Set();
  const dupes = [];
  for (const h of norm) {
    if (seen.has(h) && !dupes.includes(h)) dupes.push(h);
    seen.add(h);
  }
  return dupes;
}

function sniffDelimiter(sample) {
  const lines = String(sample || '').split('\n').filter((l) => l.trim() !== '').slice(0, 3);
  const stripQuoted = (l) => l.replace(/"[^"]*"/g, '');
  let commas = 0;
  let semicolons = 0;
  for (const l of lines) {
    const s = stripQuoted(l);
    commas += (s.match(/,/g) || []).length;
    semicolons += (s.match(/;/g) || []).length;
  }
  return semicolons > commas ? ';' : ',';
}

function raggedStats(aoa) {
  // CRITICAL: callers must pass the RAW AoA (no defval) — SheetJS pads short
  // rows to sheet width when defval is set, making every row equal header
  // length and this guard unfireable. (Kept in sync with app/intake/page.tsx.)
  if (!Array.isArray(aoa) || aoa.length <= 1) return { ragged: 0, total: 0 };
  const headerLen = (aoa[0] || []).length;
  let ragged = 0;
  for (let i = 1; i < aoa.length; i++) {
    const row = aoa[i] || [];
    if (row.every((c) => String(c ?? '').trim() === '')) continue;
    if (row.length !== headerLen) ragged++;
  }
  return { ragged, total: aoa.length - 1 };
}
// ── end ports ──

const extOfKey = (key) => String(key.split('.').pop() || '').toLowerCase();

function candidateBuckets(env) {
  const out = [];
  if (env.PRODUCTION_BUCKET && typeof env.PRODUCTION_BUCKET.get === 'function') out.push({ name: 'production', bucket: env.PRODUCTION_BUCKET });
  if (env.QUARANTINE_BUCKET && typeof env.QUARANTINE_BUCKET.get === 'function') out.push({ name: 'quarantine', bucket: env.QUARANTINE_BUCKET });
  return out;
}

async function loadSheetLib() {
  try {
    const mod = await import('xlsx');
    const lib = mod && (mod.default || mod);
    if (!lib || typeof lib.read !== 'function' || !lib.utils) return null;
    return lib;
  } catch {
    return null;
  }
}

async function sha256hexBytes(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function auditParse(env, request, event, details, username) {
  try {
    if (!env.DB || typeof env.DB.prepare !== 'function') return;
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, timestamp TEXT, event_type TEXT, page TEXT, details TEXT, username TEXT, ip_address TEXT)'
    ).run();
    await env.DB.prepare(
      'INSERT INTO audit_logs (id, timestamp, event_type, page, details, username, ip_address) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
    ).bind(
      crypto.randomUUID(), new Date().toISOString(), event, 'Intake Workbench',
      JSON.stringify(details || {}), String(username || 'unknown').slice(0, 254),
      request.headers.get('cf-connecting-ip') || 'unknown'
    ).run();
  } catch {}
}

function reject(message, extra) {
  return json({ success: false, error: 'PARSE_REJECTED', message, ...(extra || {}) }, 422);
}

export async function onRequestPost({ request, env }) {
  try {
    const user = await verifySession(env, request);
    if (!user) {
      return json({ success: false, message: 'Unauthorized' }, 401);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ success: false, message: 'Invalid request body' }, 400);
    }
    const action = body && body.action;

    const buckets = candidateBuckets(env);
    if (buckets.length === 0) {
      return json({ success: false, message: 'Evidence storage is not attached.' }, 503);
    }

    // ── list: keys under one request scope ──
    if (action === 'list') {
      const scope = typeof body.scope === 'string' ? body.scope.trim() : '';
      if (!SCOPE_RE.test(scope)) {
        return json({ success: false, message: 'Invalid scope.' }, 400);
      }
      const prefix = `requests/${scope}/`;
      const seen = new Map();
      for (const { bucket } of buckets) {
        if (typeof bucket.list !== 'function') continue;
        try {
          const page = await bucket.list({ prefix, limit: 100 });
          for (const obj of (page && page.objects) || []) {
            if (!obj || typeof obj.key !== 'string') continue;
            if (!KEY_RE.test(obj.key)) continue;
            const ext = extOfKey(obj.key);
            if (!PARSE_EXTS.has(ext)) continue;
            if (!seen.has(obj.key)) seen.set(obj.key, { key: obj.key, size: obj.size ?? null, ext });
          }
        } catch {
          continue;
        }
      }
      return json({ success: true, files: Array.from(seen.values()) });
    }

    // ── parse: R2 object → preview contract ──
    if (action === 'parse') {
      const key = typeof body.key === 'string' ? body.key : '';
      if (!KEY_RE.test(key)) {
        return json({ success: false, message: 'Unrecognized object key.' }, 400);
      }
      const ext = extOfKey(key);
      if (!PARSE_EXTS.has(ext)) {
        return json({ success: false, message: `Unsupported format ".${ext}". Only CSV, JSON, or XLSX files are accepted.` }, 400);
      }
      let maxRows = parseInt(body.maxRows, 10);
      if (!Number.isInteger(maxRows) || maxRows <= 0) maxRows = DEFAULT_PREVIEW_ROWS;
      maxRows = Math.min(maxRows, MAX_PREVIEW_ROWS);

      // Size guard BEFORE buffering (head-first; never pull 300 MB into a worker).
      let holder = null;
      let size = null;
      for (const { bucket } of buckets) {
        try {
          if (typeof bucket.head !== 'function') continue;
          const head = await bucket.head(key);
          if (head) {
            holder = bucket;
            size = head.size;
            break;
          }
        } catch {
          continue;
        }
      }
      if (!holder) {
        // No head() support or diverged bindings: fall back to get() on the
        // first bucket that holds the key (size then comes from the object).
        for (const { bucket } of buckets) {
          try {
            const obj = await bucket.get(key, { range: { offset: 0, length: 1 } });
            if (obj) {
              holder = bucket;
              size = obj.size;
              break;
            }
          } catch {
            continue;
          }
        }
      }
      if (!holder) {
        return json({ success: false, message: 'File not found in storage.' }, 404);
      }
      if (typeof size === 'number' && size > PARSE_MAX_BYTES) {
        return json({ success: false, message: `File is ${(size / 1048576).toFixed(1)} MB — server parse covers files up to ${PARSE_MAX_BYTES / 1048576} MB. Parse larger files in the browser workbench.` }, 413);
      }

      let bytes;
      try {
        const obj = await holder.get(key);
        if (!obj) {
          return json({ success: false, message: 'File not found in storage.' }, 404);
        }
        if (obj.size > PARSE_MAX_BYTES) {
          return json({ success: false, message: `File is ${(obj.size / 1048576).toFixed(1)} MB — server parse covers files up to ${PARSE_MAX_BYTES / 1048576} MB. Parse larger files in the browser workbench.` }, 413);
        }
        bytes = new Uint8Array(await obj.arrayBuffer());
      } catch {
        return json({ success: false, message: 'Failed to read file from storage.' }, 500);
      }
      const sha256 = await sha256hexBytes(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)).catch(() => 'unavailable');

      let cols = [];
      let rows = [];
      let delimiter;
      let sheetName;
      try {
        if (ext === 'xlsx' || ext === 'csv') {
          const lib = await loadSheetLib();
          if (!lib) {
            return json({ success: false, message: 'Tabular parser unavailable. Parse this file in the browser workbench.' }, 503);
          }
          if (ext === 'xlsx') {
            const wb = lib.read(bytes, { type: 'array' });
            let sheetData = [];
            for (const name of wb.SheetNames || []) {
              const ws = wb.Sheets[name];
              if (!ws) continue;
              const aoa = lib.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
              const hasData = aoa.length > 1 && aoa.slice(1).some((r) => (r || []).some((c) => String(c ?? '').trim() !== ''));
              if (hasData) {
                sheetData = lib.utils.sheet_to_json(ws, { defval: '', raw: false });
                sheetName = name;
                break;
              }
            }
            if (sheetData.length === 0) {
              await auditParse(env, request, 'INTAKE_SERVER_PARSED', { key, ext, rejected: 'zero data rows (all sheets empty)' }, user.email);
              return reject('zero data rows (all sheets empty)', { cols: [], totalRows: 0, sheetName });
            }
            cols = Object.keys(sheetData[0]);
            rows = sheetData;
            const rawSheetAoa = lib.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: false });
            const { ragged, total } = raggedStats(rawSheetAoa);
            if (total > 0 && ragged / total > 0.05) {
              await auditParse(env, request, 'INTAKE_SERVER_PARSED', { key, ext, rejected: `ragged rows: ${ragged} of ${total}` }, user.email);
              return reject(`ragged rows: ${ragged} of ${total} data rows have a field count different from the header`, { cols, totalRows: rows.length, sheetName });
            }
          } else {
            const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
            const approxLines = (text.match(/\n/g) || []).length + 1;
            if (approxLines - 1 > MAX_IMPORT_ROWS) {
              return reject(`File contains more than ${MAX_IMPORT_ROWS.toLocaleString()} data rows, exceeding the row cap. Split into smaller files.`, { totalRows: approxLines - 1 });
            }
            delimiter = sniffDelimiter(text.slice(0, 4096));
            const wb = lib.read(text, { type: 'string', FS: delimiter });
            const ws = wb.Sheets[wb.SheetNames[0]];
            if (!ws) {
              return reject('unparseable CSV (no data found)', { cols: [], totalRows: 0, delimiter });
            }
            const aoa = lib.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
            if (aoa.length <= 1) {
              return reject('zero data rows (header only)', { cols: aoa.length === 1 ? aoa[0] : [], totalRows: 0, delimiter });
            }
            const d = lib.utils.sheet_to_json(ws, { defval: '', raw: false });
            if (d.length === 0) {
              return reject('zero data rows (header only)', { cols: aoa[0] || [], totalRows: 0, delimiter });
            }
            cols = Object.keys(d[0]);
            rows = d;
            // Raw AoA for stats (no defval padding — see raggedStats note).
            const rawAoaCsv = lib.utils.sheet_to_json(ws, { header: 1, raw: false });
            const { ragged, total } = raggedStats(rawAoaCsv);
            if (total > 0 && ragged / total > 0.05) {
              await auditParse(env, request, 'INTAKE_SERVER_PARSED', { key, ext, rejected: `ragged rows: ${ragged} of ${total}` }, user.email);
              return reject(`ragged rows: ${ragged} of ${total} data rows have a field count different from the header`, { cols, totalRows: rows.length, delimiter });
            }
          }
        } else {
          const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
          let parsedJson;
          try {
            parsedJson = JSON.parse(text);
          } catch {
            await auditParse(env, request, 'INTAKE_SERVER_PARSED', { key, ext, rejected: 'unparseable JSON' }, user.email);
            return reject('unparseable JSON (expected an array of objects)', { cols: [], totalRows: 0 });
          }
          const raw = Array.isArray(parsedJson)
            ? parsedJson
            : Array.isArray(parsedJson && parsedJson.data) ? parsedJson.data
            : Array.isArray(parsedJson && parsedJson.rows) ? parsedJson.rows
            : Array.isArray(parsedJson && parsedJson.items) ? parsedJson.items
            : [parsedJson];
          if (raw.length === 0) {
            return reject('zero data rows (empty array)', { cols: [], totalRows: 0 });
          }
          if (typeof raw[0] !== 'object' || raw[0] === null) {
            return reject('unparseable JSON (expected an array of objects)', { cols: [], totalRows: 0 });
          }
          const seen = new Set();
          for (const row of raw) {
            if (typeof row !== 'object' || row === null) continue;
            for (const k of Object.keys(row)) {
              if (!seen.has(k)) seen.add(k);
            }
          }
          cols = [...seen];
          rows = raw;
        }
      } catch (err) {
        console.error('[intake-parse] parse error:', err);
        return json({ success: false, message: 'Failed to parse file. It may be corrupt — try the browser workbench.' }, 500);
      }

      if (rows.length > MAX_IMPORT_ROWS) {
        return reject(`File contains ${rows.length.toLocaleString()} rows, exceeding the ${MAX_IMPORT_ROWS.toLocaleString()}-row cap. Split into smaller files.`, { totalRows: rows.length });
      }
      const dupes = findDuplicateHeaders(cols);
      if (dupes.length > 0) {
        await auditParse(env, request, 'INTAKE_SERVER_PARSED', { key, ext, rejected: `duplicate column headers: "${dupes.join('", "')}"` }, user.email);
        return reject(`duplicate column headers: "${dupes.join('", "')}"`, { cols, totalRows: rows.length, duplicateHeaders: dupes, delimiter, sheetName });
      }

      await auditParse(env, request, 'INTAKE_SERVER_PARSED', { key, ext, rows: rows.length, columns: cols.length, sha256: String(sha256).slice(0, 16) }, user.email);
      return json({
        success: true,
        ext,
        cols,
        rows: rows.slice(0, maxRows),
        totalRows: rows.length,
        truncatedPreview: rows.length > maxRows,
        ...(delimiter ? { delimiter } : {}),
        ...(sheetName ? { sheetName } : {}),
        size,
        sha256
      });
    }

    return json({ success: false, message: 'Unknown action.' }, 400);
  } catch (err) {
    console.error('[intake-parse] Internal error:', err);
    return json({ success: false, message: 'Parse failed. Please try again shortly.' }, 500);
  }
}
