/**
 * POST /api/inventory-ai — LLM layer for the IMS dashboard (Llama via runJson).
 *
 * Actions: restock-advisor, anomaly-detect, nlq.
 * Auth: session required (401) before anything else. The LLM emergency brake
 * (llmEnabled) is checked -> 403 before any runJson call. Gateway failures
 * degrade to computed fallbacks; these endpoints never hard-fail on model
 * errors. Audit inserts into ims_audit are best-effort.
 */

import { verifySession } from './intake/auth';
import { runJson, llmEnabled, MODEL_SMALL } from './llm/client.mjs';
import { corsJson, corsPreflight } from '../_lib/cors.js';
import { ensureTables, readBalance, logEvent } from './inventory';

void corsPreflight;
void MODEL_SMALL;

const MAX_RESTOCK_ITEMS = 12;
const MAX_QUERY_LEN = 400;
const PRIORITIES = new Set(['high', 'medium', 'low']);

function aiSummary(started, result) {
  const latencyMs = result && Number.isFinite(result.latencyMs) ? result.latencyMs : Date.now() - started;
  return { latencyMs, model: result && result.model };
}

async function restockFallback(restock) {
  return restock.map((r) => ({
    sku: r.sku,
    reason: `On hand ${r.stock_on_hand} is at/below reorder trigger ${r.reorder_trigger_level}; order ${Math.max(0, r.target_max_inventory - r.stock_on_hand)} to reach target ${r.target_max_inventory}.`,
    priority: r.stock_on_hand === 0 || r.stock_on_hand <= r.reorder_trigger_level / 2 ? 'high' : 'medium'
  }));
}

async function handleRestockAdvisor(request, env, started) {
  let rows = [];
  try {
    rows = await readBalance(env);
  } catch {
    rows = [];
  }
  const restock = rows.filter((r) => r.status === 'RESTOCK REQUIRED').slice(0, MAX_RESTOCK_ITEMS);
  const summary = restock.map((r) => ({
    sku: r.sku, name: r.item_name, supplier: r.supplier_name || '',
    on_hand: r.stock_on_hand, trigger: r.reorder_trigger_level,
    target_max: r.target_max_inventory,
    recommended_qty: Math.max(0, r.target_max_inventory - r.stock_on_hand)
  }));

  const system = 'You are a senior inventory planner. Return JSON only: { "recommendations": [{ "sku": string, "reason": string, "priority": "high"|"medium"|"low" }] }. Ground every reason in the on_hand / trigger / target_max / recommended_qty numbers. Do not recommend SKUs not in the list.';
  const user = JSON.stringify({ restock_items: summary });

  let recommendations = null;
  let source = 'model';
  let latencyMs = null;
  let modelUsed = null;
  try {
    const result = await runJson(env, {
      system, user, maxTokens: 700, temperature: 0.2,
      tier: 'auto', feature: 'inventory-restock', promptVersion: 'inventory-restock-v1'
    });
    const measured = aiSummary(started, result);
    latencyMs = measured.latencyMs;
    modelUsed = measured.model;
    if (result.ok && result.payload && Array.isArray(result.payload.recommendations)) {
      recommendations = result.payload.recommendations
        .filter((rec) => rec && typeof rec.sku === 'string' && typeof rec.reason === 'string' && PRIORITIES.has(rec.priority))
        .map((rec) => ({
          sku: String(rec.sku).slice(0, 64),
          reason: String(rec.reason).slice(0, 300),
          priority: rec.priority
        }));
    }
  } catch {
    recommendations = null;
  }
  if (!recommendations) {
    source = 'fallback';
    recommendations = await restockFallback(restock);
  }

  try {
    await logEvent(env, {
      kind: 'ims_ai_restock_advisor', channel: 'inventory-ai', status: 200,
      latency_ms: latencyMs, bytes: 0,
      payload: JSON.stringify({ source, count: recommendations.length, model: modelUsed })
    });
  } catch {
    // Audit is best-effort.
  }

  return corsJson(request, env, { success: true, advisory: { source, recommendations } });
}

