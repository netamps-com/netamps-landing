'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogOut, Package, Search, Filter, ArchiveX, Key, X, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Tag, Video, Mail, Database, Server, Wifi, HardDrive, Cpu, Zap, ExternalLink, RefreshCw, Download } from 'lucide-react';
import NetampsLogo from '../NetampsLogo';
import UserManagementModal from './UserManagementModal';
import LogViewerModal from './LogViewerModal';
import EvidenceGallery from './EvidenceGallery';
import { formatPaise as paiseToDisplay, evalUnitPaise, sanitizeMoneyInput, moneyStringToPaise, lotBreakdownOf } from '../lib/money';

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
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Approval snapshot draft (per-request). Approving writes a FinalPriceSnapshot
  // atomically with the status flip; post-approval price edits are locked.
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approveBasis, setApproveBasis] = useState<'evaluated' | 'consideration' | 'negotiated'>('evaluated');
  const [approveNegotiated, setApproveNegotiated] = useState('');
  const [approveError, setApproveError] = useState<string | null>(null);

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
          const lineTotal = base === null ? null : (Number.isSafeInteger(qty * base) ? qty * base : null);
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

  const handleLogout = () => {
    // Securely terminate session by destroying cookies
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

  const handlePriceChange = async (reqId: string, productId: string, newPrice: string) => {
    if (userRole !== 'admin@netamps.com') return;
    const target = returns.find(r => r.id === reqId);
    if (target && target.status === 'Approved') return; // locked once approved (see finalPrice snapshot)
    // Paise-integer contract: parse the ₹ string once, store integer paise.
    // Empty clears; invalid (negative/nonnumeric) clears like before — never NaN.
    const cleaned = newPrice.replace(/[₹,\s]/g, '');
    const n = Number(cleaned);
    const paise = cleaned.trim() === '' ? null : (!Number.isFinite(n) || n < 0 ? null : Math.round(n * 100));
    
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
                                        <div className="flex justify-between items-start">
                                          <div>
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
                                          <div className="flex items-center gap-4">
                                            <div className="flex flex-col items-end">
                                              <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Consideration (Ask)</label>
                                              <div className="px-3 py-1.5 text-sm font-mono font-bold text-slate-200 bg-slate-900 border border-slate-700 rounded-lg" title="Visitor-stated value — read-only">
                                                {paiseToDisplay(lineAskOf(req, product))}
                                              </div>
                                            </div>
                                            <div className="flex flex-col items-end">
                                              <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Unit Price (INR)</label>
                                              <div className="relative">
                                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                                                <input
                                                  type="text"
                                                  inputMode="decimal"
                                                  disabled={userRole !== 'admin@netamps.com' || req.status === 'Approved'}
                                                  value={(product.pricePaise ?? null) !== null ? String((product.pricePaise as number) / 100) : (product.price ?? '')}
                                                  onChange={(e) => handlePriceChange(req.id, product.id, e.target.value.replace(/[^0-9.]/g, ''))}
                                                  placeholder={userRole === 'admin@netamps.com' ? "Enter price" : "Pending"}
                                                  className="w-32 bg-slate-900 border border-slate-600 rounded-lg pl-6 pr-3 py-1.5 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                                                />
                                              </div>
                                            </div>
                                            <div className="text-lg font-mono font-bold text-indigo-400 bg-indigo-500/10 px-4 py-2 rounded-lg border border-indigo-500/20">
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
                                      </div>
                                    );
                                  })()}
                                  {req.pricingBasis === 'lot' && (() => {
                                    const bd = lotBreakdownOf(
                                      (req.products || []).map(p => ({
                                        qty: Number(p.quantity) || 1,
                                        basePaise: p.basePricePaise ?? null
                                      })),
                                      req.lotConsiderationPaise ?? null
                                    );
                                    const hasAnyBase = bd.rows.some(r => r.basePaise !== null);
                                    return (
                                      <details className="mt-3 rounded-lg bg-slate-950/60 border border-slate-800 px-4 py-2">
                                        <summary className="cursor-pointer text-xs font-bold text-slate-400 uppercase tracking-wider">Lot breakdown</summary>
                                        {!hasAnyBase ? (
                                          <p className="text-xs text-slate-500 mt-2">Line breakdown unavailable — captured before per-line pricing.</p>
                                        ) : (
                                        <div className="mt-2 space-y-1">
                                          {(req.products || []).map((p, i) => {
                                            const r = bd.rows[i];
                                            return (
                                              <div key={p.id || i} className="flex justify-between gap-3 text-sm">
                                                <span className="text-slate-400 truncate">{p.category} · Qty {r ? r.qty : Number(p.quantity) || 1}</span>
                                                <span className="font-mono text-slate-200 shrink-0">
                                                  {!r || r.basePaise === null
                                                    ? '—'
                                                    : `${r.qty} × ${paiseToDisplay(r.basePaise)} = ${paiseToDisplay(r.lineTotal)}`}
                                                </span>
                                              </div>
                                            );
                                          })}
                                          <div className="border-t border-slate-800/60 my-1" />
                                          <div className="flex justify-between text-sm">
                                            <span className="text-slate-400">Sum of lines</span>
                                            <span className="font-mono text-slate-200">{paiseToDisplay(bd.sumLines)}{bd.partial ? ' (partial)' : ''}</span>
                                          </div>
                                          <div className="flex justify-between text-sm">
                                            <span className="text-slate-400">Variance</span>
                                            <span className={`font-mono font-bold ${bd.variance === null ? 'text-slate-500' : bd.variance === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                              {bd.variance === null ? '—' : bd.variance === 0 ? '✓ Reconciled' : `Differs by ${bd.variance < 0 ? '−' : '+'}${paiseToDisplay(Math.abs(bd.variance))}`}
                                            </span>
                                          </div>
                                        </div>
                                        )}
                                      </details>
                                    );
                                  })()}
                                </div>
                                
                                {/* Attached evidence — renders nothing when empty (zero pixels reclaimed) */}
                                <div className="mt-6">
                                  <EvidenceGallery
                                    files={req.attachedFiles || []}
                                    cdnBase={process.env.NEXT_PUBLIC_CDN_URL || '/api/cdn'}
                                    title="Attached Evidence"
                                  />
                                </div>

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
