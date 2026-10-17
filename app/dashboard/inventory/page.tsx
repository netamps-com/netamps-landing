'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Minus,
  Package,
  PackageCheck,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Tag,
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

type ProductDraft = {
  sku: string; item_name: string; category: string; uom: string;
  cost: string; selling: string; supplier: string; trigger: string; targetMax: string;
  hsn_code: string; hsn_description: string;
};

function blankProduct(): ProductDraft {
  return {
    sku: '', item_name: '', category: '', uom: 'Nos',
    cost: '', selling: '', supplier: '', trigger: '', targetMax: '',
    hsn_code: '', hsn_description: '',
  };
}

type HsnRow = {
  code: string; chapter: string; description: string; unit: string | null;
  cgst_rate: number; sgst_rate: number; igst_rate: number; source: string | null;
};

const MAX_SKU = 64;
const MAX_NAME = 140;
const MAX_CATEGORY = 80;
const MAX_SUPPLIER = 140;

const UOM_OPTIONS = ['Nos', 'Set', 'Box', 'Pair', 'Kg', 'Gram', 'Litre', 'Metre', 'Feet', 'Sq.ft', 'Box(s)', 'Dozen', 'Pair(s)', 'Roll', 'Sheet'];

/**
 * Validate every product field before a save is attempted. Returns a map of
 * field -> message; an empty map means the draft is safe to send.
 */
function validateProduct(
  d: ProductDraft,
  opts: { editingSku?: string | null; existing?: Product[] },
): Record<string, string> {
  const e: Record<string, string> = {};
  const sku = d.sku.trim();
  if (!sku) e.sku = 'SKU is required.';
  else if (sku.length > MAX_SKU) e.sku = `SKU must be ${MAX_SKU} characters or fewer.`;
  else if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(sku)) e.sku = 'Use letters, digits, dot, dash, slash or underscore only.';
  else if (d.hsn_code && sku.length < 2) e.sku = 'SKU must be at least 2 characters.';
  else {
    const clash = (opts.existing ?? []).some((p) => p.sku.toLowerCase() === sku.toLowerCase() && p.sku !== opts.editingSku);
    if (clash) e.sku = 'That SKU already exists.';
  }

  const name = d.item_name.trim();
  if (!name) e.item_name = 'Item name is required.';
  else if (name.length > MAX_NAME) e.item_name = `Item name must be ${MAX_NAME} characters or fewer.`;

  if (d.category.length > MAX_CATEGORY) e.category = `Category must be ${MAX_CATEGORY} characters or fewer.`;
  if (!d.uom.trim()) e.uom = 'UoM is required.';
  if (d.supplier.length > MAX_SUPPLIER) e.supplier = `Supplier must be ${MAX_SUPPLIER} characters or fewer.`;

  const cost = num(d.cost);
  const selling = num(d.selling);
  if (d.cost.trim() !== '' && (!Number.isFinite(Number(d.cost)) || cost < 0)) e.cost = 'Cost must be 0 or more.';
  else if (d.cost.trim() !== '' && Math.round(cost * 100) !== Number((Number(d.cost) * 100).toFixed(0))) e.cost = 'Cost supports at most 2 decimals.';
  if (d.selling.trim() !== '' && (!Number.isFinite(Number(d.selling)) || selling < 0)) e.selling = 'Selling price must be 0 or more.';
  else if (cost > 0 && selling > 0 && selling < cost) e.selling = 'Selling price cannot be below cost price.';

  const trigger = num(d.trigger);
  const target = num(d.targetMax);
  if (d.trigger.trim() !== '' && (!Number.isInteger(trigger) || trigger < 0)) e.trigger = 'Reorder trigger must be a whole number, 0 or more.';
  if (d.targetMax.trim() !== '' && (!Number.isInteger(target) || target < 0)) e.targetMax = 'Target max must be a whole number, 0 or more.';
  else if (target > 0 && target < trigger) e.targetMax = 'Target max must be at least the reorder trigger.';

  const hsn = d.hsn_code.trim();
  if (hsn && !/^[0-9]{2,8}$/.test(hsn)) e.hsn_code = 'HSN code must be 2-8 digits.';
  return e;
}

