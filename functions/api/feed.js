import { verifySession } from './intake/auth';
import { corsJson as baseCorsJson, corsPreflight, applyCors } from '../_lib/cors.js';

/**
 * GET/POST /api/feed — curated signal feed plus ticker and push channels.
 *
 * D1 tables (created via ensureTables):
 * - feed_config holds one row (id='site') with ONLY {enabled, scroll, channels, rate, schema}.
 * - feed_items holds curated cards ordered by sort.
 * - feed_ticker holds scrolling flashes ordered by sort.
 * - feed_events holds capped telemetry (500 rows).
 *
 * Auth: GET ?public=1 is open and returns only enabled+scroll+items+ticker+updatedAt.
 * Every other read or write requires a session.
 *
 * Honesty contract: latency is only ever a measured fetch duration.
 *
 * Expiry contract: an item/ticker `ts` is a display-until date in any
 * standard format (ISO, RFC, YYYY-MM-DD, DD/MM/YYYY). Unparseable or empty
 * means no expiry (always shown). The PUBLIC read hides expired rows; the
 * authed read returns everything so operators can re-date them.
 */

void applyCors;

/**
 * Every authed feed response carries operator-curated data, so nothing the
 * dashboard reads or writes may be stored — not by the browser, not by an
 * intermediate cache. Without an explicit Cache-Control the browser applies
 * heuristic freshness and an edge cache can hold a response indefinitely,
 * which is exactly the "I saved a change and the landing feed didn't update"
 * failure. Wrapping the shared helper once here beats sprinkling a header
 * across ~35 call sites; the public read opts back into a short window.
 */
const corsJson = (request, env, body, status = 200, opts = {}) =>
  baseCorsJson(request, env, body, status, { cacheControl: 'no-store', ...opts });

// Public read freshness: an edge may cache it briefly, but never long enough
// for a saved change to look stuck. The client revalidates on the same cadence.
const PUBLIC_CACHE = 'public, max-age=30, stale-while-revalidate=60';

const FEED_ROW_ID = 'site';
const MAX_ITEMS = 12;
const MAX_TICKER = 24;
const MAX_CHANNELS = 12;
const MAX_TITLE_LEN = 140;
const MAX_PAYLOAD_BYTES = 20 * 1024;
const PUSH_TIMEOUT_MS = 8000;

const CHANNEL_KINDS = new Set(['webhook', 'zapier', 'slack', 'custom']);
const MEDIA_KINDS = new Set(['none', 'image', 'video', 'file']);

// Tolerant display-until parser. Numeric D/M/Y forms (slashes or dashes,
// optional time) read day-first per Indian convention; everything else goes
// through Date.parse (ISO, RFC, YYYY-MM-DD). A day-first match with an
// impossible month (e.g. 10/13/2026) falls through to Date.parse, which
// reads it US-style. Returns epoch ms, or NaN when nothing parses.
export function parseFeedDate(value) {
  if (typeof value !== 'string') return NaN;
  const v = value.trim();
  if (!v) return NaN;
  const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(v);
  if (m) {
    const dd = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const yyyy = parseInt(m[3], 10);
    const hh = m[4] === undefined ? 0 : parseInt(m[4], 10);
    const mi = m[5] === undefined ? 0 : parseInt(m[5], 10);
    const ss = m[6] === undefined ? 0 : parseInt(m[6], 10);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && hh <= 23 && mi <= 59 && ss <= 59) {
      return new Date(yyyy, mm - 1, dd, hh, mi, ss).getTime();
    }
  }
  const native = Date.parse(v);
  return Number.isFinite(native) ? native : NaN;
}

// Expired = parseable date at or before now. Empty/garbage never expires:
// a missing date must not hide content.
export function isExpired(ts, nowMs) {
  const ms = parseFeedDate(ts);
  if (!Number.isFinite(ms)) return false;
  const now = nowMs === undefined ? Date.now() : nowMs;
  return ms <= now;
}

