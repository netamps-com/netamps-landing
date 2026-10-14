/**
 * Tier-2 product-line normalization.
 *
 * Design: docs/llm-product-line-normalization.md (decisions D1-D5).
 *  D1 async post-submit  D2 fixed spec schema  D3 catalog-anchored
 *  D4 Llama on Workers AI  D5 normalized lines become the match key
 *
 * Resolution order per line — DETERMINISTIC FIRST, MODEL LAST:
 *  1. Tier-1 catalog match (products/catalog.js). If it resolves, that catalog
 *     row IS the normalization and the model is never called. D3.
 *  2. Llama extraction (Workers AI) for lines Tier-1 cannot resolve.
 *  3. Catalog re-check: a descriptor that lands on an existing row snaps to
 *     that row's canonical category/model.
 *
 * NO-FABRICATION CONTRACT (the part that matters):
 *   The model's output is untrusted input until the validator clears it.
 *   Every populated value must be traceable to the visitor's own words.
 *   manufacturer/model must be substrings of the source text — a model that
 *   invents a part number is rejected wholesale, not partially trusted.
 *   Unstated spec => null / [] . Never "unknown", never a guess.
 *
 * Failure is non-fatal by construction: a line that fails to normalize keeps
 * its raw match key and stays fully matchable. Normalization can only ADD a
 * better key, never remove one.
 */

import { searchCatalog, normalizeFold, ensureCatalog } from '../products/catalog.js';
import { runJson } from '../llm/client.mjs';

export const NORMALIZER_VERSION = 'llm-norm-v1';

// Promotion gate (§7). Below this, the line keeps its raw key — a bad
// extraction must never merge two unrelated products or split a good pair.
export const PROMOTE_MIN_CONFIDENCE = 0.80;

// Hard ceiling for catalog rows that are not staff-verified. Deliberately set
// BELOW PROMOTE_MIN_CONFIDENCE so an unverified row can never be promoted to a
// normalized match key, while still being displayed and matched via its raw
// text. Raise to 1 (or flip rows to 'verified') only after human review.
export const UNVERIFIED_CATALOG_MAX_CONFIDENCE = 0.75;

// Model identities live in the shared gateway (functions/api/llm/client.mjs) —
// one definition for every model-backed feature, no drift.

const CATEGORIES = [
  'servers', 'storage', 'networking', 'laptops',
  'components', 'peripherals', 'telecom'
];

