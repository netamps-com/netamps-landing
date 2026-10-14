/**
 * External no-match enrichment (hint-only, async, quarantined).
 *
 * When Tier-1 catalog + Tier-2 normalizer find no right match, the visitor's
 * custom text is kept as-is and — behind the `enrich_enabled` flag — we try a
 * DuckDuckGo hint, parse it with Llama, validate, and add an UNVERIFIED row.
 *
 * Design constraints (per review):
 *  - DuckDuckGo is hint-only, never ground truth. Empty results are the common
 *    case (api.duckduckgo.com returned {} for "Dell PowerEdge R750").
 *  - Zero user-visible latency: called only via context.waitUntil post-submit.
 *    Never in the typeahead request path.
 *  - No fabrication: model output must share a token with the USER query,
 *    otherwise rejected as FABRICATED_IDENTITY. External text cannot hijack.
 *  - Quarantine-first: staging row + products row as unverified + incremental
 *    FTS insert. Unverified cap (0.75 < 0.80 gate) in normalize/line.js keeps
 *    these rows display-only until staff verify.
 *  - Fuzzy matching reuse: tokenize + FTS + Jaro from existing modules, no new
 *    vector infra in this step.
 */

import { normalizeFold, searchCatalog, ensureCatalog } from './catalog.js';
import {
  validateRow, findDuplicate, fold, tokenize, ensureEtlTables,
} from './etl.js';
import { validateDescriptor } from '../normalize/line.js';
import { runJson } from '../llm/client.mjs';

export const ENRICH_VERSION = 'ext-enrich-v1';
const DDG_TIMEOUT_MS = 8000;
const DDG_MAX_TEXT = 1500;

// Model identities live in the shared gateway (functions/api/llm/client.mjs).


export async function enrichEnabled(env) {
  if (!env.DB || typeof env.DB.prepare !== 'function') return false;
  try {
    const row = await env.DB
      .prepare("SELECT value FROM match_meta WHERE key = 'enrich_enabled'")
      .bind()
      .first();
    return !!row && row.value === '1';
  } catch {
    return false;
  }
}

export async function ensureEnrichTables(env) {
  if (!env.DB || typeof env.DB.prepare !== 'function') return;
  await ensureEtlTables(env);
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS product_fuzzy (' +
    'product_id TEXT NOT NULL,' +
    'phrase TEXT NOT NULL,' +
    'phrase_tokens TEXT NOT NULL,' +
    'PRIMARY KEY (product_id, phrase)' +
    ')'
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_fuzzy_tokens ON product_fuzzy(phrase_tokens)'
  ).run();
}

function ddgUrl(q) {
  const params = new URLSearchParams({
    q: String(q ?? '').slice(0, 128),
    format: 'json',
    no_html: '1',
    skip_disambig: '1',
  });
  return `https://api.duckduckgo.com/?${params.toString()}`;
}

export async function fetchDuckDuckGo(query, { timeoutMs = DDG_TIMEOUT_MS, fetchFn = fetch } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchFn(ddgUrl(query), { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res || !res.ok) return { ok: false, reason: 'DDG_HTTP' };
    const j = await res.json();
    return { ok: true, json: j };
  } catch (err) {
    return { ok: false, reason: err?.name === 'AbortError' ? 'DDG_TIMEOUT' : 'DDG_FAILED' };
  } finally {
    clearTimeout(t);
  }
}

export function extractExternalText(ddg) {
  if (!ddg || typeof ddg !== 'object') return '';
  const parts = [];
  if (ddg.Heading) parts.push(String(ddg.Heading));
  if (ddg.AbstractText) parts.push(String(ddg.AbstractText));
  if (Array.isArray(ddg.RelatedTopics)) {
    for (const r of ddg.RelatedTopics.slice(0, 3)) {
      if (r?.Text) parts.push(String(r.Text));
      else if (Array.isArray(r?.Topics)) {
        for (const s of r.Topics.slice(0, 2)) {
          if (s?.Text) parts.push(String(s.Text));
        }
      }
    }
  }
  if (Array.isArray(ddg.Results)) {
    for (const r of ddg.Results.slice(0, 2)) {
      if (r?.Text) parts.push(String(r.Text));
    }
  }
  return parts.join(' — ').slice(0, DDG_MAX_TEXT).trim();
}

