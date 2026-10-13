# LLM Product-Line Normalization — Design Spec (Tier 2)

**Status:** Design locked, awaiting review. **No code written.**
**Decisions supplied by stakeholder (2026-10-14):** async post-submit · fixed spec
schema · catalog-anchored · Llama · normalized lines replace raw text as match key.

---

## 1. Confirmed Decisions

| # | Decision | Choice |
|---|---|---|
| D1 | Enrichment timing | **Async post-submit** |
| D2 | Spec schema | **Fixed** (CPU / memory / storage / ports) |
| D3 | Normalization stance | **Catalog-anchored** |
| D4 | Model | **Llama** (Cloudflare Workers AI) |
| D5 | Match key | **Normalized replaces raw text** |

---

## 2. What This Solves

Today the match key is free text:

```js
// functions/api/match.js:40-46
const norm = (v) => String(v ?? '').trim().toUpperCase();
const lineKeyOf = (p) => {
  const name = norm(p && p.category);
  const model = norm(p && p.details);
  if (!name || !model) return null;
  return `${name}\x00${model}`;
};
```

A BUY line reading `Dell PowerEdge R750` and a SELL line reading
`25x PowerEdge R750, working` produce different keys and never join, despite
being the same product. D5 fixes this at the root.

---

## 3. Architecture (D1 — Async)

Submit stays instant. Enrichment runs after the response is sent.

Reuses the **existing async precedent** in this codebase — `intake/sessions.js`
already does queue-first-with-inline-fallback:

```js
// functions/api/intake/sessions.js:146 (existing pattern to mirror)
if (env.INTAKE_QUEUE && typeof env.INTAKE_QUEUE.send === 'function') {
  await env.INTAKE_QUEUE.send({ ... });
}
```

Proposed flow:

```
returns POST
  ├─ D1 INSERT order                 (unchanged, synchronous)
  ├─ indexLinesFor → match_lines     (raw keys, immediate matchability)
  ├─ respond 200 to visitor          (no LLM in the path)
  └─ ctx.waitUntil( normalize(requestId) )
         ├─ queue-first: env.NORMALIZE_QUEUE.send({ requestId })
         └─ fallback:    inline, one pass, bounded
```

**Guarantees**
- Visitor never waits on the model.
- Raw text is immutable — enrichment writes a new table, never overwrites
  `returns.products`.
- Failure is non-fatal: a line that never normalizes keeps its raw key and
  stays matchable. Normalization can only *add* a better key, never remove one.

---

## 4. Fixed Spec Schema (D2)

Per line, a closed schema — no open "other" bucket:

```jsonc
{
  "category":      "servers",            // catalog category
  "manufacturer":  "Dell",               // or null
  "model":         "PowerEdge R750",     // or null
  "formFactor":    "2U Rack",            // or null
  "cpu":           ["2x Intel Xeon Gold 6130"],   // [] = not stated
  "memoryGb":      128,                  // integer or null
  "storage":       ["2x 480GB SATA SSD"],        // [] = not stated
  "ports":         null,                 // integer or null (network gear)
  "catalogId":     "srv-002",            // or null
  "confidence":    0.92,                 // 0..1
  "grounded":      true                  // validator verdict
}
```

Contract: **unstated means null / empty array, never a guess.** A missing CPU
is `[]`, not `"unknown CPU"`.

`formFactor`, `manufacturer` and `model` are normalized *case and spacing only*
against the catalog when `catalogId` is set; the model never re-authors them.

---

## 5. Catalog-Anchored Normalization (D3)

Order of resolution per line — **deterministic first, model last**:

1. **Tier-1 deterministic match** (existing `products/suggest` — prefix + alias
   + Jaro-Winkler ≥ 0.85). If it resolves, that catalog row **is** the
   normalization. **No LLM call at all.**
2. **LLM extraction** only for lines Tier-1 cannot resolve. Llama extracts the
   fixed schema and may propose a `category` from the controlled vocabulary,
   but may **not** invent a manufacturer/model that is absent from the input.
3. **Catalog re-check**: a proposed descriptor that matches an existing catalog
   row is snapped to that row's canonical `category`/`model`.

> ### ⚠ Caveat you should weigh before approving D3 as-is
> The catalog holds **29 seeded rows**; the agreed MVP target is **500**.
> Until the catalog grows, Tier-1 resolves a small minority of real
> submissions, so most lines will take the LLM path — meaning the "anchored"
> guarantee is currently carried mostly by the *validator*, not by catalog
> coverage. Two ways to close this, your call:
> **(a)** fund the 500-entry seed first (deterministic wins, model rarely fires), or
> **(b)** ship now and grow the catalog as the normalizer's misses are reviewed.
> (b) gets the match-key win — the main prize — sooner.

---

## 6. Model Choice (D4) — Llama on Workers AI

```toml
# wrangler.toml — new binding
[ai]
binding = "AI"
```

Model: **`@cf/meta/llama-3.1-8b-instruct`** (`env.AI.run(...)`).

Why this one:
- Native Cloudflare binding — same account as D1/R2, **no new vendor, no API
  key to store or leak**, no cross-region hop.
- Extraction/classification is the target task; a small model is the right size.
- Already have the `ai` scope on the wrangler token.

**Honest limitation, and the mitigation:** an 8B model is not reliably
JSON-schema-perfect. Therefore:

- Request `response_format: { type: "json_object" }`.
- **One** retry on parse failure.
- Escalate to `@cf/meta/llama-3.3-70b-instruct` if the 8B output still fails
  validation (cheap: rare path only).
