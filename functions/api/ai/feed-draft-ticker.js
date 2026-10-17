/**
 * POST /api/ai/feed-draft-ticker — AI-drafts a ticker flash from a tag.
 *
 * Auth: operator-only. 401 before any registry read or model work for
 * anonymous callers, 403 for authenticated non-operators — the same two gates
 * the rest of NETAMPS AI applies (see ai.js and assistant.js).
 * Body: { tag: string }
 * Returns: { success, text, source, model?, reason? }
 *
 * Invocation goes through the governed orchestrator (module
 * `feed_draft_ticker`), not a hand-rolled call, so this path inherits the
 * emergency brake, the per-module flag, the daily budget, schema validation
 * of the model's JSON and an `ai_runs` audit row per attempt. It also uses
 * the current Workers AI model id from the shared gateway rather than the
 * retired unsuffixed llama-3.1-8b this endpoint used to hardcode — that model
 * is gone, so every call used to throw and silently degrade, meaning the
 * draft button never actually reached a model.
 *
 * Deterministic-first still holds: no model, over budget, or schema failure
 * falls back to the local tag→flash rules below, reported via `source`.
 */

import { verifySession } from '../intake/auth';
import { aiAuthorized } from './registry.mjs';
import { invokeModule } from './orchestrator.mjs';

const MAX_TICKER_TEXT = 140;

const MODULE_ID = 'feed_draft_ticker';
const PROMPT_VERSION = 'feed-draft-ticker-v1';

const SYSTEM_PROMPT =
  'You draft short scrolling ticker flashes for a B2B IT asset disposition ' +
  'company called Netamps. Reply with JSON only: {"text": "..."} where text ' +
  `is at most ${MAX_TICKER_TEXT} characters, professional and punchy, in the ` +
  'B2B voice of the site. Do not use quotes, markdown or emoji, do not ' +
  'mention "AI" or "generated", and do not invent prices, customers or ' +
  'commitments that were not in the tag.';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function clampTicker(t) {
  return String(t ?? '').trim().slice(0, MAX_TICKER_TEXT);
}

function deterministicDraft(tag) {
  const t = clampTicker(tag);
  if (!t) return '';
  const cap = t.charAt(0).toUpperCase() + t.slice(1);
  // Map common tags to short flashes.
  const maps = {
    itad: 'Enterprise pickups with chain-of-custody manifests',
    buyback: 'Fresh buyback offers open for networking hardware',
    tracking: 'Track your request live with milestone updates',
    refurb: 'Certified refurbished stock now available',
    servers: 'Enterprise servers in stock and ready to ship',
    networking: 'Networking hardware buyback offers open',
    laptops: 'Refurbished laptops available now',
    storage: 'Storage arrays and SAN units in stock',
  };
  const key = t.toLowerCase().replace(/[^a-z]/g, '');
  if (maps[key]) return maps[key];
  return `New ${cap} update available — visit netamps.com for details.`;
}

export async function onRequestPost({ request, env }) {
  // Gate 1: login. No session → 401 before anything else happens.
  const user = await verifySession(env, request);
  if (!user) {
    return json({ success: false, message: 'Unauthorized' }, 401);
  }
  // Gate 2: operator. Authenticated but not Netamps staff → 403.
  if (!aiAuthorized(user)) {
    return json({ success: false, message: 'Forbidden' }, 403);
  }

  try {
    let body = {};
    try {
      body = await request.json() || {};
    } catch {
      return json({ success: false, message: 'Invalid request body' }, 400);
    }

    const rawTag = typeof body.tag === 'string' ? body.tag : '';
    if (!rawTag.trim()) {
      return json({ success: false, message: 'tag is required.' }, 400);
    }

    let text = '';
    let source = 'deterministic';
    let model = null;
    let reason = null;

    if (env && env.DB && typeof env.DB.prepare === 'function') {
      const r = await invokeModule(env, {
        user,
        moduleId: MODULE_ID,
        system: SYSTEM_PROMPT,
        userPrompt: `Tag: ${rawTag}`,
        temperature: 0.4,
        maxTokens: 100,
        promptVersion: PROMPT_VERSION,
      });

      const p = r && r.payload;
      if (r && r.ok && p && typeof p.text === 'string') {
        const drafted = clampTicker(p.text.replace(/^["']|["']$/g, '').trim().split('\n')[0]);
        // A schema-valid but empty draft is not worth showing — degrade.
        if (drafted) {
          text = drafted;
          source = 'model';
          model = r.model || null;
        } else {
          reason = 'EMPTY_DRAFT';
          text = deterministicDraft(rawTag);
        }
      } else {
        reason = (r && r.reason) || 'MODEL_UNAVAILABLE';
        text = deterministicDraft(rawTag);
      }
    } else {
      // No database attached: no orchestration (budgets and audit live in D1).
      reason = 'NO_DB';
      text = deterministicDraft(rawTag);
    }

    const out = { success: true, text, source };
    if (model) out.model = model;
    if (reason) out.reason = reason;
    return json(out);
  } catch (err) {
    console.error('[ai/feed-draft-ticker] error:', err);
    return json({ success: false, message: 'AI draft failed.' }, 500);
  }
}
