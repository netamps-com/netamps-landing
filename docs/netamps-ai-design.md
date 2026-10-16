# NETAMPS AI — Governed Model Module — Design Spec

**Status:** IMPLEMENTED (Phase 0 + 1). No flag gates the module's existence;
operator access is identity-based (login + staff), per-module flags and the
global brake gate execution.
**Requirement:** every Llama call in the project runs through one governed,
audited, budgeted layer that interconnects all model modules — with logical,
analytical, mathematical and algorithmic precision enforced by validators
rather than asserted by prompts — visible only to authorized Netamps
operators, reported and managed from one dashboard, with a review inbox for
suggestions and future updates.

## 0. An honest boundary: orchestration, not training

This repository has no training infrastructure — no GPUs, no dataset pipeline,
no fine-tuning harness — and inference runs on Cloudflare Workers AI
(Llama 3.1 8B / 3.3 70B via API). Nothing here trains weights, and nothing
claims to. Precision in this module comes from governance, in this order:
deterministic-first invocation (the model is the last resort, never the first
pass), structural validators on every response, budgets and brakes on every
module, and golden-set evals that measure before anything is claimed. The
registry (prompt versions + eval fixtures per module) is the foundation a
future fine-tune would build on — data curation first, weights later.

## 1. Architecture

```
callers (6 modules, route:'direct' today)
   │  progressive migration: call-site swap to invokeModule, never redesign
   ▼
orchestrator (ai/orchestrator.mjs) — ONE governed path
   │  gates: operator → module → global brake → module flag → budget →
   │         input cap → gateway → schema → grounding → math → audit
   ▼
gateway (llm/client.mjs) — transport only, unchanged
```

The gateway keeps owning models, escalation, timeouts and telemetry. The
orchestrator owns policy. Neither knows the other's job.

## 2. The six governed modules

| id | feature | tier | tokens | budget/d | contract enforced |
|---|---|---|---|---|---|
| normalize | normalize | auto | 400 | 5000 | descriptor keys + types |
| enrich | enrich | auto | 400 | 500 | descriptor keys + types |
| buy_suggest | buy_suggest | small | 256 | 8000 | `{candidates, unmatched}` + ids ⊆ shortlist, cap 4 |
| match_rank | match-rank | auto | 700 | 500 | `{rankings[]}` + indices < shortlist, no dupes |
| order_search | order_search | auto | 400 | 2000 | `{indices[]}` + ints < pool, cap 25, no dupes |
| track_milestone | track_milestone | small | 256 | 2000 | `{events[], unmatched}` + milestone ∈ {5,6,8,9,10}, verbatim quotes |

Tiers and ceilings verified against the call sites; the orchestrator takes the
MINIMUM of caller ask and registry cap, so a caller can never widen its own
budget. Budgets are starting values, adjustable live via the flags action.

## 3. Precision machinery (by requested property)

- **Logical consistency / reasoning flaws**: schema gate (required keys, int
  distinguished from float, enum membership, per-item validation with indexed
  error paths) — malformed reasoning outputs die as SCHEMA_MISMATCH with the
  exact location, and the failure is logged, not retried blindly.
- **Analytical accuracy / data interpretation**: grounding gate — ids must
  come from the supplied shortlist, indices from the supplied pool, quotes
  verbatim from the supplied text (folded compare, minimum length so trivial
  overlaps never count). A model can only ever *select among* caller evidence.
- **Mathematical correctness**: structural arithmetic rules (op + field refs,
  never parsed expressions — no injection surface), recomputed
  deterministically with tolerance; mismatches carry both numbers. Implemented
  and harness-tested; no current module returns computed money (their numerics
  are validator-computed locally), so rule sets ship empty and the first
  module that needs one plugs it into its registry entry.
- **Algorithmic efficiency / edge cases**: per-module token ceilings and daily
  call budgets, 24KB input cap, caller tier respected (small-tier paths never
  escalate), empty-prompt fast path, soft-fail everywhere (a failure is
  `{ok:false, reason}`, never a throw into a request path).

## 4. Protection model

| Layer | Rule |
|---|---|
| anonymous | 401 before any registry read or model work |
| authenticated non-operator | 403, revealing nothing behind the gate |
| operator | valid login AND (role admin/staff OR @netamps.com mailbox) |
| invoke / read / suggest | any operator |
| flags, budgets, suggestion review, global brake | admin only |

Sessions keep their existing guarantees (expiry + 30-minute idle mandate);
the AI module adds no session machinery and trusts no client claim — the
dashboard renders only what the server chose to send.

## 5. API surface

`POST /api/ai`: `modules` (registry + live health), `runs` (paged, filterable),
`invoke` (governed call), `suggest`/`suggestions` (inbox), `review` (admin),
`flags` (admin), `brake` (admin). Tables are additive
(`ai_modules`, `ai_runs`, `ai_suggestions`); redeploys seed with
INSERT OR IGNORE so operator overrides survive.

## 6. Dashboard (`/dashboard/ai`)

Module health table (flag, budget used, 24h ok-rate from gateway telemetry),
invocation history with module filter, suggestion filing + inbox with
accept/ship/reject (admin), global brake toggle (admin). Non-operators see a
restriction notice, never data.

## 7. Rollout (implemented state)

1. ✅ **Registry + gates + tests** — six modules, validators, 53-assertion harness.
2. ✅ **Orchestrator + protected endpoint + console** — single governed path,
   operator-only, review inbox live.
3. ⏳ **Progressive migration** — route modules one at a time from `direct`
   gateway calls to `invokeModule` (suggest + track first: smallest prompts,
   tightest budgets); each migration ships with its golden-set eval green.
4. ⏳ **Efficacy**: per-module precision (validator pass rate), grounding
   refusal rate, budget headroom, suggestion throughput. Measured before
   claimed, per module.
5. 🚫 **Never**: training-weight claims, auto-execution of suggestions,
   operator-bypass paths, or blocking a host flow on a model.
