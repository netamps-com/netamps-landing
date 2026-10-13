# LLM Product-Line Normalization — Design Spec (Tier 2)

**Status:** PROPOSED — awaiting review. No code written.
**Author:** prepared after the Tier-1 typeahead + BUY precision shell shipped.
**Scope:** normalize SELL and BUY product lines to industry-standard catalog descriptors.

---

## 1. Problem

A visitor types free text into **Equipment Category** and **Details & Specs**
(e.g. `25x Dell PowerEdge R740, 2x Xeon Gold, 128GB RAM, working condition`).
This text is the key the match engine uses (`match.js` folds
`category` + `details` into its line key). Free text means:

- **Variant sprawl** — `R740`, `r740`, `PowerEdge R740`, `Dell R740xd` become
  distinct match keys, fragmenting BUY demand and hiding SELL supply.
- **No spec capture** — CPU model, RAM, drive config, form factor are buried in
  prose and can't be filtered, matched, or compared.
- **Poor matching recall** — a BUY line that says "2u server" and a SELL line
  that says "2U rack server" never join, despite being the same product class.

The LLM's job is to turn each submitted line into a **structured, industry-standard
descriptor** that (a) normalizes the wording and (b) extracts the specs, *without
inventing facts*.

---

## 2. Goals / Non-Goals

### Goals
1. **Normalize** the free text to a canonical product descriptor
   (manufacturer, model, form factor, category, key specs).
2. **Extract** structured specs (CPU, memory, storage, ports, etc.) into fields.
3. **Never fabricate** — if a spec isn't stated, leave it null. The LLM may
   *reformat* stated facts, never add unstated ones.
4. **Map to the existing catalog** where a product is already known, so match
   keys align with the seeded `products` table.

### Non-Goals (explicitly deferred)
- Price suggestion or valuation (BUY shows no price; SELL base price stays human).
- Auto-matching BUY→SELL (that's the match engine's job, downstream).
- Multilingual / transliteration (v2, deferred per prior decision).

---

## 3. Where It Runs (architecture decision — important)

The LLM call must **not** be in the browser or in the request path of the
submit. Proposal:

- **Runs server-side, post-submit, async**, on the stored request.
- Trigger: after a request is persisted, enqueue a **normalization job** per
  product line.
- The **original** submitted text is always retained; the LLM produces an
  **enriched/normalised variant** stored alongside.
- The visitor's own words are **never overwritten** — they're the record of what
  was asked/offered.

Rationale: keeps submit fast (no LLM latency in the funnel), keeps the form
offline-capable, avoids leaking API keys to the client, and makes the raw input
immutable evidence. Cost is bounded because it runs once per line.

> Open question for review: synchronous (visitor waits ~1-2s, sees the cleaned
> line before submit) vs async (submit is instant, normalization lands for the
> operator). **Recommend async.**

---

## 4. What the LLM Outputs (the normalized line)

For each product line, the LLM emits a structured descriptor:

```
{
  "normalizedCategory": "Servers > Rack Servers",     // canonical taxonomy
  "manufacturer": "Dell",
  "model": "PowerEdge R740",
  "formFactor": "2U Rack",
  "specs": {
    "cpu": ["2x Intel Xeon Gold 6130"],
    "memoryGb": 128,
    "storage": ["...as stated..."],
    "other": ["...key specs extracted from text..."]
  },
  "catalogMatchId": "srv-001" | null,                  // link to products table if known
  "confidence": 0.0 - 1.0,
  "specsStated": true | false,                        // did the visitor state specs at all?
  "flags": ["NEEDS_REVIEW"]                           // low confidence / ambiguous
}
```

**Hard rule:** every populated spec must be traceable to the visitor's text.
Post-processing **strips** any field the model returns that isn't grounded in
the input (a validation step re-checks; see §6).

---

## 5. Model Choice & Cost

- Model: a fast, cheap instruct model (e.g. Gemini Flash class or an equivalent
  low-cost hosted model). This is a **classification/extraction** task, not
  creative generation — a small model is the right fit.
- Structured output (JSON schema-constrained) to avoid parsing failures.
- Cost: bounded to one short call per line; volume tied to submissions.
  Batch-friendly (multiple lines per call where qty>1 shares a model).

---

## 6. Guardrails (the "no hallucination" contract)

1. **Schema-constrained decoding** — the model must return valid JSON matching
   the descriptor shape; malformed output is rejected, not guessed.
2. **Grounding check** — a post-validator confirms each extracted spec value
   appears in (or is a safe transform of) the source text. Ungrounded fields are
   nulled.
3. **Catalog anchoring** — if the text matches a known `products` row (via the
   existing Tier-1 deterministic matcher), prefer that canonical
   `category`/`model` over the LLM's free-text interpretation.
4. **Deterministic first** — Tier-1 (prefix/fuzzy) runs first; the LLM only
   handles what deterministic matching can't confidently resolve (this honors
   the "deterministic-first, no-LLM-for-known-products" principle from Tier 1).
5. **Operator visibility** — normalized output is stored with
   `specsStated`/`confidence`/`flags`; low-confidence lines are flagged
   `NEEDS_REVIEW` for a human, never silently trusted.
6. **Idempotent + versioned** — store `normalizerVersion` so a re-run after a
   model/prompt change is distinguishable.

---

## 7. Data Model (additive)

New table (does not alter existing `products` or `match_lines`):

```
product_line_norm (
  productId TEXT,        -- FK to the request's product line
  requestId TEXT,
  intent TEXT,           -- sell | buy
  payload TEXT,          -- JSON descriptor from §4
  catalogMatchId TEXT,   -- FK to products.id or NULL
  confidence REAL,
  specsStated INTEGER,
  flags TEXT,
  normalizerVersion TEXT,
  createdAt DATETIME
)
```

Original text stays in the existing `returns.products` JSON — untouched.

---

## 8. Interaction with Match

- `match.js` currently keys on folded `category` + `details`. With normalization,
  the **match key can optionally** prefer `normalizedCategory` + normalized model
  when present, improving recall without changing the deterministic engine's
  logic. (This is a follow-up decision, not in this spec's first cut.)

---

## 9. Rollout Plan

1. **Shadow mode** — run normalization on submissions, store it, but don't use
   it. Inspect quality/confidence distribution. No user-visible change.
2. **Operator view** — surface normalized line + confidence/flags in the
   dashboard for review. Flag disagreement with catalog.
3. **Match key experiment** — optionally use normalized keys; measure recall lift.
4. **Full adoption** — once quality is validated, normalized lines become the
   canonical descriptors.

---

## 10. Open Questions for Review

1. **Async (recommended) vs synchronous** enrichment at submit time?
2. **Spec granularity** — fixed schema (CPU/mem/storage/ports) or open "other"?
3. **Catalog-anchored vs free** normalization when Tier-1 already matched?
4. **Which provider/model** — in-house budget constraints?
5. **Match key adoption** — should normalized keys replace raw-text keys?

---

## Next Step

On approval, implement in shadow mode: the normalizer function, the
`product_line_norm` table, the async job hook, and the grounding validator.
