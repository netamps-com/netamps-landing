'use client';

/**
 * Price Tracker — the permanent final-price audit trail, on its own page.
 *
 * Deliberately separate from the order list. Each row here is a decision that
 * was CAPTURED and can never be edited: what it covered (the product names,
 * frozen at the moment of decision), what the figure moved from and to, who
 * made it, and when. Filters are exact — order id and date range — because a
 * decision trail you cannot reproduce with a query is not an audit trail.
 *
 * Nothing on this page can write. That is the point: the module reads a table
 * that only ever receives INSERTs.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, RefreshCw, History, Inbox } from 'lucide-react';
import { DashboardShell } from '../DashboardNav';
import { buildNavSections } from '../nav';
import { useDashboardSession } from '../useDashboardSession';
import { formatPaise } from '../../lib/money';

const API = process.env.NEXT_PUBLIC_API_URL || '';

type PriceRow = {
  id: string;
  requestId: string;
  intent: string | null;
  status: string | null;
  orderDate: string | null;
  products: { id?: string | null; category?: string; details?: string; quantity?: number }[];
  oldPaise: number | null;
  newPaise: number | null;
  basis: string | null;
  version: number | null;
  actor: string | null;
  at: string;
};

const fmt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

function label(p: PriceRow['products'][number]): string {
  const cat = (p.category || '').replace(/_/g, ' ');
  const det = p.details || '';
  const text = `${cat}${cat && det ? ' — ' : ''}${det}`.trim();
  return text || 'Unnamed line';
}

export default function PriceTrackerPage() {
  const [items, setItems] = useState<PriceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState('');

  // Exact filters only: an id match and a date range. Reproducible by anyone
  // with the same parameters — no interpretation involved.
  const [orderId, setOrderId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState({ requestId: '', from: '', to: '' });

  // Declared above the unauthorized early return: React requires the same hook
  // order on every render, and the rail's footer shows this session.
  const session = useDashboardSession();
  const navSections = buildNavSections();

  const load = useCallback(async (next: { requestId: string; from: string; to: string }, offset = 0) => {
    if (offset === 0) setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '50', offset: String(offset) });
      if (next.requestId) params.set('requestId', next.requestId);
      if (next.from) params.set('from', next.from);
      if (next.to) params.set('to', next.to);
      const res = await fetch(`${API}/api/price-history?${params.toString()}`, { cache: 'no-store' });
      if (res.status === 401) { setUnauthorized(true); return; }
      let data: any = null;
      try { data = await res.json(); } catch { throw new Error('bad response'); }
      if (!data?.success) throw new Error(data?.message || 'Failed to load price history.');
      setTotal(Number(data.total) || 0);
      setItems((prev) => (offset === 0 ? (data.items || []) : [...prev, ...(data.items || [])]));
    } catch (e: any) {
      setError(e?.message || 'Failed to load price history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(applied); }, [applied, load]);

  const applyFilters = () => setApplied({ requestId: orderId.trim(), from, to });
  const clearFilters = () => {
    setOrderId(''); setFrom(''); setTo('');
    setApplied({ requestId: '', from: '', to: '' });
  };

  if (unauthorized) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm font-semibold text-slate-700">Sign in to view price history.</p>
          <Link href="/login" className="mt-4 inline-block px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold">
            Sign in
          </Link>
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
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
              <History className="w-6 h-6 text-indigo-600" /> Price Tracker
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Every final price ever recorded for an order — what it covered, what it moved from, who decided it, and when.
              Read-only and append-only: nothing here can be edited after capture.
            </p>
          </div>
          <button onClick={() => load(applied)} className="p-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100" aria-label="Refresh">
            <RefreshCw className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        {/* ── Exact filters ── */}
        <form
          className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 flex items-end gap-3 flex-wrap"
          onSubmit={(e) => { e.preventDefault(); applyFilters(); }}
        >
          <div>
            <label htmlFor="pt-order" className="block text-xs font-semibold text-slate-600">Order ID</label>
            <input id="pt-order" value={orderId} onChange={(e) => setOrderId(e.target.value)}
              placeholder="B-772EECA3F6B9" className="mt-1 w-56 px-3 py-2 border border-slate-300 rounded-xl bg-slate-50/50 text-sm font-mono focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label htmlFor="pt-from" className="block text-xs font-semibold text-slate-600">From</label>
            <input id="pt-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="mt-1 px-3 py-2 border border-slate-300 rounded-xl bg-slate-50/50 text-sm focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label htmlFor="pt-to" className="block text-xs font-semibold text-slate-600">To</label>
            <input id="pt-to" type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="mt-1 px-3 py-2 border border-slate-300 rounded-xl bg-slate-50/50 text-sm focus:ring-2 focus:ring-indigo-500" />
          </div>
          <button type="submit" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-700">
            <Search className="w-4 h-4" /> Search
          </button>
          {(applied.requestId || applied.from || applied.to) && (
            <button type="button" onClick={clearFilters} className="px-3 py-2 rounded-xl text-sm font-semibold text-slate-500 hover:text-slate-900">
              Clear
            </button>
          )}
        </form>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex items-center gap-3 text-xs text-slate-500">
          <span className="font-mono font-bold text-slate-700">{total}</span>
          <span>recorded price decision{total === 1 ? '' : 's'}</span>
        </div>

        {loading && items.length === 0 && <p className="mt-6 text-sm text-slate-500">Loading…</p>}

        {!loading && items.length === 0 && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
            <Inbox className="w-6 h-6 mx-auto mb-3 text-slate-400" />
            No final price has been recorded yet
            <div className="mt-2 text-xs text-slate-400 max-w-md mx-auto">
              A row appears the moment a deal is approved — the intermediate figures a negotiation
              passes through are negotiation, not decisions, and are kept in the thread instead.
              {applied.requestId || applied.from || applied.to ? ' Your filters returned nothing.' : ''}
            </div>
          </div>
        )}

        <div className="mt-4 space-y-3">
          {items.map((r) => (
            <section key={r.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/dashboard?order=${encodeURIComponent(r.requestId)}`}
                      className="font-mono font-bold text-slate-900 hover:text-indigo-700">
                      {r.requestId}
                    </Link>
                    {r.intent && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border border-slate-200 bg-slate-50 text-slate-500 uppercase">
                        {r.intent}
                      </span>
                    )}
                    {r.status && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border border-indigo-200 bg-indigo-50 text-indigo-700">
                        {r.status}
                      </span>
                    )}
                    {r.version !== null && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border border-slate-200 bg-slate-50 text-slate-500 font-mono">
                        v{r.version}
                      </span>
                    )}
                  </div>

                  {r.products.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {r.products.map((p, i) => (
                        <li key={p.id || i} className="text-sm text-slate-600">
                          {label(p)}
                          {typeof p.quantity === 'number' && <span className="text-slate-400"> · Qty {p.quantity}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="text-right shrink-0">
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">Final price</div>
                  <div className="font-mono font-bold text-slate-900">
                    {r.oldPaise !== null ? <span className="text-slate-400 font-normal">{formatPaise(r.oldPaise)} → </span> : null}
                    {r.newPaise === null ? '—' : formatPaise(r.newPaise)}
                  </div>
                  <div className="text-[10px] text-slate-400">{r.basis || '—'}</div>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-3 text-xs text-slate-500 flex-wrap">
                <span>
                  Decided by <strong className="text-slate-700">{r.actor || 'unrecorded'}</strong>
                </span>
                <span className="font-mono">{fmt(r.at)}</span>
              </div>
            </section>
          ))}
        </div>

        {items.length < total && (
          <div className="mt-6 text-center">
            <button onClick={() => load(applied, items.length)}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-700 hover:bg-slate-100">
              Load more ({items.length} of {total})
            </button>
          </div>
        )}
      </main>
    </DashboardShell>
  );
}
