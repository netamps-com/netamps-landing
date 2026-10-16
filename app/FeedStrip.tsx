'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText } from 'lucide-react';

type MediaKind = 'none' | 'image' | 'video' | 'file';

type FeedItem = {
  id: string;
  tag: string;
  title: string;
  detail: string;
  href: string;
  ts: string;
  media_kind?: MediaKind;
  media_url?: string;
};

type TickerEntry = {
  id: string;
  tag: string;
  text: string;
  url: string;
  ts?: string;
  enabled?: boolean;
};

type FeedLoadState =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; enabled: boolean; scroll: boolean; items: FeedItem[]; ticker: TickerEntry[] };

// Production-grade refresh: static export has no sockets, so the strip
// revalidates on an interval (skipped while the tab is hidden) plus on
// window focus. No links leave this section — titles render as plain text.
const POLL_MS = 60000;
const FETCH_TIMEOUT_MS = 10000;

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return ts;
  }
}

// Display-until mirror of the API rule: day-first numeric forms, Date.parse
// fallback, empty/garbage never expires. Applied client-side too so a cached
// payload still hides crossed dates within the refresh window.
function isLive(ts: unknown, now: number): boolean {
  if (typeof ts !== 'string') return true;
  const v = ts.trim();
  if (!v) return true;
  const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(v);
  if (m) {
    const dd = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const yyyy = parseInt(m[3], 10);
    const hh = m[4] === undefined ? 0 : parseInt(m[4], 10);
    const mi = m[5] === undefined ? 0 : parseInt(m[5], 10);
    const ss = m[6] === undefined ? 0 : parseInt(m[6], 10);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && hh <= 23 && mi <= 59 && ss <= 59) {
      return new Date(yyyy, mm - 1, dd, hh, mi, ss).getTime() > now;
    }
  }
  const native = Date.parse(v);
  if (!Number.isFinite(native)) return true;
  return native > now;
}

// Attachment rendering follows standard practice: lazy images, click-to-play
// video (no preload), files as labelled links. Accepts absolute http(s) and
// same-origin `/api/cdn/…` URLs (local R2 uploads); everything else —
// protocol-relative, javascript:, data:, bare relative — renders nothing.
function isServableSrc(src: string): boolean {
  if (/^https?:\/\/.+/i.test(src)) return true;
  if (src.startsWith('/') && !src.startsWith('//')) return true;
  return false;
}

function FeedMedia({ kind, url, title }: { kind?: MediaKind; url?: string; title: string }) {
  const src = typeof url === 'string' ? url.trim() : '';
  if (!src || !isServableSrc(src)) return null;
  if (kind === 'image') {
    return (
      <img
        src={src}
        alt={title}
        loading="lazy"
        className="mb-3 h-36 w-full rounded-xl border border-slate-200/70 object-cover"
      />
    );
  }
  if (kind === 'video') {
    return (
      <video
        src={src}
        controls
        preload="none"
        className="mb-3 h-36 w-full rounded-xl border border-slate-200/70 bg-slate-950 object-cover"
      />
    );
  }
  if (kind === 'file') {
    return (
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-indigo-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <FileText className="h-3.5 w-3.5" /> Open attachment
      </a>
    );
  }
  return null;
}

// One flash in the ticker. Links only to servable targets (http(s) or
// same-origin CDN paths) — anything else renders as plain text, so no
// crafted href can run script or route into the app.
function TickerFlash({ item }: { item: { id: string; tag: string; title: string; href: string } }) {
  const href = typeof item.href === 'string' ? item.href.trim() : '';
  const safe = isServableSrc(href) ? href : null;
  const inner = (
    <>
      <span aria-hidden="true" className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-lime-400 shadow-[0_0_8px_rgba(163,230,53,0.9)]" />
      <span className="uppercase text-teal-300">{item.tag}</span>
      <span className="text-slate-100">{item.title}</span>
    </>
  );
  if (!safe) {
    return (
      <span className="flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-200">
        {inner}
      </span>
    );
  }
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-200 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 rounded"
    >
      {inner}
    </a>
  );
}

