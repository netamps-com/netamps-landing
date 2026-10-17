'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Handshake, AlertTriangle, RefreshCw, CheckCircle2, XCircle, Clock, Send, BadgeCheck, Mail, ArrowLeft } from 'lucide-react';
import { DashboardShell } from '../DashboardNav';
import { buildNavSections } from '../nav';
import { useDashboardSession } from '../useDashboardSession';
import { formatPaise, sanitizeMoneyInput, moneyStringToPaise } from '../../lib/money';
import { ORDER_STATUS, normalizeStatus, isClosedStatus, statusChip, kindLabel } from '../../lib/status';

/**
 * Negotiations — the ADMIN/STAFF monitor (a separate tab from the order list).
 *
 * Buyer threads and staff/seller threads share one queue. Each round shows the
 * FROZEN price version it was made against; a thread whose order has since been
 * re-priced is flagged stale so a decision is never made against a price that
 * moved.
 *
 * Staff act for the seller: offer / counter / accept / reject — and alone press
 * "Order Deal Approved", the ONE button that closes a negotiation for either a
 * BUY or a SELL request. Accepting a price moves the thread to "Accepted Final
 * Price"; it deliberately does not end it.
 */

type Round = {
  id: string; seq: number; side: 'buyer' | 'staff'; actor: string | null;
  kind: string; totalPaise: number | null; note: string;
  priceVersion: number; priceBasis: string; priceTotalPaise: number | null; createdAt: string;
};
type LadderStep = { rung: string; at: string | null; by?: string | null; touches?: number };
type Negotiation = {
  id: string; requestId: string; intent: string; status: string;
  currentTotalPaise: number | null; stale: boolean; updatedAt: string;
  current: { version: number; basis: string; totalPaise: number | null };
  order: { id: string; intent: string; name: string; company: string; status: string } | null;
  rounds: Round[];
  // Audit context appended by GET /api/negotiations: the same append-only
  // ladder the dashboard and Track page render, plus this order's email count.
  ladder?: LadderStep[];
  emailCount?: number;
  emailByCause?: Record<string, number>;
};

const API = process.env.NEXT_PUBLIC_API_URL || '';

