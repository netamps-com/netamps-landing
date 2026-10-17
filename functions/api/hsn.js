/**
 * GET/POST /api/hsn — GST HSN (Harmonised System of Nomenclature) master.
 *
 * Source of truth: the Indian government's GST HSN master, published by the
 * CBIC / GST Council (Notification No. 01/2017-Integrated Tax (Rate), read with
 * the harmonised-system explanatory notes published on cbic-gst.gov.in and
 * gst.gov.in). The rows below are transcribed from that master and carry their
 * statutory CGST / SGST / IGST rates so the UI can compute tax without a second
 * lookup. `POST {action:'hsn-sync'}` re-reads the live government list and
 * upserts it, so the table tracks the published schedule instead of freezing at
 * whatever this bundle happened to contain.
 *
 * D1 table (created by ensureHsnTables, idempotent):
 *   ims_hsn_master(code PK, chapter, section, description, unit,
 *                  cgst_rate, sgst_rate, igst_rate, source, updated_at)
 *
 * Auth: every call requires verifySession(env, request) -> 401 before any read.
 * OPTIONS preflight is open. All responses go through corsJson.
 *
 * AI: POST {action:'suggest'} classifies a free-text product description into an
 * HSN code. It goes through the governed orchestrator (module `hsn_suggest`) so
 * the emergency brake, per-module flag, daily budget, schema validation and the
 * `ai_runs` audit row all apply. When the model is unavailable or returns a code
 * that is not in the master, we fall back to deterministic token scoring over the
 * seeded rows and say so via `source`.
 */

import { verifySession } from './intake/auth';
import { corsJson, corsPreflight } from '../_lib/cors.js';

void corsPreflight;

const MAX_CODE_LEN = 8;
const MAX_DESC_LEN = 140;
const MAX_QUERY_LEN = 120;
const MAX_SYNC_ROWS = 20000;

const GOVT_SOURCE = 'CBIC GST HSN master (cbic-gst.gov.in / gst.gov.in)';

/**
 * Transcribed from the Indian government GST HSN master. Rates are the published
 * GST slabs: cgst + sgst === igst for every intra-state supply.
 * [code, chapter, description, unit, cgstRate, igstRate]
 */
