import { verifySession } from './intake/auth';
import { corsJson, corsPreflight, applyCors } from '../_lib/cors.js';

/**
 * GET/POST /api/feed — curated signal feed config plus push channels.
 *
 * Runs on Cloudflare Pages Functions (Workers runtime). D1 table
 * feed_config holds one row (id='site'); without D1 or a saved row the
 * hardcoded defaults below are served.
 *
 * Auth posture: GET ?public=1 is open and returns only
 * enabled+items+updatedAt (never channels, secrets, rate or schema).
 * Every other read or write requires a session.
 *
 * Honesty contract: latency is only ever a measured fetch duration.
 * Nothing here fabricates telemetry.
 */

void applyCors;

const FEED_ROW_ID = 'site';
const MAX_ITEMS = 12;
const MAX_CHANNELS = 12;
const MAX_TITLE_LEN = 140;
const MAX_PAYLOAD_BYTES = 20 * 1024;
const PUSH_TIMEOUT_MS = 8000;

const CHANNEL_KINDS = new Set(['webhook', 'zapier', 'slack', 'custom']);

function defaultConfig() {
  return {
    enabled: true,
    items: [
      {
        id: 'feed-1',
        tag: 'Sourcing',
        title: 'Server lots moving this week',
        detail: 'Refurbished rack servers from decommissioned data centers.',
        href: '/services',
        ts: '2026-10-10T09:00:00Z'
      },
      {
        id: 'feed-2',
        tag: 'Buyback',
        title: 'We buy used networking gear',
        detail: 'Switches, routers and firewalls collected from your office.',
        href: '/services',
        ts: '2026-10-11T09:00:00Z'
      },
      {
        id: 'feed-3',
        tag: 'Refurb',
        title: 'Certified refurbished laptops in stock',
        detail: 'Graded, tested and covered by warranty before resale.',
        href: '/services',
        ts: '2026-10-12T09:00:00Z'
      },
      {
        id: 'feed-4',
        tag: 'Recycling',
        title: 'Certified e-waste disposal',
        detail: 'Compliant recycling with documentation for every pickup.',
        href: '/services',
        ts: '2026-10-13T09:00:00Z'
      }
    ],
    channels: [
      {
        id: 'ch-webhook',
        kind: 'webhook',
        label: 'Primary webhook',
        url: 'https://example.com/hooks/netamps-feed',
        enabled: false,
        secretHint: '****'
      },
      {
        id: 'ch-zapier',
        kind: 'zapier',
        label: 'Zapier catch hook',
        url: 'https://example.com/hooks/zapier-catch',
        enabled: false,
        secretHint: '****'
      },
      {
        id: 'ch-slack',
        kind: 'slack',
        label: 'Slack incoming webhook',
        url: 'https://example.com/hooks/slack-incoming',
        enabled: false,
        secretHint: '****'
      }
    ],
    rate: { perMinute: 60, burst: 10, retryMax: 3 },
    schema: {
      format: 'json',
      fields: [
        { key: 'title', source: 'item.title', required: true },
        { key: 'link', source: 'item.href', required: true },
        { key: 'summary', source: 'item.detail', required: false },
        { key: 'timestamp', source: 'item.ts', required: true }
      ]
    }
  };
}

// Pure validators (mirrored by local copies in tests/feed.test.mjs).
export function isHttpUrl(value) {
  return typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'));
}

export function clampInt(value, min, max, fallback) {
  const n = typeof value === 'number' ? value : parseInt(value, 10);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function statusClass(status) {
  if (Number.isInteger(status) && status >= 200 && status < 300) return 'ok';
  if (Number.isInteger(status) && status >= 400 && status < 500) return 'warn';
  if (Number.isInteger(status) && status >= 500 && status < 600) return 'error';
  return 'unknown';
}

async function ensureTable(env) {
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS feed_config (id TEXT PRIMARY KEY, data TEXT, updated_at TEXT)'
  ).run();
}