function buildExternalPrompt(userSource, externalText) {
  return `You extract IT hardware facts. Use ONLY facts present in the texts. Prefer the USER text; use EXTERNAL only to expand abbreviations already present. Never invent a part number. If a spec is unstated, use null (or [] for lists).

Return ONLY a JSON object with exactly these keys:
{"category": string|null, "manufacturer": string|null, "model": string|null, "formFactor": string|null, "cpu": string[], "memoryGb": number|null, "storage": string[], "ports": number|null}

category must be one of: servers, storage, networking, laptops, components, peripherals, telecom, or null.

USER:
"""${String(userSource).slice(0, 500)}"""

EXTERNAL HINT (untrusted, may be empty or irrelevant):
"""${String(externalText).slice(0, 1000)}"""`;
}

async function callLlamaExternal(env, userSource, externalText) {
  // Delegates to the shared gateway (model escalation, timeout, telemetry).
  return runJson(env, {
    system: 'You are a precise hardware data extractor. You output only JSON.',
    user: buildExternalPrompt(userSource, externalText),
    maxTokens: 400,
    feature: 'enrich',
    promptVersion: ENRICH_VERSION
  });
}

function sharesTokenWithUser(value, userFold) {
  const v = normalizeFold(value);
  if (!v) return false;
  return v.split(' ').filter((x) => x.length > 1).some((x) => userFold.includes(x));
}

function slugId(model) {
  const slug = fold(model).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'ext';
  let hex = '';
  try {
    const b = new Uint8Array(3);
    crypto.getRandomValues(b);
    hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  } catch {
    hex = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  }
  return `ext-${slug}-${hex}`.slice(0, 60);
}

function buildSpecTemplate(d) {
  const bits = [];
  if (d.formFactor) bits.push(d.formFactor);
  if (d.cpu?.length) bits.push(d.cpu.slice(0, 2).join(', '));
  if (d.memoryGb !== null && d.memoryGb !== undefined) bits.push(`${d.memoryGb}GB`);
  if (d.storage?.length) bits.push(d.storage.slice(0, 2).join(', '));
  if (d.ports !== null && d.ports !== undefined) bits.push(`${d.ports}-port`);
  return bits.join(', ').slice(0, 400);
}

/**
 * Enrich ONE unmatched user line. Never throws.
 * @returns {{status:string, productId?:string, flags:string[]}}
 */