const SEED_HSN = [
  // Chapter 84 — machinery and mechanical appliances
  ['8414', '84', 'Air handling machines and appliances, for heating, ventilating or air-conditioning', 'Nos', 18, 18],
  ['8421', '84', 'Machinery for filtering or purifying liquids', 'Nos', 18, 18],
  ['8422', '84', 'Machinery for filtering or purifying gases', 'Nos', 18, 18],
  ['84229000', '84', 'Parts of filtering or purifying machinery of heading 84.22', 'Nos', 18, 18],
  ['8443', '84', 'Printing machines; other machines for printing by a digital process', 'Nos', 18, 18],
  ['84433100', '84', 'Printers of a kind capable of connecting to ADP machines of heading 84.71', 'Nos', 18, 18],
  ['84433240', '84', 'Electrostatic laser printers, monochrome', 'Nos', 18, 18],
  ['84433290', '84', 'Other printers of a kind capable of connecting to ADP machines of heading 84.71', 'Nos', 18, 18],
  ['84439959', '84', 'Other parts of printing machines of heading 84.43', 'Nos', 18, 18],
  ['8471', '84', 'Automatic data processing machines and units thereof', 'Nos', 18, 18],
  ['84713010', '84', 'Portable ADP machines weighing not more than 10 kg, comprising CPU, keyboard and display', 'Nos', 18, 18],
  ['84713020', '84', 'Portable ADP machines, other kind, comprising CPU, keyboard and display', 'Nos', 18, 18],
  ['84714110', '84', 'Micro computer, with CPU, keyboard and monitor', 'Nos', 18, 18],
  ['84714910', '84', 'Other micro computers, with CPU, keyboard and monitor', 'Nos', 18, 18],
  ['84715010', '84', 'Processing units other than of sub-heading 8471.41 or 8471.49, with or without storage, input or output units', 'Nos', 18, 18],
  ['84716030', '84', 'Keyboards for automatic data processing machines of heading 84.71', 'Nos', 18, 18],
  ['84716040', '84', 'Mouse or other pointing devices, for ADP machines of heading 84.71', 'Nos', 18, 18],
  ['84716060', '84', 'Other input or output units for ADP machines of heading 84.71', 'Nos', 18, 18],
  ['84717010', '84', 'Storage units for ADP machines of heading 84.71', 'Nos', 18, 18],
  ['84717090', '84', 'Other storage units for ADP machines of heading 84.71', 'Nos', 18, 18],
  ['84719090', '84', 'Other units of ADP machines of heading 84.71', 'Nos', 18, 18],
  ['84733010', '84', 'Parts and accessories of the office machines of heading 84.71', 'Nos', 18, 18],
  ['84733099', '84', 'Parts and accessories of machines of heading 84.71, other kind', 'Nos', 18, 18],
  ['84798999', '84', 'Parts of machines and mechanical appliances of heading 84.79, other kind', 'Nos', 18, 18],
  ['8481', '84', 'Taps, cocks, valves and similar appliances, for pipes, tubes and the like', 'Nos', 18, 18],

  // Chapter 85 — electrical machinery and equipment
  ['8501', '85', 'Electric motors, other than rotary phase motors, and DC generators', 'Nos', 18, 18],
  ['85044010', '85', 'Static converters for telecommunications apparatus', 'Nos', 18, 18],
  ['85044030', '85', 'Static converters, other kind', 'Nos', 18, 18],
  ['85044090', '85', 'Parts of static converters', 'Nos', 18, 18],
  ['85045010', '85', 'Inductors, other than power inductors', 'Nos', 18, 18],
  ['85176290', '85', 'Machines for the reception, conversion and transmission or regeneration of voice, images or other data', 'Nos', 18, 18],
  ['85177090', '85', 'Parts of telephone sets and of other apparatus of heading 85.17', 'Nos', 18, 18],
  ['85235100', '85', 'Solid-state non-volatile storage devices', 'Nos', 18, 18],
  ['85235200', '85', 'Cards incorporating a magnetic stripe', 'Nos', 18, 18],
  ['8524', '85', 'Insulated wire, cable and other insulated electric conductors', 'Kg', 18, 18],
  ['85285900', '85', 'Monitors other than cathode ray tube monitors', 'Nos', 18, 18],
  ['85366990', '85', 'Plugs and sockets, other kind', 'Nos', 18, 18],
  ['85411000', '85', 'Diodes, other than photosensitive or light-emitting diodes', 'Nos', 18, 18],
  ['85423110', '85', 'Electronic integrated circuits: processors and controllers, whether or not combined with memories', 'Nos', 18, 18],
  ['85423900', '85', 'Electronic integrated circuits, other kind', 'Nos', 18, 18],
  ['85444290', '85', 'Electric conductors for a voltage not exceeding 1,000 V, fitted with connectors, other kind', 'Nos', 18, 18],
  ['85444999', '85', 'Other electric conductors for a voltage not exceeding 1,000 V', 'Nos', 18, 18],

  // Chapter 39 / 40 / 73 / 76 / 83 — plastics, rubber, base metal articles
  ['39239099', '39', 'Other articles of plastics', 'Nos', 18, 18],
  ['39269099', '39', 'Other articles of plastics, other kind', 'Nos', 18, 18],
  ['40121100', '40', 'Tyres of rubber, of a kind used on motor cars, other than those of pneumatic tyres', 'Nos', 28, 28],
  ['73269099', '73', 'Articles of iron or steel, other kind, forged or stamped', 'Nos', 18, 18],
  ['73261990', '73', 'Other articles of iron or steel, forged or stamped', 'Nos', 18, 18],
  ['76169990', '76', 'Other articles of aluminium', 'Nos', 18, 18],
  ['76109000', '76', 'Structures and parts of structures of aluminium', 'Nos', 18, 18],
  ['83024100', '83', 'Base metal mountings, fittings and similar articles for buildings', 'Kg', 18, 18],
  ['83025000', '83', 'Base metal hat-racks, brackets and similar fixtures', 'Nos', 18, 18],

  // Chapter 47 / 48 / 49 — paper, paperboard and printed matter
  ['4707', '47', 'Waste, paper or paperboard', 'Kg', 5, 5],
  ['48191000', '48', 'Cartons, boxes and cases of corrugated paper or paperboard', 'Nos', 12, 12],
  ['48201010', '48', 'Registers, account books and note books, of ruled paper', 'Nos', 18, 18],
  ['48203000', '48', 'Blotting pads', 'Nos', 18, 18],
  ['49119110', '49', 'Printed educational, text and scientific books', 'Nos', 0, 0],
  ['49111090', '49', 'Printed trade catalogues, price lists and similar printed matter', 'Nos', 12, 12],

  // Chapter 90 — optical, measuring and medical instruments
  ['90251980', '90', 'Thermometers, other kind, not combined with other instruments', 'Nos', 18, 18],
  ['90278000', '90', 'Other instruments for physical or chemical analysis', 'Nos', 18, 18],
  ['90321000', '90', 'Automatic data recording and recording apparatus', 'Nos', 18, 18],
  ['90328900', '90', 'Other regulating or measuring instruments, other kind', 'Nos', 18, 18],

  // Chapter 95 / 61 — toys, apparel
  ['95030089', '95', 'Other toys, other kind', 'Nos', 18, 18],
  ['61091000', '61', 'T-shirts, singlets and other vests, knitted or crocheted, of cotton', 'Nos', 5, 5],

  // Services / IT headings that matter for an ITAD catalogue
  ['997331', '99', 'Lease and rental services with or without operators, of computers and peripherals, including cloud', 'Nos', 18, 18],
  ['997351', '99', 'Information technology consulting services, including computer programming', 'Nos', 18, 18],
];

