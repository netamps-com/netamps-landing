/**
 * Shared Workers AI gateway — the ONE place model calls happen.
 *
 * Named `.mjs` because it IS an ES module: the extension lets the Node test
 * harnesses import the real gateway instead of a stand-in for it, and it is
 * what the bundler already assumed. Callers import `'../llm/client.mjs'`.
 *
 * Why this module exists:
 *   Before it, both `normalize/line.js` and `products/enrich.js` each carried
 *   their own copy of the model constants and their own escalation loop, and a
 *   third consumer (BUY→SELL best-match ranking) was about to add a fourth.
 *   Three copies of "how we call Llama" is three places for model names,
 *   escalation, timeout and telemetry to drift. This centralises all of it.
 *
 * CONTRACT (do not violate — the safety properties depend on it):
 *   - The gateway NEVER trusts model output. It returns raw parsed JSON only;
 *     every caller runs its own validator/grounding before using a value.
 *   - A failure is always a soft failure: `{ ok:false, reason }`. A missing
 *     binding, a timeout, or a bad model day can never throw into a request
 *     path or a `waitUntil` job.
 *   - Deterministic-first is the CALLER's job. This module has no opinion on
 *     when to call; features gate themselves (norm_enabled, enrich_enabled,
 *     candidates_enabled).
 *   - `llm_enabled` is an EMERGENCY BRAKE (default ON, i.e. absent = enabled).
 *     It can only ever *stop* calls; absence can never accidentally start one.
 *
 * The model identities live here and only here. Verified against the live
 * Workers AI catalogue 2026-10-14; the unsuffixed `llama-3.1-8b-instruct` was
 * deprecated (error 5028) and `llama-3.3-70b-instruct` never existed (5007).
 */

export const LLM_GATEWAY_VERSION = 'llm-gw-v1';

export const MODEL_SMALL = '@cf/meta/llama-3.1-8b-instruct-fp8';
export const MODEL_LARGE = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

const DEFAULT_TIMEOUT_MS = 20000;

let llmTablesReady = false;

export async function ensureLlmTables(env) {
  if (!env?.DB || typeof env.DB.prepare !== 'function') return;
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS llm_calls (' +
      'id TEXT PRIMARY KEY,' +
      'feature TEXT,' +
      'model TEXT,' +
      'ok INTEGER,' +
      'reason TEXT,' +
      'latency_ms INTEGER,' +
      'prompt_version TEXT,' +
      'created_at TEXT' +
    ')'
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_llm_calls_feature ON llm_calls(feature, created_at)'
  ).run();
  llmTablesReady = true;
}

/**
 * Emergency global kill switch. Default ON.
 * Returns false ONLY when `match_meta.llm_enabled` is exactly '0'.
 * A missing DB or missing row means enabled — absence is never a reason to
 * silently disable every model-backed feature.
 */
export async function llmEnabled(env) {
  if (!env?.DB || typeof env.DB.prepare !== 'function') return true;
  try {
    const row = await env.DB
      .prepare("SELECT value FROM match_meta WHERE key = 'llm_enabled'")
      .bind()
      .first();
    return !row || row.value !== '0';
  } catch {
    return true;
  }
}

function withTimeout(promise, ms) {
  if (!ms || ms <= 0) return promise;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('LLM_TIMEOUT')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function logLlmCall(env, rec) {
  // Telemetry is best-effort: it must never fail or delay a model call.
  if (!env?.DB || typeof env.DB.prepare !== 'function') return;
  try {
    if (!llmTablesReady) await ensureLlmTables(env);
    await env.DB.prepare(
      'INSERT INTO llm_calls (id, feature, model, ok, reason, latency_ms, prompt_version, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)'
    ).bind(
      (crypto?.randomUUID ? crypto.randomUUID() : `llm-${Date.now()}-${Math.random().toString(16).slice(2)}`),
      String(rec.feature || 'unknown').slice(0, 64),
      rec.model ? String(rec.model).slice(0, 96) : null,
      rec.ok ? 1 : 0,
      rec.reason ? String(rec.reason).slice(0, 64) : null,
      Number.isFinite(rec.latencyMs) ? Math.round(rec.latencyMs) : null,
      rec.promptVersion ? String(rec.promptVersion).slice(0, 64) : null,
      new Date().toISOString()
    ).run();
  } catch {
    /* swallow — telemetry is never load-bearing */
  }
}

/**
 * Call a Workers AI chat model and return parsed JSON.
 *
 * @param {object} env
 * @param {object} opts
 * @param {string} opts.system       system prompt
 * @param {string} opts.user         user prompt
 * @param {number} [opts.maxTokens]  default 400
 * @param {number} [opts.temperature] when omitted the model default applies
 *                                    (kept omitted so existing callers are
 *                                    byte-for-byte unchanged)
 * @param {'auto'|'small'|'large'} [opts.tier] 'auto' = small→large escalation,
 *   'small' = fast model only (typeahead / extraction: answer fast or not at
 *   all — a second 70B attempt on a keystroke path is latency, not quality),
 *   'large' = large model only
 * @param {number} [opts.timeoutMs]
 * @param {string} [opts.feature]     telemetry label
 * @param {string} [opts.promptVersion]
 * @returns {Promise<{ok:boolean, payload?:object, model?:string, reason?:string, latencyMs?:number}>}
 */
export async function runJson(env, {
  system,
  user,
  maxTokens = 400,
  temperature,
  tier = 'auto',
  timeoutMs = DEFAULT_TIMEOUT_MS,
  feature = 'unknown',
  promptVersion = null,
} = {}) {
  if (!env?.AI || typeof env.AI.run !== 'function') {
    return { ok: false, reason: 'NO_AI_BINDING' };
  }
  if (!(await llmEnabled(env))) {
    return { ok: false, reason: 'LLM_DISABLED' };
  }

  // 'small' is a real tier, not an alias: callers on a latency budget (the
  // typeahead refine pass, track extraction) must never pay for a second 70B
  // attempt. 'auto' keeps its historical small→large escalation byte-for-byte.
  const models = tier === 'large'
    ? [MODEL_LARGE]
    : tier === 'small'
      ? [MODEL_SMALL]
      : [MODEL_SMALL, MODEL_LARGE];
  const started = Date.now();

  for (const model of models) {
    try {
      const params = {
        messages: [
          { role: 'system', content: String(system || 'You output only JSON.') },
          { role: 'user', content: String(user || '') },
        ],
        response_format: { type: 'json_object' },
        max_tokens: maxTokens,
      };
      // Only set temperature when the caller asks: preserves the exact
      // request shape existing callers used before this gateway existed.
      if (temperature !== undefined) params.temperature = temperature;

      const res = await withTimeout(env.AI.run(model, params), timeoutMs);
      const text = typeof res?.response === 'string' ? res.response : '';
      if (!text) continue;

      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        continue; // escalate to the larger model on malformed JSON
      }

      const latencyMs = Date.now() - started;
      logLlmCall(env, { feature, model, ok: true, latencyMs, promptVersion });
      return { ok: true, payload: parsed, model, latencyMs };
    } catch (err) {
      console.error('[llm] model call failed', feature, model, err?.message);
      continue;
    }
  }

  const latencyMs = Date.now() - started;
  logLlmCall(env, { feature, ok: false, reason: 'MODEL_FAILED', latencyMs, promptVersion });
  return { ok: false, reason: 'MODEL_FAILED', latencyMs };
}
