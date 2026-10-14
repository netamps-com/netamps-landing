'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, ShieldCheck, Handshake, AlertTriangle, CheckCircle2, XCircle, Clock, RefreshCw } from 'lucide-react';
import NetampsLogo from '../NetampsLogo';
import { formatPaise, evalUnitPaise, sanitizeMoneyInput, moneyStringToPaise } from '../lib/money';

/**
 * Track Order — the buyer-facing module.
 *
 * Order ID + email → email OTP → the verified order, with a price-negotiation
 * panel. The price shown is the FROZEN snapshot the buyer is negotiating
 * against (price-version capture); a negotiation is only ever visible after the
 * email on the order has been proven with a one-time code.
 */

type Product = {
  id: string;
  category: string;
  details: string;
  quantity: number;
  pricePaise?: number | null;
  price?: number | null;
  lineConsiderationPaise?: number | null;
};

type Order = {
  id: string;
  intent: string;
  name: string;
  company: string;
  date: string;
  status: string;
  products: Product[];
  pricingBasis: 'per_product' | 'lot';
  lotConsiderationPaise: number | null;
  finalPrice: { version: number; basis: string; totalPaise: number } | null;
  manifest: { hash: string; generatedAt: string } | null;
};

type Round = {
  id: string;
  seq: number;
  side: 'buyer' | 'staff';
  actor: string | null;
  kind: string;
  totalPaise: number | null;
  note: string;
  priceVersion: number;
  priceBasis: string;
  priceTotalPaise: number | null;
  createdAt: string;
};

type Negotiation = {
  id: string;
  status: 'open' | 'accepted' | 'rejected' | 'withdrawn';
  currentTotalPaise: number | null;
  openedPriceVersion: number;
  current: { version: number; basis: string; totalPaise: number | null };
  stale: boolean;
  rounds: Round[];
  updatedAt: string;
};

const API = process.env.NEXT_PUBLIC_API_URL || '';
const ID_RE = /^[SB]-[A-Z0-9-]{3,64}$/;

function statusChip(status: string) {
  if (status === 'Approved' || status === 'accepted') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (status === 'Declined' || status === 'rejected') return 'bg-red-100 text-red-700 border-red-200';
  if (status === 'withdrawn') return 'bg-slate-200 text-slate-600 border-slate-300';
  return 'bg-amber-100 text-amber-700 border-amber-200';
}

