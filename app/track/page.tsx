'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ShieldCheck, Handshake, AlertTriangle, CheckCircle2, XCircle, Clock, RefreshCw, ChevronRight, ListOrdered } from 'lucide-react';
import NetampsLogo from '../NetampsLogo';
import TrackHero from './TrackHero';
import { formatPaise, evalUnitPaise, sanitizeMoneyInput, moneyStringToPaise } from '../lib/money';
import { ORDER_STATUS, CHRONOLOGY, normalizeStatus, statusRank, isNegotiable, isClosedStatus, statusChip, kindLabel } from '../lib/status';
import { checkSession, logoutUser } from '../track/session';

/**
 * Track Order — the buyer-facing module. EMAIL ONLY.
 *
 * The email address on the requests IS the identity. A one-time code delivered
 * to that mailbox proves ownership, and then EVERY successfully-created request
 * filed under it is listed for the buyer to choose from — no order ID needed
 * to get in, no order ID invented along the way.
 *
 * The price shown is the FROZEN snapshot the buyer negotiates against
 * (price-version capture). The thread advances chronologically:
 *
 *   Pending → Order Accepted for Negotiation → Negotiation in Progress
 *           → Accepted Final Price           → Order Deal Approved
 *
 * A buyer can offer / counter / accept / withdraw. Only Netamps staff can
 * accept a request for negotiation and only staff can approve the final deal.
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
  status: string;
  currentTotalPaise: number | null;
  openedPriceVersion: number;
  current: { version: number; basis: string; totalPaise: number | null };
  stale: boolean;
  rounds: Round[];
  updatedAt: string;
};

const API = process.env.NEXT_PUBLIC_API_URL || '';
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;

/**
 * The figure to show on a list row. The frozen final price when one exists;
 * otherwise the lot ask; otherwise the sum of the lines that actually have an
 * evaluated price — labelled as such, because an unpriced line contributes
 * nothing and the total must never pretend otherwise.
 */
function orderFigure(o: Order): { paise: number | null; label: string } {
  if (o.finalPrice && typeof o.finalPrice.totalPaise === 'number') {
    return { paise: o.finalPrice.totalPaise, label: '' };
  }
  if (o.pricingBasis === 'lot' && typeof o.lotConsiderationPaise === 'number') {
    return { paise: o.lotConsiderationPaise, label: 'ask' };
  }
  let total = 0;
  let any = false;
  for (const p of o.products || []) {
    const unit = evalUnitPaise(p);
    if (unit === null) continue;
    total += unit * (Number(p.quantity) || 1);
    any = true;
  }
  return any ? { paise: total, label: 'evaluated' } : { paise: null, label: '' };
}

/** Human names for the server's closed email-cause vocabulary. */
const CAUSE_LABEL: Record<string, string> = {
  order_confirmation: 'Request confirmation',
  order_confirmation_resend: 'Confirmation resend',
  staff_notification: 'Netamps update',
  escalation: 'Sales escalation',
  delivery_result: 'Delivery update'
};

/** One rung the order actually stood on, with the stamp it was reached. */
export interface LadderStep {
  rung: string;
  at: string | null;
  by?: string | null;
  touches?: number;
}

export interface OrderTimeline {
  ladder: LadderStep[];
  events?: { seq: number; kind: string; rung: string | null; actor: string | null; at: string }[];
  emails?: {
    count: number;
    byCause?: Record<string, number>;
    byOutcome?: Record<string, number>;
    lastAt?: string | null;
    items?: { cause: string; outcome: string; at: string; detail?: unknown }[];
  };
}

