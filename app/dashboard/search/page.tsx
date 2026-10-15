'use client';

/**
 * Order search — deterministic filters, model-assisted free text.
 *
 * The split is visible on purpose. The exact fields (order id, email, date
 * range, status, intent) are handed to the database as comparisons; the free
 * text box goes further, but only by asking the model to CHOOSE from a pool
 * the database already enumerated. It can never produce an order that is not
 * in that pool.
 *
 * When the model is unavailable, disabled, or unhelpful, the server falls back
 * to "every term genuinely appears in the row" and says so in the plan strip.
 * That is why this page tells you HOW a result was reached: a search whose
 * provenance you cannot see is a search you cannot audit, and this module
 * reads buyer records.
 *
 * Every row's `why` chips are derived by the server from that row's own
 * columns — not from the model's opinion of them — so they can be checked
 * against the record they describe.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Search, RefreshCw, Sparkles, Filter, Inbox, ExternalLink } from 'lucide-react';
import { DashboardShell } from '../DashboardNav';
import { buildNavSections } from '../nav';
import { useDashboardSession } from '../useDashboardSession';

const API = process.env.NEXT_PUBLIC_API_URL || '';

type Why = { term: string; fields: string[] };

type Hit = {
  id: string;
  intent: string | null;
  name: string | null;
  company: string | null;
  email: string | null;
  status: string | null;
  date: string | null;
  products: string;
  why: Why[];
};

type Plan = {
  mode: 'deterministic' | 'semantic';
  terms: string[];
  poolSize: number | null;
  modelUsed: string | null;
  selection: 'model' | 'substring' | 'none' | null;
  fallback: string | null;
  latencyMs: number;
};

const EMPTY_PLAN: Plan = {
  mode: 'deterministic', terms: [], poolSize: null,
  modelUsed: null, selection: null, fallback: null, latencyMs: 0
};

const STATUS_OPTIONS = [
  'Pending', 'Order Accepted for Negotiation', 'Negotiation in Progress',
  'Accepted Final Price', 'Order Deal Approved', 'Declined',
  'In Progress', 'Completed', 'Rejected', 'Approved'
];

const SELECTION_LABEL: Record<string, string> = {
  model: 'Model-selected from enumerated rows',
  substring: 'Every term found literally in the row',
  none: 'No candidate rows'
};

const FALLBACK_LABEL: Record<string, string> = {
  NO_AI_BINDING: 'No model available — used literal text matching',
  LLM_DISABLED: 'Model disabled by emergency brake — used literal text matching',
  MODEL_FAILED: 'Model call failed — used literal text matching',
  LLM_TIMEOUT: 'Model timed out — used literal text matching',
  model_returned_nothing: 'Model returned no usable selection — used literal text matching',
  no_candidates: 'No order in the database could match those terms'
};

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
};

export default function OrderSearchPage() {
  const [text, setText] = useState('');
  const [orderId, setOrderId] = useState('');
  const [email, setEmail] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('');
  const [intent, setIntent] = useState('');

  const [items, setItems] = useState<Hit[]>([]);
  const [total, setTotal] = useState(0);
  const [plan, setPlan] = useState<Plan>(EMPTY_PLAN);
  const [loading, setLoading] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState<null | Record<string, string>>(null);
  const lastController = useRef<AbortController | null>(null);

  // Declared above the unauthorized early return: React requires the same hook
  // order on every render, and the rail's footer shows this session.
  const session = useDashboardSession();
  const navSections = buildNavSections();

  const run = useCallback(async (params: Record<string, string>) => {
    lastController.current?.abort();
    const controller = new AbortController();
    lastController.current = controller;

    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        cache: 'no-store',
        signal: controller.signal
      });
      if (res.status === 401) { setUnauthorized(true); return; }
      let data: any = null;
      try { data = await res.json(); } catch { throw new Error('bad response'); }
      if (!data?.success) throw new Error(data?.message || 'Search failed.');
      setItems(data.items || []);
      setTotal(Number(data.total) || 0);
      setPlan({ ...EMPTY_PLAN, ...(data.plan || {}) });
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      setError(e?.message || 'Search failed.');
    } finally {
      if (lastController.current === controller) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (applied) run(applied);
  }, [applied, run]);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const params: Record<string, string> = {};
    if (text.trim()) params.text = text.trim();
    if (orderId.trim()) params.orderId = orderId.trim();
    if (email.trim()) params.email = email.trim();
    if (from) params.from = from;
    if (to) params.to = to;
    if (status) params.status = status;
    if (intent) params.intent = intent;
    setApplied(params);
  };

  const clear = () => {
    setText(''); setOrderId(''); setEmail(''); setFrom(''); setTo(''); setStatus(''); setIntent('');
    setItems([]); setTotal(0); setPlan(EMPTY_PLAN); setError(''); setApplied(null);
  };

  const hasFilters = !!(orderId.trim() || email.trim() || from || to || status || intent);

  if (unauthorized) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm font-semibold text-slate-700">Sign in to search orders.</p>
          <Link href="/login" className="mt-4 inline-block px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <DashboardShell
      variant="light"
      sections={navSections}
      footer={{ email: session.email, role: session.role, onTerminate: session.terminate }}
    >
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
              <Search className="w-6 h-6 text-indigo-600" /> Order search
            </h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">
              Exact fields are answered by the database. Free text is answered by the model
              <em> choosing from rows the database already listed</em> — it cannot name an order that is not there.
            </p>
          </div>
          <button onClick={() => applied && run(applied)} className="p-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100" aria-label="Refresh">
            <RefreshCw className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        {/* ── Query ── */}
        <form className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 space-y-4" onSubmit={submit}>
          <div>
            <label htmlFor="s-text" className="block text-xs font-semibold text-slate-600">
              Free text <span className="font-normal text-slate-400">— company, product, model, contact name</span>
            </label>
            <input
              id="s-text" value={text} onChange={(e) => setText(e.target.value)}
              placeholder="acme poweredge servers"
              className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50/50 text-sm focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label htmlFor="s-order" className="block text-xs font-semibold text-slate-600">Order ID <span className="font-normal text-slate-400">(prefix)</span></label>
              <input id="s-order" value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="B-772EE"
                className="mt-1 w-44 px-3 py-2 border border-slate-300 rounded-xl bg-slate-50/50 text-sm font-mono focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label htmlFor="s-email" className="block text-xs font-semibold text-slate-600">Email</label>
              <input id="s-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="buyer@acme.com"
                className="mt-1 w-56 px-3 py-2 border border-slate-300 rounded-xl bg-slate-50/50 text-sm focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label htmlFor="s-from" className="block text-xs font-semibold text-slate-600">From</label>
              <input id="s-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                className="mt-1 px-3 py-2 border border-slate-300 rounded-xl bg-slate-50/50 text-sm focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label htmlFor="s-to" className="block text-xs font-semibold text-slate-600">To</label>
              <input id="s-to" type="date" value={to} onChange={(e) => setTo(e.target.value)}
                className="mt-1 px-3 py-2 border border-slate-300 rounded-xl bg-slate-50/50 text-sm focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label htmlFor="s-status" className="block text-xs font-semibold text-slate-600">Status</label>
              <select id="s-status" value={status} onChange={(e) => setStatus(e.target.value)}
                className="mt-1 px-3 py-2 border border-slate-300 rounded-xl bg-slate-50/50 text-sm focus:ring-2 focus:ring-indigo-500">
                <option value="">Any</option>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="s-intent" className="block text-xs font-semibold text-slate-600">Intent</label>
              <select id="s-intent" value={intent} onChange={(e) => setIntent(e.target.value)}
                className="mt-1 px-3 py-2 border border-slate-300 rounded-xl bg-slate-50/50 text-sm focus:ring-2 focus:ring-indigo-500">
                <option value="">Any</option>
                <option value="buy">BUY</option>
                <option value="sell">SELL</option>
              </select>
            </div>

            <button type="submit" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-700">
              <Search className="w-4 h-4" /> Search
            </button>
            {(text || hasFilters) && (
              <button type="button" onClick={clear} className="px-3 py-2 rounded-xl text-sm font-semibold text-slate-500 hover:text-slate-900">
                Clear
              </button>
            )}
          </div>
        </form>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        {/* ── Provenance strip ── */}
        {applied && !error && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full font-bold border ${plan.mode === 'semantic' ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                {plan.mode === 'semantic' ? <Sparkles className="w-3 h-3" /> : <Filter className="w-3 h-3" />}
                {plan.mode === 'semantic' ? 'Model-assisted' : 'Exact filters only'}
              </span>

              {plan.selection && (
                <span className="px-2 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                  {SELECTION_LABEL[plan.selection] || plan.selection}
                </span>
              )}

              {plan.modelUsed && (
                <span className="px-2 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-500 font-mono">
                  {plan.modelUsed.split('/').pop()}
                </span>
              )}

              {plan.poolSize !== null && (
                <span className="px-2 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-500 font-mono">
                  pool {plan.poolSize}
                </span>
              )}

              <span className="px-2 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-500 font-mono">
                {plan.latencyMs}ms
              </span>

              <span className="ml-auto font-mono font-bold text-slate-700">{total}</span>
              <span className="text-slate-500">match{total === 1 ? '' : 'es'}</span>
            </div>

            {plan.fallback && (
              <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                {FALLBACK_LABEL[plan.fallback] || `Degraded: ${plan.fallback}`}
              </p>
            )}
          </div>
        )}

        {loading && items.length === 0 && <p className="mt-6 text-sm text-slate-500">Searching…</p>}

        {!loading && applied && items.length === 0 && !error && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
            <Inbox className="w-6 h-6 mx-auto mb-3 text-slate-300" />
            No order matched
            <div className="mt-2 text-xs text-slate-400 max-w-md mx-auto">
              {plan.fallback === 'no_candidates'
                ? 'None of those words appear in any order the database could reach. The model was never asked to invent a match.'
                : 'Try widening the text, or drop a filter — filters are applied to the candidate set before the model sees it.'}
            </div>
          </div>
        )}

        {/* ── Results ── */}
        <div className="mt-4 space-y-3">
          {items.map((h) => (
            <section key={h.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/dashboard?order=${encodeURIComponent(h.id)}`}
                      className="font-mono font-bold text-slate-900 hover:text-indigo-700 inline-flex items-center gap-1">
                      {h.id} <ExternalLink className="w-3 h-3 text-slate-400" />
                    </Link>
                    {h.intent && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase ${h.intent === 'buy' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                        {h.intent}
                      </span>
                    )}
                    {h.status && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border border-indigo-200 bg-indigo-50 text-indigo-700">
                        {h.status}
                      </span>
                    )}
                  </div>

                  <div className="mt-1.5 text-sm text-slate-700">
                    {h.name || 'Unnamed contact'}
                    {h.company && <span className="text-slate-500"> · {h.company}</span>}
                  </div>
                  {h.email && <div className="text-xs text-slate-500 font-mono">{h.email}</div>}

                  {h.products && (
                    <p className="mt-2 text-sm text-slate-600 whitespace-pre-wrap break-words">{h.products}</p>
                  )}

                  {/* Derived from this row's own columns — checkable against it. */}
                  {h.why.length > 0 && (
                    <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] uppercase tracking-wide text-slate-400">matched in</span>
                      {h.why.map((w) => (
                        <span key={w.term} className="px-2 py-0.5 rounded-full text-[10px] font-mono border border-slate-200 bg-slate-50 text-slate-600">
                          {w.term} → {w.fields.join(', ')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="text-right shrink-0">
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">Order date</div>
                  <div className="text-xs font-mono text-slate-600">{fmtDate(h.date)}</div>
                  <Link href={`/dashboard/negotiations?order=${encodeURIComponent(h.id)}`}
                    className="mt-2 inline-block text-xs font-semibold text-amber-600 hover:text-amber-700">
                    Negotiation →
                  </Link>
                </div>
              </div>
            </section>
          ))}
        </div>
      </main>
    </DashboardShell>
  );
}
