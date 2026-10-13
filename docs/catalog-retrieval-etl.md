# Catalog Retrieval Rebuild — ETL Pipeline, Intent Processing, Schema Validation

**Status:** PROPOSED — awaiting review. No code written.
**Problem:** the typeahead misses most of the catalog. Measured, not assumed.
**Evidence:** live queries against `netamps-db` (247 products), 2026-10-14.

---

## 1. Measured Defect: What Actually Breaks

Current live results, `GET /api/products/suggest?q=&limit=20`:

| Query | API returns | Products that *should* match |
|---|---|---|
| `ssd` | **0** | **22** |
| `nvme` | **0** | **19** |
| `2u` | **0** | **31** |
| `proliant` | **1** | **14** |
| `poweredge` | 3 | 14 |
| `thinkpad` | 5 | ~20 |
| `dell` / `cisco` / `lenovo` | 20 (capped) | 48+ / 38+ / 46+ |

> **Correction (2026-10-14).** An earlier draft of this table said `2u` should return
> **33**, derived from a `LIKE '%2u%'` SQL count. That baseline was wrong: substring
> matching also hits `LG UltraFine 32UN880` ("32**UN**880" contains "2u") and
> `APC NetShelter SX 42U Rack` ("42**u**"), neither of which is a 2U product. A
> token-accurate count gives **31**, which is what the FTS5 index reproduces exactly.
> The `LIKE`-derived figures for the other three terms were checked and are correct.

**Root cause — two hard structural limits in `products/catalog.js`:**

1. **`LIMIT 200` on the fuzzy scan.** The fallback does `SELECT ... FROM products LIMIT 200`
   with no ordering and no filter, then scores in JS. With **247** rows, ~47 products
   are *never scanned*. The cap silently shrank when the catalog grew past it.
2. **Prefix-only SQL.** `WHERE lower(model) LIKE ? || '%' OR lower(category) LIKE ? || '%'`
   matches only the *start* of a column. A visitor typing `ssd` or `nvme` — words that
   appear mid-string in `spec_template` — can never match. And `spec_template` is not
   searched at all, though it is where form factor, NVMe/SSD and port counts live.

Jaro-Winkler ≥0.85 is a *whole-string* similarity and cannot rescue this: `proliant`
vs `HPE ProLiant DL380 Gen10` scores far below 0.85. Substring/token recall is
structurally impossible in the current design, no matter how the threshold is tuned.

---

## 2. Verified Technology Choice

I probed the live D1 database rather than assuming:

```
CREATE VIRTUAL TABLE _fts_probe USING fts5(id UNINDEXED, body)   → success
```

**SQLite FTS5 is available on Cloudflare D1**, with BM25 ranking and prefix queries:

| Probe | Result |
|---|---|
| `MATCH 'ssd'` | **22 hits** (current engine: 0) |
| `MATCH 'proliant'` | 14 hits, BM25-ranked |
| `MATCH 'proliant*'` | 5 hits, prefix works |
| `bm25()` ranking | returns negative relevance scores, correctly ordered |

Probe table dropped; production is unchanged. **This is the technology for production** —
no external search service, no new vendor, no cost per query, and it runs inside the
existing D1 binding.

---

## 3. ETL Pipeline

### Extract
| Source | Content | Update cadence |
|---|---|---|
| `products` (D1) | canonical catalog rows | admin CRUD |
| `seed-products*.sql` | bulk seed provenance | on change |
| Real SELL history | parts actually seen in stock | on approval |

### Transform
1. **Fold** — lowercase, strip punctuation, collapse whitespace (existing `normalizeFold`).
2. **Tokenize** — split folded text into terms.
3. **Expand synonyms** — a `product_synonyms` table maps domain vocabulary to canonical
   terms, e.g. `hdd→hard drive`, `ssd→solid state`, `nvme→ssd`, `xeon→intel`,
   `r750→poweredge r750`, `proliant→hpe`, `thinkpad→lenovo`.
4. **Strip stopwords** — `for`, `we`, `have`, `x` (outside model numbers).
5. **Protect model numbers** — tokens containing a digit survive untouched, so `r750`,
   `dl380`, `9300-48p` are never stemmed or split on the hyphen.
6. **Validate schema** — every row must satisfy the catalog schema (§4) or be quarantined,
   not silently indexed.

### Load
Two indexes, both additive:

```sql
-- 1. Full-text index over the transformed document
CREATE VIRTUAL TABLE products_fts USING fts5(
  id UNINDEXED,
  model_tok, category_tok, spec_tok, alias_tok,
  tokenize = 'unicode61'
);

-- 2. Synonym expansion table
CREATE TABLE product_synonyms (
  term TEXT PRIMARY KEY,
  canonical TEXT NOT NULL,
  category_hint TEXT
);
```

The `products` table stays the system of record. Indexes are rebuildable artifacts —
drop and regenerate from source, never hand-edited.

---

## 4. Schema Validation

A staging table so bad data is quarantined rather than indexed:

