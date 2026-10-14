'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogOut, Package, Search, Filter, ArchiveX, Key, X, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Tag, Video, Mail, Database, Server, Wifi, HardDrive, Cpu, Zap, ExternalLink, RefreshCw, Download, Handshake, Sparkles } from 'lucide-react';
import NetampsLogo from '../NetampsLogo';
import UserManagementModal from './UserManagementModal';
import LogViewerModal from './LogViewerModal';
import MatchCandidates from './MatchCandidates';
import EvidenceGallery from './EvidenceGallery';
import { useIdleTimeout, IdleTimeoutModal } from '../lib/idle-timeout';
import { formatPaise as paiseToDisplay, evalUnitPaise, sanitizeMoneyInput, moneyStringToPaise, lineFinalOf } from '../lib/money';

interface ProductItem {
  id: string;
  strategicTarget?: 'resale' | 'compliance';
  lifecycleAge?: string;
  category: string;
  details: string;
  quantity: number;
  price?: number;
  pricePaise?: number; // canonical evaluated unit price, integer paise (null/undefined = unstated)
  lineConsiderationPaise?: number | null; // visitor ask, line total paise (null = unstated)
  basePricePaise?: number | null; // lot-mode base unit price, integer paise (null = unstated)
  attachedFiles?: string[];
}

interface FinalPriceSnapshot {
  version: number;
  decidedAt: string;
  decidedBy: string;
  basis: 'evaluated' | 'consideration' | 'negotiated';
  totalPaise: number;
  lines: { productId: string; askPaise: number | null; evaluatedPaise: number | null; settledPaise: number | null }[];
  manifestHashAtApproval: string | null;
}

interface ReturnRequest {
  id: string;
  intent: 'sell' | 'buy';
  name: string;
  company: string;
  email: string;
  phone: string;
  products: ProductItem[];
  attachedFiles?: string[];
  emailDeliveryStatus?: 'pending' | 'sent' | 'failed';
  date: string;
  status: string;
  pricingBasis?: 'per_product' | 'lot';
  lotConsiderationPaise?: number | null;
  manifest?: { requestId: string; hash: string; generatedAt: string; version?: number } | null;
  finalPrice?: FinalPriceSnapshot | null;
  priceHistory?: { productId: string; oldPaise: number | null; newPaise: number | null; actor: string; at: string }[];
}

// ── Totals math (paise integers; null = unstated, never 0) ──
// Line consideration already includes all units: NEVER × qty.
// Evaluated price is per-unit: ALWAYS × qty. Two named functions, no inline math.
function lineAskOf(req: ReturnRequest, p: ProductItem): number | null {
  if (req.pricingBasis === 'lot') return null; // lot figure lives in the banner, never per-line
  return p.lineConsiderationPaise ?? null;
}

function askTotalOf(req: ReturnRequest): { total: number | null; partial: boolean } {
  if (req.pricingBasis === 'lot') return { total: req.lotConsiderationPaise ?? null, partial: false };
  const lines = req.products || [];
  const stated = lines.filter(p => p.lineConsiderationPaise !== null && p.lineConsiderationPaise !== undefined);
  if (stated.length === 0) return { total: null, partial: false };
  return {
    total: stated.reduce((a, p) => a + (p.lineConsiderationPaise as number), 0),
    partial: stated.length < lines.length
  };
}

function evalTotalOf(req: ReturnRequest): { total: number | null; partial: boolean } {
  const lines = (req.products || []).map(p => {
    const unit = evalUnitPaise(p);
    return unit === null ? null : unit * (Number(p.quantity) || 1);
  });
  if (lines.every(v => v === null)) return { total: null, partial: false };
  return {
    total: lines.reduce<number>((a, v) => a + (v ?? 0), 0),
    partial: lines.some(v => v === null)
  };
}


