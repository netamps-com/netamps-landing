'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Handshake, AlertTriangle, RefreshCw, ArrowLeft, CheckCircle2, XCircle, Clock, Send } from 'lucide-react';
import NetampsLogo from '../../NetampsLogo';
import { formatPaise, sanitizeMoneyInput, moneyStringToPaise } from '../../lib/money';

/**
 * Negotiations — the ADMIN/STAFF monitor (a separate tab from the order list).
 *
 * Buyer threads and staff/seller threads share one queue. Each round shows the
 * FROZEN price version it was made against; a thread whose order has since been
 * re-priced is flagged stale so a decision is never made against a price that
 * moved. Staff act for the seller: offer / counter / accept / reject.
 */

type Round = {
  id: string; seq: number; side: 'buyer' | 'staff'; actor: string | null;
  kind: string; totalPaise: number | null; note: string;
  priceVersion: number; priceBasis: string; priceTotalPaise: number | null; createdAt: string;
};
type Negotiation = {
  id: string; requestId: string; intent: string; status: string;
  currentTotalPaise: number | null; stale: boolean; updatedAt: string;
  current: { version: number; basis: string; totalPaise: number | null };
  order: { id: string; intent: string; name: string; company: string; status: string } | null;
  rounds: Round[];
};

const API = process.env.NEXT_PUBLIC_API_URL || '';

function statusChip(status: string) {
  if (status === 'accepted') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (status === 'rejected') return 'bg-red-100 text-red-700 border-red-200';
  if (status === 'withdrawn') return 'bg-slate-200 text-slate-600 border-slate-300';
  return 'bg-amber-100 text-amber-700 border-amber-200';
}

export default function NegotiationsPage() {
  const [items, setItems] = useState<Negotiation[]>([]);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Record<string, { amount: string; note: string }>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (f: 'open' | 'all') => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API}/api/negotiations?status=${f}`, { cache: 'no-store' });
      if (res.status === 401) { setUnauthorized(true); return; }
      const data = await res.json();
      if (data?.success) setItems(data.negotiations || []);
      else setError(data?.message || 'Failed to load negotiations.');
    } catch {
      setError('Failed to load negotiations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(filter); }, [filter, load]);

  const draftOf = (id: string) => drafts[id] || { amount: '', note: '' };
  const setDraft = (id: string, patch: Partial<{ amount: string; note: string }>) =>
    setDrafts((d) => ({ ...d, [id]: { ...draftOf(id), ...patch } }));

  const respond = async (n: Negotiation, action: string, withAmount: boolean) => {
    setError('');
    const d = draftOf(n.id);
    let totalPaise: number | null = null;
    if (withAmount) {
      totalPaise = moneyStringToPaise(d.amount);
      if (totalPaise === null) { setError('Enter a valid total (₹, max 2 decimals).'); return; }
    }
    setBusyId(n.id);
    try {
      const res = await fetch(`${API}/api/negotiations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ negotiationId: n.id, action, totalPaise, note: d.note || '' })
      });
      const data = await res.json();
      if (!data?.success) { setError(data?.message || 'Could not record that.'); return; }
      setDrafts((prev) => ({ ...prev, [n.id]: { amount: '', note: '' } }));
      await load(filter);
    } catch {
      setError('Could not record that.');
    } finally {
      setBusyId(null);
    }
  };

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
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <NetampsLogo />
          <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-900">
            <ArrowLeft className="w-4 h-4" /> Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
              <Handshake className="w-6 h-6 text-indigo-600" /> Negotiations
            </h1>
            <p className="text-sm text-slate-500 mt-1">Buyer ↔ seller price threads. Staff act for the seller.</p>
          </div>
          <div className="flex items-center gap-2">
            {(['open', 'all'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold border ${filter === f ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}`}>
                {f === 'open' ? 'Open' : 'All'}
              </button>
            ))}
            <button onClick={() => load(filter)} className="p-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100" aria-label="Refresh">
              <RefreshCw className="w-4 h-4 text-slate-600" />
            </button>
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        {loading && <p className="mt-6 text-sm text-slate-500">Loading…</p>}
        {!loading && items.length === 0 && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
            No {filter === 'open' ? 'open ' : ''}negotiations.
          </div>
        )}

        <div className="mt-6 space-y-4">
          {items.map((n) => {
            const d = draftOf(n.id);
            const lastSide = n.rounds.length ? n.rounds[n.rounds.length - 1].side : null;
            const open = n.status === 'open';
            return (
              <section key={n.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900">{n.requestId}</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${statusChip(n.status)}`}>{n.status}</span>
                      {n.stale && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border border-amber-300 bg-amber-50 text-amber-800">
                          <AlertTriangle className="w-3.5 h-3.5" /> price moved
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {n.order ? `${n.order.name} · ${n.order.company} · ${String(n.order.intent).toUpperCase()}` : 'order unavailable'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">Order price</div>
                    <div className="font-mono font-bold text-slate-800">{formatPaise(n.current.totalPaise)}</div>
                    <div className="text-[10px] text-slate-400">v{n.current.version} · {n.current.basis}</div>
                  </div>
                </div>

                {n.rounds.length > 0 && (
                  <ul className="mt-4 space-y-1.5">
                    {n.rounds.map((r) => (
                      <li key={r.id} className="flex items-center justify-between rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-sm">
                        <span className="text-slate-700">
                          <strong className={r.side === 'buyer' ? 'text-indigo-700' : 'text-emerald-700'}>{r.side === 'buyer' ? 'Buyer' : 'Staff'}</strong>
                          {' · '}{r.kind}{r.note ? <span className="text-slate-400"> — {r.note}</span> : null}
                        </span>
                        <span className="font-mono text-slate-800 shrink-0 ml-3">{r.totalPaise === null ? '—' : formatPaise(r.totalPaise)}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {open ? (
                  <div className="mt-4 flex flex-wrap items-end gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600" htmlFor={`amt-${n.id}`}>Counter total (₹)</label>
                      <input id={`amt-${n.id}`} value={d.amount} onChange={(e) => setDraft(n.id, { amount: sanitizeMoneyInput(e.target.value) })} placeholder="e.g. 88,000.00"
                        className="mt-1 w-40 px-3 py-2 border border-slate-200 rounded-xl bg-slate-50/50 text-sm focus:ring-2 focus:ring-amber-500" />
                    </div>
                    <div className="flex-1 min-w-[12rem]">
                      <label className="block text-xs font-semibold text-slate-600" htmlFor={`note-${n.id}`}>Note (optional)</label>
                      <input id={`note-${n.id}`} value={d.note} onChange={(e) => setDraft(n.id, { note: e.target.value })} maxLength={500}
                        className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50/50 text-sm focus:ring-2 focus:ring-amber-500" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => respond(n, lastSide === 'buyer' ? 'counter' : 'offer', true)} disabled={busyId === n.id}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-50">
                        <Send className="w-4 h-4" /> {lastSide === 'buyer' ? 'Counter' : 'Offer'}
                      </button>
                      {n.currentTotalPaise !== null && (
                        <button onClick={() => respond(n, 'accept', false)} disabled={busyId === n.id}
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 disabled:opacity-50">
                          <CheckCircle2 className="w-4 h-4" /> Accept
                        </button>
                      )}
                      <button onClick={() => respond(n, 'reject', false)} disabled={busyId === n.id}
                        className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-300 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-100 disabled:opacity-50">
                        <XCircle className="w-4 h-4" /> Reject
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 inline-flex items-center gap-1 text-xs text-slate-500">
                    <Clock className="w-3.5 h-3.5" /> Closed {new Date(n.updatedAt).toLocaleString()}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}