async function handleAnomalyDetect(request, env, started) {
  let flagged = [];
  try {
    const res = await env.DB.prepare(`
      SELECT sku, day, qty, avg7 FROM (
        SELECT sku, day, qty,
          AVG(qty) OVER (PARTITION BY sku ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS avg7
        FROM (
          SELECT sku, strftime('%Y-%m-%d', created_at) AS day, SUM(qty) AS qty
          FROM ims_stock_out
          WHERE created_at >= datetime('now', '-30 days')
          GROUP BY sku, day
        )
      )
      WHERE qty > 3 * avg7
      ORDER BY (qty - 3 * avg7) DESC, sku, day
      LIMIT 20
    `).all();
    flagged = (res && Array.isArray(res.results) ? res.results : []).map((r) => ({
      sku: typeof r.sku === 'string' ? r.sku : '',
      day: typeof r.day === 'string' ? r.day : '',
      qty: Number.isFinite(Number(r.qty)) ? Number(r.qty) : 0,
      avg7: Number.isFinite(Number(r.avg7)) ? Number(r.avg7) : 0
    }));
  } catch {
    flagged = [];
  }

  const bySkuDay = new Map(flagged.map((f) => [`${f.sku}|${f.day}`, f]));

  let anomalies = null;
  let source = 'model';
  let latencyMs = null;
  let modelUsed = null;
  try {
    const result = await runJson(env, {
      system: 'You are an inventory analyst. Return JSON only: { "anomalies": [{ "sku": string, "day": string, "explanation": string }] }. Explain each flagged stock-out spike concisely using only the provided qty and avg7 numbers.',
      user: JSON.stringify({ flagged_anomalies: flagged }),
      maxTokens: 700, temperature: 0.2,
      tier: 'auto', feature: 'inventory-anomaly', promptVersion: 'inventory-anomaly-v1'
    });
    const measured = aiSummary(started, result);
    latencyMs = measured.latencyMs;
    modelUsed = measured.model;
    if (result.ok && result.payload && Array.isArray(result.payload.anomalies)) {
      anomalies = result.payload.anomalies
        .filter((a) => a && typeof a.sku === 'string' && typeof a.day === 'string' && typeof a.explanation === 'string')
        .map((a) => ({
          sku: String(a.sku).slice(0, 64),
          day: String(a.day).slice(0, 16),
          explanation: String(a.explanation).slice(0, 300)
        }));
    }
  } catch {
    anomalies = null;
  }
  if (!anomalies) {
    source = 'fallback';
    anomalies = flagged.map((f) => ({
      sku: f.sku, day: f.day,
      explanation: `Single-day stock-out of ${f.qty} on ${f.day} exceeds 3x the 7-day average of ${f.avg7.toFixed(1)}.`
    }));
  }
  anomalies = anomalies.map((a) => {
    const f = bySkuDay.get(`${a.sku}|${a.day}`);
    return {
      sku: a.sku, day: a.day,
      qty: f ? f.qty : 0,
      avg7: f ? f.avg7 : 0,
      explanation: a.explanation || `Outflow spike for ${a.sku} on ${a.day}.`
    };
  });

  try {
    await logEvent(env, {
      kind: 'ims_ai_anomaly_detect', channel: 'inventory-ai', status: 200,
      latency_ms: latencyMs, bytes: 0,
      payload: JSON.stringify({ source, count: anomalies.length, model: modelUsed })
    });
  } catch {
    // Audit is best-effort.
  }

  return corsJson(request, env, { success: true, anomalies });
}

async function handleNlq(request, env, started, body) {
  const { query } = body;
  if (typeof query !== 'string' || query.length === 0 || query.length > MAX_QUERY_LEN) {
    return corsJson(request, env, { success: false, message: 'query must be 1-400 characters.' }, 400);
  }

  let rows = [];
  try {
    rows = await readBalance(env);
  } catch {
    rows = [];
  }
  const top = rows.slice(0, 20);
  const lines = top.map((r) => [
    `sku: ${r.sku}`, `name: ${r.item_name}`, `category: ${r.category}`, `uom: ${r.uom}`,
    `on_hand: ${r.stock_on_hand}`, `cost_price_cents: ${r.cost_price_cents}`,
    `selling_price_cents: ${r.selling_price_cents}`, `supplier: ${r.supplier_name || ''}`,
    `reorder_trigger: ${r.reorder_trigger_level}`, `target_max: ${r.target_max_inventory}`,
    `status: ${r.status}`
  ].join('; '));
  const context = lines.length > 0 ? lines.join('\n') : '(no inventory data)';

  const system = 'Return JSON only: { "answer": string }. Answer the question using ONLY the provided inventory context. Do not use outside knowledge or guess. If the answer is not present in the context, say exactly "I don\'t have that data". Keep the answer short.';
  const user = `Inventory context (top 20 SKUs by name):\n${context}\n\nQuestion: ${query}`;

  let answer = null;
  let source = 'model';
  let latencyMs = null;
  let modelUsed = null;
  try {
    const result = await runJson(env, {
      system, user, maxTokens: 400, temperature: 0.2,
      tier: 'auto', feature: 'inventory-nlq', promptVersion: 'inventory-nlq-v1'
    });
    const measured = aiSummary(started, result);
    latencyMs = measured.latencyMs;
    modelUsed = measured.model;
    if (result.ok && result.payload && typeof result.payload.answer === 'string' && result.payload.answer.length > 0) {
      answer = result.payload.answer;
    }
  } catch {
    answer = null;
  }
  if (answer === null) {
    source = 'fallback';
    answer = 'AI advisory is unavailable. Please try again later.';
  }

  try {
    await logEvent(env, {
      kind: 'ims_ai_nlq', channel: 'inventory-ai', status: 200,
      latency_ms: latencyMs, bytes: new TextEncoder().encode(answer).length,
      payload: JSON.stringify({ source, query: query.slice(0, 400), model: modelUsed })
    });
  } catch {
    // Audit is best-effort.
  }

  return corsJson(request, env, { success: true, answer });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return corsPreflight(request, env, {});
  }

  const user = await verifySession(env, request);
  if (!user) {
    return corsJson(request, env, { success: false, message: 'Unauthorized' }, 401);
  }

  if (request.method !== 'POST') {
    return corsJson(request, env, { success: false, message: 'Method not allowed' }, 405);
  }

  if (!await llmEnabled(env)) {
    return corsJson(request, env, { success: false, message: 'LLM emergency brake engaged.' }, 403);
  }

  if (!env?.DB || typeof env.DB.prepare !== 'function') {
    return corsJson(request, env, { success: false, message: 'Database unavailable.' }, 503);
  }
  await ensureTables(env);

  const started = Date.now();
  let body = null;
  try {
    body = await request.json();
  } catch {
    return corsJson(request, env, { success: false, message: 'Invalid request body' }, 400);
  }
  const action = body && typeof body === 'object' ? body.action : null;

  if (action === 'restock-advisor') {
    return handleRestockAdvisor(request, env, started);
  }
  if (action === 'anomaly-detect') {
    return handleAnomalyDetect(request, env, started);
  }
  if (action === 'nlq') {
    return handleNlq(request, env, started, body);
  }
  return corsJson(request, env, { success: false, message: 'Unknown action.' }, 400);
}