/** "12 Jan 2026, 14:05" — local, unambiguous, never a relative "2h ago". */
function stamp(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

/**
 * The chronological ladder rendered as a stepper — status made visible.
 *
 * When `ladder` is supplied each reached rung carries the timestamp it was
 * first reached, so this is an audit trail and not just a progress bar: the
 * question "when did this become X, and who did it?" is answerable from the
 * same widget that answers "where is it now?".
 */
function Lifecycle({ status, ladder }: { status: string; ladder?: LadderStep[] }) {
  const current = normalizeStatus(status);
  const rank = statusRank(status);
  const steps = current === ORDER_STATUS.DECLINED ? [ORDER_STATUS.PENDING, ORDER_STATUS.DECLINED] : CHRONOLOGY;
  const done = current === ORDER_STATUS.DECLINED ? 2 : rank;
  const when = new Map((ladder || []).filter((s) => s && s.rung).map((s) => [s.rung, s]));
  return (
    <div>
      <ol className="flex flex-wrap items-center gap-y-2">
        {steps.map((s, i) => {
          const state = i < done ? 'done' : i === done ? 'here' : 'todo';
          const hit = when.get(s);
          return (
            <li key={s} className="flex items-center">
              <span className={`inline-flex flex-col rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                state === 'done' ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : state === 'here' ? 'border-amber-300 bg-amber-50 text-amber-800'
                : 'border-slate-200 bg-slate-50 text-slate-400'}`}>
                <span className="inline-flex items-center gap-1">
                  {state === 'done' ? <CheckCircle2 className="w-3 h-3" /> : state === 'here' ? <Clock className="w-3 h-3" /> : null}
                  {s}
                </span>
                {hit?.at && (
                  <span className={`mt-0.5 text-[9px] font-medium normal-case ${
                    state === 'todo' ? 'text-slate-400' : 'text-slate-500'}`}>
                    {stamp(hit.at)}
                  </span>
                )}
              </span>
              {i < steps.length - 1 && <ChevronRight className="w-3.5 h-3.5 mx-1 text-slate-400" />}
            </li>
          );
        })}
      </ol>
      {ladder && ladder.length === 0 && (
        <p className="mt-2 text-[11px] text-slate-400">
          No recorded transitions yet — this request has not been opened for negotiation.
        </p>
      )}
    </div>
  );
}

export default function TrackOrderPage() {
  const [step, setStep] = useState<'identify' | 'otp' | 'orders' | 'view'>('identify');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [token, setToken] = useState('');
  const [sessionValid, setSessionValid] = useState<boolean | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [order, setOrder] = useState<Order | null>(null);
  const [negotiable, setNegotiable] = useState(false);
  const [negotiations, setNegotiations] = useState<Negotiation[]>([]);
  const [timeline, setTimeline] = useState<OrderTimeline | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Turnstile bot gate (action-pinned 'track-otp'). Dormant when the site key
  // is unset — the gate activates on key configuration.
  const trackSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';
  const [trackToken, setTrackToken] = useState('');
  const [trackKey, setTrackKey] = useState(0);
  const resetTrackCaptcha = () => {
    setTrackToken('');
    setTrackKey((k) => k + 1); // remount mints a fresh single-use token
  };

  // Negotiation draft.
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const active = negotiations.find((n) => !isClosedStatus(n.status)) || negotiations[0] || null;

  const post = async (path: string, body: any) => {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'include'
    });
    let data: any = null;
    try { data = await res.json(); } catch { throw new Error('Server returned an invalid response.'); }
    return { ok: res.ok, data };
  };

  const sendOtp = async () => {
    setError(''); setNotice('');
    const em = email.trim();
    if (!EMAIL_RE.test(em)) { setError('Enter the email address used on your requests.'); return; }

    // Bot gate: challenge verified before any OTP email is issued.
    if (trackSiteKey && !trackToken) {
      setError('Complete the human verification challenge before sending a code.');
      return;
    }
    setBusy(true);
    try {
      if (trackSiteKey) {
        try {
          const vRes = await fetch(`${API}/api/verify-turnstile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: trackToken, action: 'track-otp' })
          });
          const vData = await vRes.json().catch(() => null);
          if (!vData || !vData.success) {
            resetTrackCaptcha();
            setError('Verification failed or expired. Complete the challenge and retry.');
            return;
          }
        } catch {
          setError('Verification service unavailable. Try again shortly.');
          return;
        }
        resetTrackCaptcha(); // token is single-use — mint a fresh one
      }
      const { ok, data } = await post('/api/track/request-otp', { email: em });
      if (!ok || !data?.success) { setError(data?.message || 'Could not send a code.'); return; }
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
      const { ok, data } = await post('/api/track/verify-otp', { email: email.trim(), code: code.trim() });
      if (!ok || !data?.success) { setError(data?.message || 'Verification failed.'); return; }
      setToken(data.token);
      setEmail(data.email || email.trim());
      setOrders(data.orders || []);
      // Every request under this address, ready to choose from.
      setStep('orders');
    } catch (e: any) {
      setError(e?.message || 'Verification failed.');
    } finally {
      setBusy(false);
    }
  };

  /** Open one of the buyer's own orders. */
  const openOrder = async (o: Order, withToken = token) => {
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`${API}/api/track/negotiate?requestId=${encodeURIComponent(o.id)}`, {
        headers: { 'x-buyer-token': withToken }
      });
      let data: any = null;
      try { data = await res.json(); } catch { throw new Error('Server returned an invalid response.'); }
      if (!data?.success) { setError(data?.message || 'Could not open that request.'); return; }
      setOrder(data.order);
      setNegotiable(!!data.negotiable);
      setNegotiations(data.negotiations || []);
      setTimeline(data.timeline || null);
      setStep('view');
    } catch (e: any) {
      setError(e?.message || 'Could not open that request.');
    } finally {
      setBusy(false);
    }
  };

  const refreshThread = async (withToken = token) => {
    // No order open yet → we are on the list step; refresh the list itself.
    if (!order) {
      try {
        const res = await fetch(`${API}/api/track/negotiate`, { headers: { 'x-buyer-token': withToken } });
        let data: any = null;
        try { data = await res.json(); } catch { return; }
        if (data?.success && Array.isArray(data.orders)) setOrders(data.orders);
      } catch { /* keep the list we already have */ }
      return;
    }
    try {
      const res = await fetch(`${API}/api/track/negotiate?requestId=${encodeURIComponent(order.id)}`, {
        headers: { 'x-buyer-token': withToken }
      });
      let data: any = null;
      try { data = await res.json(); } catch { return; }
      if (data?.success) {
        setOrder(data.order);
        setNegotiable(!!data.negotiable);
        setNegotiations(data.negotiations || []);
        setTimeline(data.timeline || null);
        setOrders((prev) => prev.map((o) => (o.id === data.order.id ? data.order : o)));
      }
    } catch { /* keep the last good thread on screen */ }
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
      const { ok, data } = await post('/api/track/negotiate', {
        requestId: order?.id, action, totalPaise, note: note.trim()
      });
      if (!ok || !data?.success) { setError(data?.message || 'Could not record that.'); return; }
      setNotice('Recorded.');
      setNote(''); setAmount('');
      await refreshThread();
    } catch (e: any) {
      setError(e?.message || 'Could not record that.');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setStep('identify'); setCode(''); setToken(''); setOrder(null); setOrders([]); setNegotiations([]);
    setNegotiable(false); setError(''); setNotice(''); setAmount(''); setNote('');
    setTimeline(null);
  };

  const startingFresh = !active || active.rounds.length === 0;
  const nextKind = startingFresh ? 'offer' : 'counter';
  const proposeLabel = startingFresh ? 'Make offer' : 'Counter';
  const canSpeak = negotiable && !isClosedStatus(order?.status);
  const tablePrice = active ? (active.currentTotalPaise ?? null) : (order?.finalPrice?.totalPaise ?? null);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-100 to-slate-100">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <NetampsLogo className="h-10 w-auto" />
          <Link href="/returns" className="text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors">
            ← Back to Returns
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10">

        {/* ── Step 1: email ── */}
        {step === 'identify' && (
          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm contain-[layout_paint]">
            <TrackHero
              email={email}
              onEmailChange={(e) => setEmail(e.target.value)}
              onEmailKeyDown={(e) => { if (e.key === 'Enter') sendOtp(); }}
              onSendOtp={sendOtp}
              busy={busy}
              trackSiteKey={trackSiteKey}
              trackToken={trackToken}
              onTurnstileSuccess={(token) => setTrackToken(token)}
              onTurnstileExpire={() => setTrackToken('')}
              onTurnstileError={() => setTrackToken('')}
            />
          </section>
        )}

        {/* ── Step 2: OTP ── */}
        {step === 'otp' && (
          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5 text-center contain-[layout_paint]">
            <div className="w-14 h-14 bg-indigo-100 rounded-full flex items-center justify-center mx-auto">
              <ShieldCheck className="w-7 h-7 text-indigo-600" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Enter your code</h2>
            <p className="text-sm text-slate-500">{notice}</p>
            <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              onKeyDown={(e) => { if (e.key === 'Enter') verifyOtp(); }}
              className="block w-full max-w-xs mx-auto text-center tracking-widest text-2xl px-4 py-3 border border-slate-300 rounded-xl bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500" placeholder="••••••" />
            <button onClick={verifyOtp} disabled={busy} className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50">
              {busy ? 'Verifying…' : 'Verify & list my requests'}
            </button>
            <button onClick={() => { setStep('identify'); setCode(''); }} className="text-sm text-slate-500 hover:text-slate-800">Use a different email</button>
          </section>
        )}

        {/* ── Step 3: the buyer's own requests — choose one ── */}
        {step === 'orders' && (
          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm contain-[layout_paint]">
            <div className="flex items-center gap-2 mb-1">
              <ListOrdered className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-slate-900">Your requests</h2>
            </div>
            <p className="text-sm text-slate-500">
              {orders.length} request{orders.length === 1 ? '' : 's'} filed under <span className="font-semibold text-slate-700">{email}</span>
            </p>

            {orders.length === 0 && (
              <p className="mt-4 text-sm text-slate-500">No requests found for this address.</p>
            )}

            <ul className="mt-4 space-y-3">
              {orders.map((o) => {
                const fig = orderFigure(o);
                return (
                  <li key={o.id}>
                    <button onClick={() => openOrder(o)} disabled={busy}
                      className="w-full text-left rounded-xl border border-slate-200 p-4 hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors disabled:opacity-50">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <span className="font-mono font-bold text-slate-900">{o.id}</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${statusChip(o.status)}`}>
                          {normalizeStatus(o.status)}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        {o.name}{o.company ? ` · ${o.company}` : ''} · <span className="uppercase font-semibold">{o.intent}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                        <span>{o.date ? new Date(o.date).toLocaleDateString() : ''}</span>
                        <span className="font-mono">
                          {fig.paise === null
                            ? 'Price pending'
                            : `${formatPaise(fig.paise)}${fig.label ? ` · ${fig.label}` : ''}`}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="mt-5 flex items-center justify-between text-sm">
              <button onClick={() => refreshThread()} className="text-slate-500 hover:text-slate-800">Refresh list</button>
              <button onClick={reset} className="text-slate-500 hover:text-slate-800">Sign out of tracking</button>
            </div>
          </section>
        )}

        {/* ── Step 4: one verified request + negotiate ── */}
        {step === 'view' && order && (
          <div className="mt-8 space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm contain-[layout_paint]">
              <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
                <span className="font-mono font-bold text-slate-900 text-lg">{order.id}</span>
                <span className={`px-3 py-1 rounded-full text-xs font-bold border ${statusChip(order.status)}`}>{normalizeStatus(order.status)}</span>
              </div>

              <Lifecycle status={order.status} ladder={timeline?.ladder} />

              {/* Email triggers — a count and its causes, per order, so the
                  buyer can see what was actually sent without asking us. */}
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-bold text-slate-700">Email triggers</span>
                  <span className="text-xs font-mono font-bold text-slate-800">
                    {timeline?.emails?.count ?? 0}
                  </span>
                </div>
                {timeline?.emails?.count ? (
                  <ul className="mt-2 space-y-1">
                    {(timeline.emails.items || []).slice(0, 6).map((m, i) => (
                      <li key={i} className="flex items-start justify-between gap-3 text-[11px]">
                        <span className="text-slate-600">
                          {CAUSE_LABEL[m.cause] || m.cause}
                          <span className={`ml-1.5 font-semibold ${
                            m.outcome === 'delivered' || m.outcome === 'sent' ? 'text-emerald-600'
                            : m.outcome === 'failed' || m.outcome === 'bounced' ? 'text-rose-600'
                            : 'text-slate-500'}`}>
                            {m.outcome}
                          </span>
                        </span>
                        <span className="font-mono text-slate-400 whitespace-nowrap">{stamp(m.at)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-[11px] text-slate-400">No email has been sent for this request.</p>
                )}
              </div>

              <p className="mt-4 text-sm text-slate-600"><strong className="text-slate-800">Name:</strong> {order.name}</p>
              <p className="text-sm text-slate-600"><strong className="text-slate-800">Company:</strong> {order.company}</p>
              <p className="text-sm text-slate-600"><strong className="text-slate-800">Date:</strong> {order.date ? new Date(order.date).toLocaleDateString() : '—'}</p>

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
                <span className="font-mono font-bold text-slate-900">{formatPaise(tablePrice)}</span>
                <span className="ml-2 text-xs text-slate-500">
                  {order.finalPrice
                    ? `(${order.finalPrice.basis} basis, v${order.finalPrice.version})`
                    : '(evaluated baseline — the figure we negotiate against)'}
                </span>
              </div>
            </section>

            {/* Negotiation */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm contain-[layout_paint]">
              <div className="flex items-center gap-2 mb-1">
                <Handshake className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-900">Price negotiation</h2>
              </div>

              {isClosedStatus(order.status) && (
                <div className={`mt-3 flex items-start gap-2 rounded-lg border p-3 text-sm ${
                  normalizeStatus(order.status) === ORDER_STATUS.DEAL
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-red-200 bg-red-50 text-red-800'}`}>
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  {normalizeStatus(order.status) === ORDER_STATUS.DEAL
                    ? `Deal approved${order.finalPrice ? ` at ${formatPaise(order.finalPrice.totalPaise)}` : ''} — this negotiation is closed.`
                    : 'This request was declined — the negotiation is closed.'}
                </div>
              )}

              {!isClosedStatus(order.status) && !negotiable && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <Clock className="w-4 h-4 mt-0.5 shrink-0" />
                  Netamps has not accepted this request for negotiation yet. You will be able to make an offer once it reaches
                  “{ORDER_STATUS.ACCEPTED}”.
                </div>
              )}

              {active && active.stale && !isClosedStatus(order.status) && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  The price changed after this thread began — the amounts below were agreed against an older price version.
                </div>
              )}
              {!active && negotiable && <p className="text-sm text-slate-500 mt-2">No negotiation yet. Make an offer below to start one.</p>}

              {active && active.rounds.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {active.rounds.map((r) => (
                    <li key={r.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                      <div className="flex justify-between gap-3">
                        <span className="font-semibold text-slate-700">
                          {r.side === 'buyer' ? 'You' : 'Netamps'} · {kindLabel(r.kind)}
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

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                {active && normalizeStatus(active.status) === ORDER_STATUS.IN_PROGRESS && (
                  <span className="inline-flex items-center gap-1 text-indigo-700"><Clock className="w-3.5 h-3.5" /> {ORDER_STATUS.IN_PROGRESS}</span>
                )}
                {active && normalizeStatus(active.status) === ORDER_STATUS.AGREED && (
                  <span className="inline-flex items-center gap-1 text-teal-700"><CheckCircle2 className="w-3.5 h-3.5" /> {ORDER_STATUS.AGREED} at {formatPaise(active.currentTotalPaise)}</span>
                )}
                {active && normalizeStatus(active.status) === ORDER_STATUS.DEAL && (
                  <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" /> {ORDER_STATUS.DEAL}</span>
                )}
                {active && isClosedStatus(active.status) && normalizeStatus(active.status) === ORDER_STATUS.DECLINED && (
                  <span className="inline-flex items-center gap-1 text-red-700"><XCircle className="w-3.5 h-3.5" /> {ORDER_STATUS.DECLINED}</span>
                )}
              </div>

              {canSpeak && (
                <div className="mt-4 space-y-3">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="neg-amount" className="block text-xs font-semibold text-slate-600">Your total (₹)</label>
                      <input id="neg-amount" value={amount} onChange={(e) => setAmount(sanitizeMoneyInput(e.target.value))}
                        placeholder="e.g. 85,000.00" inputMode="decimal"
                        className="mt-1 block w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 focus:ring-2 focus:ring-amber-500 sm:text-sm" />
                    </div>
                    <div>
                      <label htmlFor="neg-note" className="block text-xs font-semibold text-slate-600">Note (optional)</label>
                      <input id="neg-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500}
                        className="mt-1 block w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 focus:ring-2 focus:ring-amber-500 sm:text-sm" />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => act(nextKind, true)} disabled={busy}
                      className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50 text-sm">
                      {proposeLabel}
                    </button>
                    {tablePrice !== null && (
                      <button onClick={() => act('accept', false)} disabled={busy}
                        className="px-4 py-2.5 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 disabled:opacity-50 text-sm">
                        Accept {formatPaise(tablePrice)}
                      </button>
                    )}
                    {active && !isClosedStatus(active.status) && (
                      <button onClick={() => act('withdraw', false)} disabled={busy}
                        className="px-4 py-2.5 border border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-100 disabled:opacity-50 text-sm">
                        Withdraw
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Only Netamps can press “{ORDER_STATUS.DEAL}” — accepting here records your agreement, it does not close the order.
                  </p>
                </div>
              )}
            </section>

            <div className="flex items-center justify-between text-sm">
              <button onClick={() => refreshThread()} className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900">
                <RefreshCw className="w-4 h-4" /> Refresh
              </button>
              <button onClick={() => { setStep('orders'); setError(''); }} className="text-slate-500 hover:text-slate-800">
                ← Back to my requests
              </button>
            </div>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-600 text-center">{error}</p>}
      </main>
    </div>
  );
}
