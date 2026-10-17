/**
 * POST /api/ai/feed-draft-ticker — AI-drafts a ticker flash from a tag.
 *
 * Auth: requires a valid dashboard session.
 * Body: { tag: string }
 * Returns: { text: string }
 *
 * Uses Workers AI (llama-3.1-8b) when env.AI is bound; falls back to
 * deterministic drafting (tag → short flash text) otherwise.
 */

import { verifySession } from '../intake/auth';

const MAX_TICKER_TEXT = 140;

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
  try {
    const user = await verifySession(env, request);
    if (!user) {
      return json({ success: false, message: 'Unauthorized' }, 401);
    }

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

    let result;
    if (env && env.AI && typeof env.AI.run === 'function') {
      try {
        const prompt = `Draft a short ticker flash (max ${MAX_TICKER_TEXT} chars) for a B2B IT asset disposition company called Netamps. The tag is: "${rawTag}". Rules:
1. Output ONLY the flash text, no quotes, no markdown, no explanation.
2. Max ${MAX_TICKER_TEXT} characters.
3. Professional, punchy, B2B tone.
4. Do not mention "AI" or "generated".

Tag: ${rawTag}`;

        const aiResp = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
          prompt,
          max_tokens: 100,
          temperature: 0.4,
        });

        const text = typeof aiResp.response === 'string' ? aiResp.response : String(aiResp.response ?? '');
        const cleaned = text.replace(/^["']|["']$/g, '').trim().split('\n')[0];
        result = clampTicker(cleaned) || deterministicDraft(rawTag);
      } catch {
        result = deterministicDraft(rawTag);
      }
    } else {
      result = deterministicDraft(rawTag);
    }

    return json({
      success: true,
      text: result,
    });
  } catch (err) {
    console.error('[ai/feed-draft-ticker] error:', err);
    return json({ success: false, message: 'AI draft failed.' }, 500);
  }
}