function defaultConfig() {
  return {
    enabled: true,
    scroll: true,
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

function defaultItems() {
  return [
    {
      id: 'feed-1',
      tag: 'ITAD Pickup',
      title: 'Enterprise decommission drive completed in Whitefield',
      detail: '214 assets collected with chain-of-custody manifest; data erasure certificates issued per NIST SP 800-88.',
      href: 'https://netamps.com/returns',
      media_kind: 'none',
      media_url: '',
      ts: ''
    },
    {
      id: 'feed-2',
      tag: 'Buyback',
      title: 'Fresh buyback offers open for networking hardware',
      detail: 'Catalyst switches, routers and firewalls evaluated within 48 hours of request approval.',
      href: 'https://netamps.com/returns',
      media_kind: 'none',
      media_url: '',
      ts: ''
    },
    {
      id: 'feed-3',
      tag: 'Refurb Stock',
      title: 'Certified refurbished ThinkPad lot graded and listed',
      detail: '42 units tested, data-wiped and warranty-tagged; bulk pricing available on request.',
      href: 'https://netamps.com/returns',
      media_kind: 'none',
      media_url: '',
      ts: ''
    },
    {
      id: 'feed-4',
      tag: 'Advisory',
      title: 'Track your request live with milestone updates',
      detail: 'Every pickup and evaluation now posts timestamped milestones to your tracking page.',
      href: 'https://netamps.com/track',
      media_kind: 'none',
      media_url: '',
      ts: ''
    }
  ];
}

function defaultTicker() {
  return [
    {
      id: 'tick-1',
      tag: 'ITAD',
      text: 'Enterprise pickups with chain-of-custody manifests',
      url: 'https://netamps.com/returns',
      ts: '',
      enabled: 1
    },
    {
      id: 'tick-2',
      tag: 'Buyback',
      text: 'Fresh buyback offers open for networking hardware',
      url: 'https://netamps.com/returns',
      ts: '',
      enabled: 1
    },
    {
      id: 'tick-3',
      tag: 'Tracking',
      text: 'Track your request live with milestone updates',
      url: 'https://netamps.com/track',
      ts: '',
      enabled: 1
    }
  ];
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

function hasDb(env) {
  return !!(env && env.DB && typeof env.DB.prepare === 'function');
}

function str(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

async function ensureTables(env) {
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS feed_config (id TEXT PRIMARY KEY, data TEXT, updated_at TEXT)'
  ).run();
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS feed_items (id TEXT PRIMARY KEY, tag TEXT, title TEXT, detail TEXT, href TEXT, media_kind TEXT, media_url TEXT, ts TEXT, sort INTEGER NOT NULL DEFAULT 0, created_at TEXT, updated_at TEXT)'
  ).run();
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS feed_ticker (id TEXT PRIMARY KEY, tag TEXT, text TEXT, url TEXT, enabled INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0, created_at TEXT)'
  ).run();
  // Ticker expiry column for tables created before display-until dates.
  try {
    await env.DB.prepare('ALTER TABLE feed_ticker ADD COLUMN ts TEXT').run();
  } catch {
    // Duplicate-column error means the column already exists.
  }
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS feed_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, channel TEXT, status INTEGER, latency_ms INTEGER, bytes INTEGER, payload TEXT)'
  ).run();
}

function mergeConfig(base, saved) {
  if (!saved || typeof saved !== 'object') return base;
  const out = { ...base };
  if (typeof saved.enabled === 'boolean') out.enabled = saved.enabled;
  if (typeof saved.scroll === 'boolean') out.scroll = saved.scroll;
  if (Array.isArray(saved.channels)) out.channels = saved.channels;
  if (saved.rate && typeof saved.rate === 'object') out.rate = { ...base.rate, ...saved.rate };
  if (saved.schema && typeof saved.schema === 'object') {
    out.schema = { ...base.schema, ...saved.schema };
    if (Array.isArray(saved.schema.fields)) out.schema.fields = saved.schema.fields;
  }
  return out;
}

function mapItemRow(row) {
  return {
    id: typeof row.id === 'string' ? row.id : '',
    tag: typeof row.tag === 'string' ? row.tag : '',
    title: typeof row.title === 'string' ? row.title : '',
    detail: typeof row.detail === 'string' ? row.detail : '',
    href: typeof row.href === 'string' ? row.href : '',
    media_kind: typeof row.media_kind === 'string' && MEDIA_KINDS.has(row.media_kind) ? row.media_kind : 'none',
    media_url: typeof row.media_url === 'string' ? row.media_url : '',
    ts: typeof row.ts === 'string' ? row.ts : ''
  };
}

