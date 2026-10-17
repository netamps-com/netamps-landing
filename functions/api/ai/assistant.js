/**
 * POST /api/ai/assistant
 *
 * Unified NETAMPS AI assistant endpoint. Provides Llama-powered assistance
 * for all modules: login, track, returns, domain, ingest, module recovery.
 *
 * Auth: operator session (admin/staff only).
 * Body: { module, context, prompt }
 * Response: { success, response, model, latencyMs }
 */

import { verifySession } from '../intake/auth';
import { runJson } from '../llm/client.mjs';
import { aiAuthorized } from '../ai/registry.mjs';

const MODULE_PROMPTS = {
  login: `You are NETAMPS AI login assistant. Analyze login anomalies, security threats, and session issues. Provide actionable recommendations. Respond in JSON: {"analysis": "...", "recommendations": ["..."], "severity": "low|medium|high"}`,
  track: `You are NETAMPS AI track assistant. Help with tracking milestones, carrier status analysis, and delivery predictions. Respond in JSON: {"analysis": "...", "recommendations": ["..."], "status": "..."}`,
  returns: `You are NETAMPS AI returns assistant. Help with returns processing, price analysis, and negotiation suggestions. Respond in JSON: {"analysis": "...", "suggestions": ["..."], "priority": "low|medium|high"}`,
  domain: `You are NETAMPS AI domain assistant. Help with domain management, DNS configuration, and SSL/TLS analysis. Respond in JSON: {"analysis": "...", "recommendations": ["..."], "status": "..."}`,
  ingest: `You are NETAMPS AI ingest assistant. Analyze data ingestion statistics, detect anomalies, and provide trend analysis. Respond in JSON: {"summary": "...", "anomalies": ["..."], "trends": ["..."]}`,
  module_recovery: `You are NETAMPS AI module recovery assistant. Diagnose failed modules, provide recovery steps, and suggest self-healing actions. Respond in JSON: {"diagnosis": "...", "recovery_steps": ["..."], "severity": "low|medium|high"}`
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

export async function onRequestPost({ request, env }) {
  try {
    const user = await verifySession(env, request);
    if (!user) {
      return json({ success: false, message: 'Unauthorized' }, 401);
    }
    if (!aiAuthorized(user)) {
      return json({ success: false, message: 'Forbidden' }, 403);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ success: false, message: 'Invalid request body' }, 400);
    }

    const module = String(body.module || '').toLowerCase();
    const context = body.context && typeof body.context === 'object' ? body.context : {};
    const prompt = typeof body.prompt === 'string' ? body.prompt : '';

    if (!MODULE_PROMPTS[module]) {
      return json({ success: false, message: `Unknown module: ${module}. Supported: ${Object.keys(MODULE_PROMPTS).join(', ')}` }, 400);
    }

    const systemPrompt = MODULE_PROMPTS[module];
    const userPrompt = prompt ? `${prompt}\n\nContext: ${JSON.stringify(context)}` : `Analyze the following context: ${JSON.stringify(context)}`;

    const started = Date.now();
    const res = await runJson(env, {
      system: systemPrompt,
      user: userPrompt,
      tier: 'small',
      maxTokens: 512,
      temperature: 0.7,
      timeoutMs: 10000,
      feature: 'ai_assistant',
      promptVersion: 'netamps-ai-assistant-v1'
    });

    const latencyMs = Date.now() - started;

    if (!res.ok) {
      return json({ success: false, message: res.reason || 'AI unavailable', latencyMs }, 503);
    }

    return json({
      success: true,
      response: res.payload,
      model: res.model,
      latencyMs
    });
  } catch (err) {
    console.error('[ai/assistant] error:', err);
    return json({ success: false, message: 'AI assistant unavailable.' }, 500);
  }
}