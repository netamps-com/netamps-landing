'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Rss, Radio, Activity, Webhook, FileJson, ShieldCheck, Gauge,
  Power, Pause, Play, Plus, Trash2, Copy, RefreshCw, ChevronDown, Send, Repeat,
  Upload, X, Loader2,
} from 'lucide-react';
import { DashboardShell } from '../DashboardNav';
import { buildNavSections } from '../nav';
import { useDashboardSession } from '../useDashboardSession';

// Post-login Feed Push Dashboard. Curates the landing feed and fans it out
// to external channels. Reads/writes `${API}/api/feed`; signing happens
// server-side on push, this page only documents the header and holds config.

const API = process.env.NEXT_PUBLIC_API_URL || '';

type ChannelKind = 'webhook' | 'zapier' | 'slack' | 'custom';
type SchemaSource = 'title' | 'link' | 'summary' | 'timestamp' | 'company';
type PayloadFormat = 'json' | 'xml';

type MediaKind = 'none' | 'image' | 'video' | 'file';
type FeedItem = { id: string; tag: string; title: string; detail: string; href: string; media_kind: MediaKind; media_url: string; ts: string };
type TickerEntry = { id: string; tag: string; text: string; url: string; ts: string; enabled: boolean };
type Channel = { id: string; kind: ChannelKind; label: string; url: string; enabled: boolean };
type SchemaField = { id: string; key: string; source: SchemaSource; required: boolean };
type FeedSchema = { format: PayloadFormat; fields: SchemaField[] };
type FeedRate = { perMinute: number; burst: number; retryMax: number };
type FeedConfig = {
  enabled: boolean;
  scroll: boolean;
  channels: Channel[];
  rate: FeedRate;
  schema: FeedSchema;
};
type FeedEvent = {
  id: string; time: string; channel: string; bytes: number;
  status: number; latency: number; payload: string;
};
type FeedHistoryEvent = {
  id: string; ts: string; kind: string; channel: string;
  status: number; latency_ms: number; bytes: number; payload?: unknown;
};

const CHANNEL_KINDS: ChannelKind[] = ['webhook', 'zapier', 'slack', 'custom'];
const MEDIA_KINDS: MediaKind[] = ['none', 'image', 'video', 'file'];
const SCHEMA_SOURCES: SchemaSource[] = ['title', 'link', 'summary', 'timestamp', 'company'];
const MAX_ITEMS = 12;
const MAX_EVENTS = 50;
const CDN_PREFIX = '/api/cdn/feed/';
const MEDIA_ACCEPT = 'image/*,video/*,.pdf,.csv,.json,.txt,.xlsx,.docx';
const MAX_MEDIA_BYTES = 15 * 1024 * 1024;

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

const DEFAULT_CONFIG: FeedConfig = {
  enabled: false,
  scroll: true,
  channels: [],
  rate: { perMinute: 60, burst: 10, retryMax: 3 },
  schema: {
    format: 'json',
    fields: [
      { id: 'f-title', key: 'title', source: 'title', required: true },
      { id: 'f-link', key: 'link', source: 'link', required: true },
      { id: 'f-summary', key: 'summary', source: 'summary', required: false },
    ],
  },
};

const FALLBACK_ITEM: FeedItem = {
  id: 'preview', tag: 'update', title: 'Sample post',
  detail: 'Preview only — add feed items below to curate landing content.',
  href: 'https://netamps.com/', media_kind: 'none', media_url: '', ts: '',
};

function isFeedConfig(v: unknown): v is FeedConfig & { items?: unknown } {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  // Accepts both shapes: new config-only and legacy config with items.
  return (
    typeof c.enabled === 'boolean' &&
    Array.isArray(c.channels) &&
    typeof c.rate === 'object' && c.rate !== null &&
    typeof c.schema === 'object' && c.schema !== null
  );
}

function normalizeItem(raw: unknown): FeedItem {
  const r = (raw ?? {}) as Record<string, unknown>;
  const mk = r.media_kind;
  return {
    id: typeof r.id === 'string' && r.id ? r.id : uid(),
    tag: typeof r.tag === 'string' ? r.tag : '',
    title: typeof r.title === 'string' ? r.title : '',
    detail: typeof r.detail === 'string' ? r.detail : '',
    href: typeof r.href === 'string' ? r.href : '',
    media_kind: mk === 'image' || mk === 'video' || mk === 'file' ? mk : 'none',
    media_url: typeof r.media_url === 'string' ? r.media_url : '',
    ts: typeof r.ts === 'string' ? r.ts : '',
  };
}

function normalizeTicker(raw: unknown): TickerEntry {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    id: typeof r.id === 'string' && r.id ? r.id : uid(),
    tag: typeof r.tag === 'string' ? r.tag : '',
    text: typeof r.text === 'string' ? r.text : '',
    url: typeof r.url === 'string' ? r.url : '',
    ts: typeof r.ts === 'string' ? r.ts : '',
    enabled: (r as { enabled?: unknown }).enabled !== false,
  };
}

function normalizeHistory(raw: unknown): FeedHistoryEvent {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    id: typeof r.id === 'string' && r.id ? r.id : uid(),
    ts: typeof r.ts === 'string' ? r.ts : '',
    kind: typeof r.kind === 'string' ? r.kind : 'push',
    channel: typeof r.channel === 'string' ? r.channel : '',
    status: typeof r.status === 'number' ? r.status : 0,
    latency_ms: typeof r.latency_ms === 'number' ? r.latency_ms : 0,
    bytes: typeof r.bytes === 'number' ? r.bytes : 0,
    payload: (r as { payload?: unknown }).payload,
  };
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// Maps a schema field source onto the curated feed item.
function sourceValue(source: SchemaSource, item: FeedItem): string {
  switch (source) {
    case 'title': return item.title;
    case 'link': return item.href;
    case 'summary': return item.detail;
    case 'timestamp': return new Date().toISOString();
    case 'company': return item.tag || 'Netamps';
  }
}

function buildPayload(schema: FeedSchema, item: FeedItem): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of schema.fields) {
    if (!f.key.trim()) continue;
    out[f.key.trim()] = sourceValue(f.source, item);
  }
  return out;
}

function toXml(payload: Record<string, string>): string {
  const rows = Object.entries(payload)
    .map(([k, v]) => `  <${escapeXml(k)}>${escapeXml(v)}</${escapeXml(k)}>`)
    .join('\n');
  return `<feed>\n${rows}\n</feed>`;
}

function payloadBytes(payload: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(payload)).length;
  } catch {
    return 0;
  }
}

