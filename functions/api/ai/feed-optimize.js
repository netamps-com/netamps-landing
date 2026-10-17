/**
 * POST /api/ai/feed-optimize — AI-optimizes feed item title and detail.
 *
 * Auth: operator-only. 401 before any registry read or model work for
 * anonymous callers, 403 for authenticated non-operators — the same two gates
 * the rest of NETAMPS AI applies (see ai.js and assistant.js).
 * Body: { title: string, detail: string }
 * Returns: { success, title, detail, source, model?, reason? }
 *
 * Invocation goes through the governed orchestrator (module `feed_optimize`),
 * not a hand-rolled call. That buys the emergency brake, the per-module flag,
 * the daily budget, schema validation of the model's JSON, and an `ai_runs`
 * audit row for every attempt — and it uses the current Workers AI model id
 * from the shared gateway instead of the retired unsuffixed llama-3.1-8b that
 * this endpoint used to hardcode (that model is gone, so every call used to
 * throw and silently degrade, meaning AI never actually ran here).
 *
 * Deterministic-first still holds: if the model is unavailable, over budget,
 * or returns something that fails the schema, we fall back to the local
 * cleanup rules below and say so via `source`, never surfacing an error for
 * what is a copy-polish nicety.
 */

import { verifySession } from '../intake/auth';
import { aiAuthorized } from './registry.mjs';
import { invokeModule } from './orchestrator.mjs';

const MAX_TITLE = 140;
const MAX_DETAIL = 280;

const MODULE_ID = 'feed_optimize';
const PROMPT_VERSION = 'feed-optimize-v1';

const SYSTEM_PROMPT =
  'You are a concise B2B copy editor for an IT asset disposition (ITAD) ' +
  'company called Netamps. Rewrite the given feed item title and detail so ' +
  `they are clear, specific and professional. Title: at most ${MAX_TITLE} ` +
  'characters, title case, no trailing period. Detail: at most ' +
  `${MAX_DETAIL} characters, 1-2 sentences, professional tone, keeping every ` +
  'concrete fact that was supplied. Do not invent numbers, customers, ' +
  'certifications or outcomes. Respond with JSON only: ' +
  '{"title": "...", "detail": "..."}';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function clampTitle(t) {
  return String(t ?? '').trim().slice(0, MAX_TITLE);
}

function clampDetail(d) {
  return String(d ?? '').trim().slice(0, MAX_DETAIL);
}

function deterministicOptimize(title, detail) {
  let outTitle = clampTitle(title);
  let outDetail = clampDetail(detail);

  // Capitalize first letter of title if it's lowercase.
  if (outTitle.length > 0) {
    outTitle = outTitle.charAt(0).toUpperCase() + outTitle.slice(1);
  }

  // Trim trailing whitespace, collapse multiple spaces.
  outTitle = outTitle.replace(/\s+/g, ' ').trim();
  outDetail = outDetail.replace(/\s+/g, ' ').trim();

  // Ensure title ends without dangling punctuation issues.
  if (outTitle.endsWith('..')) outTitle = outTitle.slice(0, -1);

  return { title: outTitle, detail: outDetail };
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

    const rawTitle = typeof body.title === 'string' ? body.title : '';
    const rawDetail = typeof body.detail === 'string' ? body.detail : '';

    if (!rawTitle.trim()) {
      return json({ success: false, message: 'title is required.' }, 400);
    }

    let result;
    let source = 'deterministic';
    let model = null;
    let reason = null;

    if (env && env.DB && typeof env.DB.prepare === 'function') {
      const r = await invokeModule(env, {
        user,
        moduleId: MODULE_ID,
        system: SYSTEM_PROMPT,
        userPrompt: `Input title: ${rawTitle}\nInput detail: ${rawDetail}`,
        temperature: 0.3,
        maxTokens: 300,
        promptVersion: PROMPT_VERSION,
      });

      const p = r && r.payload;
      if (r && r.ok && p && typeof p.title === 'string' && typeof p.detail === 'string') {
        result = { title: p.title.trim(), detail: p.detail.trim() };
        source = 'model';
        model = r.model || null;
      } else {
        reason = (r && r.reason) || 'MODEL_UNAVAILABLE';
        result = deterministicOptimize(rawTitle, rawDetail);
      }
    } else {
      // No database attached: no orchestration (budgets and audit live in D1).
      reason = 'NO_DB';
      result = deterministicOptimize(rawTitle, rawDetail);
    }

    const out = {
      success: true,
      title: clampTitle(result.title),
      detail: clampDetail(result.detail),
      source,
    };
    if (model) out.model = model;
    if (reason) out.reason = reason;
    return json(out);
  } catch (err) {
    console.error('[ai/feed-optimize] error:', err);
    return json({ success: false, message: 'AI optimization failed.' }, 500);
  }
}