function mergeConfig(base, saved) {
  if (!saved || typeof saved !== 'object') return base;
  const out = { ...base };
  if (typeof saved.enabled === 'boolean') out.enabled = saved.enabled;
  if (Array.isArray(saved.items)) out.items = saved.items;
  if (Array.isArray(saved.channels)) out.channels = saved.channels;
  if (saved.rate && typeof saved.rate === 'object') out.rate = { ...base.rate, ...saved.rate };
  if (saved.schema && typeof saved.schema === 'object') {
    out.schema = { ...base.schema, ...saved.schema };
    if (Array.isArray(saved.schema.fields)) out.schema.fields = saved.schema.fields;
  }
  return out;
}

async function readConfig(env) {
  const base = defaultConfig();
  if (!env.DB || typeof env.DB.prepare !== 'function') return { config: base, updatedAt: null };
  try {
    await ensureTable(env);
    const row = await env.DB.prepare('SELECT data, updated_at FROM feed_config WHERE id = ?')
      .bind(FEED_ROW_ID).first();
    if (!row || typeof row.data !== 'string') return { config: base, updatedAt: null };
    let saved = null;
    try {
      saved = JSON.parse(row.data);
    } catch {
      return { config: base, updatedAt: null };
    }
    return {
      config: mergeConfig(base, saved),
      updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null
    };
  } catch {
    return { config: base, updatedAt: null };
  }
}

async function writeConfig(env, config) {
  await ensureTable(env);
  const updatedAt = new Date().toISOString();
  await env.DB.prepare('INSERT OR REPLACE INTO feed_config (id, data, updated_at) VALUES (?, ?, ?)')
    .bind(FEED_ROW_ID, JSON.stringify(config), updatedAt).run();
  return updatedAt;
}