// datetime-local input round-trip: the control speaks "YYYY-MM-DDTHH:mm"
// (local), the feed stores UTC ISO. Invalid input yields '' (unset).
function tsToLocalInput(ts: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function tsFromLocalInput(v: string): string {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

// Display-until mirror of the API rule (parseFeedDate/isExpired): day-first
// numeric forms, Date.parse fallback, empty/garbage never expires.
function parseDisplayUntil(value: string): number {
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

function isExpiredTs(ts: string, nowMs?: number): boolean {
  const ms = parseDisplayUntil(ts);
  if (!Number.isFinite(ms)) return false;
  return ms <= (nowMs === undefined ? Date.now() : nowMs);
}

// CDN asset URLs are API-relative; prefix API for dashboard previews.
function previewSrc(url: string): string {
  const t = url.trim();
  if (t.startsWith('/') && API) return `${API}${t}`;
  return t;
}

// Last path segment for file chips; query/hash stripped.
function mediaFileName(url: string): string {
  const t = url.trim().split('?')[0].split('#')[0];
  const seg = t.split('/').filter(Boolean).pop() ?? t;
  try {
    return decodeURIComponent(seg) || t;
  } catch {
    return seg || t;
  }
}

function statusChip(status: number): string {
  if (status >= 200 && status < 300) return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
  if (status >= 400 && status < 500) return 'border-amber-500/40 bg-amber-500/10 text-amber-300';
  if (status >= 500) return 'border-rose-500/40 bg-rose-500/10 text-rose-300';
  return 'border-slate-500/40 bg-slate-500/10 text-slate-300';
}

function kindBadge(kind: ChannelKind): string {
  switch (kind) {
    case 'webhook': return 'border-sky-400/40 bg-sky-400/10 text-sky-300';
    case 'zapier': return 'border-amber-400/40 bg-amber-400/10 text-amber-300';
    case 'slack': return 'border-lime-400/40 bg-lime-400/10 text-lime-300';
    case 'custom': return 'border-teal-300/40 bg-teal-300/10 text-teal-300';
  }
}

const card = 'rounded-xl border border-slate-800 bg-slate-900/70 p-4';
const inputDark = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-lime-400';
const btnGhost = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-slate-200 transition-colors hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-lime-400 focus-visible:outline-none disabled:opacity-50';
const labelXs = 'block text-[11px] font-bold uppercase tracking-wider text-slate-400';

export default function FeedDashboardPage() {
  const [config, setConfig] = useState<FeedConfig>(DEFAULT_CONFIG);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [ticker, setTicker] = useState<TickerEntry[]>([]);
  const [history, setHistory] = useState<FeedHistoryEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingItems, setSavingItems] = useState(false);
  const [savingTicker, setSavingTicker] = useState(false);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [defaultItems, setDefaultItems] = useState<FeedItem[] | null>(null);
  const [live, setLive] = useState(true);
  const [lastResults, setLastResults] = useState<Record<string, { status: number; latency: number }>>({});
  const [attempts, setAttempts] = useState<Record<string, number>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [diagOpen, setDiagOpen] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [newChannel, setNewChannel] = useState({ kind: 'webhook' as ChannelKind, label: '', url: '' });
  const [channelError, setChannelError] = useState('');
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [channelDraft, setChannelDraft] = useState({ label: '', url: '' });
  const [newItem, setNewItem] = useState({ tag: '', title: '', detail: '', href: '', media_kind: 'none' as MediaKind, media_url: '', ts: '' });
  const [newTicker, setNewTicker] = useState({ tag: '', text: '', url: '', ts: '' });
  const [newFieldKey, setNewFieldKey] = useState('');
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<Record<string, string>>({});
  const secretRef = useRef<HTMLInputElement | null>(null);

  // Hooks stay above the unauthorized early return to keep hook order stable.
  const session = useDashboardSession();
  const navSections = buildNavSections();

  const appendEvent = useCallback((e: Omit<FeedEvent, 'id' | 'time'> & { payload: string }) => {
    const full: FeedEvent = {
      ...e,
      id: uid(),
      time: new Date().toLocaleTimeString(),
    };
    setEvents((prev) => [...prev, full].slice(-MAX_EVENTS));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/feed`, { cache: 'no-store' });
      if (res.status === 401) { setUnauthorized(true); return; }
      let data: any = null;
      try { data = await res.json(); } catch { throw new Error('bad response'); }
      const cfg = data?.config ?? data;
      if (Array.isArray((data?.defaults as { items?: unknown } | undefined)?.items)) {
        setDefaultItems((data.defaults as { items: unknown[] }).items.map(normalizeItem));
      }
      if (isFeedConfig(cfg)) {
        // Older saved rows predate the scroll switch — default it ON.
        const withScroll = cfg as FeedConfig & { scroll?: unknown };
        setConfig({
          enabled: cfg.enabled,
          scroll: withScroll.scroll !== false,
          channels: cfg.channels,
          rate: cfg.rate,
          schema: cfg.schema,
        });
        // New shape carries items/ticker top-level; legacy nests items in config.
        const legacyItems = (cfg as { items?: unknown }).items;
        const rawItems = Array.isArray(data?.items)
          ? (data.items as unknown[])
          : Array.isArray(legacyItems)
            ? (legacyItems as unknown[])
            : [];
        // Items saved before per-item dates/media carry no ts/media — normalize fills defaults.
        setItems(rawItems.map(normalizeItem));
        setTicker(Array.isArray(data?.ticker) ? (data.ticker as unknown[]).map(normalizeTicker) : []);
      }
      else if (!res.ok) setError(data?.message || 'Feed API unavailable — editing local defaults.');
    } catch {
      setError('Failed to load feed config — editing local defaults.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const res = await fetch(`${API}/api/feed?history=1&limit=100`, { cache: 'no-store' });
      if (res.status === 401) { setUnauthorized(true); return; }
      let data: any = null;
      try { data = await res.json(); } catch { throw new Error('bad response'); }
      if (!res.ok || data?.success === false) {
        setHistoryError(data?.message || 'Feed history unavailable.');
        return;
      }
      const rows = Array.isArray(data?.events) ? (data.events as unknown[]).map(normalizeHistory) : [];
      // Newest first by ts; rows without ts keep server order reversed.
      rows.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
      setHistory(rows);
    } catch {
      setHistoryError('Failed to load feed history.');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
    const t = setInterval(() => {
      if (document.hidden) return;
      loadHistory();
    }, 30000);
    return () => clearInterval(t);
  }, [loadHistory]);

  // Heartbeat tick: appends a monitor sample only while the stream is live.
  const previewItem = items[0] ?? FALLBACK_ITEM;
  const builtPayload = useMemo(() => buildPayload(config.schema, previewItem), [config.schema, previewItem]);
  const previewText = useMemo(
    () => (config.schema.format === 'xml' ? toXml(builtPayload) : JSON.stringify(builtPayload, null, 2)),
    [builtPayload, config.schema.format],
  );

  useEffect(() => {
    if (!live || loading) return;
    const t = setInterval(() => {
      appendEvent({
        channel: 'monitor',
        bytes: payloadBytes(builtPayload),
        status: 200,
        latency: 20 + Math.round(Math.random() * 120),
        payload: JSON.stringify({ heartbeat: true }),
      });
    }, 5000);
    return () => clearInterval(t);
  }, [live, loading, builtPayload, appendEvent]);

  const saveConfig = useCallback(async (next: FeedConfig, what: string) => {
    setSaving(true);
    setError('');
    setNotice('');
    const t0 = performance.now();
    try {
      const res = await fetch(`${API}/api/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', config: next }),
      });
      const latency = Math.round(performance.now() - t0);
      let data: any = null;
      try { data = await res.json(); } catch { /* non-JSON body still counts as a push attempt */ }
      appendEvent({
        channel: `config (${what})`,
        bytes: payloadBytes(next),
        status: res.status,
        latency,
        payload: JSON.stringify({ action: 'save', what }),
      });
      if (!res.ok || data?.success === false) {
        if (res.status === 401) { setUnauthorized(true); return; }
        setError(data?.message || 'Could not save feed config.');
        return;
      }
      setNotice('Feed config saved.');
    } catch {
      appendEvent({ channel: `config (${what})`, bytes: payloadBytes(next), status: 0, latency: 0, payload: JSON.stringify({ action: 'save', what, error: 'network' }) });
      setError('Could not save feed config.');
    } finally {
      setSaving(false);
    }
  }, [appendEvent]);

  const saveItems = useCallback(async (next: FeedItem[]) => {
    setSavingItems(true);
    setError('');
    setNotice('');
    const t0 = performance.now();
    try {
      const res = await fetch(`${API}/api/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-items', items: next }),
      });
      const latency = Math.round(performance.now() - t0);
      let data: any = null;
      try { data = await res.json(); } catch { /* non-JSON body still counts as a push attempt */ }
      appendEvent({
        channel: 'config (items)',
        bytes: payloadBytes(next),
        status: res.status,
        latency,
        payload: JSON.stringify({ action: 'save-items' }),
      });
      if (!res.ok || data?.success === false) {
        if (res.status === 401) { setUnauthorized(true); return; }
        setError(data?.message || 'Could not save feed items.');
        return;
      }
      setNotice('Feed items saved.');
      loadHistory();
    } catch {
      appendEvent({ channel: 'config (items)', bytes: payloadBytes(next), status: 0, latency: 0, payload: JSON.stringify({ action: 'save-items', error: 'network' }) });
      setError('Could not save feed items.');
    } finally {
      setSavingItems(false);
    }
  }, [appendEvent, loadHistory]);

  const saveTicker = useCallback(async (next: TickerEntry[]) => {
    setSavingTicker(true);
    setError('');
    setNotice('');
    const t0 = performance.now();
    try {
      const res = await fetch(`${API}/api/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-ticker', ticker: next }),
      });
      const latency = Math.round(performance.now() - t0);
      let data: any = null;
      try { data = await res.json(); } catch { /* non-JSON body still counts as a push attempt */ }
      appendEvent({
        channel: 'config (ticker)',
        bytes: payloadBytes(next),
        status: res.status,
        latency,
        payload: JSON.stringify({ action: 'save-ticker' }),
      });
      if (!res.ok || data?.success === false) {
        if (res.status === 401) { setUnauthorized(true); return; }
        setError(data?.message || 'Could not save ticker.');
        return;
      }
      setNotice('Ticker saved.');
      loadHistory();
    } catch {
      appendEvent({ channel: 'config (ticker)', bytes: payloadBytes(next), status: 0, latency: 0, payload: JSON.stringify({ action: 'save-ticker', error: 'network' }) });
      setError('Could not save ticker.');
    } finally {
      setSavingTicker(false);
    }
  }, [appendEvent, loadHistory]);

  const toggleEnabled = useCallback(async () => {
    const next = { ...config, enabled: !config.enabled };
    setConfig(next);
    await saveConfig(next, next.enabled ? 'enabled' : 'paused');
  }, [config, saveConfig]);

  const toggleScroll = useCallback(async () => {
    const next = { ...config, scroll: !config.scroll };
    setConfig(next);
    await saveConfig(next, next.scroll ? 'scroll-on' : 'scroll-off');
  }, [config, saveConfig]);

  // Master Save: captures EVERYTHING on screen — switches, channels, items,
  // ticker, rate, schema — in one validated all-or-nothing write. The server
  // rejects the whole request when any section is invalid, so the database
  // can never hold half of what the operator saw.
  const saveAll = useCallback(async () => {
    setSaving(true);
    setError('');
    setNotice('');
    const t0 = performance.now();
    const payload = { config, items, ticker };
    try {
      const res = await fetch(`${API}/api/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-all', ...payload }),
      });
      const latency = Math.round(performance.now() - t0);
      let data: any = null;
      try { data = await res.json(); } catch { /* non-JSON body still counts as a push attempt */ }
      appendEvent({
        channel: 'config (all)',
        bytes: payloadBytes(payload),
        status: res.status,
        latency,
        payload: JSON.stringify({ action: 'save-all' }),
      });
      if (!res.ok || data?.success === false) {
        if (res.status === 401) { setUnauthorized(true); return; }
        setError(data?.message || 'Could not save feed (all sections).');
        return;
      }
      setNotice(
        `Everything saved — switches, ${items.length} item${items.length === 1 ? '' : 's'}, ` +
        `${ticker.length} ticker ${ticker.length === 1 ? 'flash' : 'flashes'}, channels, rate and schema.`
      );
      loadHistory();
    } catch {
      appendEvent({ channel: 'config (all)', bytes: payloadBytes(payload), status: 0, latency: 0, payload: JSON.stringify({ action: 'save-all', error: 'network' }) });
      setError('Could not save feed (all sections).');
    } finally {
      setSaving(false);
    }
  }, [appendEvent, config, items, ticker, loadHistory]);

  const testPush = useCallback(async (ch: Channel) => {
    setTestingId(ch.id);
    setAttempts((a) => ({ ...a, [ch.id]: (a[ch.id] ?? 0) + 1 }));
    const payload = buildPayload(config.schema, previewItem);
    const t0 = performance.now();
    try {
      const res = await fetch(`${API}/api/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test-push', channelId: ch.id, payload: builtPayload }),
      });
      const latency = Math.round(performance.now() - t0);
      let data: any = null;
      try { data = await res.json(); } catch { /* keep status/latency from the transport */ }
      void data;
      void payload;
      setLastResults((m) => ({ ...m, [ch.id]: { status: res.status, latency } }));
      appendEvent({
        channel: `${ch.label || ch.kind} (test)`,
        bytes: payloadBytes(builtPayload),
        status: res.status,
        latency,
        payload: JSON.stringify({ action: 'test-push', channelId: ch.id, test: true }),
      });
      if (res.status === 401) setUnauthorized(true);
    } catch {
      setLastResults((m) => ({ ...m, [ch.id]: { status: 0, latency: 0 } }));
      appendEvent({
        channel: `${ch.label || ch.kind} (test)`,
        bytes: payloadBytes(builtPayload),
        status: 0,
        latency: 0,
        payload: JSON.stringify({ action: 'test-push', channelId: ch.id, test: true, error: 'network' }),
      });
    } finally {
      setTestingId(null);
    }
  }, [appendEvent, builtPayload, config.schema, previewItem]);

  const rotateSecret = useCallback(async () => {
    setRotating(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rotate-secret' }),
      });
      if (res.status === 401) { setUnauthorized(true); return; }
      let data: any = null;
      try { data = await res.json(); } catch { throw new Error('bad response'); }
      if (typeof data?.secret === 'string' && data.secret) setSecret(data.secret);
      else setError(data?.message || 'Could not rotate secret.');
    } catch {
      setError('Could not rotate secret.');
    } finally {
      setRotating(false);
    }
  }, []);

  const copySecret = useCallback(async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setNotice('Secret copied — store it now, it is shown once.');
    } catch {
      secretRef.current?.focus();
      secretRef.current?.select();
    }
  }, [secret]);

  const patch = useCallback((fn: (c: FeedConfig) => FeedConfig) => {
    setConfig((c) => fn(c));
  }, []);

  const addChannel = useCallback(() => {
    setChannelError('');
    if (!newChannel.label.trim()) { setChannelError('Label is required.'); return; }
    if (!/^https?:\/\/.+/i.test(newChannel.url.trim())) { setChannelError('URL must start with http(s)://'); return; }
    patch((c) => ({
      ...c,
      channels: [...c.channels, {
        id: uid(), kind: newChannel.kind,
        label: newChannel.label.trim(), url: newChannel.url.trim(), enabled: true,
      }],
    }));
    setNewChannel({ kind: 'webhook', label: '', url: '' });
  }, [newChannel, patch]);

  // Local-file uploads only fill the editor fields; nothing auto-saves.
  // Persistence still happens through the Save items button.
  const uploadMediaFile = useCallback(async (
    file: File,
  ): Promise<{ kind: MediaKind; url: string } | null> => {
    // Client-side pre-check: reject oversize files before any upload.
    if (file.size > MAX_MEDIA_BYTES) return null;
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API}/api/feed-media`, {
      method: 'POST',
      credentials: 'same-origin',
      body: form,
    });
    if (res.status === 401) { setUnauthorized(true); throw new Error('Session ended — sign in again.'); }
    let data: any = null;
    try { data = await res.json(); } catch { /* fall through to the error below */ }
    if (!res.ok || data?.success === false) {
      throw new Error(typeof data?.message === 'string' && data.message ? data.message : 'Upload failed.');
    }
    const kind: MediaKind = data?.kind === 'image' || data?.kind === 'video' || data?.kind === 'file' ? data.kind : 'file';
    const url = typeof data?.assetUrl === 'string' ? data.assetUrl : '';
    if (!url) throw new Error('Upload failed.');
    return { kind, url };
  }, []);

  // Shared by item rows (target = item id) and the new-item draft (target = 'new').
  const handleMediaUpload = useCallback(async (target: string, file: File | undefined | null) => {
    if (!file || uploadingId !== null) return;
    setUploadError((m) => {
      if (!(target in m)) return m;
      const next = { ...m };
      delete next[target];
      return next;
    });
    setUploadingId(`upload:${target}`);
    try {
      const uploaded = await uploadMediaFile(file);
      if (!uploaded) {
        setUploadError((m) => ({ ...m, [target]: 'File must be 15MB or smaller.' }));
        return;
      }
      if (target === 'new') {
        setNewItem((d) => ({ ...d, media_kind: uploaded.kind, media_url: uploaded.url }));
      } else {
        setItems((prev) => prev.map((x) => (x.id === target ? { ...x, media_kind: uploaded.kind, media_url: uploaded.url } : x)));
      }
      setNotice('Media uploaded — press Save items to publish.');
    } catch (e) {
      setUploadError((m) => ({ ...m, [target]: e instanceof Error ? e.message : 'Upload failed.' }));
    } finally {
      setUploadingId((cur) => (cur === `upload:${target}` ? null : cur));
    }
  }, [uploadMediaFile, uploadingId]);

  const handleMediaRemove = useCallback(async (target: string, url: string) => {
    if (uploadingId !== null) return;
    const trimmed = url.trim();
    if (!trimmed) return;
    const clearFields = () => {
      if (target === 'new') {
        setNewItem((d) => ({ ...d, media_kind: 'none' as MediaKind, media_url: '' }));
      } else {
        setItems((prev) => prev.map((x) => (x.id === target ? { ...x, media_kind: 'none' as MediaKind, media_url: '' } : x)));
      }
    };
    setUploadError((m) => {
      if (!(target in m)) return m;
      const next = { ...m };
      delete next[target];
      return next;
    });
    // Only API-hosted objects have a deletable key; external URLs just clear.
    let path: string | null = null;
    if (trimmed.startsWith(CDN_PREFIX)) {
      path = trimmed;
    } else {
      try {
        const u = new URL(trimmed);
        if (u.pathname.startsWith(CDN_PREFIX)) path = u.pathname;
      } catch { /* relative non-CDN URL — plain external, just clear */ }
    }
    if (!path) { clearFields(); return; }
    const key = `feed/${path.slice(CDN_PREFIX.length)}`;
    setUploadingId(`remove:${target}`);
    try {
      const res = await fetch(`${API}/api/feed-media?key=${encodeURIComponent(key)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (res.status === 401) { setUnauthorized(true); return; }
      if (!res.ok) {
        let msg = 'Could not remove media.';
        try {
          const data = await res.json();
          if (typeof data?.message === 'string' && data.message) msg = data.message;
        } catch { /* keep default */ }
        setUploadError((m) => ({ ...m, [target]: msg }));
        return;
      }
      clearFields();
      setNotice('Attachment removed — press Save items to publish.');
    } catch {
      setUploadError((m) => ({ ...m, [target]: 'Could not remove media.' }));
    } finally {
      setUploadingId((cur) => (cur === `remove:${target}` ? null : cur));
    }
  }, [uploadingId]);

  if (unauthorized) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-700 font-semibold">Your session has ended.</p>
          <Link href="/login" className="mt-3 inline-block px-4 py-2 bg-slate-900 text-white rounded-xl font-bold">Sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <DashboardShell
      sections={navSections}
      footer={{ email: session.email, role: session.role, onTerminate: session.terminate }}
    >
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
              <Rss className="w-6 h-6 text-lime-600" /> Feed Push Dashboard
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Curate the landing feed and push it to external channels. Test pushes are marked as test.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => load()}
              className="p-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 transition-colors focus-visible:ring-2 focus-visible:ring-lime-500 focus-visible:outline-none"
              aria-label="Refresh"
            >
              <RefreshCw className="w-4 h-4 text-slate-600" />
            </button>
            <button
              onClick={() => saveAll()}
              disabled={saving || loading}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-700 transition-colors focus-visible:ring-2 focus-visible:ring-lime-500 focus-visible:outline-none disabled:opacity-50"
              title="Saves switches, items, ticker, channels, rate and schema in one write"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        {notice && <p className="mt-4 text-sm text-emerald-700">{notice}</p>}

        {loading ? (
          <div className="mt-6 rounded-2xl bg-slate-950 border border-slate-800 p-4" aria-label="Loading">
            <div className="h-10 rounded-xl bg-slate-800 animate-pulse" />
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              {[0, 1, 2].map((i) => <div key={i} className="h-56 rounded-xl bg-slate-800 animate-pulse" />)}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
              {[0, 1].map((i) => <div key={i} className="h-56 rounded-xl bg-slate-800 animate-pulse" />)}
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl bg-slate-950 text-slate-100 border border-slate-800 p-4">
            {/* Master switch: first control, above the grids. */}
            <div className="flex items-center justify-between gap-4 flex-wrap rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="flex items-center gap-3">
                <Power className="w-5 h-5 text-lime-400" />
                <div>
                  <p className="font-bold text-white">Website Feed {config.enabled ? 'ON' : 'OFF'}</p>
                  <p className="text-sm text-slate-400">
                    ON = feed renders on netamps.com above the vendor ecosystem;
                    OFF = landing shows the compact paused bar.
                  </p>
                </div>
              </div>
              <button
                role="switch"
                aria-checked={config.enabled}
                aria-label="Website Feed"
                onClick={toggleEnabled}
                disabled={saving}
                className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors focus-visible:ring-2 focus-visible:ring-lime-400 focus-visible:outline-none disabled:opacity-50 ${config.enabled ? 'border-lime-400/60 bg-lime-400/20' : 'border-slate-700 bg-slate-800'}`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full transition-colors ${config.enabled ? 'right-0.5 bg-lime-400' : 'left-0.5 bg-slate-500'}`}
                />
              </button>
            </div>
            {/* Ticker scroll switch: motion control for the flash bar under the
                feed cards. ON = scrolling marquee; OFF = static flash row. */}
            <div className="mt-3 flex items-center justify-between gap-4 flex-wrap rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="flex items-center gap-3">
                <Repeat className="w-5 h-5 text-teal-300" />
                <div>
                  <p className="font-bold text-white">Ticker Scroll {config.scroll ? 'ON' : 'OFF'}</p>
                  <p className="text-sm text-slate-400">
                    ON = flashes scroll under the feed cards (clickable to each item&apos;s website);
                    OFF = the same flashes sit as a static row.
                  </p>
                </div>
              </div>
              <button
                role="switch"
                aria-checked={config.scroll}
                aria-label="Ticker Scroll"
                onClick={toggleScroll}
                disabled={saving}
                className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none disabled:opacity-50 ${config.scroll ? 'border-teal-300/60 bg-teal-300/20' : 'border-slate-700 bg-slate-800'}`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full transition-colors ${config.scroll ? 'right-0.5 bg-teal-300' : 'left-0.5 bg-slate-500'}`}
                />
              </button>
            </div>

            {/* Top row: Monitor / Channels / Schema */}
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <section className={card} aria-label="Real-Time Feed Monitor">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-white flex items-center gap-2">
                    <Radio className="w-4 h-4 text-lime-400" /> Feed Monitor
                  </h2>
                  <button
                    onClick={() => setLive((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs font-bold text-slate-200 transition-colors hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-lime-400 focus-visible:outline-none"
                    aria-pressed={live}
                  >
                    {live ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    {live ? 'Pause stream' : 'Resume'}
                  </button>
                </div>
                {(() => {
                  const samples = events.slice(-30);
                  const ok = events.filter((e) => e.status >= 200 && e.status < 300).length;
                  const fail = events.length - ok;
                  const total = Math.max(events.length, 1);
                  const okFrac = ok / total;
                  const avg = events.length === 0 ? 0 : Math.round(events.reduce((a, e) => a + e.latency, 0) / events.length);
                  const maxLat = Math.max(...samples.map((e) => e.latency), 1);
                  const R = 26;
                  const C = 2 * Math.PI * R;
                  return (
                    <>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-2">
                          <p className="font-mono text-xl font-black text-emerald-300">{ok}</p>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/80">Delivered</p>
                        </div>
                        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-2">
                          <p className="font-mono text-xl font-black text-rose-300">{fail}</p>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-rose-400/80">Failed</p>
                        </div>
                        <div className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2">
                          <p className="font-mono text-xl font-black text-teal-300">{avg}<span className="text-xs">ms</span></p>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Avg latency</p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 p-3">
                        <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0" role="img" aria-label={`${ok} delivered, ${fail} failed`}>
                          <circle cx="32" cy="32" r={R} fill="none" stroke="#1e293b" strokeWidth="8" />
                          <circle
                            cx="32" cy="32" r={R} fill="none"
                            stroke={fail === 0 ? '#a3e635' : '#fb7185'}
                            strokeWidth="8" strokeLinecap="round"
                            strokeDasharray={`${C * (fail === 0 ? 1 : fail / total)} ${C}`}
                            transform="rotate(-90 32 32)"
                            style={{ filter: `drop-shadow(0 0 5px ${fail === 0 ? 'rgba(163,230,53,0.8)' : 'rgba(251,113,133,0.8)'})`, transition: 'stroke-dasharray 0.5s ease, stroke 0.5s ease' }}
                          />
                          <text x="32" y="37" textAnchor="middle" fill="#f1f5f9" fontSize="13" fontWeight="900" fontFamily="monospace">
                            {Math.round(okFrac * 100)}%
                          </text>
                        </svg>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-200">Delivery health</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {events.length === 0
                              ? 'No samples yet — saves and test pushes appear here.'
                              : `${ok} of ${events.length} pushes healthy.`}
                          </p>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-lime-400 transition-all duration-500"
                              style={{ width: `${okFrac * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Latency per push — green delivered, red failed</p>
                        {samples.length === 0 ? (
                          <p className="mt-2 text-xs text-slate-500">Stream idle.</p>
                        ) : (
                          <div className="mt-2 flex h-20 items-end gap-1" role="img" aria-label="Per-push latency bars">
                            {samples.map((e) => {
                              const good = e.status >= 200 && e.status < 300;
                              return (
                                <div
                                  key={e.id}
                                  title={`${e.status} · ${e.latency}ms`}
                                  className={`flex-1 rounded-t transition-all duration-500 ${good
                                    ? 'bg-gradient-to-t from-emerald-500/40 to-lime-400 shadow-[0_0_6px_rgba(163,230,53,0.45)]'
                                    : 'bg-gradient-to-t from-rose-600/50 to-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.55)]'}`}
                                  style={{ height: `${Math.max(8, (e.latency / maxLat) * 100)}%` }}
                                />
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </section>

              <section className={card} aria-label="Channel Management Hub">
                <h2 className="font-bold text-white flex items-center gap-2">
                  <Webhook className="w-4 h-4 text-teal-300" /> Channels
                </h2>
                <ul className="mt-3 space-y-2">
                  {config.channels.length === 0 && (
                    <li className="text-xs text-slate-500">No channels yet — add one below.</li>
                  )}
                  {config.channels.map((ch) => (
                    <li key={ch.id} className="rounded-lg border border-slate-800 bg-slate-950 p-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase ${kindBadge(ch.kind)}`}>
                          {ch.kind}
                        </span>
                        <button
                          role="switch"
                          aria-checked={ch.enabled}
                          aria-label={`Enable ${ch.label}`}
                          onClick={() => patch((c) => ({
                            ...c,
                            channels: c.channels.map((x) => (x.id === ch.id ? { ...x, enabled: !x.enabled } : x)),
                          }))}
                          className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors focus-visible:ring-2 focus-visible:ring-lime-400 focus-visible:outline-none ${ch.enabled ? 'border-lime-400/60 bg-lime-400/20' : 'border-slate-700 bg-slate-800'}`}
                        >
                          <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-colors ${ch.enabled ? 'right-0.5 bg-lime-400' : 'left-0.5 bg-slate-500'}`} />
                        </button>
                        <span className="text-sm text-slate-200 font-semibold truncate flex-1">{ch.label}</span>
                        <button
                          onClick={() => testPush(ch)}
                          disabled={!ch.enabled || testingId === ch.id}
                          title="Send test push"
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-bold text-sky-300 transition-colors hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none disabled:opacity-50"
                        >
                          <Send className="w-3 h-3" /> {testingId === ch.id ? '…' : 'Test'}
                        </button>
                        <button
                          onClick={() => {
                            setEditingChannelId(ch.id);
                            setChannelDraft({ label: ch.label, url: ch.url });
                          }}
                          className="text-[11px] font-bold text-slate-400 hover:text-slate-100 transition-colors focus-visible:ring-2 focus-visible:ring-lime-400 focus-visible:outline-none rounded px-1"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => patch((c) => ({ ...c, channels: c.channels.filter((x) => x.id !== ch.id) }))}
                          aria-label={`Delete ${ch.label}`}
                          className="p-1 rounded text-slate-500 hover:text-rose-300 transition-colors focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:outline-none"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {editingChannelId === ch.id ? (
                        <div className="mt-2 space-y-1.5">
                          <input
                            value={channelDraft.label}
                            onChange={(e) => setChannelDraft((d) => ({ ...d, label: e.target.value }))}
                            className={inputDark}
                            aria-label="Channel label"
                          />
                          <input
                            value={channelDraft.url}
                            onChange={(e) => setChannelDraft((d) => ({ ...d, url: e.target.value }))}
                            className={`${inputDark} font-mono`}
                            aria-label="Channel URL"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                if (!/^https?:\/\/.+/i.test(channelDraft.url.trim())) return;
                                patch((c) => ({
                                  ...c,
                                  channels: c.channels.map((x) => (x.id === ch.id
                                    ? { ...x, label: channelDraft.label.trim() || x.label, url: channelDraft.url.trim() }
                                    : x)),
                                }));
                                setEditingChannelId(null);
                              }}
                              className={btnGhost}
                            >
                              Done
                            </button>
                            <button onClick={() => setEditingChannelId(null)} className={btnGhost}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-1 truncate text-[11px] text-slate-500 font-mono">{ch.url}</p>
                      )}
                      <p className="mt-1 text-[11px] text-slate-500 font-mono">
                        attempts: {attempts[ch.id] ?? 0}
                        {lastResults[ch.id] && (
                          <> · last <span className="text-slate-300">{lastResults[ch.id].status}</span> in <span className="text-teal-300">{lastResults[ch.id].latency}ms</span></>
                        )}
                      </p>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 space-y-1.5 rounded-lg border border-slate-800 bg-slate-950 p-2">
                  <label className={labelXs} htmlFor="ch-kind">Add channel</label>
                  <div className="flex gap-1.5">
                    <select
                      id="ch-kind"
                      value={newChannel.kind}
                      onChange={(e) => setNewChannel((d) => ({ ...d, kind: e.target.value as ChannelKind }))}
                      className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-lime-400"
                    >
                      {CHANNEL_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                    <input
                      value={newChannel.label}
                      onChange={(e) => setNewChannel((d) => ({ ...d, label: e.target.value }))}
                      placeholder="Label"
                      className={inputDark}
                      aria-label="New channel label"
                    />
                  </div>
                  <input
                    value={newChannel.url}
                    onChange={(e) => setNewChannel((d) => ({ ...d, url: e.target.value }))}
                    placeholder="https://…"
                    className={`${inputDark} font-mono`}
                    aria-label="New channel URL"
                  />
                  {channelError && <p className="text-xs text-amber-300">{channelError}</p>}
                  <button onClick={addChannel} className={btnGhost}>
                    <Plus className="w-3.5 h-3.5" /> Add channel
                  </button>
                </div>
              </section>

              <section className={card} aria-label="Payload Schema Builder">
                <h2 className="font-bold text-white flex items-center gap-2">
                  <FileJson className="w-4 h-4 text-sky-400" /> Schema
                </h2>
                <div role="radiogroup" aria-label="Payload format" className="mt-3 flex gap-2">
                  {(['json', 'xml'] as const).map((f) => (
                    <button
                      key={f}
                      role="radio"
                      aria-checked={config.schema.format === f}
                      onClick={() => patch((c) => ({ ...c, schema: { ...c.schema, format: f } }))}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-bold uppercase transition-colors focus-visible:ring-2 focus-visible:ring-lime-400 focus-visible:outline-none ${config.schema.format === f ? 'border-lime-400/60 bg-lime-400/10 text-lime-300' : 'border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <ul className="mt-3 space-y-1.5">
                  {config.schema.fields.map((f) => (
                    <li key={f.id} className="flex items-center gap-1.5">
                      <input
                        value={f.key}
                        onChange={(e) => patch((c) => ({
                          ...c,
                          schema: {
                            ...c.schema,
                            fields: c.schema.fields.map((x) => (x.id === f.id ? { ...x, key: e.target.value } : x)),
                          },
                        }))}
                        className={`${inputDark} font-mono`}
                        aria-label="Field key"
                      />
                      <select
                        value={f.source}
                        onChange={(e) => patch((c) => ({
                          ...c,
                          schema: {
                            ...c.schema,
                            fields: c.schema.fields.map((x) => (x.id === f.id ? { ...x, source: e.target.value as SchemaSource } : x)),
                          },
                        }))}
                        className="rounded-lg border border-slate-700 bg-slate-950 px-1.5 py-1.5 text-xs text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-lime-400"
                        aria-label="Field source"
                      >
                        {SCHEMA_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <label className="flex items-center gap-1 text-[11px] text-slate-400 shrink-0">
                        <input
                          type="checkbox"
                          checked={f.required}
                          onChange={(e) => patch((c) => ({
                            ...c,
                            schema: {
                              ...c.schema,
                              fields: c.schema.fields.map((x) => (x.id === f.id ? { ...x, required: e.target.checked } : x)),
                            },
                          }))}
                          className="accent-lime-400"
                        />
                        req
                      </label>
                      <button
                        onClick={() => patch((c) => ({
                          ...c,
                          schema: { ...c.schema, fields: c.schema.fields.filter((x) => x.id !== f.id) },
                        }))}
                        aria-label={`Remove field ${f.key}`}
                        className="p-1 rounded text-slate-500 hover:text-rose-300 transition-colors focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:outline-none"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex gap-1.5">
                  <input
                    value={newFieldKey}
                    onChange={(e) => setNewFieldKey(e.target.value)}
                    placeholder="new-field key"
                    className={`${inputDark} font-mono`}
                    aria-label="New field key"
                  />
                  <button
                    onClick={() => {
                      if (!newFieldKey.trim()) return;
                      patch((c) => ({
                        ...c,
                        schema: {
                          ...c.schema,
                          fields: [...c.schema.fields, { id: uid(), key: newFieldKey.trim(), source: 'title' as SchemaSource, required: false }],
                        },
                      }));
                      setNewFieldKey('');
                    }}
                    className={btnGhost}
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </div>
                <pre className="mt-3 max-h-48 overflow-auto rounded-lg border border-slate-800 bg-black/60 p-2.5 font-mono text-[11px] leading-relaxed text-teal-300">
                  {previewText}
                </pre>
              </section>
            </div>

            {/* Second row: Diagnostics / Rate+Security */}
            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
              <section className={card} aria-label="Health and Error Diagnostics">
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => setDiagOpen((v) => !v)}
                    className="flex items-center gap-2 font-bold text-white rounded-lg focus-visible:ring-2 focus-visible:ring-lime-400 focus-visible:outline-none"
                    aria-expanded={diagOpen}
                    aria-label="Toggle diagnostics"
                  >
                    <Activity className="w-4 h-4 text-rose-300" /> Diagnostics
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${diagOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {diagOpen && <button onClick={() => setEvents([])} className={btnGhost}>Clear log</button>}
                </div>
                {!diagOpen ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Collapsed — expand to inspect {events.length === 0 ? 'push events.' : `${events.length} push event${events.length === 1 ? '' : 's'}.`}
                  </p>
                ) : (
                <>
                <div className="mt-3 space-y-1.5">
                  {events.length === 0 && <p className="text-xs text-slate-500">No events yet.</p>}
                  {events.map((e) => (
                    <div key={e.id} className="rounded-lg border border-slate-800 bg-slate-950">
                      <button
                        onClick={() => setExpandedId((id) => (id === e.id ? null : e.id))}
                        className="flex w-full items-center gap-2 px-2 py-1.5 text-xs transition-colors hover:bg-slate-900 focus-visible:ring-2 focus-visible:ring-lime-400 focus-visible:outline-none rounded-lg"
                        aria-expanded={expandedId === e.id}
                      >
                        <span className={`px-1.5 py-0.5 rounded border font-mono font-bold ${statusChip(e.status)}`}>{e.status}</span>
                        <span className="truncate text-slate-300 flex-1 text-left">{e.channel}</span>
                        <span className="text-slate-400 font-mono">{e.time}</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-colors ${expandedId === e.id ? 'rotate-180' : ''}`} />
                      </button>
                      {expandedId === e.id && (
                        <pre className="mx-2 mb-2 max-h-32 overflow-auto rounded border border-slate-800 bg-black/60 p-2 font-mono text-[11px] text-slate-300">
                          {e.payload}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
                {Object.keys(attempts).length > 0 && (
                  <p className="mt-3 text-[11px] text-slate-500 font-mono">
                    retries — {Object.entries(attempts).map(([id, n]) => {
                      const ch = config.channels.find((c) => c.id === id);
                      return `${ch?.label ?? id}: ${n}`;
                    }).join(' · ')}
                  </p>
                )}
                </>
                )}
              </section>

              <section className={card} aria-label="Rate Limiting and Security">
                <h2 className="font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-lime-400" /> Rate & Security
                </h2>
                <div className="mt-3 space-y-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <label className={labelXs} htmlFor="rate-per-minute">
                        <span className="inline-flex items-center gap-1"><Gauge className="w-3.5 h-3.5" /> Per minute</span>
                      </label>
                      <span className="font-mono text-sm text-lime-300">{config.rate.perMinute}</span>
                    </div>
                    <input
                      id="rate-per-minute"
                      type="range" min={1} max={600}
                      value={config.rate.perMinute}
                      onChange={(e) => patch((c) => ({ ...c, rate: { ...c.rate, perMinute: Number(e.target.value) } }))}
                      className="w-full accent-lime-400"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <label className={labelXs} htmlFor="rate-burst">Burst</label>
                      <span className="font-mono text-sm text-lime-300">{config.rate.burst}</span>
                    </div>
                    <input
                      id="rate-burst"
                      type="range" min={1} max={100}
                      value={config.rate.burst}
                      onChange={(e) => patch((c) => ({ ...c, rate: { ...c.rate, burst: Number(e.target.value) } }))}
                      className="w-full accent-teal-300"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={labelXs}>Retry max</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => patch((c) => ({ ...c, rate: { ...c.rate, retryMax: Math.max(0, c.rate.retryMax - 1) } }))}
                        className="w-7 h-7 rounded-lg border border-slate-700 bg-slate-800 font-bold text-slate-200 transition-colors hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-lime-400 focus-visible:outline-none"
                        aria-label="Decrease retries"
                      >
                        −
                      </button>
                      <span className="font-mono text-sm text-sky-300 w-6 text-center">{config.rate.retryMax}</span>
                      <button
                        onClick={() => patch((c) => ({ ...c, rate: { ...c.rate, retryMax: Math.min(10, c.rate.retryMax + 1) } }))}
                        className="w-7 h-7 rounded-lg border border-slate-700 bg-slate-800 font-bold text-slate-200 transition-colors hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-lime-400 focus-visible:outline-none"
                        aria-label="Increase retries"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className={labelXs}>Signing secret</span>
                      <button onClick={rotateSecret} disabled={rotating} className={btnGhost}>
                        <RefreshCw className={`w-3.5 h-3.5 ${rotating ? 'animate-spin' : ''}`} />
                        {secret ? 'Regenerate' : 'Generate'}
                      </button>
                    </div>
                    {secret ? (
                      <div className="mt-2 flex gap-1.5">
                        <input ref={secretRef} readOnly value={secret} className={`${inputDark} font-mono`} aria-label="Signing secret" />
                        <button onClick={copySecret} className={btnGhost} aria-label="Copy secret">
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-slate-500">No secret shown. Generate reveals it once.</p>
                    )}
                    <p className="mt-2 text-xs text-slate-400">
                      Signed with HMAC-SHA256 over the raw body (X-Netamps-Signature).
                    </p>
                  </div>
                </div>
              </section>
            </div>

            {/* Feed items editor: full width below the grids. */}
            <section className={`${card} mt-4`} aria-label="Feed Items Editor">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="font-bold text-white flex items-center gap-2">
                  <Rss className="w-4 h-4 text-lime-400" /> Feed Items
                </h2>
                <div className="flex items-center gap-2">
                  {defaultItems && defaultItems.length > 0 && (
                    <button
                      onClick={() => {
                        if (!window.confirm('Replace all feed items with the current defaults? Your channels, rate and schema are untouched. Press Save items to publish.')) return;
                        setItems(defaultItems.map((d) => ({ ...d, id: uid() })));
                        setNotice('Defaults loaded into the editor — press Save items to publish.');
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-bold text-slate-200 transition-colors hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-lime-400 focus-visible:outline-none"
                    >
                      <RefreshCw className="w-3 h-3" /> Restore defaults
                    </button>
                  )}
                  <span className="text-[11px] font-mono text-slate-500">{items.length}/{MAX_ITEMS}</span>
                  <button onClick={() => saveItems(items)} disabled={savingItems || uploadingId !== null} className={btnGhost}>
                    {savingItems ? 'Saving…' : 'Save items'}
                  </button>
                </div>
              </div>
              <ul className="mt-3 space-y-2">
                {items.length === 0 && (
                  <li className="text-xs text-slate-500">No curated items — the landing shows the paused bar until items exist and the feed is ON.</li>
                )}
                {items.map((it) => (
                  <li key={it.id} className="rounded-lg border border-slate-800 bg-slate-950 p-2">
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      <div className="flex items-center gap-2">
                        <input
                          value={it.tag}
                          onChange={(e) => setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, tag: e.target.value } : x)))}
                          placeholder="tag" className={inputDark} aria-label="Item tag"
                        />
                        {isExpiredTs(it.ts) && (
                          <span className="shrink-0 rounded border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">Expired</span>
                        )}
                      </div>
                      <input
                        value={it.href}
                        onChange={(e) => setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, href: e.target.value } : x)))}
                        placeholder="https://website… (ticker links here)"
                        className={`${inputDark} font-mono`}
                        aria-label="Item website URL — the ticker flash links here"
                        title="Website URL — the landing ticker flash links here"
                      />
                      <input
                        value={it.title}
                        onChange={(e) => setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, title: e.target.value } : x)))}
                        placeholder="Title" className={`${inputDark} sm:col-span-2`} aria-label="Item title"
                      />
                      <input
                        value={it.detail}
                        onChange={(e) => setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, detail: e.target.value } : x)))}
                        placeholder="Detail" className={`${inputDark} sm:col-span-2`} aria-label="Item detail"
                      />
                      {it.media_url.trim() !== '' && (
                        <div className="sm:col-span-2">
                          {it.media_kind === 'image' ? (
                            <img src={previewSrc(it.media_url)} alt="" className="h-16 rounded object-cover" />
                          ) : it.media_kind === 'video' ? (
                            <video src={previewSrc(it.media_url)} className="h-16 rounded" controls preload="none" />
                          ) : (
                            <span className="inline-block max-w-full truncate rounded border border-slate-700 bg-slate-800 px-2 py-1 font-mono text-[11px] text-slate-200">
                              {mediaFileName(it.media_url)}
                            </span>
                          )}
                        </div>
                      )}
                      <label className="sm:col-span-2">
                        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Media kind</span>
                        <select
                          value={it.media_kind}
                          onChange={(e) => setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, media_kind: e.target.value as MediaKind } : x)))}
                          className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-lime-400"
                          aria-label={`Media kind for ${it.title || 'item'}`}
                        >
                          {MEDIA_KINDS.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </label>
                      {it.media_kind !== 'none' && (
                        <input
                          value={it.media_url}
                          onChange={(e) => setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, media_url: e.target.value } : x)))}
                          placeholder="https://… image / video / file URL"
                          className={`${inputDark} font-mono sm:col-span-2`}
                          aria-label={`Media URL for ${it.title || 'item'}`}
                        />
                      )}
                      <div className="sm:col-span-2 flex items-center gap-2 flex-wrap">
                        <label className={`${btnGhost} cursor-pointer ${uploadingId !== null ? 'opacity-50 pointer-events-none' : ''}`}>
                          {uploadingId === `upload:${it.id}` ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Upload className="w-3.5 h-3.5" />
                          )}
                          {uploadingId === `upload:${it.id}` ? 'Uploading…' : 'Upload file'}
                          <input
                            type="file"
                            className="hidden"
                            accept={MEDIA_ACCEPT}
                            disabled={uploadingId !== null}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = '';
                              void handleMediaUpload(it.id, f);
                            }}
                          />
                        </label>
                        {it.media_url.trim() !== '' && (
                          <button
                            onClick={() => void handleMediaRemove(it.id, it.media_url)}
                            disabled={uploadingId !== null}
                            className={btnGhost}
                          >
                            {uploadingId === `remove:${it.id}` ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <X className="w-3.5 h-3.5" />
                            )}
                            {uploadingId === `remove:${it.id}` ? 'Removing…' : 'Remove attachment'}
                          </button>
                        )}
                        {uploadError[it.id] && <p className="text-xs text-amber-300 w-full">{uploadError[it.id]}</p>}
                      </div>
                      <label className="sm:col-span-2">
                        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Item date (individual) — display until; empty = always shown</span>
                        <input
                          type="datetime-local"
                          value={tsToLocalInput(it.ts)}
                          onChange={(e) => setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, ts: tsFromLocalInput(e.target.value) } : x)))}
                          className={`${inputDark} font-mono`}
                          aria-label={`Date for ${it.title || 'item'}`}
                        />
                      </label>
                    </div>
                    <div className="mt-1.5 flex justify-end">
                      <button
                        onClick={() => setItems((prev) => prev.filter((x) => x.id !== it.id))}
                        aria-label={`Delete item ${it.title}`}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-rose-300 transition-colors focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:outline-none rounded px-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2 rounded-lg border border-slate-800 bg-slate-950 p-2">
                <input value={newItem.tag} onChange={(e) => setNewItem((d) => ({ ...d, tag: e.target.value }))} placeholder="tag" className={inputDark} aria-label="New item tag" />
                <input value={newItem.href} onChange={(e) => setNewItem((d) => ({ ...d, href: e.target.value }))} placeholder="https://website… (ticker links here)" className={`${inputDark} font-mono`} aria-label="New item website URL" />
                <input value={newItem.title} onChange={(e) => setNewItem((d) => ({ ...d, title: e.target.value }))} placeholder="Title" className={`${inputDark} sm:col-span-2`} aria-label="New item title" />
                <input value={newItem.detail} onChange={(e) => setNewItem((d) => ({ ...d, detail: e.target.value }))} placeholder="Detail" className={`${inputDark} sm:col-span-2`} aria-label="New item detail" />
                {newItem.media_url.trim() !== '' && (
                  <div className="sm:col-span-2">
                    {newItem.media_kind === 'image' ? (
                      <img src={previewSrc(newItem.media_url)} alt="" className="h-16 rounded object-cover" />
                    ) : newItem.media_kind === 'video' ? (
                      <video src={previewSrc(newItem.media_url)} className="h-16 rounded" controls preload="none" />
                    ) : (
                      <span className="inline-block max-w-full truncate rounded border border-slate-700 bg-slate-800 px-2 py-1 font-mono text-[11px] text-slate-200">
                        {mediaFileName(newItem.media_url)}
                      </span>
                    )}
                  </div>
                )}
                <label className="sm:col-span-2">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Media kind</span>
                  <select
                    value={newItem.media_kind}
                    onChange={(e) => setNewItem((d) => ({ ...d, media_kind: e.target.value as MediaKind }))}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-lime-400"
                    aria-label="New item media kind"
                  >
                    {MEDIA_KINDS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
                {newItem.media_kind !== 'none' && (
                  <input
                    value={newItem.media_url}
                    onChange={(e) => setNewItem((d) => ({ ...d, media_url: e.target.value }))}
                    placeholder="https://… image / video / file URL"
                    className={`${inputDark} font-mono sm:col-span-2`}
                    aria-label="New item media URL"
                  />
                )}
                <div className="sm:col-span-2 flex items-center gap-2 flex-wrap">
                  <label className={`${btnGhost} cursor-pointer ${uploadingId !== null ? 'opacity-50 pointer-events-none' : ''}`}>
                    {uploadingId === 'upload:new' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    {uploadingId === 'upload:new' ? 'Uploading…' : 'Upload file'}
                    <input
                      type="file"
                      className="hidden"
                      accept={MEDIA_ACCEPT}
                      disabled={uploadingId !== null}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        void handleMediaUpload('new', f);
                      }}
                    />
                  </label>
                  {newItem.media_url.trim() !== '' && (
                    <button
                      onClick={() => void handleMediaRemove('new', newItem.media_url)}
                      disabled={uploadingId !== null}
                      className={btnGhost}
                    >
                      {uploadingId === 'remove:new' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <X className="w-3.5 h-3.5" />
                      )}
                      {uploadingId === 'remove:new' ? 'Removing…' : 'Remove attachment'}
                    </button>
                  )}
                  {uploadError.new && <p className="text-xs text-amber-300 w-full">{uploadError.new}</p>}
                </div>
                <label className="sm:col-span-2">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Display until (empty = always shown)</span>
                  <input
                    type="datetime-local"
                    value={tsToLocalInput(newItem.ts)}
                    onChange={(e) => setNewItem((d) => ({ ...d, ts: tsFromLocalInput(e.target.value) }))}
                    className={`${inputDark} font-mono`}
                    aria-label="New item date"
                  />
                </label>
                <div className="sm:col-span-2">
                  <button
                    onClick={() => {
                      if (!newItem.title.trim() || items.length >= MAX_ITEMS) return;
                      setItems((prev) => [...prev, {
                        id: uid(),
                        tag: newItem.tag.trim(),
                        title: newItem.title.trim(),
                        detail: newItem.detail.trim(),
                        href: newItem.href.trim(),
                        media_kind: newItem.media_kind,
                        media_url: newItem.media_url.trim(),
                        // Individual date per item: operator's pick, else now.
                        ts: newItem.ts,
                      }]);
                      setNewItem({ tag: '', title: '', detail: '', href: '', media_kind: 'none', media_url: '', ts: '' });
                    }}
                    disabled={!newItem.title.trim() || items.length >= MAX_ITEMS || uploadingId !== null}
                    className={btnGhost}
                  >
                    <Plus className="w-3.5 h-3.5" /> Add item
                  </button>
                </div>
              </div>
            </section>

            {/* Scroll ticker editor: flashes under the feed cards. */}
            <section className={`${card} mt-4`} aria-label="Scroll Ticker Editor">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="font-bold text-white flex items-center gap-2">
                  <Repeat className="w-4 h-4 text-teal-300" /> Scroll Ticker
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-slate-500">{ticker.length}</span>
                  <button onClick={() => saveTicker(ticker)} disabled={savingTicker} className={btnGhost}>
                    {savingTicker ? 'Saving…' : 'Save ticker'}
                  </button>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                The Ticker Scroll switch at top controls motion; these entries are the flashes.
              </p>
              <ul className="mt-3 space-y-2">
                {ticker.length === 0 && (
                  <li className="text-xs text-slate-500">No ticker entries — add flashes below, then Save ticker.</li>
                )}
                {ticker.map((t) => (
                  <li key={t.id} className="rounded-lg border border-slate-800 bg-slate-950 p-2">
                    <div className="flex items-center gap-2">
                      <input
                        value={t.tag}
                        onChange={(e) => setTicker((prev) => prev.map((x) => (x.id === t.id ? { ...x, tag: e.target.value } : x)))}
                        placeholder="tag" className={inputDark} aria-label="Ticker tag"
                      />
                      <button
                        role="switch"
                        aria-checked={t.enabled}
                        aria-label={`Enable ticker ${t.text || t.tag}`}
                        onClick={() => setTicker((prev) => prev.map((x) => (x.id === t.id ? { ...x, enabled: !x.enabled } : x)))}
                        className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors focus-visible:ring-2 focus-visible:ring-lime-400 focus-visible:outline-none ${t.enabled ? 'border-lime-400/60 bg-lime-400/20' : 'border-slate-700 bg-slate-800'}`}
                      >
                        <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-colors ${t.enabled ? 'right-0.5 bg-lime-400' : 'left-0.5 bg-slate-500'}`} />
                      </button>
                      <button
                        onClick={() => setTicker((prev) => prev.filter((x) => x.id !== t.id))}
                        aria-label={`Delete ticker ${t.text}`}
                        className="p-1 rounded text-slate-500 hover:text-rose-300 transition-colors focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:outline-none"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="mt-1.5 grid grid-cols-1 gap-1.5">
                      <input
                        value={t.text}
                        onChange={(e) => setTicker((prev) => prev.map((x) => (x.id === t.id ? { ...x, text: e.target.value } : x)))}
                        placeholder="Flash text" className={inputDark} aria-label="Ticker text"
                      />
                      <input
                        value={t.url}
                        onChange={(e) => setTicker((prev) => prev.map((x) => (x.id === t.id ? { ...x, url: e.target.value } : x)))}
                        placeholder="https://…" className={`${inputDark} font-mono`} aria-label="Ticker URL"
                      />
                      <label>
                        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Display until (empty = always shown)
                          {isExpiredTs(t.ts) && <span className="ml-2 rounded border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-300">Expired — hidden on site</span>}
                        </span>
                        <input
                          type="datetime-local"
                          value={tsToLocalInput(t.ts)}
                          onChange={(e) => setTicker((prev) => prev.map((x) => (x.id === t.id ? { ...x, ts: tsFromLocalInput(e.target.value) } : x)))}
                          className={`${inputDark} font-mono`}
                          aria-label={`Display-until date for ${t.text || 'ticker flash'}`}
                        />
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-3 rounded-lg border border-slate-800 bg-slate-950 p-2">
                <input value={newTicker.tag} onChange={(e) => setNewTicker((d) => ({ ...d, tag: e.target.value }))} placeholder="tag" className={inputDark} aria-label="New ticker tag" />
                <input value={newTicker.text} onChange={(e) => setNewTicker((d) => ({ ...d, text: e.target.value }))} placeholder="Flash text" className={inputDark} aria-label="New ticker text" />
                <input value={newTicker.url} onChange={(e) => setNewTicker((d) => ({ ...d, url: e.target.value }))} placeholder="https://…" className={`${inputDark} font-mono`} aria-label="New ticker URL" />
                <input
                  type="datetime-local"
                  value={tsToLocalInput(newTicker.ts)}
                  onChange={(e) => setNewTicker((d) => ({ ...d, ts: tsFromLocalInput(e.target.value) }))}
                  className={`${inputDark} font-mono`}
                  aria-label="New ticker display-until date"
                  title="Display until (empty = always shown)"
                />
                <div className="sm:col-span-3">
                  <button
                    onClick={() => {
                      if (!newTicker.text.trim()) return;
                      setTicker((prev) => [...prev, {
                        id: uid(),
                        tag: newTicker.tag.trim(),
                        text: newTicker.text.trim(),
                        url: newTicker.url.trim(),
                        ts: newTicker.ts,
                        enabled: true,
                      }]);
                      setNewTicker({ tag: '', text: '', url: '', ts: '' });
                    }}
                    disabled={!newTicker.text.trim()}
                    className={btnGhost}
                  >
                    <Plus className="w-3.5 h-3.5" /> Add flash
                  </button>
                </div>
              </div>
            </section>

            {/* Feed history: server-persisted archive of saves and test pushes. */}
            <section className={`${card} mt-4`} aria-label="Feed History">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="font-bold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-teal-300" /> Feed History
                </h2>
                <button onClick={() => loadHistory()} disabled={historyLoading} className={btnGhost}>
                  <RefreshCw className={`w-3.5 h-3.5 ${historyLoading ? 'animate-spin' : ''}`} />
                  {historyLoading ? 'Loading…' : 'Refresh'}
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Server-persisted archive — every save and test push is logged automatically. Refreshes every 30s.
              </p>
              {historyError && <p className="mt-2 text-xs text-amber-300">{historyError}</p>}
              {history.length === 0 ? (
                <p className="mt-3 text-xs text-slate-500">No push history yet — saves and test pushes are logged automatically.</p>
              ) : (
                <ul className="mt-3 max-h-96 space-y-1.5 overflow-auto">
                  {history.map((h) => (
                    <li key={h.id} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 text-xs">
                      <span className="font-mono text-slate-400 shrink-0">{h.ts ? new Date(h.ts).toLocaleString() : '—'}</span>
                      <span className="px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800 text-slate-300 text-[10px] font-bold uppercase shrink-0">{h.kind}</span>
                      <span className="truncate text-slate-300 flex-1">{h.channel || '—'}</span>
                      <span className={`px-1.5 py-0.5 rounded border font-mono font-bold shrink-0 ${statusChip(h.status)}`}>{h.status}</span>
                      <span className="font-mono text-teal-300 shrink-0">{h.latency_ms}ms</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </main>
    </DashboardShell>
  );
}