```sql
CREATE TABLE catalog_staging (
  raw_json TEXT NOT NULL,
  source TEXT NOT NULL,
  parsed_id TEXT,
  parsed_category TEXT,
  parsed_model TEXT,
  errors TEXT,          -- JSON array
  status TEXT,          -- OK | QUARANTINED
  loadedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Rules (fail → `QUARANTINED`, never indexed):**
- `id` present, unique, matches `^[a-z0-9-]{3,64}$`
- `category` ∈ the 7-value controlled vocabulary
- `model` non-empty, 2–160 chars
- `spec_template` ≤ 400 chars, no `₹` / price-like patterns
- `aliases` valid JSON array of strings, ≤ 12 entries, each ≤ 64 chars

**Dedupe gate:** reject a second row whose folded `model` already exists under a
different `id`. This is the exact defect I hit when seeding the expansion — six
shadow duplicates appeared because `INSERT OR IGNORE` only dedupes on primary key,
not on model. A duplicate splits one product across two ids, so normalization can
anchor the same hardware to different ids and produce inconsistent match keys.

---

## 5. Intent Processing

Deterministic first, model only when deterministic fails:

| Intent | Signal | Handling |
|---|---|---|
| **Brand** | matches synonym/brand lexicon | boost those rows, rank brands first |
| **Model code** | token matches `\d{3,}` pattern | exact + prefix match on model |
| **Category** | token ∈ controlled vocabulary | filter + boost |
| **Spec** | memory/storage/ports/age terms | match against `spec_tok` |
| **Budget** | `₹`, `under`, `budget` | **stripped, never sent to FTS** — see §7 |
| **Unknown** | nothing matched | fall through to LLM expansion (§6) |

The Budget rule matters: BUY carries no price, so price-like tokens must not
influence catalog ranking. Treating `under 50000` as a search term would silently
degrade relevance for every other buyer.

---

## 6. Where the LLM Fits — and Where It Must Not

**LLM is not in the typeahead request path.** Deterministic FTS5 answers
sub-100ms with zero cost. An LLM round-trip on every keystroke-debounce is slow,
costly, and non-deterministic — the exact anti-pattern already proven once in this
codebase, where `basePrice` was populated from a catalog `spec_template`.

The LLM is used in exactly two places:

1. **Query expansion, offline/async.** For queries with zero FTS hits, an
   admin-triggered job asks the model to propose synonyms/corrections, which are
   **human-reviewed** before entering `product_synonyms`. The model never writes
   to the index directly.
2. **Intent classification fallback.** Only when the deterministic classifier
   cannot assign an intent.

Output is validated against the §4 schema before it is ever persisted. A response
failing validation is discarded — never coerced.

---

## 7. Query Plan (the actual production path)

```
query "hpe proliant dl380 256gb"
  ├─ fold + tokenize            → [hpe, proliant, dl380, 256gb]
  ├─ synonym expand             → [hpe, proliant, dl380, 256gb]   (proliant→hpe proliant)
  ├─ drop stopwords / budget    → unchanged
  ├─ FTS5 MATCH (AND, bm25)     → ranked row set, LIMIT 50
  ├─ boost: exact model hit     → move to top
  ├─ boost: category match      → +weight
  ├─ re-apply current prefix + alias + Jaro-Winkler tiering
  └─ return top N (no arbitrary cap)
```

**Every stage is deterministic.** The old `LIMIT 200` scan disappears entirely —
FTS5 returns the *matching* rows, so recall no longer degrades as the catalog grows.

---

## 8. Removing the Caps

| Cap | Now | After |
|---|---|---|
| Fuzzy scan | `LIMIT 200` (**breaks at 247**) | removed — FTS5 |
| Max results | 20 | 50 (configurable) |
| Frontend request | `limit: '10'` | 25, with "show more" |
| Max query | 64 chars | 128 chars |

I would **not** raise the frontend cap arbitrarily. A dropdown that renders 50 rows
is a worse UI than one that renders 12 with a clear "view all N matches" affordance.
Recommend: 12 inline, plus an explicit expansion.

---

## 9. Scale Path

FTS5 comfortably handles far beyond the 500-row target. When the catalog reaches
tens of thousands, the same query plan moves to `products_fts` sharding or a D1
read-replica — no application rewrite, because the interface is one SQL query.

---

## 10. Migration & Rollback

1. Build `products_fts` + synonyms + staging alongside the current path. **No traffic change.**
2. Backfill and **verify recall parity** with a fixed query set (assert the
   §1 numbers: `ssd`→22, `nvme`→19, `2u`→31, `proliant`→14).
3. Shadow-compare FTS vs current for N days; log disagreements.
4. Cut over behind a flag; keep the old path one release for instant rollback.
5. Only then delete the `LIMIT 200` scan.

**Rollback is a flag flip**, because both paths stay intact through steps 1–4.

---

## 11. Open Questions

1. **Front-end affordance** — 12 inline + "view all", or a flat 25/50 list?
2. **Typo tolerance** — FTS5 prefix only, or add trigram/n-gram for misspelling
   (`poweredge` → `powedrage`)? n-gram index costs storage but catches real typos.
3. **Synonym governance** — who approves model-proposed synonyms before they enter
   the index? (I recommend staff review; auto-accept would let the LLM reshape
   retrieval globally.)
4. **Scope** — rebuild retrieval only, or fold the D5 normalized-match-key work in
   the same change? I recommend **separate**: they share the catalog but have
   different risk profiles, and retrieval is the one with a measurable defect today.

---

## What I Would Do First

Steps 1–2 above are pure additive work with a **measurable success criterion already
established** — the §1 table. That makes it verifiable in a way the Tier-2 LLM work
was not. Steps 3–5 follow once parity is proven.

One caveat I want to be explicit about: I have **not** built any of this. The FTS5
capability is verified against your live database, and the recall numbers are real
queries against the live endpoint — but the pipeline, schema gate and intent
classifier are designs, not tested code.
