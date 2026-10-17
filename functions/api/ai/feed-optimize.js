/**
 * POST /api/ai/feed-optimize — AI-optimizes feed item title and detail.
 *
 * Auth: requires a valid dashboard session.
 * Body: { title: string, detail: string }
 * Returns: { title: string, detail: string }
 *
 * Uses Workers AI (llama-3.1-8b) when env.AI is bound; falls back to
 * deterministic cleanup (trim, capitalize, truncate to limits) otherwise.
 */

import { verifySession } from '../intake/auth';

const MAX_TITLE = 140;
const MAX_DETAIL = 280;

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

    const rawTitle = typeof body.title === 'string' ? body.title : '';
    const rawDetail = typeof body.detail === 'string' ? body.detail : '';

    if (!rawTitle.trim()) {
      return json({ success: false, message: 'title is required.' }, 400);
    }

    let result;
    if (env && env.AI && typeof env.AI.run === 'function') {
      try {
        const prompt = `You are a concise B2B copy editor for an IT asset disposition (ITAD) company called Netamps. Optimize the following feed item title and detail for clarity, professionalism, and impact. Rules:
1. Title: max ${MAX_TITLE} chars, title case, no trailing period, punchy and specific.
2. Detail: max ${MAX_DETAIL} chars, 1-2 sentences, professional tone, include key facts.
3. Output ONLY valid JSON: {"title": "...", "detail": "..."}. No markdown, no explanation.

Input title: ${rawTitle}
Input detail: ${rawDetail}`;

        const aiResp = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
          prompt,
          max_tokens: 300,
          temperature: 0.3,
        });

        let parsed;
        try {
          const text = typeof aiResp.response === 'string' ? aiResp.response : String(aiResp.response ?? '');
          const start = text.indexOf('{');
          const end = text.lastIndexOf('}');
          if (start >= 0 && end > start) {
            parsed = JSON.parse(text.slice(start, end + 1));
          } else {
            parsed = JSON.parse(text);
          }
        } catch {
          parsed = null;
        }

        result = {
          title: typeof parsed?.title === 'string' ? parsed.title.trim() : rawTitle.trim(),
          detail: typeof parsed?.detail === 'string' ? parsed.detail.trim() : rawDetail.trim(),
        };
      } catch {
        result = deterministicOptimize(rawTitle, rawDetail);
      }
    } else {
      result = deterministicOptimize(rawTitle, rawDetail);
    }

    return json({
      success: true,
      title: clampTitle(result.title),
      detail: clampDetail(result.detail),
    });
  } catch (err) {
    console.error('[ai/feed-optimize] error:', err);
    return json({ success: false, message: 'AI optimization failed.' }, 500);
  }
}
