import { runJson, llmEnabled } from '../llm/client.mjs';
import {
  AI_REGISTRY_VERSION, AI_MODULES, getModule, aiAuthorized,
  ensureAiTables, moduleState, todayUsage,
  validateSchema, checkGrounding, verifyMath,
} from './registry.mjs';

/**
 * NETAMPS AI orchestrator — the one governed path for invoking a registered
 * model module.
 *
 * Order of gates (each failure returns BEFORE the next runs, so a denied
 * caller can never spend budget and an over-budget module can never spend a
 * model call):
 *   1. operator authorization (FORBIDDEN)
 *   2. module exists (UNKNOWN_MODULE)
 *   3. global emergency brake (LLM_DISABLED)
 *   4. per-module flag (MODULE_DISABLED)
 *   5. daily budget (BUDGET_EXCEEDED — counted before calling)
 *   6. input size cap (INPUT_TOO_LARGE — algorithmic edge case: unbounded
 *      prompts are a latency and cost hazard)
 *   7. gateway call (caller's tier + token ceiling enforced, never widened)
 *   8. response validators — schema, grounding, math — each recorded in the
 *      run row, so precision failures are measured, not argued about
 *
 * Every attempt (allowed or denied-at-budget, ok or failed) lands in `ai_runs`
 * best-effort: telemetry must never fail the response, but a missing run row
 * for a served answer is a gap, so the write happens before returning.
 * Writers return {ok, reason} and never throw for domain failures.
 */

const INPUT_JSON_CAP = 24000;

async function logRun(env, rec) {
  try {
    await ensureAiTables(env);
    await env.DB.prepare(
      'INSERT INTO ai_runs (id, module_id, actor, ok, reason, model, latency_ms, prompt_version, checks, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)'
    ).bind(
      crypto.randomUUID(),
      String(rec.moduleId || 'unknown').slice(0, 64),
      rec.actor ? String(rec.actor).slice(0, 254) : null,
      rec.ok ? 1 : 0,
      rec.reason ? String(rec.reason).slice(0, 64) : null,
      rec.model ? String(rec.model).slice(0, 96) : null,
      Number.isFinite(rec.latencyMs) ? Math.round(rec.latencyMs) : null,
      rec.promptVersion ? String(rec.promptVersion).slice(0, 64) : null,
      rec.checks ? JSON.stringify(rec.checks).slice(0, 2000) : null,
      new Date().toISOString()
    ).run();
    return true;
  } catch {
    return false;
  }
}