export default function FeedStrip() {
  const [state, setState] = useState<FeedLoadState>({ status: 'loading' });
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const base = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${base}/api/feed?public=1`, { cache: 'no-store', signal: ctrl.signal });
      if (!res.ok) throw new Error('Feed request failed');
      const data = (await res.json()) as { enabled?: unknown; scroll?: unknown; items?: unknown; ticker?: unknown; updatedAt?: unknown };
      const items = Array.isArray(data.items) ? (data.items as FeedItem[]) : [];
      const rawTicker = Array.isArray(data.ticker) ? (data.ticker as TickerEntry[]) : [];
      setState({ status: 'ready', enabled: data.enabled !== false, scroll: data.scroll !== false, items, ticker: rawTicker });
      if (typeof data.updatedAt === 'string') setUpdatedAt(data.updatedAt);
    } catch {
      // Keep the last good render; only a first-load failure hides the strip.
      setState((prev) => (prev.status === 'ready' ? prev : { status: 'failed' }));
    } finally {
      clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    window.addEventListener('focus', load);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', load);
      abortRef.current?.abort();
    };
  }, [load]);

  if (state.status === 'loading') {
    return (
      <section aria-busy="true" aria-label="Loading feed" className="relative overflow-hidden border-y border-slate-200/70 bg-gradient-to-b from-white via-indigo-50/40 to-white">
        <div className="mx-auto grid max-w-7xl animate-pulse gap-4 px-4 py-8 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm">
              <div className="h-3 w-16 rounded-full bg-slate-200" />
              <div className="mt-3 h-4 w-3/4 rounded bg-slate-200" />
              <div className="mt-2 h-3 w-full rounded bg-slate-200" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  // A failed feed must never break the landing page.
  if (state.status === 'failed') return null;

  // Compact single-line bar when the feed is disabled.
  if (!state.enabled) {
    return (
      <div className="border-y border-slate-200/70 bg-white/70">
        <p className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2 text-xs text-slate-500">
          <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-slate-400" />
          <span>Feed updates are paused — explore our services below.</span>
          <a href="#services" className="font-medium text-indigo-600 hover:text-indigo-800">
            View services
          </a>
        </p>
      </div>
    );
  }

  // Dedicated ticker placeholder wins; items backfill only when the operator
  // has not curated ticker entries yet. Crossed display-until dates hide in
  // both lists (the API filters too; this covers cached payloads mid-window).
  const now = Date.now();
  const liveItems = state.items.filter((it) => it.title.trim() !== '' && isLive(it.ts, now));
  const liveTicker = state.ticker.filter((t) => t.text.trim() !== '' && isLive(t.ts, now));
  const tickerItems = (liveTicker.length > 0
    ? liveTicker.map((t) => ({ id: t.id, tag: t.tag, title: t.text, href: t.url }))
    : liveItems.map((it) => ({ id: it.id, tag: it.tag, title: it.title, href: it.href }))
  );

  return (
    <section aria-label="Netamps signal feed" className="relative overflow-hidden border-y border-slate-200/70 bg-gradient-to-b from-white via-indigo-50/50 to-white">
      <style>{`
        @keyframes feed-rise { from { opacity: 0; transform: translateY(10px) scale(0.99); } to { opacity: 1; transform: none; } }
        @keyframes feed-ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .feed-ticker-track { animation: feed-ticker 45s linear infinite; }
        .feed-ticker:hover .feed-ticker-track { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) {
          .feed-ticker-track { animation: none; }
        }
      `}</style>

      {/* Ambient mesh — decorative only. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/4 h-64 w-64 rounded-full bg-indigo-200/40 blur-[90px]" />
        <div className="absolute -bottom-24 right-1/4 h-64 w-64 rounded-full bg-emerald-200/40 blur-[90px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-10 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-700">
              <span aria-hidden="true" className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-600" />
              </span>
              Live Feed
            </span>
            <h2 className="mt-3 bg-gradient-to-r from-slate-900 via-indigo-900 to-slate-900 bg-clip-text text-2xl font-black tracking-tight text-transparent sm:text-3xl">
              Real-time insights, expertly curated
            </h2>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {liveItems.map((item, i) => (
            <article
              key={item.id || i}
              style={{ animation: 'feed-rise 0.45s ease-out both', animationDelay: `${i * 70}ms` }}
              className="group relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-indigo-300/70 hover:shadow-[0_12px_32px_rgba(79,70,229,0.12)]"
            >
              <div aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-indigo-500 via-sky-400 to-emerald-400 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <FeedMedia kind={item.media_kind} url={item.media_url} title={item.title} />
              <span className="inline-block rounded-full bg-gradient-to-r from-indigo-50 to-sky-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-indigo-700 ring-1 ring-inset ring-indigo-100">
                {item.tag}
              </span>
              <h3 className="mt-2.5 text-sm font-bold leading-snug text-slate-900">
                {item.title}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{item.detail}</p>
              {item.ts ? (
                <time dateTime={item.ts} className="mt-3 block text-xs font-medium text-slate-400">
                  {formatTime(item.ts)}
                </time>
              ) : null}
            </article>
          ))}
        </div>
      </div>

      {/* Flash scroll ticker — pure CSS motion, duplicated list for a gapless
          loop. The duplicate is aria-hidden so readers hear each flash once.
          Each flash links to the website entered for that item (http(s) only);
          items without a website render as plain text. When the dashboard
          scroll switch is OFF, the same flashes render as a static row. */}
      {tickerItems.length > 0 && (
        <div className="feed-ticker relative border-t border-slate-200/70 bg-slate-950/[0.92] py-2.5 backdrop-blur">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-slate-950 to-transparent" aria-hidden="true" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-slate-950 to-transparent" aria-hidden="true" />
          {state.scroll ? (
            <div className="feed-ticker-track flex w-max items-center gap-8 whitespace-nowrap px-4">
              {[0, 1].map((copy) => (
                <div key={copy} aria-hidden={copy === 1} className="flex items-center gap-8">
                  {tickerItems.map((item) => (
                    <TickerFlash key={`${copy}-${item.id}`} item={item} />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-2 px-4">
              {tickerItems.map((item) => (
                <TickerFlash key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      )}
      {updatedAt && (
        <p className="sr-only">Feed last updated {formatTime(updatedAt)}</p>
      )}
    </section>
  );
}