export async function ensureNormTables(env) {
  if (!env.DB || typeof env.DB.prepare !== 'function') return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS product_line_norm (
      requestId         TEXT NOT NULL,
      lineIdx           INTEGER NOT NULL,
      intent            TEXT NOT NULL,
      productId         TEXT,
      payload           TEXT,
      catalogId         TEXT,
      confidence        REAL,
      grounded          INTEGER DEFAULT 0,
      flags             TEXT,
      normalizerVersion TEXT,
      createdAt         DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (requestId, lineIdx)
    )`
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_pln_catalog ON product_line_norm(catalogId)'
  ).run();
}

function emptyDescriptor() {
  return {
    category: null,
    manufacturer: null,
    model: null,
    formFactor: null,
    cpu: [],
    memoryGb: null,
    storage: [],
    ports: null,
    catalogId: null,
    confidence: 0,
    grounded: false
  };
}

// ── Validator ────────────────────────────────────────────────────────────────
// Everything here is deliberately conservative: it may REMOVE a field the model
// produced, never add one. Emptying is always safe; inventing is not.

/** Is `value` recoverable from the source text? Allows case/space/unit folding. */
function isGrounded(value, sourceFold) {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.every((v) => isGrounded(v, sourceFold));
  const v = normalizeFold(String(value));
  if (!v) return true;
  if (sourceFold.includes(v)) return true;
  // Token-wise fallback: "Intel Xeon Gold 6130" grounded by "Xeon Gold 6130".
  return v.split(' ').filter((t) => t.length > 2).every((t) => sourceFold.includes(t));
}

function clampInt(n) {
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function asStringArray(v) {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter(Boolean)
    .slice(0, 8);
}

/**
 * Verified-evidence confidence, in [0, 1].
 *
 * Starts from what the validator actually confirmed, not what the model
 * claimed. Catalog anchoring is the strongest signal (our own row), a full
 * grounded identity triple is next, and each grounded spec is a small bonus.
 * A line that is only a category guess lands below the promotion gate.
 */
function computeConfidence(d, src) {
  let c = 0;
  if (d.catalogId) return 0.97;           // our catalog row — strongest
  if (d.model && d.manufacturer) c += 0.60;
  else if (d.model) c += 0.45;
  else if (d.category) c += 0.25;          // category only: never promotable alone
  if (d.category && d.model) c += 0.15;    // coherent pair
  if (d.formFactor) c += 0.05;
  if (d.cpu.length) c += 0.10;
  if (d.memoryGb !== null) c += 0.08;
  if (d.storage.length) c += 0.05;
  if (d.ports !== null) c += 0.03;
  return Math.max(0, Math.min(c, 0.96));
}

/**
 * Validate + ground a raw model payload against the visitor's own text.
 * @returns {{d: object, rejected: string|null}}
 */
export function validateDescriptor(raw, { source }) {
  const d = emptyDescriptor();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { d, rejected: 'NOT_AN_OBJECT' };
  }
  const src = normalizeFold(source);

  // ── Category: must come from the controlled vocabulary ──
  const cat = normalizeFold(raw.category);
  if (cat && CATEGORIES.includes(cat)) d.category = cat;

  // ── Identity fields: SUBSTRING of source or they are invention ──
  // `fabricated` records that the model DID assert an identity sharing no token
  // with the visitor's words. The field is dropped either way; this flag also
  // marks the line ungrounded, so the audit trail shows the model tried to
  // invent a part number instead of silently reporting success.
  let fabricated = false;
  for (const field of ['manufacturer', 'model']) {
    const v = typeof raw[field] === 'string' ? raw[field].trim() : '';
    if (!v) continue;
    const folded = normalizeFold(v);
    // Catalog names legitimately differ from visitor prose; only treat as
    // fabrication when the value shares NO token with the source.
    const sharesToken = folded.split(' ').filter((t) => t.length > 1).some((t) => src.includes(t));
    if (sharesToken || src.includes(folded)) d[field] = v;
    else fabricated = true;
  }

  // ── Form factor: controlled tokens only ──
  const ff = normalizeFold(raw.formFactor);
  if (/^(1u|2u|4u|tower|rack|blade|rackmount|desktop|laptop|small form factor|sff)$/.test(ff)) {
    d.formFactor = raw.formFactor;
  }

  // ── Specs: grounded or dropped ──
  const cpu = asStringArray(raw.cpu).filter((c) => isGrounded(c, src));
  if (cpu.length) d.cpu = cpu;

  const mem = clampInt(raw.memoryGb);
  if (mem !== null && (src.includes(String(mem)) || src.includes(`${mem}gb`))) d.memoryGb = mem;

  const storage = asStringArray(raw.storage).filter((s) => isGrounded(s, src));
  if (storage.length) d.storage = storage;

  const ports = clampInt(raw.ports);
  if (ports !== null && src.includes(String(ports))) d.ports = ports;

  // Confidence is COMPUTED, never taken from the model. Live testing showed
  // llama-3.1-8b self-reports 0.99 on essentially every line including vague
  // ones, so a model-reported score made the 0.80 promotion gate
  // non-discriminating. Our score reflects only what the validator verified.
  d.confidence = computeConfidence(d, src);

  // A line with no grounded identity — or one where the model invented an
  // identity — is not promotable.
  d.grounded = !fabricated && Boolean(d.model || d.category) &&
    (!d.model || isGrounded(d.model, src));

  if (!d.grounded) return { d, rejected: fabricated ? 'FABRICATED_IDENTITY' : 'UNGROUNDED' };
  return { d, rejected: null };
}

// ── Model call ───────────────────────────────────────────────────────────────

function buildPrompt(source) {
  return `Extract IT hardware specs from the text below. Use ONLY facts stated in the text. If a spec is not stated, use null (or [] for lists). Never guess, never infer, never add a part number that is not present.

Return ONLY a JSON object with exactly these keys:
{"category": string|null, "manufacturer": string|null, "model": string|null, "formFactor": string|null, "cpu": string[], "memoryGb": number|null, "storage": string[], "ports": number|null, "confidence": number}

category must be one of: ${CATEGORIES.join(', ')} or null.
confidence: 1.0 only if every field is directly stated in the text.

TEXT:
"""${source}"""`;
}

async function callModel(env, source) {
  // Delegates to the shared gateway: model escalation, timeout, JSON parse and
  // telemetry all live there. Same {ok, payload, model, reason} contract.
  return runJson(env, {
    system: 'You are a precise hardware data extractor. You output only JSON.',
    user: buildPrompt(source),
    maxTokens: 400,
    feature: 'normalize',
    promptVersion: NORMALIZER_VERSION
  });
}

// ── Per-line normalization ───────────────────────────────────────────────────

/**
 * Normalize ONE product line. Never throws — a failure returns a flag-only
 * result and the caller leaves the line on its raw key.
 */
export async function normalizeLine(env, { category, details, model: modelHint }) {
  const source = [category, details].filter(Boolean).join(' — ').trim();
  const flags = [];

  // 1. Deterministic first (D3): catalog hit means NO model call.
  let hits = [];
  try {
    await ensureCatalog(env);
    hits = await searchCatalog(env, details || category || '', 5);
  } catch (err) {
    console.error('[normalize] catalog lookup failed', err?.message);
  }

  const strong = hits.find((h) => h.matchType === 'prefix') || hits[0];
  if (strong && strong.id) {
    const d = emptyDescriptor();
    d.category = strong.category;
    d.model = strong.model;
    d.formFactor = /^[124]U\b/i.test(strong.specTemplate || '') ? `${strong.specTemplate[0]}U Rack` : null;
    d.catalogId = strong.id;
    d.confidence = strong.matchType === 'prefix' ? 0.99 : 0.9;
    // Catalog-anchored: identity comes from OUR catalog, so it is trusted by
    // construction. Specs are NOT claimed — the catalog row carries no parsed
    // spec columns yet, and inferring them here would be fabrication.
    d.grounded = true;
    flags.push('CATALOG_ANCHORED');
    if (strong.source === 'fts') flags.push('CATALOG_FTS');

    // ── Unverified catalog rows are NOT trusted ground truth ──
    // Bulk-generated rows carry verification_status='unverified': the part
    // numbers are plausible but not vendor-confirmed. An anchored line is
    // trusted BY CONSTRUCTION, so an unverified SKU would otherwise be able to
    // anchor a line to the wrong product with near-certainty — the exact
    // failure mode the catalog spec warns about ("a wrong seed is worse than an
    // empty one"). Capping confidence below PROMOTE_MIN_CONFIDENCE keeps these
    // rows usable for DISPLAY while making them ineligible to become a match
    // key until staff confirm them.
    if (strong.verificationStatus !== 'verified') {
      d.confidence = Math.min(d.confidence, UNVERIFIED_CATALOG_MAX_CONFIDENCE);
      flags.push('CATALOG_UNVERIFIED');
    }
    return { descriptor: d, flags, model: null };
  }

  // 2. Model path.
  const call = await callModel(env, source);
  if (!call.ok) {
    flags.push(call.reason === 'NO_AI_BINDING' ? 'NO_AI_BINDING' : call.reason === 'LLM_DISABLED' ? 'LLM_DISABLED' : 'MODEL_FAILED');
    return { descriptor: emptyDescriptor(), flags, model: null };
  }

  const { d, rejected } = validateDescriptor(call.payload, { source });
  if (rejected) {
    flags.push(rejected);
    return { descriptor: emptyDescriptor(), flags, model: call.model };
  }

  // 3. Catalog re-check: snap a proposed descriptor onto a real catalog row.
  if (!d.catalogId && d.model) {
    try {
      const re = await searchCatalog(env, d.model, 3);
      const snap = re.find((h) => h.matchType === 'prefix') || re[0];
      if (snap && snap.id) {
        d.catalogId = snap.id;
        d.category = snap.category;
        d.model = snap.model;
        flags.push('SNAPPED_TO_CATALOG');
      }
    } catch {}
  }

  // No floor is applied to the computed confidence: the validator's score is
  // the promotion signal, and inflating it here would defeat the gate.
  return { descriptor: d, flags, model: call.model };
}

/** Is this line safe to promote from raw key to normalized key? (§7) */
export function isPromotable(descriptor) {
  return Boolean(
    descriptor &&
    descriptor.grounded &&
    descriptor.confidence >= PROMOTE_MIN_CONFIDENCE &&
    descriptor.category &&
    descriptor.model
  );
}

// ── Order-level driver ───────────────────────────────────────────────────────

/**
 * Normalize every line of one submitted order and persist to product_line_norm.
 * Additive only: never mutates `returns.products`. Never throws.
 *
 * @param {{requestId: string, intent: string, products: Array}} order
 *   NOTE: the key is `requestId`, NOT `id`. The returns POST originally passed
 *   `id`, which bound requestId to undefined and made every INSERT fail with
 *   D1_TYPE_ERROR. The contract is explicit and guarded below.
 */
export async function normalizeOrder(env, { requestId, intent, products }) {
  const summary = { requestId, lines: 0, catalog: 0, promoted: 0, review: 0 };
  if (!env.DB || typeof env.DB.prepare !== 'function') return summary;
  if (!requestId) {
    console.error('[normalize] normalizeOrder called without requestId; skipping');
    return summary;
  }
  try {
    await ensureNormTables(env);
  } catch (err) {
    console.error('[normalize] table init failed', err?.message);
    return summary;
  }

  for (let i = 0; i < (products || []).length; i++) {
    const p = products[i] || {};
    try {
      const { descriptor, flags } = await normalizeLine(env, {
        category: p.category,
        details: p.details
      });
      const promotable = isPromotable(descriptor);
      if (descriptor.catalogId) summary.catalog++;
      if (promotable) summary.promoted++;
      if (!descriptor.grounded) summary.review++;

      await env.DB.prepare(
        `INSERT INTO product_line_norm
           (requestId, lineIdx, intent, productId, payload, catalogId, confidence, grounded, flags, normalizerVersion)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
         ON CONFLICT(requestId, lineIdx) DO UPDATE SET
           payload=excluded.payload, catalogId=excluded.catalogId,
           confidence=excluded.confidence, grounded=excluded.grounded,
           flags=excluded.flags, normalizerVersion=excluded.normalizerVersion`
      ).bind(
        requestId,
        i,
        intent,
        p.id ?? null,
        JSON.stringify(descriptor),
        descriptor.catalogId,
        descriptor.confidence,
        descriptor.grounded ? 1 : 0,
        JSON.stringify(flags),
        NORMALIZER_VERSION
      ).run();
      summary.lines++;
    } catch (err) {
      console.error('[normalize] line failed', requestId, i, err?.message);
    }
  }
  return summary;
}