export default function DashboardPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  
  // Modals
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  // Mandatory idle watchdog: uniform 30-min termination for every role.
  // No props — the mandate cannot be disabled or retimed per caller.
  const idle = useIdleTimeout();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Approval snapshot draft (per-request). Approving writes a FinalPriceSnapshot
  // atomically with the status flip; post-approval price edits are locked.
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approveBasis, setApproveBasis] = useState<'evaluated' | 'consideration' | 'negotiated'>('evaluated');
  const [approveNegotiated, setApproveNegotiated] = useState('');
  const [approveError, setApproveError] = useState<string | null>(null);

  // Key-reconciliation reports, keyed by request id (admin-only UI below).
  const [reconcileResult, setReconcileResult] = useState<Record<string, any>>({});
  const [reconciling, setReconciling] = useState<string | null>(null);

  // Best-match (BUY → SELL suggestions) kill switch — admin-visible state.
  const [candidatesEnabled, setCandidatesEnabled] = useState<boolean | null>(null);
  const [candidatesFlagBusy, setCandidatesFlagBusy] = useState(false);

  // Draft text for each evaluated-price field. Keystrokes never reach the
  // server: a price is committed deliberately (blur / Enter), so price_history
  // stays a chain of custody for real decisions instead of an edit log.
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});

  const loadCandidatesFlag = useCallback(async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${API_URL}/api/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'candidates-flag' })
      });
      const data = await res.json();
      if (data?.success) setCandidatesEnabled(!!data.candidatesEnabled);
    } catch {}
  }, []);

  const setCandidatesFlag = async (next: boolean) => {
    if (candidatesFlagBusy) return;
    if (next && !window.confirm(
      'Enable best-match suggestions?\n\nAdvisory only — the model suggests, staff decide. New BUY orders get a gated, cached candidate set; existing orders need a Regenerate.'
    )) return;
    setCandidatesFlagBusy(true);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${API_URL}/api/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'candidates-flag', enabled: next })
      });
      const data = await res.json();
      if (data?.success) setCandidatesEnabled(!!data.candidatesEnabled);
    } catch {} finally {
      setCandidatesFlagBusy(false);
    }
  };

  useEffect(() => {
    const isAdmin = userRole === 'admin@netamps.com' || userRole === 'admin';
    if (isAuthenticated && isAdmin) loadCandidatesFlag();
  }, [isAuthenticated, userRole, loadCandidatesFlag]);

  const runReconcile = async (req: ReturnRequest, prune: boolean) => {
    if (prune && !window.confirm(
      'Remove all dead attachment references from this request? ' +
      'Stored files are never touched; only unresolvable references are pruned. ' +
      'This is recorded in the audit log.'
    )) return;
    setReconciling(req.id + (prune ? ':prune' : ':report'));
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${API_URL}/api/secure-reconcile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: req.id, prune })
      });
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        // Pages rewrites 404/5xx into a text/HTML page — never surface a raw
        // "JSON.parse: unexpected end of data" to the operator.
        throw new Error(
          res.status === 404
            ? 'Key-reconciliation service is not deployed on this build.'
            : `Key-reconciliation service returned HTTP ${res.status}. Retry shortly.`
        );
      }
      if (!res.ok || !data?.success || !data.reports || data.reports.length === 0) {
        throw new Error(data?.message || `Reconciliation failed (HTTP ${res.status}).`);
      }
      setReconcileResult(prev => ({ ...prev, [req.id]: data.reports[0] }));
      if (prune) fetchReturns(false);
      try {
        const { logEvent } = await import('../lib/logger');
        logEvent(prune ? 'EVIDENCE_PRUNED' : 'EVIDENCE_RECONCILED', 'Dashboard Page',
          `${prune ? 'Pruned dead references in' : 'Reconciled keys for'} request ${req.id}`, userRole);
      } catch {}
    } catch (e: any) {
      setReconcileResult(prev => ({ ...prev, [req.id]: { error: e.message || 'Reconciliation failed.' } }));
    } finally {
      setReconciling(null);
    }
  };

  const fetchReturns = useCallback(async (silent = true) => {
    if (!silent) setIsRefreshing(true);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${API_URL}/api/returns`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success && data.returns) {
        setReturns(data.returns);
        localStorage.setItem('netamps_returns', JSON.stringify(data.returns));
      }
    } catch (e) {
      // Keep existing data to avoid UI errors/flicker
    } finally {
      if (!silent) setIsRefreshing(false);
    }
  }, []);
  
  useEffect(() => {
    // Check industry-standard session ID cookie
    const checkAuth = () => {
      const cookies = document.cookie.split(';');
      let hasSession = false;
      let role = '';
      
      cookies.forEach(cookie => {
        const [name, value] = cookie.trim().split('=');
        if (name === 'session_id' && value) hasSession = true;
        if (name === 'user_role') role = value;
      });

      if (!hasSession) {
        router.push('/login');
      } else {
        setIsAuthenticated(true);
        setUserRole(role);

        // Load offline cache first for zero latency
        const stored = localStorage.getItem('netamps_returns');
        if (stored) {
          try {
            setReturns(JSON.parse(stored));
          } catch (e) {}
        }
        
        // Fetch fresh data immediately
        fetchReturns(false);
        
        // Start real-time polling (every 10 seconds)
        const intervalId = setInterval(() => fetchReturns(true), 10000);
        return () => clearInterval(intervalId);
      }
    };

    const cleanup = checkAuth();
    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, [router, fetchReturns]);

  // Admin-only request export (S2): full records plus the SAME computed
  // figures shown on screen (ask/eval/final via shared helpers) — exported
  // figures can never diverge from displayed figures.
  const exportRequests = async (format: 'json' | 'csv') => {
    const stamp = new Date().toISOString().slice(0, 10);
    const enriched = returns.map(req => {
      const ask = askTotalOf(req);
      const ev = evalTotalOf(req);
      return {
        ...req,
        _computed: {
          askTotalPaise: ask.total,
          askPartial: ask.partial,
          evalTotalPaise: ev.total,
          evalPartial: ev.partial,
          finalTotalPaise: req.finalPrice?.totalPaise ?? null,
          finalBasis: req.finalPrice?.basis ?? null
        }
      };
    });
    const download = (name: string, content: string, type: string) => {
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    if (format === 'json') {
      download(`netamps-requests-${stamp}.json`, JSON.stringify(enriched, null, 2), 'application/json');
    } else {
      const esc = (v: unknown) => {
        const s = v === null || v === undefined ? '' : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const header = ['requestId', 'intent', 'status', 'company', 'email', 'date', 'pricingBasis',
        'productId', 'category', 'details', 'quantity', 'lineAskPaise', 'lotAskPaise', 'basePricePaise',
        'computedLineTotalPaise', 'evaluatedUnitPaise', 'evaluatedLinePaise', 'finalTotalPaise', 'finalBasis', 'manifestHash'];
      const rows: string[] = [header.join(',')];
      for (const req of enriched) {
        const lines = (req.products || []).length > 0 ? req.products : [null];
        for (const p of lines) {
          const unit = p ? evalUnitPaise(p) : null;
          const base = p && (p.basePricePaise ?? null) !== null ? (p.basePricePaise as number) : null;
          const qty = p ? (Number(p.quantity) || 1) : 1;
          const lineTotal = p ? lineFinalOf(qty, base) : null;
          rows.push([
            req.id, req.intent, req.status, req.company, req.email, req.date,
            req.pricingBasis === 'lot' ? 'lot' : 'per_product',
            p ? p.id : '', p ? p.category : '', p ? p.details : '', p ? p.quantity : '',
            p && p.lineConsiderationPaise != null ? p.lineConsiderationPaise : '',
            req.lotConsiderationPaise ?? '',
            base ?? '',
            lineTotal ?? '',
            unit ?? '',
            unit === null || !p ? '' : unit * (Number(p.quantity) || 1),
            req._computed.finalTotalPaise ?? '',
            req._computed.finalBasis ?? '',
            req.manifest?.hash ?? ''
          ].map(esc).join(','));
        }
      }
      download(`netamps-requests-${stamp}.csv`, rows.join('\n'), 'text/csv');
    }
    try {
      const { logEvent } = await import('../lib/logger');
      logEvent('REQUESTS_EXPORTED', 'Dashboard Page', `Exported ${enriched.length} requests as ${format.toUpperCase()}`, userRole);
    } catch {}
  };

  const handleLogout = async () => {
    // Full server revocation first (D1 row + HttpOnly cookie — cookies alone
    // leave the session usable until expiry), then local cleanup + redirect.
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      await fetch(`${API_URL}/api/users/logout`, { method: 'POST', credentials: 'same-origin' });
    } catch {}
    document.cookie = 'session_id=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    document.cookie = 'user_role=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    router.push('/login');
  };

  const toggleRow = (id: string) => {
    const newSet = new Set(expandedRows);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedRows(newSet);
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    const updatedReturns = returns.map(req => 
      req.id === id ? { ...req, status: newStatus } : req
    );
    setReturns(updatedReturns);
    localStorage.setItem('netamps_returns', JSON.stringify(updatedReturns));
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      await fetch(`${API_URL}/api/returns`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'status', status: newStatus })
      });
      const { logEvent } = await import('../lib/logger');
      logEvent('STATUS_UPDATED', 'Dashboard Page', `Request ${id} status changed to ${newStatus}`, userRole);
    } catch(err){}
  };

  // Approval writes a FinalPriceSnapshot atomically with the status flip.
  // Corrections re-approve (version+1 with history); post-approval edits lock.
  const handleApproveWithSnapshot = async (req: ReturnRequest) => {
    setApproveError(null);
    const ev = evalTotalOf(req);
    const ask = askTotalOf(req);
    let total: number | null = null;
    if (approveBasis === 'evaluated') {
      if (ev.total === null) {
        setApproveError('Cannot approve on Evaluated basis: some lines lack evaluated prices.');
        return;
      }
      total = ev.total;
    } else if (approveBasis === 'consideration') {
      if (ask.total === null) {
        setApproveError('Cannot approve on Consideration basis: the ask is unstated.');
        return;
      }
      total = ask.total;
    } else {
      const negotiated = moneyStringToPaise(approveNegotiated);
      if (negotiated === null) {
        setApproveError('Enter a valid negotiated total (0 – ₹99,99,99,999, max 2 decimals).');
        return;
      }
      total = negotiated;
    }

    const snapshot: FinalPriceSnapshot = {
      version: (req.finalPrice?.version ?? 0) + 1,
      decidedAt: new Date().toISOString(),
      decidedBy: userRole || 'unknown',
      basis: approveBasis,
      totalPaise: total,
      lines: (req.products || []).map(p => {
        const a = lineAskOf(req, p);
        const unit = evalUnitPaise(p);
        const e = unit === null ? null : unit * (Number(p.quantity) || 1);
        return {
          productId: p.id,
          askPaise: a,
          evaluatedPaise: e,
          settledPaise: approveBasis === 'negotiated' ? null : (approveBasis === 'evaluated' ? e : a)
        };
      }),
      manifestHashAtApproval: req.manifest?.hash ?? null
    };

    const updatedReturns = returns.map(r =>
      r.id === req.id ? { ...r, status: 'Approved', finalPrice: snapshot } : r
    );
    setReturns(updatedReturns);
    localStorage.setItem('netamps_returns', JSON.stringify(updatedReturns));
    setApprovingId(null);
    setApproveNegotiated('');
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      await fetch(`${API_URL}/api/returns`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: req.id, action: 'status', status: 'Approved', finalPrice: snapshot })
      });
      const { logEvent } = await import('../lib/logger');
      logEvent('STATUS_UPDATED', 'Dashboard Page', `Request ${req.id} approved (final v${snapshot.version}, basis ${snapshot.basis}, total ${snapshot.totalPaise} paise)`, userRole);
    } catch(err){}
  };

  const handleDeleteRequest = async (id: string) => {
    if (window.confirm('Are you sure you want to permanently delete this request?')) {
      const updatedReturns = returns.filter(req => req.id !== id);
      setReturns(updatedReturns);
      localStorage.setItem('netamps_returns', JSON.stringify(updatedReturns));
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
        await fetch(`${API_URL}/api/returns?id=${id}`, { method: 'DELETE' });
        const { logEvent } = await import('../lib/logger');
        logEvent('REQUEST_DELETED', 'Dashboard Page', `Request ${id} permanently deleted`, userRole);
      } catch(err){}
    }
  };

  // Commit an evaluated price. Called on blur/Enter — NOT on every keystroke.
  // Each deliberate commit writes exactly one price_history row, so the
  // permanent audit trail records real decisions (1600 → 15000) rather than
  // every intermediate value typed along the way.
  const commitPrice = async (reqId: string, productId: string, raw: string) => {
    const key = `${reqId}:${productId}`;
    // The committed value now owns the field — clear any in-progress draft.
    setPriceDrafts(prev => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

    if (userRole !== 'admin@netamps.com') return;
    const target = returns.find(r => r.id === reqId);
    if (target && target.status === 'Approved') return; // locked once approved (see finalPrice snapshot)

    // Paise-integer contract: parse the ₹ string once, store integer paise.
    // Empty clears; invalid (negative/nonnumeric) clears like before — never NaN.
    const cleaned = raw.replace(/[₹,\s]/g, '');
    const n = Number(cleaned);
    const paise = cleaned.trim() === '' ? null : (!Number.isFinite(n) || n < 0 ? null : Math.round(n * 100));

    // No-op when nothing actually changed (re-committing the same figure, or
    // matching the legacy rupee value) — no server write, no audit row.
    const product = target?.products.find(p => p.id === productId);
    if (product && paise === evalUnitPaise(product)) return;

    const updatedReturns = returns.map(req => {
      if (req.id === reqId) {
        return {
          ...req,
          products: req.products.map(p => {
            if (p.id !== productId) return p;
            const next = { ...p } as ProductItem & { pricePaise?: number };
            if (paise === null) {
              delete next.pricePaise;
            } else {
              next.pricePaise = paise;
            }
            return next;
          })
        };
      }
      return req;
    });
    setReturns(updatedReturns);
    localStorage.setItem('netamps_returns', JSON.stringify(updatedReturns));
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      await fetch(`${API_URL}/api/returns`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reqId, action: 'price', productId, pricePaise: paise })
      });
      const { logEvent } = await import('../lib/logger');
      logEvent('PRICE_UPDATED', 'Dashboard Page', `Updated price for product ${productId} in request ${reqId}`, userRole);
    } catch(err){}
  };

  const handleEmailPush = async (req: ReturnRequest) => {
    if (req.status !== 'Approved') return;
    
    const updatedReturns = returns.map(r => 
      r.id === req.id ? { ...r, emailDeliveryStatus: 'pending' as const } : r
    );
    setReturns(updatedReturns);
    localStorage.setItem('netamps_returns', JSON.stringify(updatedReturns));
    
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${API_URL}/api/email/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: req.email,
          requestId: req.id,
          products: req.products,
          intent: req.intent,
          consideration: {
            pricingBasis: req.pricingBasis === 'lot' ? 'lot' : 'per_product',
            lotConsiderationPaise: req.lotConsiderationPaise ?? null,
            lines: (req.products || []).map(p => ({ productId: p.id, lineConsiderationPaise: p.lineConsiderationPaise ?? null }))
          },
          askTotalPaise: askTotalOf(req).total,
          finalPrice: req.finalPrice ?? null
        })
      });
      let data;
      try {
        data = await res.json();
      } catch (err) {
        throw new Error('Server returned an invalid response (500 Internal Server Error)');
      }
      
      if (!data.success) throw new Error(data.message);
      
      if (data.message && data.message.includes('failed')) {
        alert(data.message);
      }

      const finalStatus = data.emailDeliveryStatus || 'sent';

      const finalReturns = updatedReturns.map(r => 
        r.id === req.id ? { ...r, emailDeliveryStatus: finalStatus } : r
      );
      setReturns(finalReturns);
      localStorage.setItem('netamps_returns', JSON.stringify(finalReturns));
      
      await fetch(`${API_URL}/api/returns`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: req.id, action: 'emailDelivery', emailDeliveryStatus: finalStatus })
      }).catch(() => {});
      
      const { logEvent } = await import('../lib/logger');
      logEvent('EMAIL_PUSH_SENT', 'Dashboard Page', `Sent email push for request ${req.id}`, userRole);
    } catch (e: any) {
      console.error(e);
      alert(e.message || 'Network error.');
      const failedReturns = updatedReturns.map(r => 
        r.id === req.id ? { ...r, emailDeliveryStatus: 'failed' as const } : r
      );
      setReturns(failedReturns);
      localStorage.setItem('netamps_returns', JSON.stringify(failedReturns));
      try {
        const { logEvent } = await import('../lib/logger');
        logEvent('EMAIL_PUSH_FAILED', 'Dashboard Page', `Failed to send email push for request ${req.id}: ${e.message}`, userRole);
      } catch (err) {}
    }
  };

  if (!isAuthenticated) return null; // Prevent flash of content

  return (
    <div className="min-h-screen bg-[#020817] text-white font-sans">
      {/* Top Navbar */}
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-4">
              <NetampsLogo />
              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                Enterprise DB
              </span>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Webmail Access Button */}
              <a
                href="https://webmail.netamps.in"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 px-3 py-1.5 rounded-lg transition-colors border border-indigo-500/20"
                title="Access Webmail"
              >
                <Mail className="w-4 h-4" />
                <span className="hidden sm:inline">Webmail</span>
              </a>

              {/* Price negotiations monitor — buyer ↔ seller threads (separate tab) */}
              <Link
                href="/dashboard/negotiations"
                className="flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1.5 rounded-lg transition-colors border border-amber-500/20"
                title="Price negotiations"
              >
                <Handshake className="w-4 h-4" />
                <span className="hidden sm:inline">Negotiations</span>
              </Link>
              
              <div className="text-sm font-medium text-slate-300">
                Logged in as <span className="text-white capitalize">{userRole}</span>
              </div>
              
              {userRole === 'admin@netamps.com' && (
                <>
                  <button 
                    onClick={() => setShowLogsModal(true)}
                    className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 px-3 py-1.5 rounded-lg transition-colors border border-indigo-500/20"
                  >
                    <Database className="w-4 h-4" /> Website Event Logs
                  </button>
                  <button 
                    onClick={() => setShowPasswordModal(true)}
                    className="flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-1.5 rounded-lg transition-colors border border-emerald-500/20"
                  >
                    <Key className="w-4 h-4" /> Manage Users
                  </button>
                  <button 
                    onClick={() => setCandidatesFlag(!(candidatesEnabled === true))}
                    disabled={candidatesFlagBusy}
                    className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg transition-colors border disabled:opacity-50 ${candidatesEnabled === true ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20' : 'text-slate-300 bg-slate-800 border-slate-700 hover:bg-slate-700'}`}
                    title="Best-match suggestions for BUY orders (advisory: the model suggests, staff decide)"
                  >
                    <Sparkles className="w-4 h-4" /> Best-match: {candidatesEnabled === null ? '…' : candidatesEnabled ? 'ON' : 'OFF'}
                  </button>
                  <button 
                    onClick={() => exportRequests('json')}
                    className="flex items-center gap-2 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors border border-slate-700"
                  >
                    <Download className="w-4 h-4" /> Export JSON
                  </button>
                  <button 
                    onClick={() => exportRequests('csv')}
                    className="flex items-center gap-2 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors border border-slate-700"
                  >
                    <Download className="w-4 h-4" /> Export CSV
                  </button>
                </>
              )}

              <button 
                onClick={handleLogout}
                className="flex items-center gap-2 text-sm text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors border border-slate-700"
              >
                <LogOut className="w-4 h-4" /> Terminate Session
              </button>
            </div>
          </div>
        </div>
      </nav>

      {showPasswordModal && (
        <UserManagementModal 
          onClose={() => setShowPasswordModal(false)} 
          currentUserRole={userRole} 
        />
      )}

      {idle.warning && (
        <IdleTimeoutModal
          remainingMs={idle.remainingMs}
          onStay={idle.stay}
          onTerminate={idle.terminateNow}
        />
      )}

      {showLogsModal && userRole === 'admin@netamps.com' && (
        <LogViewerModal onClose={() => setShowLogsModal(false)} />
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Active Requests Dashboard</h1>
            <p className="mt-2 text-sm text-slate-400">Manage all IT asset procurement (BUY) and liquidation (SELL) orders.</p>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => fetchReturns(false)}
              disabled={isRefreshing}
              title="Refresh Data"
              className="p-2 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50 shadow-lg"
            >
              <RefreshCw className={`w-4 h-4 text-slate-300 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <Link href="/intake" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-indigo-500/20 mr-2">
              <Database className="w-4 h-4" /> Intake Workbench
            </Link>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input type="text" placeholder="Search orders..." className="pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 w-64" />
            </div>
            <button className="p-2 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors">
              <Filter className="w-4 h-4 text-slate-300" />
            </button>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-800">
              <thead className="bg-slate-800/50">
                <tr>
                  <th scope="col" className="w-10 px-4 py-4"></th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Tracking ID</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Client Details</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Order Size</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Date Submitted</th>
                  <th scope="col" className="px-6 py-4 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 bg-slate-900">
                {returns.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                      <ArchiveX className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      <p>No active requests found in the database.</p>
                      <p className="text-xs mt-1">New requests from the portal will appear here.</p>
                    </td>
                  </tr>
                ) : (
                  returns.map((req) => {
                    const isExpanded = expandedRows.has(req.id);
                    const isSell = req.intent === 'sell';
                    
                    return (
                      <React.Fragment key={req.id}>
                        <tr 
                          className="hover:bg-slate-800/30 transition-colors cursor-pointer group"
                          onClick={() => toggleRow(req.id)}
                        >
                          <td className="px-4 py-4 whitespace-nowrap text-slate-500 group-hover:text-white">
                            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2.5 py-1 text-xs font-bold rounded-lg border ${isSell ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                              {req.id}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-bold text-white">{req.name}</div>
                            <div className="text-xs text-slate-400">{req.company} &bull; {req.email}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <Package className="w-4 h-4 text-slate-500" />
                              <span className="text-sm text-slate-300 font-medium">{req.products?.length || 0} Products</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                            {new Date(req.date).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <span className={`px-2.5 py-1 text-xs font-medium border rounded-full ${
                              req.status === 'Approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                              req.status === 'Declined' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 
                              'bg-amber-500/10 text-amber-500 border-amber-500/20'
                            }`}>
                              {req.status}
                            </span>
                          </td>
                        </tr>
                        {/* Expandable Tree Row */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={6} className="px-0 py-0 bg-slate-950/50">
                              <div className="px-14 py-6 border-l-2 border-indigo-500/30 ml-8 my-4">
                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                                  <Tag className="w-4 h-4" /> Order Manifest
                                </h4>
                                {req.pricingBasis === 'lot' && (
                                  <div className="mb-4 p-3 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-300">
                                    Lot consideration (whole request): <span className="font-mono font-bold text-white">{paiseToDisplay(req.lotConsiderationPaise ?? null)}</span>
                                  </div>
                                )}
                                <div className="space-y-3">
                                  {req.products && req.products.length > 0 ? (
                                    req.products.map((product, idx) => (
                                      <div key={product.id || idx} className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 flex flex-col gap-3">
                                        <div className="flex justify-between items-start gap-4 flex-wrap">
                                          <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2 mb-2">
                                              {product.strategicTarget && (
                                                <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${product.strategicTarget === 'resale' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
                                                  {product.strategicTarget === 'resale' ? 'Resale Value Opt.' : 'Compliance Recycling'}
                                                </span>
                                              )}
                                              {product.lifecycleAge && (
                                                <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-300 border border-slate-600">
                                                  {product.lifecycleAge}
                                                </span>
                                              )}
                                            </div>
                                            <div className="text-sm font-bold text-slate-200 capitalize mb-1">
                                              {product.category.replace('_', ' ')}
                                            </div>
                                            <div className="text-xs text-slate-400 max-w-2xl">
                                              {product.details}
                                            </div>
                                          </div>
                                          <div className="flex items-start gap-3 shrink-0 flex-wrap">
                                            <div className="flex flex-col items-end">
                                              <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 whitespace-nowrap leading-4 min-h-4">Base Price (Per Unit)</label>
                                              <div className="px-3 py-1.5 min-w-[7.5rem] flex items-center justify-end text-sm font-mono font-bold tabular-nums text-slate-200 bg-slate-900 border border-slate-700 rounded-lg" title="Visitor-stated base per unit — read-only, sealed in manifest">
                                                {paiseToDisplay(product.basePricePaise ?? null)}
                                              </div>
                                            </div>
                                            <div className="flex flex-col items-end">
                                              <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 whitespace-nowrap leading-4 min-h-4">Line Consideration (Upfront Discount)</label>
                                              <div className="px-3 py-1.5 min-w-[7.5rem] flex items-center justify-end text-sm font-mono font-bold tabular-nums text-slate-200 bg-slate-900 border border-slate-700 rounded-lg" title="Visitor-stated upfront total for this line — read-only">
                                                {paiseToDisplay(lineAskOf(req, product))}
                                              </div>
                                              {(() => {
                                                const final = lineFinalOf(Number(product.quantity) || 1, product.basePricePaise ?? null);
                                                return (
                                                  <div className="text-[11px] text-slate-400 mt-1 min-h-[1.25rem]" title="Quantity × base price — computed, read-only">
                                                    {final === null ? <>&nbsp;</> : <>Final: <span className="font-mono font-bold tabular-nums text-slate-200">{paiseToDisplay(final)}</span></>}
                                                  </div>
                                                );
                                              })()}
                                            </div>
                                            <div className="flex flex-col items-end">
                                              <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 whitespace-nowrap leading-4 min-h-4">Evaluated (Per Unit)</label>
                                              <div className="relative">
                                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                                                <input
                                                  type="text"
                                                  inputMode="decimal"
                                                  disabled={userRole !== 'admin@netamps.com' || req.status === 'Approved'}
                                                  value={priceDrafts[`${req.id}:${product.id}`] ?? ((product.pricePaise ?? null) !== null ? String((product.pricePaise as number) / 100) : (product.price ?? ''))}
                                                  onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ''); setPriceDrafts(prev => ({ ...prev, [`${req.id}:${product.id}`]: v })); }}
                                                  onBlur={(e) => commitPrice(req.id, product.id, e.target.value.replace(/[^0-9.]/g, ''))}
                                                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                                  placeholder={userRole === 'admin@netamps.com' ? "Enter price" : "Pending"}
                                                  className="w-32 bg-slate-900 border border-slate-600 rounded-lg pl-6 pr-3 py-1.5 text-sm tabular-nums text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                                                />
                                              </div>
                                            </div>
                                            <div className="shrink-0 self-start mt-[1.25rem] text-sm font-mono font-bold tabular-nums text-indigo-400 bg-indigo-500/10 px-3 py-1.5 rounded-lg border border-indigo-500/20">
                                              x{product.quantity}
                                            </div>
                                          </div>
                                        </div>
                                        {product.attachedFiles && product.attachedFiles.length > 0 && (
                                          <div className="mt-4 pt-4 border-t border-slate-700/50">
                                            <EvidenceGallery
                                              files={product.attachedFiles}
                                              cdnBase={process.env.NEXT_PUBLIC_CDN_URL || '/api/cdn'}
                                              title="Asset Evidence"
                                              compact
                                            />
                                          </div>
                                        )}
                                      </div>
                                    ))
                                  ) : (
                                    <div className="text-sm text-slate-500 italic">No products listed. (Legacy request)</div>
                                  )}
                                  
                                  {req.products && req.products.length > 0 && (() => {
                                    const ask = askTotalOf(req);
                                    const ev = evalTotalOf(req);
                                    const final = req.finalPrice ?? null;
                                    const row = (label: string, value: string, sub: string | null, accent: string) => (
                                      <div className="flex justify-between items-center py-1.5">
                                        <div className="text-sm font-bold text-slate-400 uppercase tracking-wider">{label}</div>
                                        <div className="text-right">
                                          <div className={`text-2xl font-mono font-bold ${accent}`}>{value}</div>
                                          {sub && <div className="text-[11px] text-amber-400">{sub}</div>}
                                        </div>
                                      </div>
                                    );
                                    return (
                                      <div className="mt-4 p-4 rounded-lg bg-slate-900 border border-slate-700">
                                        {row('Total Asked', paiseToDisplay(ask.total), ask.partial ? 'Partial — some lines unstated' : null, 'text-sky-400')}
                                        <div className="border-t border-slate-700/60 my-1" />
                                        {row('Total Evaluated Value', paiseToDisplay(ev.total), ev.partial ? 'Partial — some lines unevaluated' : null, 'text-emerald-400')}
                                        <div className="border-t border-slate-700/60 my-1" />
                                        {row('Final', final ? `${paiseToDisplay(final.totalPaise)} (v${final.version})` : '—', null, 'text-white')}
                                        {(req.priceHistory ?? []).length > 0 && (
                                          <>
                                            <div className="border-t border-slate-700/60 my-1" />
                                            <div className="pt-2">
                                              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Price history (permanent audit trail)</div>
                                              <ul className="space-y-1">
                                                {(req.priceHistory ?? []).slice(-5).map((h, i) => (
                                                  <li key={i} className="text-[11px] font-mono text-slate-400">
                                                    {h.productId.slice(0, 8)}…: {paiseToDisplay(h.oldPaise)} → {paiseToDisplay(h.newPaise)} <span className="text-slate-600">· {h.actor} · {new Date(h.at).toLocaleString()}</span>
                                                  </li>
                                                ))}
                                              </ul>
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>
                                
                                {/* BUY → SELL best-match suggestions (advisory, cached, admin-acceptable) */}
                                {req.intent === 'buy' && (
                                  <MatchCandidates
                                    requestId={req.id}
                                    isAdmin={userRole === 'admin@netamps.com'}
                                    products={req.products || []}
                                  />
                                )}

                                {/* Attached evidence — renders nothing when empty (zero pixels reclaimed) */}
                                <div className="mt-6">
                                  <EvidenceGallery
                                    files={req.attachedFiles || []}
                                    cdnBase={process.env.NEXT_PUBLIC_CDN_URL || '/api/cdn'}
                                    title="Attached Evidence"
                                  />
                                </div>

                                {/* Key reconciliation — admin only. Report-first; prune is explicit + audited. */}
                                {userRole === 'admin@netamps.com' && (
                                  <div className="mt-4 rounded-lg bg-slate-950/60 border border-slate-800 px-4 py-3">
                                    <div className="flex flex-wrap items-center gap-3">
                                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Key reconciliation</span>
                                      <button
                                        type="button"
                                        disabled={reconciling === `${req.id}:report`}
                                        onClick={(e) => { e.stopPropagation(); runReconcile(req, false); }}
                                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors disabled:opacity-50"
                                      >
                                        {reconciling === `${req.id}:report` ? 'Checking…' : 'Verify attachment keys'}
                                      </button>
                                      {(() => {
                                        const rep = reconcileResult[req.id];
                                        if (!rep || rep.error) return null;
                                        if (!rep.missing || rep.missing.length === 0) return null;
                                        return (
                                          <button
                                            type="button"
                                            disabled={reconciling === `${req.id}:prune`}
                                            onClick={(e) => { e.stopPropagation(); runReconcile(req, true); }}
                                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 transition-colors disabled:opacity-50"
                                          >
                                            {reconciling === `${req.id}:prune` ? 'Pruning…' : `Remove ${rep.missing.length} dead reference${rep.missing.length > 1 ? 's' : ''}`}
                                          </button>
                                        );
                                      })()}
                                    </div>
                                    {(() => {
                                      const rep = reconcileResult[req.id];
                                      if (!rep) return null;
                                      if (rep.error) {
                                        return <p className="text-xs text-red-400 mt-2">{rep.error}</p>;
                                      }
                                      return (
                                        <div className="text-xs text-slate-400 mt-2 space-y-1">
                                          <p>
                                            Checked {rep.checked} reference{rep.checked === 1 ? '' : 's'}: {' '}
                                            <span className="text-emerald-400 font-bold">{rep.ok} OK</span>
                                            {rep.missing?.length > 0 && <span className="text-red-300 font-bold"> · {rep.missing.length} missing</span>}
                                            {rep.malformed?.length > 0 && <span className="text-amber-300 font-bold"> · {rep.malformed.length} malformed</span>}
                                            {rep.inline > 0 && <span> · {rep.inline} inline</span>}
                                          </p>
                                          {rep.missing?.length > 0 && (
                                            <ul className="font-mono text-[11px] text-slate-500 space-y-0.5">
                                              {rep.missing.map((m: any) => (
                                                <li key={m.key} className="truncate" title={m.key}>
                                                  ✗ {m.key} <span className="text-slate-600">({(m.sources || []).join(', ')})</span>
                                                </li>
                                              ))}
                                            </ul>
                                          )}
                                          {rep.pruned?.length > 0 && (
                                            <p className="text-emerald-400">Pruned {rep.pruned.length} dead reference{rep.pruned.length > 1 ? 's' : ''} (audited).{rep.manifestStale ? ' Manifest now differs from record — re-verify before transacting.' : ''}</p>
                                          )}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                )}

                                <div className="mt-6 flex flex-wrap gap-3 border-t border-slate-800 pt-4 items-center">
                                  {approvingId === req.id && (
                                    <div className="w-full mb-4 p-4 rounded-lg bg-slate-900 border border-emerald-500/30">
                                      <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">
                                        Approve with final price snapshot {req.finalPrice ? `(correction → v${req.finalPrice.version + 1})` : '(v1)'}
                                      </div>
                                      <div className="flex flex-wrap gap-2 mb-3">
                                        {(['evaluated', 'consideration', 'negotiated'] as const).map(b => (
                                          <button
                                            key={b}
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setApproveBasis(b); setApproveError(null); }}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${approveBasis === b ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'}`}
                                          >
                                            {b === 'evaluated' ? 'Evaluated Total' : b === 'consideration' ? 'Consideration Total' : 'Negotiated Total'}
                                          </button>
                                        ))}
                                      </div>
                                      {approveBasis === 'negotiated' && (
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          value={approveNegotiated}
                                          onChange={(e) => setApproveNegotiated(sanitizeMoneyInput(e.target.value))}
                                          placeholder="Negotiated total (₹)"
                                          className="w-full sm:max-w-xs mb-3 px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:border-emerald-500 focus:outline-none"
                                        />
                                      )}
                                      <div className="text-sm text-slate-400 mb-3">
                                        Preview total:{' '}
                                        <span className="font-mono font-bold text-white">
                                          {(() => {
                                            if (approveBasis === 'evaluated') return paiseToDisplay(evalTotalOf(req).total);
                                            if (approveBasis === 'consideration') return paiseToDisplay(askTotalOf(req).total);
                                            const n = moneyStringToPaise(approveNegotiated);
                                            return n === null ? '—' : paiseToDisplay(n);
                                          })()}
                                        </span>
                                      </div>
                                      {approveError && (
                                        <div className="text-xs text-red-400 mb-3">{approveError}</div>
                                      )}
                                      <div className="flex gap-2">
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); handleApproveWithSnapshot(req); }}
                                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-lg transition-colors"
                                        >
                                          Confirm Approval
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); setApprovingId(null); setApproveError(null); }}
                                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors border border-slate-700"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                  {req.status === 'Approved' && (
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); handleEmailPush(req); }}
                                      disabled={req.emailDeliveryStatus === 'pending'}
                                      className={`px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 mr-auto disabled:opacity-70 ${req.emailDeliveryStatus === 'sent' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-indigo-600 hover:bg-indigo-500'}`}
                                    >
                                      {req.emailDeliveryStatus === 'pending' ? <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Mail className="w-4 h-4" />}
                                      {req.emailDeliveryStatus === 'sent' ? 'Email Sent' : req.emailDeliveryStatus === 'failed' ? 'Retry Email' : 'Email Push'}
                                    </button>
                                  )}
                                  <div className={req.status === 'Approved' ? 'flex gap-3' : 'ml-auto flex gap-3'}>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); setApprovingId(req.id); setApproveBasis('evaluated'); setApproveNegotiated(''); setApproveError(null); }}
                                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
                                    >
                                      Approve Request
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); handleUpdateStatus(req.id, 'Declined'); }}
                                      className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors"
                                    >
                                      Decline Request
                                    </button>
                                    {userRole === 'admin@netamps.com' && (
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); handleDeleteRequest(req.id); }}
                                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-red-400 text-sm font-medium rounded-lg transition-colors border border-red-500/20"
                                      >
                                        Delete Request
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