export async function enrichLine(env, { category, details, fetchFn = fetch }) {
  const flags = [];
  const userSource = [category, details].filter(Boolean).join(' — ').trim();
  if (!userSource || normalizeFold(userSource).length < 2) {
    return { status: 'SKIP_EMPTY', flags };
  }

  // Deterministic first: if the catalog now has it (race with another insert),
  // do nothing. This keeps enrichment strictly for true no-matches.
  try {
    await ensureCatalog(env);
    const hits = await searchCatalog(env, details || category || '', 3);
    if (hits?.length) return { status: 'ALREADY_IN_CATALOG', flags, productId: hits[0].id };
  } catch {}

  const userFold = normalizeFold(userSource);

  // External hint (timeout-bounded, never blocking the user).
  const ddg = await fetchDuckDuckGo(userSource, { fetchFn });
  if (!ddg.ok) return { status: ddg.reason, flags: [...flags, ddg.reason] };
  const externalText = extractExternalText(ddg.json);
  if (!externalText) return { status: 'NO_EXTERNAL_HINT', flags: [...flags, 'NO_EXTERNAL_HINT'] };

  const call = await callLlamaExternal(env, userSource, externalText);
  if (!call.ok) return { status: call.reason, flags: [...flags, call.reason] };

  // Validate against COMBINED text, then require user-token grounding so the
  // external hint cannot hijack the identity.
  const combined = `${userSource} — ${externalText}`;
  const { d, rejected } = validateDescriptor(call.payload, { source: combined });
  if (rejected) return { status: rejected, flags: [...flags, rejected], model: call.model };

  if (d.model && !sharesTokenWithUser(d.model, userFold)) {
    return { status: 'FABRICATED_IDENTITY', flags: [...flags, 'FABRICATED_IDENTITY'], model: call.model };
  }
  if (d.manufacturer && !sharesTokenWithUser(d.manufacturer, userFold)) {
    d.manufacturer = null;
  }
  if (!d.model || !d.category) {
    return { status: 'UNGROUNDED', flags: [...flags, 'UNGROUNDED'], model: call.model };
  }

  const row = {
    id: slugId(d.model),
    category: d.category,
    model: d.model.trim().slice(0, 160),
    spec_template: buildSpecTemplate(d),
    aliases: [normalizeFold(d.model)].filter(Boolean).slice(0, 3),
  };

  const { ok, errors, value } = validateRow({ ...row, aliases: JSON.stringify(row.aliases) });
  if (!ok) return { status: 'SCHEMA_REJECT', flags: [...flags, 'SCHEMA_REJECT'], model: call.model };

  try {
    await ensureEnrichTables(env);
    const { results: existing } = await env.DB
      .prepare('SELECT id, model FROM products')
      .bind().all();
    const seen = new Map();
    for (const r of existing || []) {
      const k = fold(r.model);
      if (k && !seen.has(k)) seen.set(k, r.id);
    }
    const dup = findDuplicate(value, seen);
    if (dup) return { status: 'DUPLICATE_MODEL', flags: [...flags, 'DUPLICATE_MODEL'], productId: dup.keptId };

    await env.DB.prepare(
      'INSERT INTO products (id, category, model, spec_template, aliases, verification_status) VALUES (?1,?2,?3,?4,?5,?6)'
    ).bind(value.id, value.category, value.model, value.spec_template, JSON.stringify(value.aliases), 'unverified').run();

    const phrase = userSource.slice(0, 200);
    try {
      await env.DB.prepare(
        'INSERT OR IGNORE INTO product_fuzzy (product_id, phrase, phrase_tokens) VALUES (?1,?2,?3)'
      ).bind(value.id, phrase, fold(phrase)).run();
    } catch {}

    try {
      await env.DB.prepare(
        'INSERT INTO catalog_staging (raw_json, source, parsed_id, parsed_category, parsed_model, errors, status) VALUES (?1,?2,?3,?4,?5,?6,?7)'
      ).bind(
        JSON.stringify({ userSource, externalText: externalText.slice(0, 500), payload: call.payload }),
        'duckduckgo-external',
        value.id, value.category, value.model,
        JSON.stringify([]),
        'ENRICHED_UNVERIFIED'
      ).run();
    } catch {}

    // Incremental FTS insert so the new row is reachable via fuzzy matching
    // without a full rebuild.
    try {
      await env.DB.prepare(
        'INSERT INTO products_fts (id, model_tok, cat_tok, spec_tok, alias_tok) VALUES (?1,?2,?3,?4,?5)'
      ).bind(
        value.id,
        tokenize(value.model).join(' '),
        tokenize(value.category).join(' '),
        tokenize(value.spec_template).join(' '),
        tokenize(value.aliases.join(' ')).join(' ')
      ).run();
    } catch (err) {
      console.error('[enrich] fts insert failed', err?.message);
    }

    return { status: 'ENRICHED_UNVERIFIED', flags: [...flags, 'EXTERNAL_CANDIDATE', 'CATALOG_UNVERIFIED'], productId: value.id, model: call.model };
  } catch (err) {
    console.error('[enrich] insert failed', err?.message);
    return { status: 'INSERT_FAILED', flags: [...flags, 'INSERT_FAILED'] };
  }
}

/**
 * Enrich every unmatched line of one order. Additive only. Never throws.
 * Reads product_line_norm to find lines with no catalogId.
 */
export async function enrichUnmatchedLines(env, { requestId, intent, fetchFn = fetch }) {
  const summary = { requestId, checked: 0, enriched: 0, skipped: 0, statuses: {} };
  if (!env.DB || typeof env.DB.prepare !== 'function') return summary;
  if (!requestId) return summary;
  try {
    const normRows = await env.DB.prepare(
      'SELECT lineIdx FROM product_line_norm WHERE requestId = ? AND catalogId IS NULL'
    ).bind(requestId).all();
    const idxs = (normRows?.results || []).map((r) => r.lineIdx);
    if (!idxs.length) return summary;

    const ret = await env.DB.prepare('SELECT products FROM returns WHERE id = ?').bind(requestId).first();
    let products = [];
    try {
      products = JSON.parse(ret?.products || '[]');
      if (!Array.isArray(products)) products = [];
    } catch { products = []; }

    for (const i of idxs) {
      const p = products[i];
      if (!p) continue;
      summary.checked++;
      const r = await enrichLine(env, { category: p.category, details: p.details, fetchFn });
      summary.statuses[r.status] = (summary.statuses[r.status] || 0) + 1;
      if (r.status === 'ENRICHED_UNVERIFIED') summary.enriched++;
      else summary.skipped++;
    }
  } catch (err) {
    console.error('[enrich] order failed', requestId, err?.message);
  }
  return summary;
}