function str(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function sanitizeConfig(input) {
  return {
    enabled: input.enabled === true,
    items: input.items.map((it) => ({
      id: str(it.id, 64),
      tag: str(it.tag, 40),
      title: str(it.title, MAX_TITLE_LEN),
      detail: str(it.detail, 280),
      href: str(it.href, 500),
      ts: str(it.ts, 64)
    })),
    channels: input.channels.map((ch) => ({
      id: str(ch.id, 64),
      kind: ch.kind,
      label: str(ch.label, 120),
      url: str(ch.url, 2000),
      enabled: ch.enabled === true,
      secretHint: str(ch.secretHint, 32)
    })),
    rate: {
      perMinute: clampInt(input.rate.perMinute, 1, 10000, 60),
      burst: clampInt(input.rate.burst, 1, 1000, 10),
      retryMax: clampInt(input.rate.retryMax, 0, 10, 3)
    },
    schema: {
      format: input.schema.format,
      fields: input.schema.fields.map((f) => ({
        key: str(f.key, 64),
        source: str(f.source, 120),
        required: f.required === true
      }))
    }
  };
}

function validateSave(input) {
  if (!input || typeof input !== 'object') return 'Config object is required.';
  if (typeof input.enabled !== 'boolean') return 'enabled must be a boolean.';
  if (!Array.isArray(input.items) || input.items.length > MAX_ITEMS) {
    return 'items must be an array of at most 12 entries.';
  }
  for (const it of input.items) {
    if (!it || typeof it !== 'object') return 'Each item must be an object.';
    if (typeof it.title !== 'string' || it.title.length === 0 || it.title.length > MAX_TITLE_LEN) {
      return 'Each item title must be 1-140 characters.';
    }
  }
  if (!Array.isArray(input.channels) || input.channels.length > MAX_CHANNELS) {
    return 'channels must be an array of at most 12 entries.';
  }
  for (const ch of input.channels) {
    if (!ch || typeof ch !== 'object') return 'Each channel must be an object.';
    if (!CHANNEL_KINDS.has(ch.kind)) return 'Channel kind must be webhook, zapier, slack or custom.';
    if (!isHttpUrl(ch.url)) return 'Channel url must start with http:// or https://.';
  }
  const rate = input.rate;
  if (!rate || typeof rate !== 'object') return 'rate is required.';
  if (!Number.isInteger(rate.perMinute) || rate.perMinute < 1 || rate.perMinute > 10000) {
    return 'rate.perMinute must be 1-10000.';
  }
  if (!Number.isInteger(rate.burst) || rate.burst < 1 || rate.burst > 1000) {
    return 'rate.burst must be 1-1000.';
  }
  if (!Number.isInteger(rate.retryMax) || rate.retryMax < 0 || rate.retryMax > 10) {
    return 'rate.retryMax must be 0-10.';
  }
  const schema = input.schema;
  if (!schema || typeof schema !== 'object') return 'schema is required.';
  if (schema.format !== 'json' && schema.format !== 'xml') return 'schema.format must be json or xml.';
  if (!Array.isArray(schema.fields)) return 'schema.fields must be an array.';
  for (const f of schema.fields) {
    if (!f || typeof f !== 'object' || typeof f.key !== 'string' ||
        typeof f.source !== 'string' || typeof f.required !== 'boolean') {
      return 'Each schema field needs key, source and required.';
    }
  }
  return null;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const isPublicRead = url.searchParams.get('public') === '1';

  if (request.method === 'OPTIONS') {
    return corsPreflight(request, env, isPublicRead ? { public: true, methods: 'GET', maxAge: 60 } : {});
  }

  if (request.method === 'GET') {
    if (isPublicRead) {
      const { config, updatedAt } = await readConfig(env);
      return corsJson(request, env,
        { success: true, enabled: config.enabled, items: config.items, updatedAt },
        200, { public: true, methods: 'GET', maxAge: 60 });
    }
    const user = await verifySession(env, request);
    if (!user) return corsJson(request, env, { success: false, message: 'Unauthorized' }, 401);
    const { config, updatedAt } = await readConfig(env);
    return corsJson(request, env, { success: true, config: { ...config, updatedAt } });
  }

  if (request.method === 'POST') {
    const user = await verifySession(env, request);
    if (!user) return corsJson(request, env, { success: false, message: 'Unauthorized' }, 401);
    let body = null;
    try {
      body = await request.json();
    } catch {
      return corsJson(request, env, { success: false, message: 'Invalid request body' }, 400);
    }
    const action = body && body.action;

    if (action === 'save') {
      const invalid = validateSave(body.config);
      if (invalid) return corsJson(request, env, { success: false, message: invalid }, 400);
      if (!env.DB || typeof env.DB.prepare !== 'function') {
        return corsJson(request, env, { success: false, message: 'Config store misconfigured.' }, 503);
      }
      try {
        const clean = sanitizeConfig(body.config);
        const updatedAt = await writeConfig(env, clean);
        return corsJson(request, env, { success: true, config: { ...clean, updatedAt } });
      } catch {
        return corsJson(request, env, { success: false, message: 'Failed to save feed config.' }, 500);
      }
    }

    if (action === 'rotate-secret') {
      // Issued once to the caller; never persisted server-side.
      const secret = 'fsk_' + crypto.randomUUID().replace(/-/g, '');
      return corsJson(request, env, { success: true, secret });
    }

    if (action === 'test-push') {
      const channelId = typeof body.channelId === 'string' ? body.channelId : '';
      const { config } = await readConfig(env);
      const channel = (config.channels || []).find((c) => c && c.id === channelId);
      if (!channel || channel.enabled !== true) {
        return corsJson(request, env, { success: false, message: 'Channel not found or disabled.' }, 400);
      }
      let payloadText = 'null';
      try {
        payloadText = JSON.stringify(body.payload === undefined ? {} : body.payload);
      } catch {
        return corsJson(request, env, { success: false, message: 'Payload is not serializable.' }, 400);
      }
      if (payloadText.length > MAX_PAYLOAD_BYTES) {
        return corsJson(request, env, { success: false, message: 'Payload exceeds 20KB cap.' }, 400);
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), PUSH_TIMEOUT_MS);
      const start = Date.now();
      try {
        const res = await fetch(channel.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Netamps-Feed-Test': '1' },
          body: payloadText,
          signal: ctrl.signal
        });
        const latencyMs = Date.now() - start;
        const ok = statusClass(res.status) === 'ok';
        return corsJson(request, env, { success: ok, status: res.status, latencyMs, ok });
      } catch {
        return corsJson(request, env,
          { success: false, status: 0, latencyMs: Date.now() - start, ok: false, message: 'Push failed.' });
      } finally {
        clearTimeout(timer);
      }
    }

    return corsJson(request, env, { success: false, message: 'Unknown action.' }, 400);
  }

  return corsJson(request, env, { success: false, message: 'Method not allowed' }, 405);
}
