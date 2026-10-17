'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  ChevronDown,
  Clock,
  Copy,
  DollarSign,
  Edit2,
  Package,
  PackageCheck,
  Plus,
  RefreshCw,
  Save,
  Search,
  Truck,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { DashboardShell } from '../DashboardNav';
import { buildNavSections } from '../nav';
import { useDashboardSession } from '../useDashboardSession';

const API = process.env.NEXT_PUBLIC_API_URL || '';

/** Render integer cents as rupees with two decimals. */
function rupees(cents: number): string {
  return '₹' + (Math.max(0, cents) / 100).toFixed(2);
}

function num(v: unknown, def = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function blankProduct() {
  return { sku: '', item_name: '', category: '', uom: 'Nos', cost: '', selling: '', supplier: '', trigger: '', targetMax: '' };
}

function txnId(prefix: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${prefix}${pad(d.getFullYear())}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;
}

type Product = { sku: string; item_name: string; category: string; uom: string; cost: number; selling: number; supplier: string; trigger: number; target_max: number; };
type BalanceRow = { sku: string; item_name: string; category: string; uom: string; opening: number; inflow: number; outflow: number; on_hand: number; stock_value_cents: number; status: 'HEALTHY' | 'RESTOCK REQUIRED'; trigger: number; };
type RestockItem = { sku: string; item_name: string; supplier: string; on_hand: number; trigger_level: number; target_max: number; recommended_qty: number; };
type Txn = { txn_id: string; sku: string; type: 'IN' | 'OUT'; qty: number; unit_rate_cents: number; ref_notes: string; createdAt: string; };

function parseJson(res: Response): Promise<any> {
  try { return res.json(); } catch { return Promise.resolve(null); }
}

function rowsOf(v: unknown): unknown[] {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    for (const k of ['data', 'items', 'rows', 'balance', 'restock', 'products']) {
      if (Array.isArray(o[k])) return o[k];
    }
  }
  return Array.isArray(v) ? v : [];
}