- Any line that survives escalation as unparseable is written with
  `grounded: false` and flagged `NEEDS_REVIEW`, and **keeps its raw match key**
  (never promoted on a bad parse).

---

## 7. No-Fabrication Guardrail

The validator is the contract. After the model returns:

1. **Schema check** — fixed keys, correct types, no extras.
2. **Grounding check** — each populated value must appear in the source text, or
   be a safe transform of it (case/space fold, `"128GB"` → `128`).
   Ungrounded fields are **nulled**, not trusted.
3. **No-invention check** — `manufacturer`/`model` must be substrings of the
   source text. A model that invents a part number is rejected wholesale.
4. **Promotion gate** — a line is promoted to the normalized match key only if
   `grounded === true` **and** `confidence >= 0.80`. Below that it stays
   raw-keyed, so a bad extraction can never merge two unrelated products.

---

## 8. Match-Key Replacement (D5) — the consequential one

`match_lines` today:

| column | meaning |
|---|---|
| `norm_name`, `norm_model` | the key (folded category, folded details) |
| `raw_cat`, `raw_det` | display text |

### The migration problem

Three concrete hazards, all of which the codebase already cares about — the
`match.js` header documents *"mixed states never silently miss"*:

1. **Async race.** Normalization finishes seconds to minutes after submit. A BUY
   at T0 and a SELL at T0+5s must still match, even though only one has been
   normalized.
2. **Historical rows.** Every existing `match_lines` row is raw-keyed. New rows
   keyed on normalized text would never join with them.
3. **Bad extractions.** Promoting a low-confidence key splits or merges the wrong
   products.

### Solution — dual-key during transition

Each line is indexed under **both** keys: the normalized key (primary) and the
raw key (secondary, permanent for the transition period).

- **At submit**: index raw-keyed (unchanged code path, immediate matchability).
- **After normalization**: `UPDATE match_lines` for that one order's lines to
  the normalized key, **keeping the raw key as the secondary**. One write, one
  order, no table rewrite.
- **At match time**: a BUY competes under its primary key, then its secondary.
  A SELL is found by either key. Union of both key spaces.
- **Retirement**: only after `normalized` covers 100% of live lines *and* a soak
  period, drop the secondary key. Not in this phase.

New columns (additive, nullable):

```sql
ALTER TABLE match_lines ADD COLUMN alt_name TEXT;    -- secondary key, raw
ALTER TABLE match_lines ADD COLUMN alt_model TEXT;
ALTER TABLE match_lines ADD COLUMN normalized INTEGER DEFAULT 0;  -- 1 = promoted
```

`buildIndexedInputs` then pushes each sell line into `sellQueues` under **both**
keys, and a BUY looks up both. `indexLinesFor` stays the single definition of
"what a line is" — no drift.

### Invariants preserved
- `match_meta.ready` gate untouched.
- A line that never normalizes is fully matchable on its raw key.
- Truncation flagging (`truncated: true`) unchanged.

---

## 9. Data Model (additive — nothing existing is altered)

```sql
CREATE TABLE IF NOT EXISTS product_line_norm (
  productId          TEXT NOT NULL,
  requestId          TEXT NOT NULL,
  intent             TEXT NOT NULL,
  lineIdx            INTEGER NOT NULL,
  payload            TEXT,          -- fixed-schema JSON (§4)
  catalogId          TEXT,          -- products.id or NULL
  confidence         REAL,
  grounded           INTEGER DEFAULT 0,
  flags              TEXT,          -- NEEDS_REVIEW etc.
  normalizerVersion  TEXT,
  createdAt          DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (requestId, lineIdx)
);
CREATE INDEX IF NOT EXISTS idx_pln_request ON product_line_norm(requestId);
CREATE INDEX IF NOT EXISTS idx_pln_catalog ON product_line_norm(catalogId);
```

Original text stays in `returns.products` — untouched, auditable.

---

## 10. Failure & Cost Posture

| Path | Behaviour |
|---|---|
| Model timeout / 5xx | Line keeps raw key. Retry once via queue. Never blocks a match. |
| Bad JSON | 1 retry on 8B → 70B → else `NEEDS_REVIEW`, raw key retained. |
| Ungrounded field | Nulled by validator; line still promotable on remaining fields. |
| Queue unavailable | Inline `waitUntil` pass (same as intake's fallback). |

Cost is bounded to one short call per unmatched line, with the 70B escalation
on a rare path. Catalog-anchoring (D3) is the cost ceiling — as the catalog
fills in, LLM calls drop toward zero.

---

## 11. Rollout

1. **Schema + normalizer**, `product_line_norm` live, `match_lines` untouched.
   Normalization runs, output stored, **no behavioural change**. Inspect
   confidence distribution + validator rejection rate.
2. **Dual-key indexing** behind a flag, raw remains primary. Measure whether
   normalized keys actually increase match recall before going further.
3. **Promote normalized to primary** once step 2 shows a real recall lift and
   rejection rate is low.
4. **Retire secondary keys** — out of scope for this phase.

---

## 12. What I Need From You

1. **The catalog-size call in §5** — fund the 500-entry seed first, or ship with
   the current 29 and grow from review misses? This is the one place where your
   D3 decision has a weaker foundation than it appears.
2. **Promotion threshold** — I propose `confidence ≥ 0.80` + grounded. Confirm
   or adjust.
3. **70B escalation** — keep it as a rare fallback, or drop to 8B-only for cost?

Once these three are settled I'll implement steps 1–2 behind flags, so the match
engine's current behaviour stays intact until you call the switch.