const FILTERS = [
  { key: 'open', label: 'Open' },
  { key: 'agreed', label: 'Awaiting approval' },
  { key: 'deal', label: 'Approved' },
  { key: 'all', label: 'All' }
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

export default function NegotiationsPage() {
  const [items, setItems] = useState<Negotiation[]>([]);
  const [filter, setFilter] = useState<FilterKey>('open');
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [drafts, setDrafts] = useState<Record<string, { amount: string; note: string }>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  // Declared above the unauthorized early return: React requires the same hook
  // order on every render, and the rail's footer shows this session.
  const session = useDashboardSession();
  const router = useRouter();
  const navSections = buildNavSections();

  const load = useCallback(async (f: FilterKey) => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API}/api/negotiations?status=${f}`, { cache: 'no-store', credentials: 'include' });
      if (res.status === 401) { setUnauthorized(true); return; }
      let data: any = null;
      try { data = await res.json(); } catch { throw new Error('bad response'); }
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
    setError(''); setNotice('');
    const d = draftOf(n.id);
    let totalPaise: number | null = null;
    if (withAmount) {
      totalPaise = moneyStringToPaise(d.amount);
      if (totalPaise === null) { setError('Enter a valid total (₹, max 2 decimals).'); return; }
    }

    if (action === 'approve') {
      const agreed = n.currentTotalPaise;
      const label = agreed === null ? 'this figure' : formatPaise(agreed);
      if (!window.confirm(
        `Approve this deal at ${label}?\n\nThis is the closing action — it records the final price, ` +
        `sets the order to “${ORDER_STATUS.DEAL}” and appends the permanent audit row. It cannot be undone here.`
      )) return;
    }

    setBusyId(n.id);
    try {
      const res = await fetch(`${API}/api/negotiations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ negotiationId: n.id, action, totalPaise, note: d.note || '' })
      });
      let data: any = null;
      try { data = await res.json(); } catch { throw new Error('bad response'); }
      if (!data?.success) {
        // Reload even on refusal: the server reconciles the order's status from
        // its thread, so the screen must show the repaired truth rather than
        // keep displaying a status the server will not act on.
        setError(data?.message || 'Could not record that.');
        await load(filter);
        return;
      }
      setDrafts((prev) => ({ ...prev, [n.id]: { amount: '', note: '' } }));
      if (action === 'approve') setNotice(`Deal approved at ${formatPaise(data.negotiation?.currentTotalPaise ?? n.currentTotalPaise)} · ${n.requestId}`);
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
    <DashboardShell
      sections={navSections}
      footer={{ email: session.email, role: session.role, onTerminate: session.terminate }}
    >
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
              <Handshake className="w-6 h-6 text-indigo-600" /> Negotiations
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Buyer ↔ seller price threads. Staff act for the seller; only “{ORDER_STATUS.DEAL}” closes one.
            </p>
          </div>
          <button onClick={() => router.push('/dashboard')} className="p-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100" aria-label="Back to dashboard">
            <ArrowLeft className="w-4 h-4 text-slate-600" />
          </button>
          <button onClick={() => load(filter)} className="p-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100" aria-label="Refresh">
            <RefreshCw className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        {/* These are views of one list, not four actions - so they read as tabs:
            an underline marks the current one and the rest sit on the rule,
            instead of a row of boxed buttons competing with the header for
            attention. Same tab idiom /intake already uses. */}
        <nav aria-label="Filter negotiations" className="mt-5 flex items-center gap-1 border-b border-slate-200">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              aria-current={filter === f.key ? 'true' : undefined}
              className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-bold transition-colors ${
                filter === f.key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </nav>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        {notice && <p className="mt-4 text-sm text-emerald-700">{notice}</p>}
        {loading && <p className="mt-6 text-sm text-slate-500">Loading…</p>}
        {!loading && items.length === 0 && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
            No {filter === 'open' ? 'open ' : ''}negotiations.
            <div className="mt-2 text-xs text-slate-400">
              Threads appear once a request is moved to “{ORDER_STATUS.ACCEPTED}” from the dashboard.
            </div>
          </div>
        )}

        <div className="mt-6 space-y-4">
          {items.map((n) => {
            const d = draftOf(n.id);
            const lastSide = n.rounds.length ? n.rounds[n.rounds.length - 1].side : null;
            const status = normalizeStatus(n.status);
            const closed = isClosedStatus(status);
            const agreed = status === ORDER_STATUS.AGREED;
            return (
              <section key={n.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-slate-900">{n.requestId}</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${statusChip(status)}`}>{status}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border border-slate-200 bg-slate-50 text-slate-500 uppercase">
                        {String(n.intent || '').toUpperCase()}
                      </span>
                      {n.stale && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border border-amber-300 bg-amber-50 text-amber-800">
                          <AlertTriangle className="w-3.5 h-3.5" /> price moved
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {n.order ? `${n.order.name} · ${n.order.company}` : 'order unavailable'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">Order price</div>
                    <div className="font-mono font-bold text-slate-800">{formatPaise(n.current.totalPaise)}</div>
                    <div className="text-[10px] text-slate-400">v{n.current.version} · {n.current.basis}</div>
                  </div>
                </div>

                {/* Ladder with stamps — the negotiation window's own audit strip.
                    Same rows as the dashboard and Track page: one table, three views. */}
                {(n.ladder || []).length > 0 && (
                  <ol className="mt-4 flex flex-wrap gap-x-1 gap-y-2 items-center">
                    {(n.ladder || []).map((s, i) => {
                      const isCurrent = s.rung === status;
                      return (
                        <li key={`${s.rung}-${i}`} className="flex items-center">
                          <span className={`inline-flex flex-col rounded-full border px-2 py-0.5 ${
                            isCurrent ? 'border-amber-300 bg-amber-50 text-amber-800'
                            : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                            <span className="text-[10px] font-bold">
                              {s.rung}{isCurrent ? ' · now' : ''}
                            </span>
                            <span className="text-[9px] font-mono text-slate-400">
                              {s.at ? new Date(s.at).toLocaleString() : '—'}
                            </span>
                          </span>
                          {i < (n.ladder || []).length - 1 && <span className="mx-1 text-slate-400 text-xs">→</span>}
                        </li>
                      );
                    })}
                  </ol>
                )}

                <div className="mt-3 flex items-center gap-3 flex-wrap text-[11px] text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5" />
                    <strong className="text-slate-700 font-mono">{n.emailCount ?? 0}</strong>
                    email{(n.emailCount ?? 0) === 1 ? '' : 's'} triggered
                  </span>
                  {Object.entries(n.emailByCause || {}).map(([cause, count]) => (
                    <span key={cause} className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono">
                      {cause} ×{count}
                    </span>
                  ))}
                </div>

                {n.rounds.length > 0 && (
                  <ul className="mt-4 space-y-1.5">
                    {n.rounds.map((r) => (
                      <li key={r.id} className="flex items-center justify-between rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-sm">
                        <span className="text-slate-700">
                          <strong className={r.side === 'buyer' ? 'text-indigo-700' : 'text-emerald-700'}>{r.side === 'buyer' ? (n.order?.name || 'Buyer') : 'Staff'}</strong>
                          {' · '}{kindLabel(r.kind)}{r.note ? <span className="text-slate-400"> — {r.note}</span> : null}
                        </span>
                        <span className="flex items-center gap-3 shrink-0 ml-3">
                          <span className="text-[10px] font-mono text-slate-400">
                            {r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}
                          </span>
                          <span className="font-mono text-slate-800">{r.totalPaise === null ? '—' : formatPaise(r.totalPaise)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {!closed ? (
                  <div className="mt-4 space-y-3">
                    <div className="flex flex-wrap items-end gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600" htmlFor={`amt-${n.id}`}>Counter total (₹)</label>
                        <input id={`amt-${n.id}`} value={d.amount} onChange={(e) => setDraft(n.id, { amount: sanitizeMoneyInput(e.target.value) })} placeholder="e.g. 88,000.00" inputMode="decimal"
                          className="mt-1 w-40 px-3 py-2 border border-slate-200 rounded-xl bg-slate-50/50 text-sm focus:ring-2 focus:ring-amber-500" />
                      </div>
                      <div className="flex-1 min-w-[12rem]">
                        <label className="block text-xs font-semibold text-slate-600" htmlFor={`note-${n.id}`}>Note (optional)</label>
                        <input id={`note-${n.id}`} value={d.note} onChange={(e) => setDraft(n.id, { note: e.target.value })} maxLength={500}
                          placeholder="e.g. Can we close at ₹82,000 by Friday?"
                          className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50/50 text-sm focus:ring-2 focus:ring-amber-500" />
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => respond(n, lastSide === 'buyer' ? 'counter' : 'offer', true)} disabled={busyId === n.id}
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-50">
                          <Send className="w-4 h-4" /> {lastSide === 'buyer' ? 'Counter' : 'Offer'}
                        </button>
                        {n.currentTotalPaise !== null && (
                          <button onClick={() => respond(n, 'accept', false)} disabled={busyId === n.id}
                            title="Accept the figure currently on the table"
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-teal-600 text-white rounded-xl font-bold text-sm hover:bg-teal-700 disabled:opacity-50">
                            <CheckCircle2 className="w-4 h-4" /> Accept
                          </button>
                        )}
                        <button onClick={() => respond(n, 'reject', false)} disabled={busyId === n.id}
                          className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-300 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-100 disabled:opacity-50">
                          <XCircle className="w-4 h-4" /> Reject
                        </button>
                      </div>
                    </div>

                    {/* The single closing action — both BUY and SELL. */}
                    <div className={`rounded-xl border p-3 ${agreed ? 'border-emerald-300 bg-emerald-50/70' : 'border-slate-200 bg-slate-50'}`}>
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="text-xs text-slate-600">
                          {agreed ? (
                            <>Agreed at <span className="font-mono font-bold text-emerald-700">{formatPaise(n.currentTotalPaise)}</span> — this is the figure the deal will be approved at.</>
                          ) : (
                            <>Reach “{ORDER_STATUS.AGREED}” to enable closing. Accept the price on the table first.</>
                          )}
                        </div>
                        <button onClick={() => respond(n, 'approve', false)} disabled={!agreed || busyId === n.id}
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed">
                          <BadgeCheck className="w-4 h-4" /> {ORDER_STATUS.DEAL}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 inline-flex items-center gap-1 text-xs text-slate-500">
                    <Clock className="w-3.5 h-3.5" />
                    {status === ORDER_STATUS.DEAL ? 'Deal approved' : 'Closed'} {new Date(n.updatedAt).toLocaleString()}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </main>
    </DashboardShell>
  );
}