function computeBalance(raw: unknown[], products: Product[]): BalanceRow[] {
  const bySku = new Map(products.map((p) => [p.sku, p]));
  return (raw || []).map((row) => {
    const r = row as Record<string, unknown>;
    const p = bySku.get(String(r.sku ?? ''));
    const opening = num(r.opening);
    const inflow = num(r.inflow);
    const outflow = num(r.outflow);
    const onHand = opening + inflow - outflow;
    const cost = p ? num(p.cost) : 0;
    const trigger = p ? num(p.trigger) : 0;
    return {
      sku: String(r.sku ?? ''),
      item_name: String(r.item_name ?? p?.item_name ?? ''),
      category: String(r.category ?? p?.category ?? ''),
      uom: String(r.uom ?? p?.uom ?? ''),
      opening,
      inflow,
      outflow,
      on_hand: onHand,
      stock_value_cents: typeof r.stock_value_cents === 'number' ? r.stock_value_cents : Math.round(onHand * cost),
      status: onHand <= trigger ? 'RESTOCK REQUIRED' : 'HEALTHY',
      trigger,
    };
  });
}

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [balance, setBalance] = useState<BalanceRow[]>([]);
  const [restockItems, setRestockItems] = useState<RestockItem[]>([]);
  const [analytics, setAnalytics] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [unauthorized, setUnauthorized] = useState(false);

  // Declared before any early return so hook order stays stable.
  const session = useDashboardSession();
  const navSections = buildNavSections();

  const [prodDraft, setProdDraft] = useState(() => blankProduct());
  const [editingSku, setEditingSku] = useState<string | null>(null);
  const [savingProd, setSavingProd] = useState(false);

  const [txnIn, setTxnIn] = useState({ txn_id: txnId('IN-'), sku: '', qty: '', unit_rate_cents: '', ref_notes: '' });
  const [txnOut, setTxnOut] = useState({ txn_id: txnId('OUT-'), sku: '', qty: '', unit_rate_cents: '', ref_notes: '' });
  const [txns, setTxns] = useState<Txn[]>([]);
  const [submittingTxn, setSubmittingTxn] = useState<'in' | 'out' | null>(null);
  const stockInRef = useRef<HTMLDivElement | null>(null);

  const [live, setLive] = useState(true);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'healthy' | 'restock'>('all');
  const [searchSku, setSearchSku] = useState('');

  const [aiMode, setAiMode] = useState<'advisory' | 'anomaly' | 'query' | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<unknown>(null);
  const [nlq, setNlq] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const [balRes, restRes, anaRes, prodRes] = await Promise.all([
        fetch(`${API}/api/inventory?action=balance`, { cache: 'no-store', credentials: 'include' }),
        fetch(`${API}/api/inventory?action=restock`, { cache: 'no-store', credentials: 'include' }),
        fetch(`${API}/api/inventory?action=analytics`, { cache: 'no-store', credentials: 'include' }),
        fetch(`${API}/api/inventory?action=products`, { cache: 'no-store', credentials: 'include' }),
      ]);
      if (balRes.status === 401 || restRes.status === 401 || anaRes.status === 401 || prodRes.status === 401) {
        setUnauthorized(true);
        setLoading(false);
        return;
      }
      const [bal, rest, ana, prod] = await Promise.all([parseJson(balRes), parseJson(restRes), parseJson(anaRes), parseJson(prodRes)]);
      const nextProducts = rowsOf(prod).map((p) => {
        const x = p as Record<string, unknown>;
        return {
          sku: String(x.sku ?? ''),
          item_name: String(x.item_name ?? ''),
          category: String(x.category ?? ''),
          uom: String(x.uom ?? 'Nos'),
          cost: num(x.cost),
          selling: num(x.selling),
          supplier: String(x.supplier ?? ''),
          trigger: num(x.trigger),
          target_max: num(x.target_max),
        };
      });
      setProducts(nextProducts);
      setBalance(computeBalance(rowsOf(bal), nextProducts));
      setRestockItems(rowsOf(rest).map((x) => {
        const r = x as Record<string, unknown>;
        return {
          sku: String(r.sku ?? ''),
          item_name: String(r.item_name ?? ''),
          supplier: String(r.supplier ?? ''),
          on_hand: num(r.on_hand),
          trigger_level: num(r.trigger_level),
          target_max: num(r.target_max),
          recommended_qty: num(r.recommended_qty),
        };
      }));
      setAnalytics(ana && typeof ana === 'object' && !Array.isArray(ana) ? ana : {});
    } catch {
      setError('Failed to load inventory data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (tickRef.current !== null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (live) {
      tickRef.current = setInterval(async () => {
        try {
          const res = await fetch(`${API}/api/inventory?action=balance`, { cache: 'no-store', credentials: 'include' });
          if (res.status === 401) { setUnauthorized(true); return; }
          const data = await parseJson(res);
          setBalance(computeBalance(rowsOf(data), products));
        } catch {
          // A missed poll is not an error state; the next tick retries.
        }
      }, 15000);
    }
    return () => { if (tickRef.current !== null) clearInterval(tickRef.current); };
  }, [live, products]);

  const saveProduct = useCallback(async () => {
    const sku = prodDraft.sku.trim();
    const itemName = prodDraft.item_name.trim();
    const cost = num(prodDraft.cost) * 100;
    const selling = num(prodDraft.selling) * 100;
    if (!sku || !itemName) { setError('SKU and item name are required.'); return; }
    setError('');
    setSavingProd(true);
    try {
      const res = await fetch(`${API}/api/inventory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'save-product', product: { sku, item_name: itemName, category: prodDraft.category.trim(), uom: prodDraft.uom.trim() || 'Nos', cost: Math.round(cost), selling: Math.round(selling), supplier: prodDraft.supplier.trim(), trigger: num(prodDraft.trigger), target_max: num(prodDraft.targetMax) } }),
      });
      if (res.status === 401) { setUnauthorized(true); return; }
      let data: any = null;
      try { data = await res.json(); } catch { throw new Error('bad response'); }
      if (!data?.success) { setError(data?.message || 'Could not save product.'); return; }
      setEditingSku(null);
      setProdDraft(blankProduct());
      setNotice(`Product ${sku} saved.`);
      await load();
    } catch {
      setError('Could not save product.');
    } finally {
      setSavingProd(false);
    }
  }, [prodDraft, load]);

  const deleteProduct = useCallback(async (sku: string) => {
    if (!window.confirm(`Delete product ${sku}? This cannot be undone.`)) return;
    setError('');
    try {
      const res = await fetch(`${API}/api/inventory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'delete-product', sku }),
      });
      if (res.status === 401) { setUnauthorized(true); return; }
      let data: any = null;
      try { data = await res.json(); } catch { throw new Error('bad response'); }
      if (!data?.success) { setError(data?.message || 'Could not delete product.'); return; }
      setNotice(`Product ${sku} deleted.`);
      if (editingSku === sku) { setEditingSku(null); setProdDraft(blankProduct()); }
      await load();
    } catch {
      setError('Could not delete product.');
    }
  }, [editingSku, load]);

  const submitTxn = useCallback(async (type: 'IN' | 'OUT') => {
    const draft = type === 'IN' ? txnIn : txnOut;
    const txnIdValue = draft.txn_id.trim() || txnId(type === 'IN' ? 'IN-' : 'OUT-');
    const sku = draft.sku.trim().toUpperCase();
    const qty = num(draft.qty);
    const rate = num(draft.unit_rate_cents) * 100;
    if (!sku || qty <= 0) { setError('Enter a valid SKU and quantity.'); return; }
    if (!products.some((p) => p.sku === sku)) { setError(`Unknown SKU ${sku}.`); return; }
    setError('');
    setSubmittingTxn(type === 'IN' ? 'in' : 'out');
    try {
      const res = await fetch(`${API}/api/inventory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: type === 'IN' ? 'stock-in' : 'stock-out', txn_id: txnIdValue, sku, qty: Math.round(qty), unit_rate_cents: Math.round(rate), ref_notes: draft.ref_notes.trim() }),
      });
      if (res.status === 400) {
        let data: any = null;
        try { data = await res.json(); } catch { data = null; }
        setError((data?.message && typeof data.message === 'string') ? data.message : 'Insufficient stock — entry blocked.');
        return;
      }
      if (res.status === 401) { setUnauthorized(true); return; }
      let data: any = null;
      try { data = await res.json(); } catch { throw new Error('bad response'); }
      if (!data?.success) { setError(data?.message || 'Transaction rejected.'); return; }
      const entry: Txn = { txn_id: txnIdValue, sku, type, qty: Math.round(qty), unit_rate_cents: Math.round(rate), ref_notes: draft.ref_notes.trim(), createdAt: new Date().toISOString() };
      setTxns((prev) => [entry, ...prev].slice(0, 10));
      if (type === 'IN') setTxnIn({ txn_id: txnId('IN-'), sku: '', qty: '', unit_rate_cents: '', ref_notes: '' });
      else setTxnOut({ txn_id: txnId('OUT-'), sku: '', qty: '', unit_rate_cents: '', ref_notes: '' });
      setNotice(`${type} ${sku} × ${qty} recorded.`);
      await load();
    } catch {
      setError('Transaction failed.');
    } finally {
      setSubmittingTxn(null);
    }
  }, [txnIn, txnOut, products, load]);

  const createPo = useCallback((item: RestockItem) => {
    setTxnIn({
      txn_id: txnId('IN-'),
      sku: item.sku,
      qty: String(item.recommended_qty || 0),
      unit_rate_cents: '',
      ref_notes: `PO draft · target max ${item.target_max}`,
    });
    setNotice(`Drafted stock-in for ${item.sku} — recommended qty ${item.recommended_qty} pre-filled above.`);
    stockInRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const aiCall = useCallback(async (action: string, body: Record<string, unknown>) => {
    setAiLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/inventory-ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, ...body }),
      });
      if (res.status === 401) { setUnauthorized(true); return; }
      let data: any = null;
      try { data = await res.json(); } catch { throw new Error('bad response'); }
      if (!data?.success) { setError(data?.message || 'AI request failed.'); return; }
      setAiResult(data.result ?? data);
    } catch {
      setError('AI request failed.');
    } finally {
      setAiLoading(false);
    }
  }, []);

  const getRestockAdvisory = useCallback(() => {
    setAiMode('advisory');
    setAiResult(null);
    void aiCall('restock-advisor', {});
  }, [aiCall]);

  const detectAnomalies = useCallback(() => {
    setAiMode('anomaly');
    setAiResult(null);
    void aiCall('anomaly-detect', {});
  }, [aiCall]);

  const askNlq = useCallback(() => {
    if (!nlq.trim()) return;
    setAiMode('query');
    setAiResult(null);
    void aiCall('nlq', { query: nlq.trim() });
  }, [nlq, aiCall]);

  const renderAdvisory = (result: unknown) => {
    const list = Array.isArray(result) ? result : [];
    if (list.length === 0) return <p className="text-xs text-slate-500">No restock recommendations.</p>;
    return (
      <ul className="space-y-1 text-xs">
        {list.map((x, i) => {
          const r = x as Record<string, unknown>;
          const high = String(r.priority ?? '').toLowerCase() === 'high';
          return (
            <li key={i} className="flex items-center gap-2">
              <span className="w-10 font-mono text-slate-600">{String(r.sku ?? '')}</span>
              <span className="min-w-0 flex-1 truncate text-slate-700">{String(r.reason ?? '')}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${high ? 'border-rose-500/30 bg-rose-500/10 text-rose-400' : 'border-amber-500/30 bg-amber-500/10 text-amber-400'}`}>
                {String(r.priority ?? '—')}
              </span>
            </li>
          );
        })}
      </ul>
    );
  };

  const renderAnomalies = (result: unknown) => {
    const list = Array.isArray(result) ? result : [];
    if (list.length === 0) return <p className="text-xs text-slate-500">No anomalies detected.</p>;
    return (
      <ul className="space-y-1 text-xs">
        {list.map((x, i) => {
          const r = x as Record<string, unknown>;
          return (
            <li key={i} className="flex items-center gap-2">
              <span className="w-10 font-mono text-slate-600">{String(r.sku ?? '')}</span>
              <span className="min-w-0 flex-1 truncate text-slate-700">{String(r.detail ?? r.reason ?? '')}</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold border border-rose-500/30 bg-rose-500/10 text-rose-400">
                {String(r.severity ?? '—')}
              </span>
            </li>
          );
        })}
      </ul>
    );
  };

  const renderQueryAnswer = (result: unknown) => {
    const obj = result as Record<string, unknown>;
    const answer = typeof obj.answer === 'string' ? obj.answer : typeof result === 'string' ? result : 'No answer returned.';
    return <p className="text-xs text-slate-600">{answer}</p>;
  };

  const totalValuationCents = balance.reduce((a, r) => a + r.stock_value_cents, 0);
  const totalUnits = balance.reduce((a, r) => a + r.on_hand, 0);
  const restockCount = balance.filter((r) => r.status === 'RESTOCK REQUIRED').length;
  const rawVelocities = analytics.topVelocities;
  const topVelocities: Array<{ sku: string; item_name: string; volume: number }> = Array.isArray(rawVelocities)
    ? (rawVelocities as unknown[]).slice(0, 3).map((v) => {
        const x = v as Record<string, unknown>;
        return { sku: String(x.sku ?? ''), item_name: String(x.item_name ?? ''), volume: num(x.volume) };
      })
    : [];
  const maxVol = Math.max(1, ...topVelocities.map((v) => v.volume));
  const filteredProducts = products.filter((p) =>
    p.sku.toLowerCase().includes(searchSku.toLowerCase()) || p.item_name.toLowerCase().includes(searchSku.toLowerCase()),
  );
  const filteredBalance = balance.filter((r) => {
    if (statusFilter === 'healthy') return r.status === 'HEALTHY';
    if (statusFilter === 'restock') return r.status === 'RESTOCK REQUIRED';
    return true;
  });

  const card = 'rounded-xl border border-slate-200 bg-white p-4';
  const input = 'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-500 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-lime-400 focus-visible:outline-none';
  const fieldLabel = 'block text-[11px] font-bold uppercase tracking-wider text-slate-500';
  const btnLime = 'inline-flex items-center gap-1.5 rounded-lg border border-lime-400/40 bg-lime-400/10 px-3 py-2 text-xs font-bold text-lime-400 transition-colors hover:bg-lime-400/20 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-lime-400 focus-visible:outline-none';
  const btnSky = 'inline-flex items-center gap-1.5 rounded-lg border border-sky-400/40 bg-sky-400/10 px-3 py-2 text-xs font-bold text-sky-400 transition-colors hover:bg-sky-400/20 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none';
  const btnGhost = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-300 focus-visible:ring-2 focus-visible:ring-lime-400 focus-visible:outline-none disabled:opacity-50';
  const pill = (restock: boolean) => `px-2 py-0.5 rounded text-[10px] font-bold border ${restock ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'}`;

  if (unauthorized) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-700 font-semibold">Your session has ended.</p>
          <Link href="/login" className="mt-3 inline-block px-4 py-2 bg-slate-50 text-white rounded-xl font-bold">
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
      <main className="max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
              <Package className="w-6 h-6 text-indigo-600" /> Inventory
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Stock on hand, movements, restock procurement and analytics for the product catalog.
            </p>
          </div>
          <button
            onClick={() => load()}
            disabled={loading}
            className="p-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 transition-colors focus-visible:ring-2 focus-visible:ring-lime-500 focus-visible:outline-none disabled:opacity-50"
            aria-label="Refresh inventory data"
          >
            <RefreshCw className={`w-4 h-4 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        {notice && <p className="mt-4 text-sm text-emerald-700">{notice}</p>}

        {loading ? (
          <div className="mt-6 rounded-2xl bg-white border border-slate-200 p-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <section className={card}>
                <div className="h-10 rounded-lg bg-slate-100 animate-pulse" />
                <div className="mt-3 space-y-2">
                  <div className="h-8 rounded-lg bg-slate-100 animate-pulse w-3/4" />
                  <div className="h-8 rounded-lg bg-slate-100 animate-pulse w-1/2" />
                </div>
              </section>
              <section className={card}>
                <div className="h-10 rounded-lg bg-slate-100 animate-pulse" />
                <div className="mt-3 space-y-2">
                  <div className="h-8 rounded-lg bg-slate-100 animate-pulse w-3/4" />
                  <div className="h-8 rounded-lg bg-slate-100 animate-pulse w-1/2" />
                </div>
              </section>
              <section className={card}>
                <div className="h-10 rounded-lg bg-slate-100 animate-pulse" />
                <div className="mt-3 grid gap-3">
                  <div className="h-12 rounded-lg bg-slate-100 animate-pulse" />
                  <div className="h-12 rounded-lg bg-slate-100 animate-pulse" />
                  <div className="h-12 rounded-lg bg-slate-100 animate-pulse" />
                </div>
              </section>
              <section className={`${card} lg:col-span-3`}>
                <div className="h-10 rounded-lg bg-slate-100 animate-pulse" />
                <div className="mt-3 space-y-2">
                  <div className="h-8 rounded-lg bg-slate-100 animate-pulse" />
                  <div className="h-8 rounded-lg bg-slate-100 animate-pulse w-3/4" />
                </div>
              </section>
              <section className={`${card} lg:col-span-3`}>
                <div className="h-10 rounded-lg bg-slate-100 animate-pulse" />
                <div className="mt-3 space-y-2">
                  <div className="h-8 rounded-lg bg-slate-100 animate-pulse w-1/2" />
                </div>
              </section>
              <section className={`${card} lg:col-span-3`}>
                <div className="h-10 rounded-lg bg-slate-100 animate-pulse" />
                <div className="mt-3 space-y-2">
                  <div className="h-8 rounded-lg bg-slate-100 animate-pulse w-1/3" />
                  <div className="h-16 rounded-lg bg-slate-100 animate-pulse" />
                </div>
              </section>
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl bg-white text-slate-900 border border-slate-200 p-4">
            {/* Top row of modules: product registry, transaction logging, analytics. */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* ── MODULE 1: Product Master Registry ── */}
              <section className={card} aria-label="Product Master Registry">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h2 className="font-bold text-white flex items-center gap-2">
                    <Package className="w-4 h-4 text-lime-400" /> Product Master Registry
                  </h2>
                  <button
                    onClick={() => { setEditingSku(null); setProdDraft(blankProduct()); setError(''); }}
                    className={btnGhost}
                  >
                    <Plus className="w-3.5 h-3.5" /> New
                  </button>
                </div>
                <div className="mt-3 relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                  <input
                    value={searchSku}
                    onChange={(e) => setSearchSku(e.target.value)}
                    placeholder="Filter by SKU or item name…"
                    className={`${input} pl-8`}
                  />
                </div>
                <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                    <div className="sm:col-span-2">
                      <label className={`${fieldLabel} mb-1`}>SKU</label>
                      <input value={prodDraft.sku} onChange={(e) => setProdDraft((d) => ({ ...d, sku: e.target.value }))} placeholder="e.g. SKU-1001" className={input} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={`${fieldLabel} mb-1`}>Item name</label>
                      <input value={prodDraft.item_name} onChange={(e) => setProdDraft((d) => ({ ...d, item_name: e.target.value }))} placeholder="e.g. Toner cartridge" className={input} />
                    </div>
                    <div>
                      <label className={`${fieldLabel} mb-1`}>Category</label>
                      <input value={prodDraft.category} onChange={(e) => setProdDraft((d) => ({ ...d, category: e.target.value }))} placeholder="Category" className={input} />
                    </div>
                    <div>
                      <label className={`${fieldLabel} mb-1`}>UoM</label>
                      <input value={prodDraft.uom} onChange={(e) => setProdDraft((d) => ({ ...d, uom: e.target.value }))} placeholder="Nos" className={input} />
                    </div>
                    <div>
                      <label className={`${fieldLabel} mb-1`}>Cost (₹)</label>
                      <input value={prodDraft.cost} onChange={(e) => setProdDraft((d) => ({ ...d, cost: e.target.value }))} placeholder="0.00" className={input} />
                    </div>
                    <div>
                      <label className={`${fieldLabel} mb-1`}>Selling (₹)</label>
                      <input value={prodDraft.selling} onChange={(e) => setProdDraft((d) => ({ ...d, selling: e.target.value }))} placeholder="0.00" className={input} />
                    </div>
                    <div>
                      <label className={`${fieldLabel} mb-1`}>Supplier</label>
                      <input value={prodDraft.supplier} onChange={(e) => setProdDraft((d) => ({ ...d, supplier: e.target.value }))} placeholder="Supplier" className={input} />
                    </div>
                    <div>
                      <label className={`${fieldLabel} mb-1`}>Reorder trigger</label>
                      <input type="number" value={prodDraft.trigger} onChange={(e) => setProdDraft((d) => ({ ...d, trigger: e.target.value }))} placeholder="0" className={input} />
                    </div>
                    <div>
                      <label className={`${fieldLabel} mb-1`}>Target max</label>
                      <input type="number" value={prodDraft.targetMax} onChange={(e) => setProdDraft((d) => ({ ...d, targetMax: e.target.value }))} placeholder="0" className={input} />
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2 flex-wrap">
                    {editingSku !== null ? (
                      <>
                        <p className="mt-0.5 text-xs text-slate-500">Editing <span className="font-mono font-bold">{editingSku}</span>.</p>
                        <button onClick={saveProduct} disabled={savingProd} className={btnLime}>
                          {savingProd ? <Save className="w-3.5 h-3.5" /> : null} {savingProd ? 'Saving…' : 'Save product'}
                        </button>
                        <button onClick={() => { setEditingSku(null); setProdDraft(blankProduct()); setError(''); }} className={btnGhost}>Cancel</button>
                      </>
                    ) : (
                      <button onClick={saveProduct} disabled={savingProd} className={btnLime}>
                        {savingProd ? <Save className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />} {savingProd ? 'Saving…' : 'Add product'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-300 text-[10px] uppercase tracking-wider text-slate-500">
                        <th className="px-4 py-3 text-left">SKU</th>
                        <th className="px-4 py-3 text-left">Item</th>
                        <th className="px-4 py-3 text-left">Category</th>
                        <th className="px-4 py-3 text-left">UoM</th>
                        <th className="px-4 py-3 text-right">Cost</th>
                        <th className="px-4 py-3 text-right">Selling</th>
                        <th className="px-4 py-3 text-left">Supplier</th>
                        <th className="px-4 py-3 text-right">Trigger</th>
                        <th className="px-4 py-3 text-right">Target</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredProducts.length === 0 ? (
                        <tr>
                          <td className="px-4 py-6 text-center text-slate-500" colSpan={10}>
                            No products yet. Add one above.
                          </td>
                        </tr>
                      ) : (
                        filteredProducts.map((p) => (
                          <tr key={p.sku} className="text-slate-700">
                            <td className="px-4 py-3 font-mono">{p.sku}</td>
                            <td className="px-4 py-3">{p.item_name}</td>
                            <td className="px-4 py-3 text-slate-600">{p.category}</td>
                            <td className="px-4 py-3 text-slate-600">{p.uom}</td>
                            <td className="px-4 py-3 text-right font-mono text-slate-600">{rupees(p.cost)}</td>
                            <td className="px-4 py-3 text-right font-mono text-slate-600">{rupees(p.selling)}</td>
                            <td className="px-4 py-3 text-slate-600">{p.supplier}</td>
                            <td className="px-4 py-3 text-right text-slate-600">{p.trigger}</td>
                            <td className="px-4 py-3 text-right text-slate-600">{p.target_max}</td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => {
                                  setEditingSku(p.sku);
                                  setProdDraft({
                                    sku: p.sku, item_name: p.item_name, category: p.category, uom: p.uom,
                                    cost: (p.cost / 100).toFixed(2), selling: (p.selling / 100).toFixed(2),
                                    supplier: p.supplier, trigger: String(p.trigger), targetMax: String(p.target_max),
                                  });
                                  setError('');
                                }}
                                title="Edit product"
                                className="p-1 text-slate-500 hover:text-sky-400 transition-colors focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => deleteProduct(p.sku)}
                                title="Delete product"
                                className="ml-1 p-1 text-slate-500 hover:text-rose-400 transition-colors focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:outline-none"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* ── MODULE 2: Transaction Logging ── */}
              <section ref={stockInRef} className={card} aria-label="Transaction Logging">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h2 className="font-bold text-white flex items-center gap-2">
                    <Truck className="w-4 h-4 text-teal-300" /> Transaction Logging
                  </h2>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-lime-400 mb-3 flex items-center gap-1">
                      <Plus className="w-3 h-3" /> Stock In
                    </h3>
                    <div className="space-y-2">
                      <label className={`${fieldLabel} mb-1`}>Txn ID</label>
                      <input value={txnIn.txn_id} onChange={(e) => setTxnIn((d) => ({ ...d, txn_id: e.target.value }))} placeholder="IN-…" className={input} />
                      <label className={`${fieldLabel} mb-1`}>SKU</label>
                      <input list="product-skus" value={txnIn.sku} onChange={(e) => setTxnIn((d) => ({ ...d, sku: e.target.value.toUpperCase() }))} placeholder="SKU-1001" className={input} />
                      <datalist id="product-skus">{products.map((p) => <option key={p.sku} value={p.sku} />)}</datalist>
                      <label className={`${fieldLabel} mb-1`}>Qty</label>
                      <input type="number" value={txnIn.qty} onChange={(e) => setTxnIn((d) => ({ ...d, qty: e.target.value }))} placeholder="0" className={input} />
                      <label className={`${fieldLabel} mb-1`}>Unit rate (₹)</label>
                      <input value={txnIn.unit_rate_cents} onChange={(e) => setTxnIn((d) => ({ ...d, unit_rate_cents: e.target.value }))} placeholder="0.00" className={input} />
                      <label className={`${fieldLabel} mb-1`}>Reference notes</label>
                      <input value={txnIn.ref_notes} onChange={(e) => setTxnIn((d) => ({ ...d, ref_notes: e.target.value }))} placeholder="PO / GRN ref" className={input} />
                      <button
                        onClick={() => submitTxn('IN')}
                        disabled={submittingTxn === 'in'}
                        className={`w-full ${btnLime}`}
                      >
                        {submittingTxn === 'in' ? 'Recording…' : <><Plus className="w-3.5 h-3.5" /> Stock In</>}
                      </button>
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400 mb-3 flex items-center gap-1">
                      <Plus className="w-3 h-3 text-sky-400" /> Stock Out
                    </h3>
                    <div className="space-y-2">
                      <label className={`${fieldLabel} mb-1`}>Txn ID</label>
                      <input value={txnOut.txn_id} onChange={(e) => setTxnOut((d) => ({ ...d, txn_id: e.target.value }))} placeholder="OUT-…" className={input} />
                      <label className={`${fieldLabel} mb-1`}>SKU</label>
                      <input list="product-skus" value={txnOut.sku} onChange={(e) => setTxnOut((d) => ({ ...d, sku: e.target.value.toUpperCase() }))} placeholder="SKU-1001" className={input} />
                      <label className={`${fieldLabel} mb-1`}>Qty</label>
                      <input type="number" value={txnOut.qty} onChange={(e) => setTxnOut((d) => ({ ...d, qty: e.target.value }))} placeholder="0" className={input} />
                      <label className={`${fieldLabel} mb-1`}>Unit rate (₹)</label>
                      <input value={txnOut.unit_rate_cents} onChange={(e) => setTxnOut((d) => ({ ...d, unit_rate_cents: e.target.value }))} placeholder="0.00" className={input} />
                      <label className={`${fieldLabel} mb-1`}>Reference notes</label>
                      <input value={txnOut.ref_notes} onChange={(e) => setTxnOut((d) => ({ ...d, ref_notes: e.target.value }))} placeholder="Customer / issue ref" className={input} />
                      <button
                        onClick={() => submitTxn('OUT')}
                        disabled={submittingTxn === 'out'}
                        className={`w-full ${btnSky}`}
                      >
                        {submittingTxn === 'out' ? 'Recording…' : <><Plus className="w-3 h-3" /> Stock Out</>}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-500" /> Recent this session
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-300 text-[10px] uppercase tracking-wider text-slate-500">
                          <th className="px-4 py-3 text-left">Txn ID</th>
                          <th className="px-4 py-3 text-left">SKU</th>
                          <th className="px-4 py-3 text-left">Type</th>
                          <th className="px-4 py-3 text-right">Qty</th>
                          <th className="px-4 py-3 text-right">Rate</th>
                          <th className="px-4 py-3 text-left">Notes</th>
                          <th className="px-4 py-3 text-right">Time</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {txns.length === 0 ? (
                          <tr>
                            <td className="px-4 py-6 text-center text-slate-500" colSpan={8}>
                              No transactions this session.
                            </td>
                          </tr>
                        ) : (
                          txns.map((t) => (
                            <tr key={t.txn_id} className="text-slate-700">
                              <td className="px-4 py-3 font-mono text-slate-600">{t.txn_id}</td>
                              <td className="px-4 py-3 font-mono">{t.sku}</td>
                              <td className="px-4 py-3">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${t.type === 'IN' ? 'border-lime-500/30 bg-lime-500/10 text-lime-400' : 'border-sky-500/30 bg-sky-500/10 text-sky-400'}`}>
                                  {t.type}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right text-slate-600">{t.qty}</td>
                              <td className="px-4 py-3 text-right font-mono text-slate-600">{rupees(t.unit_rate_cents)}</td>
                              <td className="px-4 py-3 text-slate-600 truncate" title={t.ref_notes}>{t.ref_notes}</td>
                              <td className="px-4 py-3 text-right font-mono text-slate-500">{new Date(t.createdAt).toLocaleTimeString()}</td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  onClick={() => { void navigator.clipboard.writeText(t.txn_id).catch(() => {}); setNotice(`Copied ${t.txn_id}`); }}
                                  title="Copy txn id"
                                  className="p-1 text-slate-500 hover:text-slate-700 transition-colors focus-visible:ring-2 focus-visible:ring-lime-400 focus-visible:outline-none"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              {/* ── MODULE 5: Executive Analytics ── */}
              <section className={card} aria-label="Executive Analytics">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h2 className="font-bold text-white flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-sky-400" /> Executive Analytics
                  </h2>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total valuation</p>
                    <p className="text-2xl font-mono font-black text-white">{rupees(totalValuationCents)}</p>
                    <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                      <DollarSign className="w-3 h-3" /> stock value at on-hand qty
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total units</p>
                    <p className="text-2xl font-mono font-black text-white">{totalUnits}</p>
                    <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                      <Package className="w-3 h-3" /> on hand across SKUs
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">SKUs requiring restock</p>
                    <p className={`text-2xl font-mono font-black ${restockCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>{restockCount}</p>
                    <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                      <AlertTriangle className="w-3 h-3" /> at or below reorder trigger
                    </div>
                  </div>
                </div>
                <div className="mt-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-sky-400" /> Top velocity items
                  </h3>
                  <div className="space-y-2">
                    {topVelocities.length === 0 ? (
                      <p className="text-xs text-slate-500">No velocity data.</p>
                    ) : (
                      topVelocities.map((v) => (
                        <div key={v.sku} className="flex items-center gap-3 text-xs">
                          <span className="w-10 font-mono text-slate-500">{v.sku}</span>
                          <span className="min-w-0 flex-1 truncate text-slate-700">{v.item_name}</span>
                          <div className="w-24 h-2 shrink-0 rounded-full border border-slate-300 bg-slate-300">
                            <div className="h-full rounded-full bg-lime-400" style={{ width: `${Math.min(100, (v.volume / maxVol) * 100)}%` }} />
                          </div>
                          <span className="w-10 text-right font-mono text-slate-600">{v.volume}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </section>
            </div>

            {/* Full-width modules below. */}
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-1">
              {/* ── MODULE 3: Live Real-Time Inventory Balance Engine ── */}
              <section className={`${card} lg:col-span-3`} aria-label="Live inventory balance engine">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <h2 className="font-bold text-white flex items-center gap-2">
                      <Activity className="w-4 h-4 text-lime-400" /> Live Real-Time Balance Engine
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">On-hand = opening + inflow − outflow; value at product cost.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className={`${fieldLabel} mb-0 shrink-0`}>Status</label>
                    <div className="relative shrink-0">
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as 'all' | 'healthy' | 'restock')}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-lime-400 focus-visible:outline-none"
                      >
                        <option value="all">All SKUs</option>
                        <option value="healthy">Healthy</option>
                        <option value="restock">Restock required</option>
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                    </div>
                    <button
                      onClick={() => setLive((v) => !v)}
                      className="ml-2 inline-flex items-center gap-1.5 rounded-lg border transition-colors focus-visible:ring-2 focus-visible:ring-lime-400 focus-visible:outline-none px-2.5 py-1.5 text-xs font-bold text-slate-700 disabled:opacity-50"
                      aria-pressed={live}
                    >
                      {live ? 'Pause polling' : 'Resume polling'}
                    </button>
                    <span className={`ml-3 text-xs font-mono ${live ? 'text-lime-400' : 'text-slate-500'}`}>
                      {live ? 'Live · 15s' : 'Paused'}
                    </span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-300 text-[10px] uppercase tracking-wider text-slate-500">
                        <th className="px-4 py-3 text-left">SKU</th>
                        <th className="px-4 py-3 text-left">Item</th>
                        <th className="px-4 py-3 text-left">Category</th>
                        <th className="px-4 py-3 text-left">UoM</th>
                        <th className="px-4 py-3 text-right">Opening</th>
                        <th className="px-4 py-3 text-right">Inflow</th>
                        <th className="px-4 py-3 text-right">Outflow</th>
                        <th className="px-4 py-3 text-right">On hand</th>
                        <th className="px-4 py-3 text-right">Stock value</th>
                        <th className="px-4 py-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredBalance.length === 0 ? (
                        <tr>
                          <td className="px-4 py-6 text-center text-slate-500" colSpan={10}>
                            No balance data.
                          </td>
                        </tr>
                      ) : (
                        filteredBalance.map((r) => (
                          <tr key={r.sku} className="text-slate-700">
                            <td className="px-4 py-3 font-mono text-slate-600">{r.sku}</td>
                            <td className="px-4 py-3">{r.item_name}</td>
                            <td className="px-4 py-3 text-slate-600">{r.category}</td>
                            <td className="px-4 py-3 text-slate-600">{r.uom}</td>
                            <td className="px-4 py-3 text-right font-mono text-slate-600">{r.opening}</td>
                            <td className="px-4 py-3 text-right font-mono text-slate-600">{r.inflow}</td>
                            <td className="px-4 py-3 text-right font-mono text-slate-600">{r.outflow}</td>
                            <td className="px-4 py-3 text-right font-mono text-slate-700">{r.on_hand}</td>
                            <td className="px-4 py-3 text-right font-mono text-slate-600">{rupees(r.stock_value_cents)}</td>
                            <td className="px-4 py-3 text-right">
                              <span className={`${pill(r.status === 'RESTOCK REQUIRED')} flex items-center gap-1`}>
                                {r.status === 'RESTOCK REQUIRED' && <AlertTriangle className="w-3 h-3" />}
                                {r.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* ── MODULE 4: Automated Restock Procurement ── */}
              <section className={`${card} lg:col-span-3`} aria-label="Automated restock procurement">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h2 className="font-bold text-white flex items-center gap-2">
                    <Truck className="w-4 h-4 text-amber-400" /> Automated Restock Procurement
                  </h2>
                  <p className="text-xs text-slate-500">SKUs at or below reorder trigger.</p>
                </div>
                {restockItems.length === 0 ? (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">
                    <PackageCheck className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                    <p className="text-xs font-bold text-slate-600">No restock required — all SKUs healthy.</p>
                  </div>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-300 text-[10px] uppercase tracking-wider text-slate-500">
                          <th className="px-4 py-3 text-left">SKU</th>
                          <th className="px-4 py-3 text-left">Item</th>
                          <th className="px-4 py-3 text-left">Supplier</th>
                          <th className="px-4 py-3 text-right">On hand</th>
                          <th className="px-4 py-3 text-right">Trigger</th>
                          <th className="px-4 py-3 text-right">Target max</th>
                          <th className="px-4 py-3 text-right">Recommended qty</th>
                          <th className="px-4 py-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {restockItems.map((item) => (
                          <tr key={item.sku} className="text-slate-700">
                            <td className="px-4 py-3 font-mono text-slate-600">{item.sku}</td>
                            <td className="px-4 py-3">{item.item_name}</td>
                            <td className="px-4 py-3 text-slate-600">{item.supplier}</td>
                            <td className="px-4 py-3 text-right font-mono text-slate-600">{item.on_hand}</td>
                            <td className="px-4 py-3 text-right font-mono text-slate-600">{item.trigger_level}</td>
                            <td className="px-4 py-3 text-right font-mono text-slate-600">{item.target_max}</td>
                            <td className="px-4 py-3 text-right font-mono text-lime-400">{item.recommended_qty}</td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => createPo(item)}
                                className="rounded-lg border border-lime-400/40 bg-lime-400/10 px-2.5 py-1.5 text-xs font-bold text-lime-400 transition-colors hover:bg-lime-400/20 focus-visible:ring-2 focus-visible:ring-lime-400 focus-visible:outline-none"
                              >
                                <PackageCheck className="w-3.5 h-3.5" /> Create PO
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* ── AI Assistant ── */}
              <section className={`${card} lg:col-span-3`} aria-label="AI Assistant">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h2 className="font-bold text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-sky-400" /> AI Assistant
                  </h2>
                </div>
                <p className="text-xs text-slate-500 mb-3">Governed LLAMA layer: restock advice, anomaly detection, natural-language lookup.</p>
                <div className="space-y-2">
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={getRestockAdvisory}
                      disabled={aiLoading || aiMode === 'advisory'}
                      className={`rounded-lg border border-lime-400/40 bg-lime-400/10 px-3 py-2 text-xs font-bold text-lime-400 transition-colors hover:bg-lime-400/20 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-lime-400 focus-visible:outline-none`}
                    >
                      Get restock advisory
                    </button>
                    <button
                      onClick={detectAnomalies}
                      disabled={aiLoading || aiMode === 'anomaly'}
                      className={`rounded-lg border border-sky-400/40 bg-sky-400/10 px-3 py-2 text-xs font-bold text-sky-400 transition-colors hover:bg-sky-400/20 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none`}
                    >
                      Detect anomalies
                    </button>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <input
                      value={nlq}
                      onChange={(e) => setNlq(e.target.value)}
                      placeholder="Ask about stock… e.g. which SKUs fell below trigger?"
                      className={input}
                    />
                    <button
                      onClick={askNlq}
                      disabled={aiLoading || !nlq.trim()}
                      className={`rounded-lg border border-sky-400/40 bg-sky-400/10 px-3 py-2 text-xs font-bold text-sky-400 transition-colors hover:bg-sky-400/20 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none`}
                    >
                      Ask
                    </button>
                  </div>
                  {aiLoading && <p className="text-xs text-lime-400">Working…</p>}
                  {aiResult !== null && (
                    <div className="mt-3 rounded-lg border border-slate-300 bg-slate-50 p-3">
                      {aiMode === 'advisory' && renderAdvisory(aiResult)}
                      {aiMode === 'anomaly' && renderAnomalies(aiResult)}
                      {aiMode === 'query' && renderQueryAnswer(aiResult)}
                    </div>
                  )}
                </div>
                <p className="mt-3 text-[10px] text-slate-500">Powered by governed LLAMA layer — operator access only.</p>
              </section>
            </div>
          </div>
        )}
      </main>
    </DashboardShell>
  );
}