export async function invokeModule(env, {
  user, moduleId, system = null, userPrompt = null,
  context = {}, mathRules = null, promptVersion = null,
  maxTokens = null, timeoutMs = null, temperature = 0,
} = {}) {
  const actor = user && typeof user.email === 'string' ? user.email : 'unknown';

  // 1. operator-only. Checked before anything else touches the DB or a model.
  if (!aiAuthorized(user)) {
    return { ok: false, reason: 'FORBIDDEN' };
  }
  // 2. registered module only — there is no ad-hoc invocation.
  const mod = getModule(moduleId);
  if (!mod) {
    return { ok: false, reason: 'UNKNOWN_MODULE' };
  }
  // 3–4. brakes: global, then per-module.
  if (!(await llmEnabled(env))) {
    return { ok: false, reason: 'LLM_DISABLED' };
  }
  const state = await moduleState(env, mod.id);
  if (!state.enabled) {
    return { ok: false, reason: 'MODULE_DISABLED' };
  }
  // 5. budget, counted before spending.
  const used = await todayUsage(env, mod.id);
  if (used >= state.dailyBudget) {
    await logRun(env, { moduleId: mod.id, actor, ok: false, reason: 'BUDGET_EXCEEDED', promptVersion });
    return { ok: false, reason: 'BUDGET_EXCEEDED', used, dailyBudget: state.dailyBudget };
  }
  // 6. input bound.
  const inputJson = JSON.stringify({ system, userPrompt, context });
  if (inputJson.length > INPUT_JSON_CAP) {
    return { ok: false, reason: 'INPUT_TOO_LARGE', detail: [`${inputJson.length}>${INPUT_JSON_CAP}`] };
  }
  if (!system && !userPrompt) {
    return { ok: false, reason: 'EMPTY_PROMPT' };
  }

  // 7. gateway — the caller's tier stands, the token ceiling is the MINIMUM
  // of caller ask and registry cap (a caller can never widen its own budget).
  const call = await runJson(env, {
    system: system || 'You output only JSON.',
    user: userPrompt || '',
    maxTokens: Math.min(
      Number.isInteger(maxTokens) && maxTokens > 0 ? maxTokens : mod.maxTokens,
      mod.maxTokens
    ),
    temperature,
    tier: mod.tier,
    timeoutMs: Number.isInteger(timeoutMs) && timeoutMs > 0 ? timeoutMs : undefined,
    feature: mod.feature,
    promptVersion: promptVersion || `${mod.id}-orchestrated-v1`,
  });
  if (!call.ok) {
    await logRun(env, {
      moduleId: mod.id, actor, ok: false, reason: call.reason || 'MODEL_FAILED',
      model: call.model || null, latencyMs: call.latencyMs || null, promptVersion
    });
    return { ok: false, reason: call.reason || 'MODEL_FAILED', model: call.model || null };
  }

  // 8. precision gates on the payload.
  const checks = {};
  const schemaRes = validateSchema(call.payload, mod.schema);
  checks.schema = schemaRes.ok ? 'pass' : `fail:${schemaRes.reason}`;
  if (!schemaRes.ok) {
    await logRun(env, {
      moduleId: mod.id, actor, ok: false, reason: 'SCHEMA_MISMATCH',
      model: call.model, latencyMs: call.latencyMs, promptVersion, checks
    });
    return { ok: false, reason: 'SCHEMA_MISMATCH', detail: schemaRes.detail || [], model: call.model, checks };
  }
  const groundRes = checkGrounding(call.payload, mod.grounding, context);
  checks.grounding = groundRes.ok ? (groundRes.skipped ? 'skipped' : 'pass') : `fail:${groundRes.reason}`;
  if (!groundRes.ok) {
    await logRun(env, {
      moduleId: mod.id, actor, ok: false, reason: groundRes.reason,
      model: call.model, latencyMs: call.latencyMs, promptVersion, checks
    });
    return { ok: false, reason: groundRes.reason, detail: groundRes.detail || [], model: call.model, checks };
  }
  const mathRes = verifyMath(call.payload, mathRules || mod.math);
  checks.math = mathRes.ok ? (mathRes.skipped ? 'skipped' : 'pass') : `fail:${mathRes.reason}`;
  if (!mathRes.ok) {
    await logRun(env, {
      moduleId: mod.id, actor, ok: false, reason: mathRes.reason,
      model: call.model, latencyMs: call.latencyMs, promptVersion, checks
    });
    return { ok: false, reason: mathRes.reason, detail: mathRes.detail || [], model: call.model, checks };
  }

  await logRun(env, {
    moduleId: mod.id, actor, ok: true, reason: null,
    model: call.model, latencyMs: call.latencyMs, promptVersion, checks
  });
  return {
    ok: true, payload: call.payload, model: call.model,
    latencyMs: call.latencyMs, checks,
    usage: { used: used + 1, dailyBudget: state.dailyBudget },
    registry: AI_REGISTRY_VERSION
  };
}

/** Paged run history for the dashboard. Newest first. */
export async function listRuns(env, { moduleId = null, actor = null, limit = 100 } = {}) {
  await ensureAiTables(env);
  const cap = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : 100;
  const conds = [];
  const binds = [];
  if (moduleId) {
    conds.push('module_id = ?');
    binds.push(String(moduleId));
  }
  if (actor) {
    conds.push('actor = ?');
    binds.push(String(actor));
  }
  const sql = 'SELECT * FROM ai_runs' + (conds.length > 0 ? ' WHERE ' + conds.join(' AND ') : '') + ' ORDER BY created_at DESC LIMIT ?';
  binds.push(cap);
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return results || [];
}

/** 24h health per feature from the gateway's own telemetry table. */
export async function moduleHealth(env) {
  await ensureAiTables(env);
  const out = [];
  for (const mod of AI_MODULES) {
    const state = await moduleState(env, mod.id);
    const used = await todayUsage(env, mod.id);
    let calls24h = 0;
    let ok24h = 0;
    try {
      const row = await env.DB.prepare(
        "SELECT COUNT(*) AS n, COALESCE(SUM(ok), 0) AS o FROM llm_calls WHERE feature = ? AND created_at >= datetime('now', '-1 day')"
      ).bind(mod.feature).first();
      calls24h = Number((row && row.n) || 0);
      ok24h = Number((row && row.o) || 0);
    } catch { /* telemetry table may not exist yet — health reads zero, honestly */ }
    out.push({
      id: mod.id, feature: mod.feature, owner: mod.owner, purpose: mod.purpose,
      tier: mod.tier, route: mod.route,
      enabled: state.enabled, dailyBudget: state.dailyBudget,
      usedToday: used, calls24h, ok24h
    });
  }
  return out;
}