/** Validate a stock movement draft. Returns field -> message. */
function validateTxn(d: { txn_id: string; sku: string; qty: string; unit_rate_cents: string }, products: Product[], onHandBySku: Record<string, number>, type: 'IN' | 'OUT'): Record<string, string> {
  const e: Record<string, string> = {};
  const txn = d.txn_id.trim();
  if (!txn) e.txn_id = 'Transaction ID is required.';
  else if (txn.length > 64) e.txn_id = 'Transaction ID must be 64 characters or fewer.';
  else if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(txn)) e.txn_id = 'Use letters, digits, dot, dash, slash or underscore only.';

  const sku = d.sku.trim().toUpperCase();
  if (!sku) e.sku = 'SKU is required.';
  else if (!products.some((p) => p.sku.toUpperCase() === sku)) e.sku = `Unknown SKU ${sku}.`;

  const qty = num(d.qty);
  if (!d.qty.trim()) e.qty = 'Quantity is required.';
  else if (!Number.isInteger(qty) || qty <= 0) e.qty = 'Quantity must be a whole number above zero.';

  if (d.unit_rate_cents.trim() !== '') {
    const rate = num(d.unit_rate_cents);
    if (!Number.isFinite(Number(d.unit_rate_cents)) || rate < 0) e.unit_rate_cents = 'Unit rate must be 0 or more.';
  }

  if (type === 'OUT' && sku && Number.isInteger(qty) && qty > 0) {
    const onHand = onHandBySku[sku] ?? 0;
    if (qty > onHand) e.qty = `Only ${onHand} on hand — cannot issue ${qty}.`;
  }
  return e;
}

function txnId(prefix: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${prefix}${pad(d.getFullYear())}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;
}