export default function TrackOrderPage() {
  const [step, setStep] = useState<'identify' | 'otp' | 'view'>('identify');
  const [trackingId, setTrackingId] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [token, setToken] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [negotiations, setNegotiations] = useState<Negotiation[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Negotiation draft.
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const active = negotiations.find((n) => n.status === 'open') || negotiations[0] || null;

  const post = async (path: string, body: any, withToken = false) => {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(withToken ? { 'x-order-token': token } : {})
      },
      body: JSON.stringify(body)
    });
    let data: any = null;
    try { data = await res.json(); } catch { throw new Error('Server returned an invalid response.'); }
    return { ok: res.ok, data };
  };

  const sendOtp = async () => {
    setError(''); setNotice('');
    const id = trackingId.trim().toUpperCase();
    if (!ID_RE.test(id)) { setError('That does not look like a Netamps tracking ID (format S-… or B-…).'); return; }
    if (!email.trim()) { setError('Enter the email address used on the request.'); return; }
    setBusy(true);
    try {
      const { ok, data } = await post('/api/track/request-otp', { id, email: email.trim() });
      if (!ok || !data?.success) { setError(data?.message || 'Could not send a code.'); return; }
      setTrackingId(id);
      setStep('otp');
      setNotice(data.message || 'Verification code sent to your email.');
    } catch (e: any) {
      setError(e?.message || 'Lookup failed. Check your connection and retry.');
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    setError('');
    if (!/^[0-9]{6}$/.test(code.trim())) { setError('Enter the 6-digit code from your email.'); return; }
    setBusy(true);
    try {
      const { ok, data } = await post('/api/track/verify-otp', { id: trackingId.trim().toUpperCase(), email: email.trim(), code: code.trim() });
      if (!ok || !data?.success) { setError(data?.message || 'Verification failed.'); return; }
      setToken(data.token);
      setOrder(data.order);
      setStep('view');
      await refreshThread(data.token);
    } catch (e: any) {
      setError(e?.message || 'Verification failed.');
    } finally {
      setBusy(false);
    }
  };

  const refreshThread = async (withToken = token) => {
    const res = await fetch(`${API}/api/track/negotiate`, { headers: { 'x-order-token': withToken } });
    let data: any = null;
    try { data = await res.json(); } catch { return; }
    if (data?.success) {
      setOrder(data.order);
      setNegotiations(data.negotiations || []);
    }
  };

  const act = async (action: string, withAmount: boolean) => {
    setError(''); setNotice('');
    let totalPaise: number | null = null;
    if (withAmount) {
      totalPaise = moneyStringToPaise(amount);
      if (totalPaise === null) { setError('Enter a valid total (₹, max 2 decimals).'); return; }
    }
    setBusy(true);
    try {
      const { ok, data } = await post('/api/track/negotiate', { action, totalPaise, note: note.trim() }, true);
      if (!ok || !data?.success) { setError(data?.message || 'Could not record that.'); return; }
      setNotice('Recorded.');
      setNote('');
      await refreshThread();
    } catch (e: any) {
      setError(e?.message || 'Could not record that.');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setStep('identify'); setCode(''); setToken(''); setOrder(null); setNegotiations([]);
    setError(''); setNotice(''); setAmount(''); setNote('');
  };

  const startingFresh = !active || active.status !== 'open' || active.rounds.length === 0;
  const nextKind = startingFresh ? 'offer' : 'counter';
  const proposeLabel = startingFresh ? 'Make offer' : 'Counter';

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <NetampsLogo />
          <Link href="/" className="text-sm font-semibold text-slate-500 hover:text-slate-900">Home</Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-black text-slate-900">Track &amp; Negotiate</h1>
        <p className="mt-1 text-sm text-slate-500">
          Verify with your order ID and the email on the request, then view the evaluation and negotiate the price.
        </p>

        {/* ── Step 1: identify ── */}
        {step === 'identify' && (
          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
            <div>
              <label htmlFor="track-id" className="block text-sm font-medium text-slate-700">Order ID</label>
              <div className="mt-2 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input id="track-id" value={trackingId} onChange={(e) => setTrackingId(e.target.value)} placeholder="B-… or S-…"
                  className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 focus:ring-2 focus:ring-amber-500 sm:text-sm" />
              </div>
            </div>
            <div>
              <label htmlFor="track-email" className="block text-sm font-medium text-slate-700">Email on the request</label>
              <input id="track-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com"
                className="mt-2 block w-full px-3 py-3 border border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 focus:ring-2 focus:ring-amber-500 sm:text-sm" />
            </div>
            <button onClick={sendOtp} disabled={busy} className="w-full py-3.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 disabled:opacity-50">
              {busy ? 'Sending…' : 'Send verification code'}
            </button>
          </section>
        )}

        {/* ── Step 2: OTP ── */}
        {step === 'otp' && (
          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5 text-center">
            <div className="w-14 h-14 bg-indigo-100 rounded-full flex items-center justify-center mx-auto">
              <ShieldCheck className="w-7 h-7 text-indigo-600" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Enter your code</h2>
            <p className="text-sm text-slate-500">{notice}</p>
            <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              className="block w-full max-w-xs mx-auto text-center tracking-widest text-2xl px-4 py-3 border border-slate-300 rounded-xl bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500" placeholder="••••••" />
            <button onClick={verifyOtp} disabled={busy} className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50">
              {busy ? 'Verifying…' : 'Verify & view order'}
            </button>
            <button onClick={() => { setStep('identify'); setCode(''); }} className="text-sm text-slate-500 hover:text-slate-800">Use a different order</button>
          </section>
        )}

        {/* ── Step 3: verified order + negotiate ── */}
        {step === 'view' && order && (
          <div className="mt-8 space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <span className="font-mono font-bold text-slate-900 text-lg">{order.id}</span>
                <span className={`px-3 py-1 rounded-full text-xs font-bold border ${statusChip(order.status)}`}>{order.status}</span>
              </div>
              <p className="text-sm text-slate-600"><strong className="text-slate-800">Name:</strong> {order.name}</p>
              <p className="text-sm text-slate-600"><strong className="text-slate-800">Company:</strong> {order.company}</p>
              <p className="text-sm text-slate-600"><strong className="text-slate-800">Date:</strong> {new Date(order.date).toLocaleDateString()}</p>

              <h3 className="mt-5 text-sm font-bold text-slate-800">Equipment</h3>
              <div className="mt-3 space-y-2">
                {order.products.map((p, i) => {
                  const evaluated = evalUnitPaise(p);
                  return (
                    <div key={p.id || i} className="flex justify-between items-center gap-3 rounded-lg border border-slate-200 p-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-700 capitalize">{(p.category || '').replace('_', ' ')}</div>
                        <div className="text-xs text-slate-500">{p.details} · Qty {p.quantity}</div>
                      </div>
                      <div className="text-sm font-mono font-bold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-100">
                        {evaluated === null ? 'Pending' : formatPaise(evaluated)}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 rounded-lg bg-slate-100 border border-slate-200 p-3 text-sm text-slate-700">
                Current price:{' '}
                <span className="font-mono font-bold text-slate-900">
                  {formatPaise(active ? (active.current.totalPaise ?? null) : (order.finalPrice?.totalPaise ?? null))}
                </span>
                <span className="ml-2 text-xs text-slate-500">
                  {order.finalPrice ? `(approved basis: ${order.finalPrice.basis}, v${order.finalPrice.version})` : '(evaluated baseline, not yet approved)'}
                </span>
              </div>
            </section>

            {/* Negotiation */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <Handshake className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-900">Price negotiation</h2>
              </div>
              {active && active.stale && (
                <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  The price changed after this thread began — the amounts below were agreed against an older price version.
                </div>
              )}
              {!active && <p className="text-sm text-slate-500 mt-2">No negotiation yet. Make an offer below to start one.</p>}

              {active && active.rounds.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {active.rounds.map((r) => (
                    <li key={r.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                      <div className="flex justify-between">
                        <span className="font-semibold text-slate-700">
                          {r.side === 'buyer' ? 'You' : 'Netamps'} · {r.kind}
                        </span>
                        <span className="font-mono text-slate-800">{r.totalPaise === null ? '—' : formatPaise(r.totalPaise)}</span>
                      </div>
                      {r.note && <div className="text-xs text-slate-500 mt-1">{r.note}</div>}
                      <div className="text-[10px] uppercase tracking-wide text-slate-400 mt-1">
                        against price v{r.priceVersion} ({formatPaise(r.priceTotalPaise)}) · {new Date(r.createdAt).toLocaleString()}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 flex items-center gap-2 text-xs">
                {active && active.status === 'open' && <span className="inline-flex items-center gap-1 text-amber-700"><Clock className="w-3.5 h-3.5" /> Open</span>}
                {active && active.status === 'accepted' && <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" /> Accepted at {formatPaise(active.currentTotalPaise)}</span>}
                {active && active.status === 'rejected' && <span className="inline-flex items-center gap-1 text-red-700"><XCircle className="w-3.5 h-3.5" /> Closed</span>}
                {active && active.status === 'withdrawn' && <span className="inline-flex items-center gap-1 text-slate-600"><XCircle className="w-3.5 h-3.5" /> Withdrawn</span>}
              </div>

              <div className="mt-4 space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="neg-amount" className="block text-xs font-semibold text-slate-600">Your total (₹)</label>
                    <input id="neg-amount" value={amount} onChange={(e) => setAmount(sanitizeMoneyInput(e.target.value))} placeholder="e.g. 85,000.00"
                      className="mt-1 block w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 focus:ring-2 focus:ring-amber-500 sm:text-sm" />
                  </div>
                  <div>
                    <label htmlFor="neg-note" className="block text-xs font-semibold text-slate-600">Note (optional)</label>
                    <input id="neg-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500}
                      className="mt-1 block w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 focus:ring-2 focus:ring-amber-500 sm:text-sm" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => act(nextKind, true)} disabled={busy}
                    className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50 text-sm">
                    {proposeLabel}
                  </button>
                  {active && active.status === 'open' && active.currentTotalPaise !== null && (
                    <button onClick={() => act('accept', false)} disabled={busy}
                      className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 text-sm">
                      Accept {formatPaise(active.currentTotalPaise)}
                    </button>
                  )}
                  {active && active.status === 'open' && (
                    <button onClick={() => act('withdraw', false)} disabled={busy}
                      className="px-4 py-2.5 border border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-100 disabled:opacity-50 text-sm">
                      Withdraw
                    </button>
                  )}
                </div>
              </div>
            </section>

            <div className="flex items-center justify-between text-sm">
              <button onClick={() => refreshThread()} className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900">
                <RefreshCw className="w-4 h-4" /> Refresh
              </button>
              <button onClick={reset} className="text-slate-500 hover:text-slate-800">Track another order</button>
            </div>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-600 text-center">{error}</p>}
      </main>
    </div>
  );
}