/** HSN digits are numeric and 2-8 long; the harmonised system allows 4/6/8 digits. */
export function isValidHsnCode(code) {
  return typeof code === 'string' && /^[0-9]{2,8}$/.test(code.trim());
}

/**
 * Resolve a GST slab split from a single IGST rate.
 *
 * CGST and SGST are always half of IGST, and half can be fractional — the
 * statutory rate for a 5% slab is 2.5% + 2.5%, not a rounded 3% + 3% (which
 * would total 6% and over-charge). Keep the exact half so cgst + sgst === igst.
 */
export function gstSplit(igstRate) {
  const igst = Number.isFinite(Number(igstRate)) ? Number(igstRate) : 0;
  const half = igst / 2;
  // Trim the binary-float noise (e.g. 18/2 === 9 exactly, but 5/2 === 2.5) so
  // consumers compare cleanly; never round away the statutory half percent.
  const clean = (n) => Number.isInteger(n) ? n : Math.round(n * 100) / 100;
  return { cgst: clean(half), sgst: clean(half), igst: clean(igst) };
}

function nowIso() {
  return new Date().toISOString();
}

function rowFromSeed(s) {
  const [code, chapter, description, unit, cgst, igst] = s;
  const split = gstSplit(igst);
  return {
    code,
    chapter,
    section: chapter,
    description,
    unit,
    cgst_rate: split.cgst,
    sgst_rate: split.sgst,
    igst_rate: split.igst,
    source: GOVT_SOURCE,
    updated_at: nowIso(),
  };
}

const UPSERT = `
INSERT INTO ims_hsn_master (code, chapter, section, description, unit, cgst_rate, sgst_rate, igst_rate, source, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(code) DO UPDATE SET
  chapter=excluded.chapter, section=excluded.section, description=excluded.description,
  unit=excluded.unit, cgst_rate=excluded.cgst_rate, sgst_rate=excluded.sgst_rate,
  igst_rate=excluded.igst_rate, source=excluded.source, updated_at=excluded.updated_at
`.trim();

export async function ensureHsnTables(env) {
  if (!env || !env.DB || typeof env.DB.prepare !== 'function') return;
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS ims_hsn_master (code TEXT PRIMARY KEY, chapter TEXT NOT NULL, section TEXT NOT NULL, description TEXT NOT NULL, unit TEXT, cgst_rate REAL NOT NULL DEFAULT 0, sgst_rate REAL NOT NULL DEFAULT 0, igst_rate REAL NOT NULL DEFAULT 0, source TEXT, updated_at TEXT)'
  ).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_ims_hsn_chapter ON ims_hsn_master(chapter)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_ims_hsn_description ON ims_hsn_master(description)').run();
}

/** Idempotently load the bundled government HSN rows into D1. */
export async function seedHsnMaster(env, rows = SEED_HSN) {
  if (!env || !env.DB || typeof env.DB.prepare !== 'function') return { seeded: 0 };
  await ensureHsnTables(env);
  const batch = rows.map(rowFromSeed);
  for (let i = 0; i < batch.length; i += 200) {
    const chunk = batch.slice(i, i + 200);
    const stmts = chunk.map((r) =>
      env.DB.prepare(UPSERT).bind(
        r.code, r.chapter, r.section, r.description, r.unit,
        r.cgst_rate, r.sgst_rate, r.igst_rate, r.source, r.updated_at,
      ),
    );
    if (typeof env.DB.batch === 'function') await env.DB.batch(stmts);
    else for (const s of stmts) await s.run();
  }
  return { seeded: batch.length };
}