type Product = {
  sku: string; item_name: string; category: string; uom: string;
  cost: number; selling: number; supplier: string; trigger: number; target_max: number;
  hsn_code: string; hsn_description: string;
};
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

  // Per-field validation messages. Kept separate from the global `error` banner
  // so an invalid box is marked at the box, not only described in prose.
  const [prodErrors, setProdErrors] = useState<Record<string, string>>({});
  const [txnInErrors, setTxnInErrors] = useState<Record<string, string>>({});
  const [txnOutErrors, setTxnOutErrors] = useState<Record<string, string>>({});

  // GST HSN master: search box, results and AI classification.
  const [hsnQuery, setHsnQuery] = useState('');
  const [hsnResults, setHsnResults] = useState<HsnRow[]>([]);
  const [hsnOpen, setHsnOpen] = useState(false);
  const [hsnLoading, setHsnLoading] = useState(false);
  const [hsnSource, setHsnSource] = useState('');
  const [hsnBusy, setHsnBusy] = useState(false);
  const hsnBoxRef = useRef<HTMLDivElement | null>(null);

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
        // The API returns the schema column names (id, cost_price_cents,
        // reorder_trigger_level, ...). Older fixtures used the short UI names,
        // so accept both rather than rendering blank rows.
        const pick = (...keys: string[]) => {
          for (const k of keys) if (x[k] !== undefined && x[k] !== null) return x[k];
          return undefined;
        };
        const costRaw = num(pick('cost_price_cents', 'cost', 'cost_cents'));
        const sellRaw = num(pick('selling_price_cents', 'selling', 'selling_cents'));
        return {
          sku: String(pick('id', 'sku') ?? ''),
          item_name: String(pick('item_name', 'name') ?? ''),
          category: String(pick('category') ?? ''),
          uom: String(pick('uom') ?? 'Nos'),
          cost: costRaw,
          selling: sellRaw,
          supplier: String(pick('supplier_name', 'supplier') ?? ''),
          trigger: num(pick('reorder_trigger_level', 'trigger')),
          target_max: num(pick('target_max_inventory', 'target_max')),
          hsn_code: String(pick('hsn_code') ?? ''),
          hsn_description: String(pick('hsn_description') ?? ''),
        };
      }).filter((p) => p.sku !== '');
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
    const errs = validateProduct(prodDraft, { editingSku, existing: products });
    setProdErrors(errs);
    const bad = Object.keys(errs);
    if (bad.length > 0) {
      setError(`${bad.length} field${bad.length === 1 ? '' : 's'} need attention — see the highlighted boxes.`);
      return;
    }
    const sku = prodDraft.sku.trim();
    const itemName = prodDraft.item_name.trim();
    const cost = Math.round(num(prodDraft.cost) * 100);
    const selling = Math.round(num(prodDraft.selling) * 100);
    setError('');
    setNotice('');
    setSavingProd(true);
    try {
      // Flat payload: this is the API contract (sku, item_name, cost_price_cents,
      // ...). The nested `product` object the old client sent read as an empty
      // sku and 400'd with "sku must be 1-64 characters".
      const res = await fetch(`${API}/api/inventory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'save-product',
          sku,
          item_name: itemName,
          category: prodDraft.category.trim(),
          uom: prodDraft.uom.trim() || 'Nos',
          cost_price_cents: cost,
          selling_price_cents: selling,
          supplier_name: prodDraft.supplier.trim(),
          reorder_trigger_level: num(prodDraft.trigger),
          target_max_inventory: num(prodDraft.targetMax),
          hsn_code: prodDraft.hsn_code.trim(),
          hsn_description: prodDraft.hsn_description.trim(),
        }),
      });
      if (res.status === 401) { setUnauthorized(true); return; }
      let data: any = null;
      try { data = await res.json(); } catch { throw new Error('bad response'); }
      if (!data?.success) {
        const msg = data?.message || 'Could not save product.';
        setError(msg);
        if (data?.field) setProdErrors((e) => ({ ...e, [data.field]: msg }));
        return;
      }
      setEditingSku(null);
      setProdDraft(blankProduct());
      setProdErrors({});
      setNotice(`Product ${sku} saved.`);
      await load();
    } catch {
      setError('Could not save product — check your connection and retry.');
    } finally {
      setSavingProd(false);
    }
  }, [prodDraft, editingSku, products, load]);

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

  const onHandBySku = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of balance) m[r.sku] = r.on_hand;
    return m;
  }, [balance]);

  const submitTxn = useCallback(async (type: 'IN' | 'OUT') => {
    const draft = type === 'IN' ? txnIn : txnOut;
    const errs = validateTxn(draft, products, onHandBySku, type);
    if (type === 'IN') setTxnInErrors(errs); else setTxnOutErrors(errs);
    const bad = Object.keys(errs);
    if (bad.length > 0) {
      setError(`${bad.length} field${bad.length === 1 ? '' : 's'} need attention before this ${type === 'IN' ? 'receipt' : 'issue'}.`);
      return;
    }
    const txnIdValue = draft.txn_id.trim() || txnId(type === 'IN' ? 'IN-' : 'OUT-');
    const sku = draft.sku.trim().toUpperCase();
    const qty = num(draft.qty);
    const rate = Math.round(num(draft.unit_rate_cents) * 100);
    setError('');
    setNotice('');
    setSubmittingTxn(type === 'IN' ? 'in' : 'out');
    try {
      const res = await fetch(`${API}/api/inventory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: type === 'IN' ? 'stock-in' : 'stock-out', txn_id: txnIdValue, sku, qty: Math.round(qty), unit_rate_cents: rate, ref_notes: draft.ref_notes.trim() }),
      });
      if (res.status === 401) { setUnauthorized(true); return; }
      let data: any = null;
      try { data = await res.json(); } catch { throw new Error('bad response'); }
      if (!data?.success) {
        const msg = (data?.message && typeof data.message === 'string') ? data.message : 'Transaction rejected.';
        setError(msg);
        if (data?.field) {
          const key = data.field === 'qty' ? 'qty' : data.field;
          if (type === 'IN') setTxnInErrors((e) => ({ ...e, [key]: msg }));
          else setTxnOutErrors((e) => ({ ...e, [key]: msg }));
        }
        return;
      }
      const entry: Txn = { txn_id: txnIdValue, sku, type, qty: Math.round(qty), unit_rate_cents: rate, ref_notes: draft.ref_notes.trim(), createdAt: new Date().toISOString() };
      setTxns((prev) => [entry, ...prev].slice(0, 10));
      if (type === 'IN') setTxnIn({ txn_id: txnId('IN-'), sku: '', qty: '', unit_rate_cents: '', ref_notes: '' });
      else setTxnOut({ txn_id: txnId('OUT-'), sku: '', qty: '', unit_rate_cents: '', ref_notes: '' });
      setTxnInErrors({});
      setTxnOutErrors({});
      setNotice(`${type === 'IN' ? 'Received' : 'Issued'} ${qty} × ${sku}.`);
      await load();
    } catch {
      setError('Transaction failed — check your connection and retry.');
    } finally {
      setSubmittingTxn(null);
    }
  }, [txnIn, txnOut, products, onHandBySku, load]);

  /** Search the GST HSN master. Debounced so typing does not spam the API. */
  useEffect(() => {
    if (!hsnOpen) return;
    const term = hsnQuery.trim();
    const t = setTimeout(async () => {
      setHsnLoading(true);
      try {
        const res = await fetch(`${API}/api/hsn?q=${encodeURIComponent(term)}&limit=25`, { cache: 'no-store', credentials: 'include' });
        if (res.status === 401) { setUnauthorized(true); return; }
        const data = await parseJson(res);
        if (data?.success) {
          setHsnResults(Array.isArray(data.results) ? (data.results as HsnRow[]) : []);
          setHsnSource(typeof data.source === 'string' ? data.source : '');
        }
      } catch {
        setHsnResults([]);
      } finally {
        setHsnLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [hsnQuery, hsnOpen]);

  /** Ask the model to classify the item description into an HSN code. */
  const suggestHsn = useCallback(async () => {
    const description = prodDraft.item_name.trim() || prodDraft.category.trim();
    if (!description) { setError('Type the item name first so the model has something to classify.'); return; }
    setHsnBusy(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/hsn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'suggest', description }),
      });
      if (res.status === 401) { setUnauthorized(true); return; }
      const data = await parseJson(res);
      if (!data?.success) { setError(data?.message || 'HSN suggestion failed.'); return; }
      const row = data.result as HsnRow | null;
      if (row && typeof row.code === 'string') {
        setProdDraft((d) => ({ ...d, hsn_code: row.code, hsn_description: row.description || '' }));
        setNotice(`HSN ${row.code} ${row.source === 'model' ? 'suggested by AI' : 'matched locally'} · IGST ${row.igst_rate}%`);
      } else {
        setNotice('No confident HSN match — refine the description and try again.');
      }
    } catch {
      setError('HSN suggestion failed — check your connection and retry.');
    } finally {
      setHsnBusy(false);
    }
  }, [prodDraft.item_name, prodDraft.category]);

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
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${high ? 'border-rose-500/30 bg-rose-500/10 text-rose-600' : 'border-amber-500/30 bg-amber-500/10 text-amber-600'}`}>
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
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold border border-rose-500/30 bg-rose-500/10 text-rose-600">
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
  // Narrow, clearly-bounded inputs. Each field is a labelled box with a visible
  // border and a short placeholder so it reads as an input, not a button.
  const input = 'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 placeholder:font-normal outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
  const inputBad = 'border-rose-400 bg-rose-50/40 focus:border-rose-500 focus:ring-rose-100';
  const fieldLabel = 'mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500';
  const fieldError = 'mt-0.5 flex items-center gap-0.5 text-[10px] font-semibold text-rose-600';
  const fieldOk = 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-100';
  const btnLime = 'inline-flex items-center justify-center gap-1.5 rounded-md border border-indigo-600 bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none';
  const btnSky = 'inline-flex items-center justify-center gap-1.5 rounded-md border border-sky-600 bg-sky-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none';
  const btnGhost = 'inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none';
  const btnAi = 'inline-flex items-center justify-center gap-1.5 rounded-md border border-violet-300 bg-violet-50 px-2.5 py-1.5 text-xs font-bold text-violet-700 transition-colors hover:bg-violet-100 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:outline-none';
  const panelTitle = 'flex items-center gap-2 text-sm font-bold text-slate-900';
  const pill = (restock: boolean) => `inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-bold ${restock ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-emerald-300 bg-emerald-50 text-emerald-700'}`;

  /** Compose the input class for a field that may be in an error or ok state. */
  const fld = (errs: Record<string, string>, key: string, touched?: boolean) =>
    `${input} ${errs[key] ? inputBad : touched ? fieldOk : ''}`;

  const Fld = ({
    label, children, error,
  }: { label: string; children: React.ReactNode; error?: string }) => (
    <div>
      <span className={fieldLabel}>{label}</span>
      {children}
      {error ? <p className={fieldError}><AlertTriangle className="w-3 h-3" />{error}</p> : null}
    </div>
  );

  if (unauthorized) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-700 font-semibold">Your session has ended.</p>
          <Link href="/login" className="mt-3 inline-block rounded-lg bg-slate-900 px-4 py-2 font-bold text-white hover:bg-slate-700">
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
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Package className="w-4 h-4 text-lime-600" /> Product Master Registry
                  </h2>
                  <button
                    onClick={() => { setEditingSku(null); setProdDraft(blankProduct()); setProdErrors({}); setHsnQuery(''); setHsnOpen(false); setError(''); setNotice(''); }}
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
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                  <p className="mb-2 text-[11px] font-semibold text-slate-500">
                    {editingSku !== null ? (
                      <>Editing <span className="font-mono font-bold text-slate-900">{editingSku}</span></>
                    ) : (
                      'New product'
                    )}
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    <Fld label="SKU" error={prodErrors.sku}>
                      <input
                        value={prodDraft.sku}
                        onChange={(e) => setProdDraft((d) => ({ ...d, sku: e.target.value.toUpperCase() }))}
                        placeholder="SKU-1001"
                        autoComplete="off"
                        spellCheck={false}
                        className={`${fld(prodErrors, 'sku')} font-mono`}
                      />
                    </Fld>
                    <div className="col-span-2 sm:col-span-2 lg:col-span-2">
                      <Fld label="Item name" error={prodErrors.item_name}>
                        <input
                          value={prodDraft.item_name}
                          onChange={(e) => setProdDraft((d) => ({ ...d, item_name: e.target.value }))}
                          placeholder="Toner cartridge"
                          className={fld(prodErrors, 'item_name')}
                        />
                      </Fld>
                    </div>
                    <Fld label="Category" error={prodErrors.category}>
                      <input
                        value={prodDraft.category}
                        onChange={(e) => setProdDraft((d) => ({ ...d, category: e.target.value }))}
                        placeholder="Consumable"
                        className={fld(prodErrors, 'category')}
                      />
                    </Fld>
                    <Fld label="UoM" error={prodErrors.uom}>
                      <select
                        value={prodDraft.uom}
                        onChange={(e) => setProdDraft((d) => ({ ...d, uom: e.target.value }))}
                        className={fld(prodErrors, 'uom')}
                      >
                        {UOM_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </Fld>
                    <Fld label="Cost ₹" error={prodErrors.cost}>
                      <input
                        inputMode="decimal"
                        value={prodDraft.cost}
                        onChange={(e) => setProdDraft((d) => ({ ...d, cost: e.target.value }))}
                        placeholder="0.00"
                        className={`${fld(prodErrors, 'cost')} font-mono`}
                      />
                    </Fld>
                    <Fld label="Selling ₹" error={prodErrors.selling}>
                      <input
                        inputMode="decimal"
                        value={prodDraft.selling}
                        onChange={(e) => setProdDraft((d) => ({ ...d, selling: e.target.value }))}
                        placeholder="0.00"
                        className={`${fld(prodErrors, 'selling')} font-mono`}
                      />
                    </Fld>
                    <Fld label="Supplier" error={prodErrors.supplier}>
                      <input
                        value={prodDraft.supplier}
                        onChange={(e) => setProdDraft((d) => ({ ...d, supplier: e.target.value }))}
                        placeholder="Vendor Ltd"
                        className={fld(prodErrors, 'supplier')}
                      />
                    </Fld>
                    <Fld label="Reorder at" error={prodErrors.trigger}>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        value={prodDraft.trigger}
                        onChange={(e) => setProdDraft((d) => ({ ...d, trigger: e.target.value }))}
                        placeholder="0"
                        className={`${fld(prodErrors, 'trigger')} font-mono`}
                      />
                    </Fld>
                    <Fld label="Target max" error={prodErrors.targetMax}>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        value={prodDraft.targetMax}
                        onChange={(e) => setProdDraft((d) => ({ ...d, targetMax: e.target.value }))}
                        placeholder="0"
                        className={`${fld(prodErrors, 'targetMax')} font-mono`}
                      />
                    </Fld>
                    <div className="col-span-2 sm:col-span-2 lg:col-span-2">
                      <Fld label="GST HSN" error={prodErrors.hsn_code}>
                        <div className="flex gap-1.5">
                          <div className="relative min-w-0 flex-1" ref={hsnBoxRef}>
                            <input
                              value={prodDraft.hsn_code}
                              onChange={(e) => setProdDraft((d) => ({ ...d, hsn_code: e.target.value.replace(/[^0-9]/g, '').slice(0, 8) }))}
                              onFocus={() => setHsnOpen(true)}
                              placeholder="8471"
                              inputMode="numeric"
                              className={`${fld(prodErrors, 'hsn_code')} font-mono`}
                            />
                            {hsnOpen && hsnResults.length > 0 && (
                              <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-auto rounded-md border border-slate-300 bg-white py-1 shadow-lg" role="listbox">
                                {hsnResults.map((r) => (
                                  <li key={r.code} role="option" aria-selected={r.code === prodDraft.hsn_code}>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setProdDraft((d) => ({ ...d, hsn_code: r.code, hsn_description: r.description }));
                                        setHsnOpen(false);
                                        setHsnQuery('');
                                      }}
                                      className="flex w-full items-baseline gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-indigo-50"
                                    >
                                      <span className="shrink-0 font-mono font-bold text-indigo-700">{r.code}</span>
                                      <span className="min-w-0 flex-1 truncate text-slate-600">{r.description}</span>
                                      <span className="shrink-0 font-mono text-[10px] text-slate-500">{r.igst_rate}%</span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <input
                            value={hsnQuery}
                            onChange={(e) => { setHsnQuery(e.target.value); setHsnOpen(true); }}
                            onFocus={() => setHsnOpen(true)}
                            placeholder="Search HSN…"
                            className={`${input} min-w-0 flex-1`}
                          />
                          <button type="button" onClick={suggestHsn} disabled={hsnBusy} className={`${btnAi} shrink-0`} title="Let AI classify this item into an HSN code">
                            <Sparkles className="w-3.5 h-3.5" />{hsnBusy ? '…' : 'AI'}
                          </button>
                        </div>
                      </Fld>
                      {prodDraft.hsn_description && (
                        <p className="mt-1 flex items-start gap-1 text-[10px] leading-snug text-slate-500">
                          <Tag className="mt-px w-3 h-3 shrink-0 text-indigo-500" />
                          <span className="min-w-0 flex-1">{prodDraft.hsn_description}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  {hsnSource && (
                    <p className="mt-1.5 text-[10px] text-slate-400">Source: {hsnSource}{hsnLoading ? ' · searching…' : ''}</p>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    <button onClick={saveProduct} disabled={savingProd} className={btnLime}>
                      {savingProd ? <Save className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                      {savingProd ? 'Saving…' : editingSku !== null ? 'Save product' : 'Add product'}
                    </button>
                    {editingSku !== null && (
                      <button
                        onClick={() => { setEditingSku(null); setProdDraft(blankProduct()); setProdErrors({}); setHsnQuery(''); setHsnOpen(false); setError(''); }}
                        className={btnGhost}
                      >
                        Cancel
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
                        <th className="px-4 py-3 text-left">HSN</th>
                        <th className="px-4 py-3 text-right">Trigger</th>
                        <th className="px-4 py-3 text-right">Target</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredProducts.length === 0 ? (
                        <tr>
                          <td className="px-4 py-6 text-center text-slate-500" colSpan={11}>
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
                            <td className="px-4 py-3">
                              {p.hsn_code ? (
                                <span title={p.hsn_description || undefined} className="inline-flex max-w-full items-center gap-1">
                                  <span className="shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-indigo-700">{p.hsn_code}</span>
                                  <span className="min-w-0 truncate text-[11px] text-slate-500">{p.hsn_description}</span>
                                </span>
                              ) : (
                                <button onClick={() => { setEditingSku(p.sku); setProdDraft({ sku: p.sku, item_name: p.item_name, category: p.category, uom: p.uom, cost: (p.cost / 100).toFixed(2), selling: (p.selling / 100).toFixed(2), supplier: p.supplier, trigger: String(p.trigger), targetMax: String(p.target_max), hsn_code: '', hsn_description: '' }); setProdErrors({}); }} className="text-[10px] font-bold text-indigo-600 underline decoration-dotted hover:text-indigo-800">
                                  add HSN
                                </button>
                              )}
                            </td>
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
                                    hsn_code: p.hsn_code || '', hsn_description: p.hsn_description || '',
                                  });
                                  setProdErrors({});
                                  setError('');
                                }}
                                title="Edit product"
                                className="p-1 text-slate-500 hover:text-sky-600 transition-colors focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => deleteProduct(p.sku)}
                                title="Delete product"
                                className="ml-1 p-1 text-slate-500 hover:text-rose-600 transition-colors focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:outline-none"
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
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Truck className="w-4 h-4 text-teal-600" /> Transaction Logging
                  </h2>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                    <h3 className="mb-3 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-indigo-700">
                      <Plus className="w-3 h-3" /> Receive
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      <Fld label="Txn ID" error={txnInErrors.txn_id}>
                        <input value={txnIn.txn_id} onChange={(e) => setTxnIn((d) => ({ ...d, txn_id: e.target.value }))} placeholder="IN-…" className={`${fld(txnInErrors, 'txn_id')} font-mono`} />
                      </Fld>
                      <Fld label="SKU" error={txnInErrors.sku}>
                        <input list="product-skus" value={txnIn.sku} onChange={(e) => setTxnIn((d) => ({ ...d, sku: e.target.value.toUpperCase() }))} placeholder="SKU-1001" className={`${fld(txnInErrors, 'sku')} font-mono`} />
                        <datalist id="product-skus">{products.map((p) => <option key={p.sku} value={p.sku} />)}</datalist>
                      </Fld>
                      <Fld label="Qty" error={txnInErrors.qty}>
                        <input type="number" min={1} step={1} inputMode="numeric" value={txnIn.qty} onChange={(e) => setTxnIn((d) => ({ ...d, qty: e.target.value }))} placeholder="0" className={`${fld(txnInErrors, 'qty')} font-mono`} />
                      </Fld>
                      <Fld label="Rate ₹" error={txnInErrors.unit_rate_cents}>
                        <input inputMode="decimal" value={txnIn.unit_rate_cents} onChange={(e) => setTxnIn((d) => ({ ...d, unit_rate_cents: e.target.value }))} placeholder="0.00" className={`${fld(txnInErrors, 'unit_rate_cents')} font-mono`} />
                      </Fld>
                      <div className="col-span-2">
                        <Fld label="Reference" error={txnInErrors.ref_notes}>
                          <input value={txnIn.ref_notes} onChange={(e) => setTxnIn((d) => ({ ...d, ref_notes: e.target.value }))} placeholder="PO / GRN ref" className={input} />
                        </Fld>
                      </div>
                    </div>
                    <button onClick={() => submitTxn('IN')} disabled={submittingTxn === 'in'} className={`mt-3 w-full ${btnLime}`}>
                      {submittingTxn === 'in' ? 'Recording…' : <><Plus className="w-3.5 h-3.5" /> Receive</>}
                    </button>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                    <h3 className="mb-3 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-sky-700">
                      <Minus className="w-3 h-3" /> Issue
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      <Fld label="Txn ID" error={txnOutErrors.txn_id}>
                        <input value={txnOut.txn_id} onChange={(e) => setTxnOut((d) => ({ ...d, txn_id: e.target.value }))} placeholder="OUT-…" className={`${fld(txnOutErrors, 'txn_id')} font-mono`} />
                      </Fld>
                      <Fld label="SKU" error={txnOutErrors.sku}>
                        <input list="product-skus" value={txnOut.sku} onChange={(e) => setTxnOut((d) => ({ ...d, sku: e.target.value.toUpperCase() }))} placeholder="SKU-1001" className={`${fld(txnOutErrors, 'sku')} font-mono`} />
                      </Fld>
                      <Fld label="Qty" error={txnOutErrors.qty}>
                        <input type="number" min={1} step={1} inputMode="numeric" value={txnOut.qty} onChange={(e) => setTxnOut((d) => ({ ...d, qty: e.target.value }))} placeholder="0" className={`${fld(txnOutErrors, 'qty')} font-mono`} />
                        {txnOut.sku && !txnOutErrors.qty && (
                          <p className="mt-0.5 text-[10px] text-slate-400">{onHandBySku[txnOut.sku.trim().toUpperCase()] ?? 0} on hand</p>
                        )}
                      </Fld>
                      <Fld label="Rate ₹" error={txnOutErrors.unit_rate_cents}>
                        <input inputMode="decimal" value={txnOut.unit_rate_cents} onChange={(e) => setTxnOut((d) => ({ ...d, unit_rate_cents: e.target.value }))} placeholder="0.00" className={`${fld(txnOutErrors, 'unit_rate_cents')} font-mono`} />
                      </Fld>
                      <div className="col-span-2">
                        <Fld label="Reference" error={txnOutErrors.ref_notes}>
                          <input value={txnOut.ref_notes} onChange={(e) => setTxnOut((d) => ({ ...d, ref_notes: e.target.value }))} placeholder="Customer / issue ref" className={input} />
                        </Fld>
                      </div>
                    </div>
                    <button onClick={() => submitTxn('OUT')} disabled={submittingTxn === 'out'} className={`mt-3 w-full ${btnSky}`}>
                      {submittingTxn === 'out' ? 'Recording…' : <><Minus className="w-3 h-3" /> Issue</>}
                    </button>
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
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${t.type === 'IN' ? 'border-lime-500/30 bg-lime-500/10 text-lime-600' : 'border-sky-500/30 bg-sky-500/10 text-sky-600'}`}>
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
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-sky-600" /> Executive Analytics
                  </h2>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total valuation</p>
                    <p className="text-2xl font-mono font-black text-slate-900">{rupees(totalValuationCents)}</p>
                    <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                      <DollarSign className="w-3 h-3" /> stock value at on-hand qty
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total units</p>
                    <p className="text-2xl font-mono font-black text-slate-900">{totalUnits}</p>
                    <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                      <Package className="w-3 h-3" /> on hand across SKUs
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">SKUs requiring restock</p>
                    <p className={`text-2xl font-mono font-black ${restockCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{restockCount}</p>
                    <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                      <AlertTriangle className="w-3 h-3" /> at or below reorder trigger
                    </div>
                  </div>
                </div>
                <div className="mt-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-sky-600" /> Top velocity items
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
                            <div className="h-full rounded-full bg-lime-500" style={{ width: `${Math.min(100, (v.volume / maxVol) * 100)}%` }} />
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
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-lime-600" /> Live Real-Time Balance Engine
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
                    <span className={`ml-3 text-xs font-mono ${live ? 'text-lime-600' : 'text-slate-500'}`}>
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
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Truck className="w-4 h-4 text-amber-600" /> Automated Restock Procurement
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
                            <td className="px-4 py-3 text-right font-mono text-lime-600">{item.recommended_qty}</td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => createPo(item)}
                                className="rounded-lg border border-lime-400/40 bg-lime-500/10 px-2.5 py-1.5 text-xs font-bold text-lime-600 transition-colors hover:bg-lime-500/20 focus-visible:ring-2 focus-visible:ring-lime-400 focus-visible:outline-none"
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
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-sky-600" /> AI Assistant
                  </h2>
                </div>
                <p className="text-xs text-slate-500 mb-3">Governed LLAMA layer: restock advice, anomaly detection, natural-language lookup.</p>
                <div className="space-y-2">
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={getRestockAdvisory}
                      disabled={aiLoading || aiMode === 'advisory'}
                      className={`rounded-lg border border-lime-400/40 bg-lime-500/10 px-3 py-2 text-xs font-bold text-lime-600 transition-colors hover:bg-lime-500/20 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-lime-400 focus-visible:outline-none`}
                    >
                      Get restock advisory
                    </button>
                    <button
                      onClick={detectAnomalies}
                      disabled={aiLoading || aiMode === 'anomaly'}
                      className={`rounded-lg border border-sky-400/40 bg-sky-400/10 px-3 py-2 text-xs font-bold text-sky-600 transition-colors hover:bg-sky-400/20 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none`}
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
                      className={`rounded-lg border border-sky-400/40 bg-sky-400/10 px-3 py-2 text-xs font-bold text-sky-600 transition-colors hover:bg-sky-400/20 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none`}
                    >
                      Ask
                    </button>
                  </div>
                  {aiLoading && <p className="text-xs text-lime-600">Working…</p>}
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
