# BUY → SELL Best-Match Suggestion — Design Spec

**Status:** PROPOSED — awaiting review. No code written.
**Requirement:** when a BUY line's exact product is not available in SELL, the
BUY dashboard must automatically surface the closest available SELL product,
ranked by the LLM.

---

## 1. Why This Is Not Just A Search

The existing matcher (`functions/api/match.js`) does **exact key equality**:
`BUY line matches SELL line` iff `norm(category) + norm(details)` are
byte-identical after folding. It is deliberately conservative — it will never
pair two products that differ.

That means a BUY for `HPE ProLiant DL380 Gen10` finds **nothing** when the only
stock is `HPE ProLiant DL380 Gen9`. From the operator's seat that reads as "no
supply exists", which is false. The product class exists; only the exact string
differs.

This feature closes that gap **advisorily**: it never claims a match, it
proposes ranked candidates for a human to accept.

---

## 2. Hard Boundary: Suggestion ≠ Match

This is the single most important design decision, so it goes first.

| | Exact match (today) | Best-match suggestion (new) |
|---|---|---|
| Basis | byte-identical key | LLM-ranked similarity |
| Status | `Matches`, order-level claim | `Candidates`, advisory only |
| Affects greedy claim logic | Yes | **No** |
| Requires human acceptance | No | **Yes** |
| Shown in dashboard | Matches table | Separate "Candidates" panel |

**The suggestion path must never write to `match_lines`, never consume claim
capacity, and never alter what the existing matcher returns.** Greedy one-to-one
claiming is a correctness-critical invariant; a fuzzy ranking must not touch it.
If this feature is wrong, the worst outcome is a useless suggestion — never a
badly-paired order.

---

## 3. Pipeline: Deterministic First, LLM Only as Tiebreak

Sending the whole SELL book to an LLM is unaffordable and unauditable. So:

**Stage 1 — deterministic candidate retrieval (free, no LLM).**
For each BUY line, pull the top ~40 SELL lines from `match_lines` by:
1. same `normalized catalogId` (a BUY anchored to `srv-003` vs SELL lines
   anchored to `srv-003` / same manufacturer+model family)
2. same catalog `category`
3. token overlap on `raw_det` (Jaccard over folded tokens) as a tiebreak

This yields a shortlist with zero model spend and full auditability.

**Stage 2 — LLM ranking (only on the shortlist).**
One call ranks the ≤40 shortlisted SELL lines against the BUY line's structured
descriptor + specs, returning an ordered list with:
- `fit` — how well it satisfies the requirement
- `gaps` — what does NOT match (e.g. "Gen 9 vs Gen 10 requested")
- `confidence` — computed by our validator, never self-reported (D4 lesson)

**Stage 3 — presentation.** Top 3–5 candidates per BUY line, each with an
explicit "Accept as match" button that runs the *existing* exact-match write
path if the operator agrees, so accepting a candidate produces the same auditable
record as a native match.

---

## 4. Cost Control

This is the part that decides whether it ships. LLM calls on every dashboard
view would be indefensible.

- **Compute once, cache per (buyLine, sellBookVersion).** Results are stored in
  a new `match_candidates` table and reused until either the BUY line's
  descriptor changes or a new SELL order arrives (`sellBookVersion` is bumped on
  SELL insert/delete).
- **Dashboard reads the cache, never triggers a live call.** Live calls happen in
  the same async post-submit `waitUntil` as Tier-2 normalization.
- **Budget:** one call per BUY line per SELL-book change, not per page view.
  At current volume this is a handful of calls per submission.
- **Kill switch:** reuse the existing `match_meta` gate pattern —
  `candidates_enabled` flag, default OFF.

---

## 5. Grounding / No-Fabrication (same contract as Tier-2)

The ranking model **may only reorder the candidates it was given.** It cannot
introduce a SELL order that is not in the shortlist. Enforced by:

1. Post-validator asserts every returned candidate id ∈ shortlist. Anything else
   is dropped and the response is discarded.
2. `fit` must cite at least one grounded spec from the BUY descriptor.
3. `confidence` computed by us from evidence, not self-reported.
4. A SELL line with no grounded overlap is never surfaced as a candidate at all —
   a "closest match" with nothing in common is worse than an empty state.

---

## 6. Empty-State Is A Valid, Explicit Outcome

If Stage 1 finds no candidates above threshold, the dashboard says:

> "No comparable stock in current SELL inventory for this line."

and calls **no LLM**. We do not pad with weak matches to make the panel look
useful. An honest empty state is the correct product behaviour here.

---

## 7. Data Model (additive)

```sql
CREATE TABLE match_candidates (
  buyOrderId   TEXT NOT NULL,
  buyLineIdx   INTEGER NOT NULL,
  sellOrderId  TEXT NOT NULL,
  sellLineIdx  INTEGER NOT NULL,
  rank         INTEGER NOT NULL,
  fit          REAL,
  gaps         TEXT,
  confidence   REAL,
  rationale    TEXT,
  model        TEXT,
  sellBookVersion TEXT,
  createdAt    DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (buyOrderId, buyLineIdx, sellOrderId, sellLineIdx)
);
CREATE INDEX idx_mc_buy ON match_candidates(buyOrderId, buyLineIdx, rank);
```

`match_lines` and the greedy claim logic are **untouched**.

---

## 8. Rollout

1. **Compute + cache, display nothing.** Populate `match_candidates`, inspect fit
   quality and gap accuracy. Zero user-visible change.
2. **Read-only panel** in the dashboard, behind `candidates_enabled`. Operators
   see candidates; no accept action yet. Measure how often the top candidate is
   actually the one an operator would have picked.
3. **Accept action** wired to the existing exact-match write path, audited.

Gating promotion on measured operator agreement is what keeps this from becoming
a confident-sounding feature nobody trusts.

---

## 9. Open Questions For You

1. **Candidate count** — top 3, or top 5 per BUY line in the dashboard?
2. **Scope** — all BUY requests, or only those still unmatched after review?
   (Recommending unmatched-only to keep the panel meaningful.)
3. **Fit threshold** — below what score should a candidate be hidden entirely?
   (I propose hiding < 0.5 so the panel never shows noise.)
4. **Does the current single SELL order + zero BUY orders** warrant building this
   at all yet? There is no live supply to match against. If real SELL inventory
   is not imminent, this should stay on paper.

That last point is the one I'd weigh most heavily: **with 1 SELL order and 0 BUY
orders in the database, this feature has nothing to operate on today.** It is
real work against an empty book.