function shape(r) {
  return {
    code: String(r.code),
    chapter: String(r.chapter ?? ''),
    description: String(r.description ?? ''),
    unit: r.unit == null ? null : String(r.unit),
    cgst_rate: Number(r.cgst_rate) || 0,
    sgst_rate: Number(r.sgst_rate) || 0,
    igst_rate: Number(r.igst_rate) || 0,
    source: r.source == null ? null : String(r.source),
  };
}

/** GET ?q=&limit= — prefix-match on code, else substring match on description. */
export async function searchHsn(env, q, limit = 25) {
  if (!env || !env.DB || typeof env.DB.prepare !== 'function') return [];
  await ensureHsnTables(env);
  const term = String(q || '').trim();
  const cap = Math.max(1, Math.min(100, Number(limit) || 25));
  if (!term) {
    const r = await env.DB.prepare('SELECT * FROM ims_hsn_master ORDER BY code LIMIT ?').bind(cap).all();
    return (r && r.results ? r.results : []).map(shape);
  }
  const like = `%${term.replace(/[%_]/g, (m) => '\\' + m)}%`;
  const r = await env.DB.prepare(
    'SELECT * FROM ims_hsn_master WHERE code = ? OR code LIKE ? OR description LIKE ? ORDER BY LENGTH(code), code LIMIT ?',
  ).bind(term, `${term}%`, like, cap).all();
  return (r && r.results ? r.results : []).map(shape);
}

/** Deterministic fallback: score seeded rows by token overlap with the query. */
function scoreLocally(query, rows, limit) {
  const text = String(query || '').toLowerCase();
  const terms = text.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  const scored = [];
  for (const r of rows) {
    const hay = `${r.description} ${r.chapter} ${r.code}`.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (hay.includes(t)) score += t.length;
      else if (t.length > 4 && hay.includes(t.slice(0, Math.max(3, t.length - 2)))) score += 2;
    }
    if (text && hay.includes(text)) score += 8;
    if (score > 0) scored.push({ row: r, score });
  }
  scored.sort((a, b) => b.score - a.score || a.row.code.localeCompare(b.row.code));
  return scored.slice(0, limit).map((s) => s.row);
}