function mapTickerRow(row) {
  return {
    id: typeof row.id === 'string' ? row.id : '',
    tag: typeof row.tag === 'string' ? row.tag : '',
    text: typeof row.text === 'string' ? row.text : '',
    url: typeof row.url === 'string' ? row.url : '',
    ts: typeof row.ts === 'string' ? row.ts : '',
    enabled: row.enabled === false || row.enabled === 0 ? 0 : 1
  };
}

function sanitizeItem(it, index) {
  const kind = MEDIA_KINDS.has(it && it.media_kind) ? it.media_kind : 'none';
  return {
    id: str(it && it.id, 64) || `feed-${index + 1}`,
    tag: str(it && it.tag, 40),
    title: str(it && it.title, MAX_TITLE_LEN),
    detail: str(it && it.detail, 280),
    href: str(it && it.href, 500),
    media_kind: kind,
    media_url: kind === 'none' ? '' : (isHttpUrl(it && it.media_url) ? str(it.media_url, 2000) : ''),
    ts: str(it && it.ts, 64)
  };
}

function sanitizeItemsArray(items) {
  const seen = new Set();
  const stamp = Date.now().toString(36);
  return items.map((it, idx) => {
    const s = sanitizeItem(it, idx);
    if (!s.id || seen.has(s.id)) s.id = `feed-${idx + 1}-${stamp}`;
    seen.add(s.id);
    return s;
  });
}

function sanitizeTickerEntry(t, index) {
  const enabled = (t && (t.enabled === false || t.enabled === 0 || t.enabled === 'false' || t.enabled === '0')) ? 0 : 1;
  return {
    id: str(t && t.id, 64) || `tick-${index + 1}`,
    tag: str(t && t.tag, 40),
    text: str(t && t.text, 140),
    url: str(t && t.url, 500),
    ts: str(t && t.ts, 64),
    enabled
  };
}

function sanitizeTickerArray(ticker) {
  const seen = new Set();
  const stamp = Date.now().toString(36);
  return ticker.map((t, idx) => {
    const s = sanitizeTickerEntry(t, idx);
    if (!s.id || seen.has(s.id)) s.id = `tick-${idx + 1}-${stamp}`;
    seen.add(s.id);
    return s;
  });
}

