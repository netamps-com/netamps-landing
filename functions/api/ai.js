import { verifySession } from './intake/auth';

/**
 * POST /api/ai — NETAMPS AI module console.
 *
 * Protection (the whole point of this file): unauthenticated callers get 401
 * BEFORE any model work or registry reads; authenticated non-operators get
 * 403. An operator is a valid login session AND (role admin/staff OR a
 * @netamps.com mailbox) — see aiAuthorized() in ai/registry.mjs. Within that,
 * invoking/reading/suggesting is operator-wide; flags, budgets, suggestion
 * review and the global brake are admin-only.
 *
 * Actions:
 *   modules      registry + live health (flags, budgets, today usage, 24h ok)
 *   runs         paged invocation history, filterable by module/actor
 *   invoke       governed single-module invocation (operator)
 *   suggest      file a review/roadmap/issue item for owner review (operator)
 *   suggestions  read the inbox, filterable by status/kind
 *   review       accept/reject/ship a suggestion (admin)
 *   flags        read/set a module's enabled + daily budget (admin)
 *   brake        read/set the global llm_enabled emergency brake (admin)
 *
 * Zero npm imports. D1-only (same as the ranker).
 */

import {
  AI_MODULES, aiAuthorized, aiAdmin,
  ensureAiTables, moduleState, setModuleState,
  submitSuggestion, listSuggestions, reviewSuggestion,
} from './ai/registry.mjs';
import { invokeModule, listRuns, moduleHealth } from './ai/orchestrator.mjs';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

export async function onRequestPost({ request, env }) {
  try {
    // Gate 1: login. No session → 401 before anything else happens.
    const user = await verifySession(env, request);
    if (!user) {
      return json({ success: false, message: 'Unauthorized' }, 401);
    }
    // Gate 2: operator. Authenticated but not Netamps staff → 403, and the
    // response says nothing about what lies behind the gate.
    if (!aiAuthorized(user)) {
      return json({ success: false, message: 'Forbidden' }, 403);
    }
    if (!env.DB || typeof env.DB.prepare !== 'function') {
      return json({ success: false, message: 'Returns database is not attached.' }, 503);
    }

    let body = {};
    try {
      body = await request.json() || {};
    } catch {
      return json({ success: false, message: 'Invalid request body' }, 400);
    }
    const action = String(body.action || 'modules');
    const ALLOWED = new Set([
      'modules', 'runs', 'invoke', 'suggest', 'suggestions',
      'review', 'flags', 'brake'
    ]);
    if (!ALLOWED.has(action)) {
      return json({ success: false, message: 'Unknown action.' }, 400);
    }

    // ── operator reads ──
    if (action === 'modules') {
      return json({ success: true, registry: 'netamps-ai-v1', modules: await moduleHealth(env) });
    }
    if (action === 'runs') {
      const moduleId = typeof body.moduleId === 'string' && body.moduleId ? body.moduleId : null;
      if (moduleId && !AI_MODULES.some((m) => m.id === moduleId)) {
        return json({ success: false, message: 'Unknown module.' }, 400);
      }
      const actor = typeof body.actor === 'string' && body.actor ? body.actor.slice(0, 254) : null;
      const limit = Number.isInteger(body.limit) && body.limit > 0 ? Math.min(body.limit, 500) : 100;
      return json({ success: true, runs: await listRuns(env, { moduleId, actor, limit }) });
    }
    if (action === 'suggestions') {
      const status = typeof body.status === 'string' && body.status ? body.status : null;
      const kind = typeof body.kind === 'string' && body.kind ? body.kind : null;
      return json({ success: true, suggestions: await listSuggestions(env, { status, kind }) });
    }

    // ── operator writes ──
    if (action === 'invoke') {
      if (typeof body.moduleId !== 'string' || !body.moduleId) {
        return json({ success: false, message: '`moduleId` is required.' }, 400);
      }
      const r = await invokeModule(env, {
        user,
        moduleId: body.moduleId,
        system: typeof body.system === 'string' ? body.system : null,
        userPrompt: typeof body.userPrompt === 'string' ? body.userPrompt : null,
        context: body.context && typeof body.context === 'object' && !Array.isArray(body.context) ? body.context : {},
        mathRules: Array.isArray(body.mathRules) ? body.mathRules : null,
        promptVersion: typeof body.promptVersion === 'string' ? body.promptVersion.slice(0, 64) : null,
        maxTokens: Number.isInteger(body.maxTokens) ? body.maxTokens : null,
        timeoutMs: Number.isInteger(body.timeoutMs) ? body.timeoutMs : null,
        temperature: typeof body.temperature === 'number' ? body.temperature : 0,
      });
      return json({ success: r.ok, ...r }, r.ok ? 200 : (r.reason === 'FORBIDDEN' ? 403 : 400));
    }
    if (action === 'suggest') {
      const r = await submitSuggestion(env, {
        kind: body.kind, title: body.title, detail: body.detail,
        moduleId: typeof body.moduleId === 'string' && body.moduleId ? body.moduleId : null,
        actor: user.email,
      });
      return json({ success: r.ok, ...r }, r.ok ? 200 : 400);
    }

    // ── admin only from here ──
    const admin = aiAdmin(user);
    if (!admin) {
      return json({ success: false, message: 'Forbidden' }, 403);
    }
    if (action === 'review') {
      const r = await reviewSuggestion(env, { id: body.id, decision: body.decision, reviewer: user.email });
      return json({ success: r.ok, ...r }, r.ok ? 200 : 400);
    }
    if (action === 'flags') {
      if (typeof body.moduleId !== 'string' || !body.moduleId) {
        return json({ success: false, message: '`moduleId` is required.' }, 400);
      }
      if (body.enabled === undefined && body.dailyBudget === undefined) {
        await ensureAiTables(env);
        return json({ success: true, id: body.moduleId, ...(await moduleState(env, body.moduleId)) });
      }
      const r = await setModuleState(env, body.moduleId, {
        enabled: body.enabled === undefined ? undefined : body.enabled === true,
        dailyBudget: body.dailyBudget === undefined ? undefined : body.dailyBudget,
      });
      return json({ success: r.ok, ...r }, r.ok ? 200 : 400);
    }
    if (action === 'brake') {
      await ensureAiTables(env);
      if (body.enabled === undefined || body.enabled === null) {
        const row = await env.DB.prepare("SELECT value FROM match_meta WHERE key = 'llm_enabled'").first().catch(() => null);
        return json({ success: true, enabled: !row || row.value !== '0' });
      }
      if (typeof body.enabled !== 'boolean') {
        return json({ success: false, message: '`enabled` must be a boolean.' }, 400);
      }
      await env.DB.prepare(
        "INSERT INTO match_meta (key, value) VALUES ('llm_enabled', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      ).bind(body.enabled ? '1' : '0').run();
      return json({ success: true, enabled: body.enabled });
    }

    return json({ success: false, message: 'Unknown action.' }, 400);
  } catch (err) {
    console.error('[ai] Internal error:', err);
    return json({ success: false, message: 'AI request failed. Please try again shortly.' }, 500);
  }
}