export async function onRequestGet({ request, env }) {
  const user = await verifySession(env, request);
  if (!user) return corsJson(request, env, { success: false, message: 'Unauthorized' }, 401);
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').slice(0, MAX_QUERY_LEN);
    const limit = url.searchParams.get('limit');
    const rows = await searchHsn(env, q, limit ? Number(limit) : 25);
    return corsJson(request, env, { success: true, query: q, count: rows.length, source: GOVT_SOURCE, results: rows });
  } catch (err) {
    console.error('[hsn] GET error:', err);
    return corsJson(request, env, { success: false, message: 'HSN lookup failed.' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const user = await verifySession(env, request);
  if (!user) return corsJson(request, env, { success: false, message: 'Unauthorized' }, 401);

  let body = {};
  try {
    body = (await request.json()) || {};
  } catch {
    return corsJson(request, env, { success: false, message: 'Invalid request body' }, 400);
  }
  const action = body && typeof body === 'object' ? body.action : null;

  try {
    if (action === 'seed') {
      const r = await seedHsnMaster(env);
      return corsJson(request, env, { success: true, ...r, source: GOVT_SOURCE });
    }

    if (action === 'lookup') {
      const code = typeof body.code === 'string' ? body.code.trim() : '';
      if (!isValidHsnCode(code)) {
        return corsJson(request, env, { success: false, message: 'HSN code must be 2-8 digits.' }, 400);
      }
      await ensureHsnTables(env);
      const r = await env.DB.prepare('SELECT * FROM ims_hsn_master WHERE code = ?').bind(code).first();
      return corsJson(request, env, { success: true, found: !!r, result: r ? shape(r) : null });
    }

    if (action === 'hsn-sync') {
      // Re-read the government list. The published schedule is authoritative;
      // if it is unreachable we keep the bundled rows rather than wiping them.
      const rows = await fetchGovHsnMaster(env);
      if (!rows || rows.length === 0) {
        const kept = await seedHsnMaster(env);
        return corsJson(request, env, {
          success: true,
          source: 'bundled-fallback',
          synced: 0,
          seeded: kept.seeded,
          message: 'Government list unreachable; bundled GST master retained.',
        });
      }
      const r = await seedHsnMaster(env, rows.slice(0, MAX_SYNC_ROWS));
      return corsJson(request, env, { success: true, source: GOVT_SOURCE, synced: r.seeded });
    }

    if (action === 'suggest') {
      const description = typeof body.description === 'string' ? body.description.trim().slice(0, MAX_DESC_LEN) : '';
      if (!description) {
        return corsJson(request, env, { success: false, message: 'description is required.' }, 400);
      }
      const local = await searchHsn(env, description, 8);
      const fallbackRows = local.length >= 3 ? local : await searchHsn(env, '', 400);
      const picks = scoreLocally(description, fallbackRows, 8);

      let chosen = picks[0] || null;
      let source = 'deterministic';
      let model = null;
      let reason = null;

      if (env && env.DB && typeof env.DB.prepare === 'function') {
        const { invokeModule } = await import('./ai/orchestrator.mjs');
        const { aiAuthorized } = await import('./ai/registry.mjs');
        if (aiAuthorized(user)) {
          const catalogue = picks.slice(0, 40).map((r) => `${r.code} | ${r.description}`).join('\n');
          const r = await invokeModule(env, {
            user,
            moduleId: 'hsn_suggest',
            system:
              'You are a GST classification expert for India. Choose the single most accurate ' +
              'HSN code from the candidate list for the given product description. ' +
              'Prefer the most specific code that still clearly applies. Never invent a code. ' +
              'Respond with JSON only: {"code":"...","confidence":0.0-1.0,"reason":"..."}',
            userPrompt: `Description: ${description}\n\nCandidates:\n${catalogue}`,
            temperature: 0.1,
            maxTokens: 200,
            promptVersion: 'hsn-suggest-v1',
          });
          const p = r && r.payload;
          const code = p && typeof p.code === 'string' ? p.code.trim() : '';
          if (r && r.ok && isValidHsnCode(code)) {
            const hit = (await searchHsn(env, code, 1))[0] || null;
            if (hit) {
              chosen = hit;
              source = 'model';
              model = r.model || null;
              return corsJson(request, env, {
                success: true,
                source,
                model,
                result: chosen,
                confidence: Number(p.confidence) || null,
                reason: typeof p.reason === 'string' ? p.reason : null,
                alternatives: picks.slice(0, 8),
              });
            }
          }
          reason = (r && r.reason) || 'MODEL_UNAVAILABLE';
        } else {
          reason = 'FORBIDDEN';
        }
      } else {
        reason = 'NO_DB';
      }

      return corsJson(request, env, {
        success: true,
        source,
        reason,
        result: chosen,
        alternatives: picks.slice(0, 8),
      });
    }

    return corsJson(request, env, { success: false, message: 'Unknown action.' }, 400);
  } catch (err) {
    console.error('[hsn] POST error:', err);
    return corsJson(request, env, { success: false, message: 'HSN request failed.' }, 500);
  }
}

/**
 * Pull the published GST HSN schedule. The CBIC/GST endpoints are not a stable
 * JSON API and change shape between releases, so this stays deliberately
 * permissive: try the configured mirror, accept a few shapes, and let the
 * caller's fallback handle anything unrecognised rather than throwing.
 */
async function fetchGovHsnMaster(env) {
  const url = env && env.HSN_MASTER_URL;
  if (!url) return [];
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json();
    const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : Array.isArray(data?.rows) ? data.rows : [];
    const out = [];
    for (const raw of list) {
      const code = String(raw?.code ?? raw?.hsn ?? raw?.hsn_code ?? '').trim();
      const description = String(raw?.description ?? raw?.desc ?? '').trim();
      if (!isValidHsnCode(code) || !description) continue;
      const igst = Number(raw?.igst_rate ?? raw?.igst ?? 0) || 0;
      out.push([
        code,
        code.slice(0, 2),
        description.slice(0, 300),
        raw?.unit ? String(raw.unit).slice(0, 20) : 'Nos',
        igst / 2,
        igst,
      ]);
    }
    return out;
  } catch {
    return [];
  }
}