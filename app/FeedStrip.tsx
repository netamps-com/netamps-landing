'use client';

import { useEffect, useState } from 'react';

type FeedItem = {
  id: string;
  tag: string;
  title: string;
  detail: string;
  href: string;
  ts: string;
};

type FeedLoadState =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; enabled: boolean; items: FeedItem[] };

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return ts;
  }
}

export default function FeedStrip() {
  const [state, setState] = useState<FeedLoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const base = process.env.NEXT_PUBLIC_API_URL || '';
    fetch(`${base}/api/feed?public=1`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error('Feed request failed');
        const data = (await res.json()) as { enabled?: unknown; items?: unknown };
        if (cancelled) return;
        const items = Array.isArray(data.items) ? (data.items as FeedItem[]) : [];
        setState({ status: 'ready', enabled: data.enabled !== false, items });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <section aria-busy="true" aria-label="Loading feed" className="border-y border-slate-200 bg-white/60">
        <div className="mx-auto grid max-w-7xl animate-pulse gap-4 px-4 py-6 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border border-slate-200 bg-slate-100 p-4">
              <div className="h-3 w-16 rounded bg-slate-200" />
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
      <div className="border-y border-slate-200 bg-white/60">
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

  return (
    <section aria-label="Netamps signal feed" className="border-y border-slate-200 bg-white/60 backdrop-blur">
      <style>{`@keyframes feed-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }`}</style>
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
              Live Feed
            </span>
            <h2 className="text-lg font-semibold text-slate-900">Netamps Signal Feed</h2>
          </div>
          <a href="/dashboard/feed" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
            Manage in dashboard
          </a>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {state.items.map((item, i) => (
            <article
              key={item.id || i}
              style={{ animation: 'feed-rise 0.4s ease-out both', animationDelay: `${i * 60}ms` }}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            >
              <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                {item.tag}
              </span>
              <h3 className="mt-2 text-sm font-semibold text-slate-900">
                {item.href ? (
                  <a href={item.href} className="hover:text-indigo-700">
                    {item.title}
                  </a>
                ) : (
                  item.title
                )}
              </h3>
              <p className="mt-1 text-sm text-slate-600">{item.detail}</p>
              <time dateTime={item.ts} className="mt-2 block text-xs text-slate-400">
                {formatTime(item.ts)}
              </time>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
