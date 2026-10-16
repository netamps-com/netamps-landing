# Stock Ledger — Buy & Sell Inventory, Connected — Design Spec

**Status:** IMPLEMENTED (Phase 0 + 1). Flag `stock_enabled` default **OFF**.
**Requirement:** SELL and BUY inventory must behave as one managed stock book:
goods a SELL deal commits become available supply; a BUY consumes that supply
through reservation and issue; declines, deletes and recounts move stock
through explicit, audited transitions — never silent mutation.

**Corrected framing (load-bearing — read it before the rest):**

| Loose phrasing | Correction | Why |
|---|---|---|
| "link buy and sell" | one **append-only movement ledger** both sides write | A link (a foreign key, a flag) cannot answer "who took the last 3 units". The ledger is the audit trail, so there is no second book to drift. |
| "update the quantity" | **derive** balances (receipts − issues − outstanding holds + adjustments) | Two concurrent writers mutating one cell both read 5, both subtract 3. Appends never collide; guards fail closed on the derived number. |
| "match means fulfilled" | match pairs; **issue fulfills** | The greedy matcher reports pairs and persists nothing. Only an ISSUE movement decrements stock. |
| "auto-deduct on deal" | hooks are **best-effort**; shortfall is **reported, never silent** | A stock write must never fail a deal approval. Partial fulfillment carries its shortfall in the response and the audit log. |

---

## 1. Why The Matcher Alone Is Not Stock

`POST /api/match` pairs one BUY order with one SELL order on byte-identical
keys. It is deliberately qty-blind and status-blind: it will pair a BUY for 50
units with a SELL of 2, pair against a declined order's lines, and pair the
same SELL order twice across two BUYs. That is correct for an *advisory
matcher* and fatal for *inventory*. This module is the parallel qty-aware
layer; the matcher itself is untouched.

---

## 2. Data Model (additive; all `CREATE TABLE IF NOT EXISTS`)

```sql
CREATE TABLE stock_lots (
  id TEXT PRIMARY KEY,
  sell_order_id TEXT NOT NULL, sell_line_idx INTEGER NOT NULL,
  norm_name TEXT NOT NULL, norm_model TEXT NOT NULL,
  raw_cat TEXT NOT NULL, raw_det TEXT NOT NULL,
  qty_total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',           -- OPEN | VOID
  created_at TEXT NOT NULL, closed_at TEXT,
  UNIQUE (sell_order_id, sell_line_idx)
);
CREATE TABLE stock_movements (
  id TEXT PRIMARY KEY, lot_id TEXT NOT NULL, kind TEXT NOT NULL,  -- RECEIPT|RESERVE|RELEASE|ISSUE|ADJUST
  qty INTEGER NOT NULL,                        -- positive; ADJUST signed
  ref_buy_order TEXT, ref_buy_line INTEGER,    -- the demand side, when any
  actor TEXT, reason TEXT, at TEXT NOT NULL
);
CREATE TABLE stock_meta (key TEXT PRIMARY KEY, value TEXT);  -- 'enabled'
```

`available(lot) = ΣRECEIPT + ΣADJUST − ΣISSUE − (ΣRESERVE − ΣRELEASE)`.
Lots are one-per-SELL-line, keyed by `(sell_order_id, sell_line_idx)` —
re-fires (deal webhooks, backfills) return the existing lot, never double stock.

## 3. Flows

| Event | Movement | Guard |
|---|---|---|
| SELL `Order Deal Approved` (`finalizeDeal`) | RECEIPT, full line qty | idempotent per (order, line) |
| candidate accepted (`acceptCandidate`) | RESERVE, buy-line qty | `qty ≤ available`, one outstanding per (lot, ref); accept itself never depends on stock |
| BUY `Order Deal Approved` (`finalizeDeal`) | ISSUE per line: own holds first, then FIFO direct-issue | partial + shortfall reported |
| order declined/withdrawn (`setOrderStatus` → Declined) | RELEASE all holds for that buy order | per-ref, never touches other buyers |
| order deleted (`returns` DELETE, sell only) | VOID lots + auto-release outstanding (`lot_voided`) | closed lots refuse new movements, vanish from the board |
| recount/damage/found stock (admin) | ADJUST, signed + reasoned | reason mandatory; never below zero |

Every writer is flag-gated (`DISABLED` when off) and every lifecycle hook is
best-effort try/catch: stock can never fail a deal, a status write, an accept,
or a delete.

## 4. Idempotency & Concurrency

- RECEIPT: unique (order, line) — retries are no-ops.
- RESERVE: at most one outstanding per (lot, buy ref) — accept double-clicks dedupe.
- ISSUE: hook-level exactly-once (a deal can only be approved once — re-approve
  after DEAL is rejected by the lifecycle gate); admin direct issues are each
  deliberate movements.
- VOID: re-void finds no OPEN lots.
- Guards read derived balances at write time; concurrent over-claims fail
  closed with the available number in the response.

## 5. API surface

`POST /api/stock` (same auth posture as `/api/match`: session reads, admin writes):

| action | effect |
|---|---|
| `levels` | availability by key across OPEN lots (zero-stock keys excluded by default) |
| `movements` | ledger for one lot, or everything touching one buy order |
| `reservations` / `lots` | outstanding holds per buy order; lots + balances per sell order |
| `receive/reserve/release/release-order/issue/adjust/void` | guarded admin writes |
| `flag` | read/set `stock_enabled` without a deploy |
| `backfill` | receive every SELL already at DEAL (idempotent; for adoption) |

## 6. Rollout (implemented state)

1. ✅ **Ledger + guards + tests** — module, tables, flag (OFF), 40-assertion harness.
2. ✅ **Lifecycle hooks** — receive/issue on deal, release on decline, reserve on
   accept, void on delete; all best-effort, all audited (`STOCK_*` events).
3. ✅ **Read API + backfill** — board, ledger views, adoption path.
4. ⏳ **Dashboard stock panel** — `levels`/`reservations` rendered for operators;
   low-stock signal. Next build.
5. 🚫 **Never**: matcher rewrites, auto-claims, or blocking a deal on stock.

## 7. Efficacy

Watch once enabled with real supply: receipt volume vs deal volume, reserve
conversion (accept → issue), shortfall rate per key (buys the book cannot
cover), and void/adjust frequency (data-quality signal). Until then the honest
state is: machinery shipped dark, measurable before it is claimed.