function sanitizeConfig(input) {
  return {
    enabled: input.enabled === true,
    scroll: input.scroll !== false,
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

function validateConfig(input) {
  if (!input || typeof input !== 'object') return 'Config object is required.';
  if (typeof input.enabled !== 'boolean') return 'enabled must be a boolean.';
  if (input.scroll !== undefined && typeof input.scroll !== 'boolean') return 'scroll must be a boolean.';
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

function validateItems(items) {
  if (!Array.isArray(items) || items.length > MAX_ITEMS) {
    return 'items must be an array of at most 12 entries.';
  }
  for (const it of items) {
    if (!it || typeof it !== 'object') return 'Each item must be an object.';
    if (typeof it.title !== 'string' || it.title.length === 0 || it.title.length > MAX_TITLE_LEN) {
      return 'Each item title must be 1-140 characters.';
    }
    if (it.tag !== undefined && it.tag !== null) {
      if (typeof it.tag !== 'string' || it.tag.length > 40) return 'Each item tag must be at most 40 characters.';
    }
    if (it.detail !== undefined && it.detail !== null) {
      if (typeof it.detail !== 'string' || it.detail.length > 280) return 'Each item detail must be at most 280 characters.';
    }
    if (it.href !== undefined && it.href !== null) {
      if (typeof it.href !== 'string' || it.href.length > 500) return 'Each item href must be at most 500 characters.';
    }
    const kind = it.media_kind === undefined || it.media_kind === null || it.media_kind === '' ? 'none' : it.media_kind;
    if (!MEDIA_KINDS.has(kind)) return 'Each item media_kind must be none, image, video or file.';
    if (it.media_url !== undefined && it.media_url !== null) {
      if (typeof it.media_url !== 'string' || it.media_url.length > 2000) return 'Each item media_url must be at most 2000 characters.';
      if (kind !== 'none' && it.media_url !== '' && !isHttpUrl(it.media_url)) {
        return 'Each item media_url must start with http:// or https://.';
      }
    }
    if (it.ts !== undefined && it.ts !== null) {
      if (typeof it.ts !== 'string' || it.ts.length > 64) return 'Each item ts must be at most 64 characters.';
    }
  }
  return null;
}

function validateTicker(ticker) {
  if (!Array.isArray(ticker) || ticker.length > MAX_TICKER) {
    return 'ticker must be an array of at most 24 entries.';
  }
  for (const t of ticker) {
    if (!t || typeof t !== 'object') return 'Each ticker entry must be an object.';
    if (typeof t.text !== 'string' || t.text.length === 0 || t.text.length > 140) {
      return 'Each ticker text must be 1-140 characters.';
    }
    if (t.tag !== undefined && t.tag !== null) {
      if (typeof t.tag !== 'string' || t.tag.length > 40) return 'Each ticker tag must be at most 40 characters.';
    }
    if (t.url !== undefined && t.url !== null) {
      if (typeof t.url !== 'string' || t.url.length > 500) return 'Each ticker url must be at most 500 characters.';
    }
    if (t.ts !== undefined && t.ts !== null) {
      if (typeof t.ts !== 'string' || t.ts.length > 64) return 'Each ticker ts must be at most 64 characters.';
    }
  }
  return null;
}

async function logEvent(env, entry) {
  try {
    if (!hasDb(env)) return null;
    const id = crypto.randomUUID();
    const ts = new Date().toISOString();
    const kind = typeof entry.kind === 'string' ? entry.kind.slice(0, 64) : '';
    const channel = typeof entry.channel === 'string' ? entry.channel.slice(0, 200) : '';
    const status = Number.isInteger(entry.status) ? entry.status : null;
    const latencyMs = Number.isInteger(entry.latencyMs)
      ? entry.latencyMs
      : (Number.isInteger(entry.latency_ms) ? entry.latency_ms : null);
    const bytes = Number.isInteger(entry.bytes) ? entry.bytes : null;
    const payload = typeof entry.payload === 'string' ? entry.payload.slice(0, 2000) : '';
    await env.DB.prepare(
      'INSERT INTO feed_events (id, ts, kind, channel, status, latency_ms, bytes, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, ts, kind, channel, status, latencyMs, bytes, payload).run();
    try {
      await env.DB.prepare(
        'DELETE FROM feed_events WHERE id NOT IN (SELECT id FROM feed_events ORDER BY ts DESC, rowid DESC LIMIT 500)'
      ).run();
    } catch {
      // Prune failure must not break the main action.
    }
    return id;
  } catch {
    return null;
  }
}

async function readFeed(env) {
  if (!hasDb(env)) {
    return { config: defaultConfig(), items: defaultItems(), ticker: defaultTicker(), updatedAt: null };
  }
  try {
    await ensureTables(env);
    const row = await env.DB.prepare('SELECT data, updated_at FROM feed_config WHERE id = ?')
      .bind(FEED_ROW_ID).first();
    let saved = null;
    let updatedAt = null;
    if (row) {
      if (typeof row.updated_at === 'string') updatedAt = row.updated_at;
      if (typeof row.data === 'string') {
        try {
          saved = JSON.parse(row.data);
        } catch {
          saved = null;
        }
      }
    }
    const config = mergeConfig(defaultConfig(), saved);

    let items = [];
    try {
      const res = await env.DB.prepare(
        'SELECT id, tag, title, detail, href, media_kind, media_url, ts FROM feed_items ORDER BY sort ASC, rowid ASC'
      ).all();
      items = (res && Array.isArray(res.results) ? res.results : []).map(mapItemRow);
    } catch {
      items = [];
    }

    let ticker = [];
    try {
      const res = await env.DB.prepare(
        'SELECT id, tag, text, url, ts, enabled FROM feed_ticker ORDER BY sort ASC, rowid ASC'
      ).all();
      ticker = (res && Array.isArray(res.results) ? res.results : []).map(mapTickerRow);
    } catch {
      ticker = [];
    }

    // Migration: legacy items embedded in feed_config.data move to feed_items once.
    if (items.length === 0 && saved && Array.isArray(saved.items) && saved.items.length > 0) {
      const now = new Date().toISOString();
      const legacy = saved.items.slice(0, MAX_ITEMS);
      const seen = new Set();
      for (let i = 0; i < legacy.length; i++) {
        const s = sanitizeItem(legacy[i], i);
        if (!s.id || seen.has(s.id)) s.id = `feed-${i + 1}-${Date.now().toString(36)}`;
        seen.add(s.id);
        try {
          await env.DB.prepare(
            'INSERT OR REPLACE INTO feed_items (id, tag, title, detail, href, media_kind, media_url, ts, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(s.id, s.tag, s.title, s.detail, s.href, s.media_kind, s.media_url, s.ts, i, now, now).run();
        } catch {
          // Single-row migration failure must not break the read.
        }
      }
      try {
        const res = await env.DB.prepare(
          'SELECT id, tag, title, detail, href, media_kind, media_url, ts FROM feed_items ORDER BY sort ASC, rowid ASC'
        ).all();
        const migrated = (res && Array.isArray(res.results) ? res.results : []).map(mapItemRow);
        if (migrated.length > 0) items = migrated;
      } catch {
        // Keep previously read items on re-read failure.
      }
    }

    // Migration: seed ticker defaults once when the table is empty.
    if (ticker.length === 0) {
      const now = new Date().toISOString();
      const seeds = defaultTicker();
      for (let i = 0; i < seeds.length; i++) {
        const t = seeds[i];
        try {
          await env.DB.prepare(
            'INSERT OR REPLACE INTO feed_ticker (id, tag, text, url, ts, enabled, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(t.id, t.tag, t.text, t.url, t.ts || '', t.enabled ? 1 : 0, i, now).run();
        } catch {
          // Single-row seed failure must not break the read.
        }
      }
      try {
        const res = await env.DB.prepare(
          'SELECT id, tag, text, url, ts, enabled FROM feed_ticker ORDER BY sort ASC, rowid ASC'
        ).all();
        const seeded = (res && Array.isArray(res.results) ? res.results : []).map(mapTickerRow);
        if (seeded.length > 0) ticker = seeded;
        else ticker = seeds.map((s) => ({ ...s }));
      } catch {
        ticker = seeds.map((s) => ({ ...s }));
      }
    }

    return { config, items, ticker, updatedAt };
  } catch {
    return { config: defaultConfig(), items: defaultItems(), ticker: defaultTicker(), updatedAt: null };
  }
}

async function writeConfigRow(env, config) {
  await ensureTables(env);
  const updatedAt = new Date().toISOString();
  await env.DB.prepare('INSERT OR REPLACE INTO feed_config (id, data, updated_at) VALUES (?, ?, ?)')
    .bind(FEED_ROW_ID, JSON.stringify(config), updatedAt).run();
  return updatedAt;
}

async function replaceItems(env, items) {
  const clean = sanitizeItemsArray(items);
  const now = new Date().toISOString();
  await env.DB.prepare('DELETE FROM feed_items').run();
  for (let i = 0; i < clean.length; i++) {
    const s = clean[i];
    await env.DB.prepare(
      'INSERT OR REPLACE INTO feed_items (id, tag, title, detail, href, media_kind, media_url, ts, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(s.id, s.tag, s.title, s.detail, s.href, s.media_kind, s.media_url, s.ts, i, now, now).run();
  }
  return clean;
}

async function replaceTicker(env, ticker) {
  const clean = sanitizeTickerArray(ticker);
  const now = new Date().toISOString();
  await env.DB.prepare('DELETE FROM feed_ticker').run();
  for (let i = 0; i < clean.length; i++) {
    const s = clean[i];
    await env.DB.prepare(
      'INSERT OR REPLACE INTO feed_ticker (id, tag, text, url, ts, enabled, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(s.id, s.tag, s.text, s.url, s.ts, s.enabled ? 1 : 0, i, now).run();
  }
  return clean;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const isPublicRead = url.searchParams.get('public') === '1';
  const isHistoryRead = url.searchParams.get('history') === '1';

  if (request.method === 'OPTIONS') {
    return corsPreflight(request, env, isPublicRead ? { public: true, methods: 'GET', maxAge: 60 } : {});
  }

  if (request.method === 'GET') {
    if (isPublicRead) {
      const { config, items, ticker, updatedAt } = await readFeed(env);
      const now = Date.now();
      const liveItems = Array.isArray(items) ? items.filter((it) => it && !isExpired(it.ts, now)) : [];
      const liveTicker = Array.isArray(ticker)
        ? ticker.filter((t) => t && t.enabled && !isExpired(t.ts, now))
        : [];
      return corsJson(request, env,
        {
          success: true,
          enabled: config.enabled,
          scroll: config.scroll !== false,
          items: liveItems,
          ticker: liveTicker,
          updatedAt
        },
        200, { public: true, methods: 'GET', maxAge: 60, cacheControl: PUBLIC_CACHE });
    }
    const user = await verifySession(env, request);
    if (!user) return corsJson(request, env, { success: false, message: 'Unauthorized' }, 401);

    if (isHistoryRead) {
      const limit = clampInt(url.searchParams.get('limit'), 1, 200, 100);
      if (!hasDb(env)) return corsJson(request, env, { success: true, events: [] });
      try {
        await ensureTables(env);
        const res = await env.DB.prepare(
          'SELECT id, ts, kind, channel, status, latency_ms, bytes, payload FROM feed_events ORDER BY ts DESC, rowid DESC LIMIT ?'
        ).bind(limit).all();
        const events = (res && Array.isArray(res.results) ? res.results : []).map((r) => ({
          id: typeof r.id === 'string' ? r.id : '',
          ts: typeof r.ts === 'string' ? r.ts : '',
          kind: typeof r.kind === 'string' ? r.kind : '',
          channel: typeof r.channel === 'string' ? r.channel : '',
          status: Number.isInteger(r.status) ? r.status : null,
          latency_ms: Number.isInteger(r.latency_ms) ? r.latency_ms : null,
          bytes: Number.isInteger(r.bytes) ? r.bytes : null,
          payload: typeof r.payload === 'string' ? r.payload : ''
        }));
        return corsJson(request, env, { success: true, events });
      } catch {
        return corsJson(request, env, { success: false, message: 'Failed to load feed history.' }, 500);
      }
    }

    const { config, items, ticker, updatedAt } = await readFeed(env);
    return corsJson(request, env, {
      success: true,
      config,
      items,
      ticker,
      defaults: { items: defaultItems(), ticker: defaultTicker() },
      updatedAt
    });
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
      const invalid = validateConfig(body.config);
      if (invalid) return corsJson(request, env, { success: false, message: invalid }, 400);
      let legacyItems = null;
      if (body.config && Array.isArray(body.config.items)) {
        const itemsInvalid = validateItems(body.config.items);
        if (itemsInvalid) return corsJson(request, env, { success: false, message: itemsInvalid }, 400);
        legacyItems = body.config.items;
      }
      if (!hasDb(env)) {
        return corsJson(request, env, { success: false, message: 'Database unavailable.' }, 503);
      }
      try {
        const clean = sanitizeConfig(body.config);
        const updatedAt = await writeConfigRow(env, clean);
        if (legacyItems !== null) {
          await replaceItems(env, legacyItems);
        }
        await logEvent(env, { kind: 'save-config', channel: 'config', status: 200, bytes: 0, payload: '' });
        const { items, ticker } = await readFeed(env);
        return corsJson(request, env, { success: true, config: clean, items, ticker, updatedAt });
      } catch {
        return corsJson(request, env, { success: false, message: 'Failed to save feed config.' }, 500);
      }
    }

    if (action === 'save-items') {
      const invalid = validateItems(body.items);
      if (invalid) return corsJson(request, env, { success: false, message: invalid }, 400);
      if (!hasDb(env)) {
        return corsJson(request, env, { success: false, message: 'Database unavailable.' }, 503);
      }
      try {
        await ensureTables(env);
        const clean = await replaceItems(env, body.items);
        await logEvent(env, { kind: 'save-items', channel: 'items', status: 200, bytes: clean.length, payload: '' });
        return corsJson(request, env, { success: true, items: clean });
      } catch {
        return corsJson(request, env, { success: false, message: 'Failed to save feed items.' }, 500);
      }
    }

    if (action === 'save-ticker') {
      const invalid = validateTicker(body.ticker);
      if (invalid) return corsJson(request, env, { success: false, message: invalid }, 400);
      if (!hasDb(env)) {
        return corsJson(request, env, { success: false, message: 'Database unavailable.' }, 503);
      }
      try {
        await ensureTables(env);
        const clean = await replaceTicker(env, body.ticker);
        await logEvent(env, { kind: 'save-ticker', channel: 'ticker', status: 200, bytes: clean.length, payload: '' });
        return corsJson(request, env, { success: true, ticker: clean });
      } catch {
        return corsJson(request, env, { success: false, message: 'Failed to save feed ticker.' }, 500);
      }
    }

    // save-all: the dashboard Save button. Validates EVERY section first so a
    // bad row anywhere rejects the whole write (nothing half-persisted), then
    // writes config+items+ticker in one D1 batch — one round trip, one event.
    if (action === 'save-all') {
      const cfg = body.config;
      if (!cfg || typeof cfg !== 'object' || !Array.isArray(body.items) || !Array.isArray(body.ticker)) {
        return corsJson(request, env, { success: false, message: 'save-all requires config, items and ticker.' }, 400);
      }
      const badConfig = validateConfig(cfg);
      if (badConfig) return corsJson(request, env, { success: false, message: badConfig }, 400);
      const badItems = validateItems(body.items);
      if (badItems) return corsJson(request, env, { success: false, message: badItems }, 400);
      const badTicker = validateTicker(body.ticker);
      if (badTicker) return corsJson(request, env, { success: false, message: badTicker }, 400);
      let legacyItems = null;
      if (Array.isArray(cfg.items)) {
        const legacyInvalid = validateItems(cfg.items);
        if (legacyInvalid) return corsJson(request, env, { success: false, message: legacyInvalid }, 400);
        legacyItems = cfg.items;
      }
      if (!hasDb(env)) {
        return corsJson(request, env, { success: false, message: 'Database unavailable.' }, 503);
      }
      try {
        await ensureTables(env);
        const cleanConfig = sanitizeConfig(cfg);
        const cleanItems = sanitizeItemsArray(legacyItems !== null ? legacyItems : body.items);
        const cleanTicker = sanitizeTickerArray(body.ticker);
        const now = new Date().toISOString();
        const stmts = [
          env.DB.prepare('INSERT OR REPLACE INTO feed_config (id, data, updated_at) VALUES (?, ?, ?)')
            .bind(FEED_ROW_ID, JSON.stringify(cleanConfig), now),
          env.DB.prepare('DELETE FROM feed_items'),
          ...cleanItems.map((s, i) => env.DB.prepare(
            'INSERT OR REPLACE INTO feed_items (id, tag, title, detail, href, media_kind, media_url, ts, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(s.id, s.tag, s.title, s.detail, s.href, s.media_kind, s.media_url, s.ts, i, now, now)),
          env.DB.prepare('DELETE FROM feed_ticker'),
          ...cleanTicker.map((s, i) => env.DB.prepare(
            'INSERT OR REPLACE INTO feed_ticker (id, tag, text, url, ts, enabled, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(s.id, s.tag, s.text, s.url, s.ts, s.enabled ? 1 : 0, i, now)),
        ];
        if (env.DB.batch && typeof env.DB.batch === 'function') {
          await env.DB.batch(stmts);
        } else {
          for (const st of stmts) await st.run();
        }
        await logEvent(env, {
          kind: 'save-all', channel: 'all',
          status: 200, bytes: cleanItems.length + cleanTicker.length, payload: ''
        });
        return corsJson(request, env, {
          success: true, config: cleanConfig, items: cleanItems, ticker: cleanTicker, updatedAt: now
        });
      } catch {
        return corsJson(request, env, { success: false, message: 'Failed to save feed (all sections).' }, 500);
      }
    }

    if (action === 'rotate-secret') {
      // Issued once to the caller; never persisted server-side.
      const secret = 'fsk_' + crypto.randomUUID().replace(/-/g, '');
      return corsJson(request, env, { success: true, secret });
    }

    if (action === 'test-push') {
      const channelId = typeof body.channelId === 'string' ? body.channelId : '';
      const { config } = await readFeed(env);
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
        const eventId = await logEvent(env, {
          kind: 'test-push',
          channel: typeof channel.label === 'string' && channel.label ? channel.label : channel.id,
          status: res.status,
          latencyMs,
          bytes: payloadText.length,
          payload: payloadText.slice(0, 2000)
        });
        return corsJson(request, env, { success: ok, status: res.status, latencyMs, ok, eventId });
      } catch {
        const latencyMs = Date.now() - start;
        const eventId = await logEvent(env, {
          kind: 'test-push',
          channel: typeof channel.label === 'string' && channel.label ? channel.label : channel.id,
          status: 0,
          latencyMs,
          bytes: payloadText.length,
          payload: payloadText.slice(0, 2000)
        });
        return corsJson(request, env,
          { success: false, status: 0, latencyMs, ok: false, message: 'Push failed.', eventId });
      } finally {
        clearTimeout(timer);
      }
    }

    return corsJson(request, env, { success: false, message: 'Unknown action.' }, 400);
  }

  return corsJson(request, env, { success: false, message: 'Method not allowed' }, 405);
}
