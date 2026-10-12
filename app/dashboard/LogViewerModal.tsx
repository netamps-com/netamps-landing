import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Search, Download, Filter, FileText, Database } from 'lucide-react';
import type { AuditLog } from '../lib/logger';

interface LogViewerModalProps {
  onClose: () => void;
}

// Explicit severity (never substring-sniffed: REQUEST_DELETED and
// TURNSTILE_BLOCKED used to render neutral). Unknown types default to info.
type Severity = 'critical' | 'security' | 'success' | 'info';
const SEVERITY_MAP: Record<string, Severity> = {
  REQUEST_DELETED: 'critical',
  LOGS_CLEARED: 'critical',
  EVIDENCE_PRUNED: 'critical',
  AUTH_LOGIN_FAILED: 'security',
  AUTH_LOGIN_THROTTLED: 'security',
  AUTH_LOGIN_BOT_BLOCKED: 'security',
  TURNSTILE_BLOCKED: 'security',
  OTP_FAILED: 'security',
  OTP_INVALID: 'security',
  OTP_ERROR: 'security',
  INTAKE_FILE_REJECTED: 'security',
  MATCH_ESCALATE_FAILED: 'security',
  EMAIL_PUSH_FAILED: 'security',
  AUTH_SUCCESS: 'success',
  INTAKE_AUTO_COMMITTED: 'success',
  EMAIL_PUSH_SENT: 'success',
  MATCH_ESCALATED: 'success',
  INTAKE_JOB_REVIEWED: 'success',
  REQUESTS_EXPORTED: 'success',
};

function severityOf(eventType?: string): Severity {
  if (!eventType) return 'info';
  if (SEVERITY_MAP[eventType]) return SEVERITY_MAP[eventType];
  if (/(FAILED|ERROR|BLOCKED|DELETED|CLEARED|PRUNED)/.test(eventType)) return 'security';
  if (/(SUCCESS|COMMITTED|SENT|APPROVED|REVIEWED|ESCALATED|EXPORTED)/.test(eventType)) return 'success';
  return 'info';
}

const SEVERITY_STYLES: Record<Severity, string> = {
  critical: 'bg-red-100 text-red-800',
  security: 'bg-amber-100 text-amber-800',
  success: 'bg-emerald-100 text-emerald-800',
  info: 'bg-indigo-100 text-indigo-800',
};

// CSV-injection guard (shared rule with intake/dashboard exports): a cell
// opening with = + - @ (after whitespace) is neutralized — exported audit
// details open inert in Excel.
function sanitizeCsvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  const safe = /^\s*[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export default function LogViewerModal({ onClose }: LogViewerModalProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [pageFilter, setPageFilter] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc'|'asc'>('desc');
  const [storeState, setStoreState] = useState<'d1' | 'none' | 'local'>('d1');
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  // Pagination state (server-side; client only renders the current page)
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(100);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  // Clear flow: idle → confirm (auto-exported first) → clearing. Typed CLEAR
  // + server tombstone replace the old one-click window.confirm.
  const [clearStage, setClearStage] = useState<'idle' | 'confirm' | 'clearing'>('idle');
  const [clearText, setClearText] = useState('');
  const [clearReason, setClearReason] = useState('');
  const [clearError, setClearError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 400);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const params = new URLSearchParams();
      if (dateFilter) params.set('since', dateFilter);
      if (debouncedSearch) params.set('q', debouncedSearch);
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      const qs = params.toString();
      const res = await fetch(`${API_URL}/api/logs${qs ? `?${qs}` : ''}`);
      const data = await res.json();
      if (data.success && data.logs) {
        setStoreState(data.store === 'none' ? 'none' : 'd1');
        setTotal(data.total || 0);
        setLimit(data.limit || limit);
        setOffset(data.offset || offset);
        
        // Always merge on-device logs so the view retains history during D1 transition
        // or captures any events that failed to POST to the central API.
        const { getLogs } = await import('../lib/logger');
        const local = getLogs();
        
        const remote = data.logs;
        const merged = [...remote];
        
        local.forEach((l: AuditLog) => {
          if (!merged.some(m => m.id === l.id)) {
            merged.push(l);
          }
        });
        
        setLogs(merged);
      } else {
        // Fallback to local storage if API fails
        const { getLogs } = await import('../lib/logger');
        setLogs(getLogs());
        setStoreState('local');
        setTotal(0);
      }
    } catch (err) {
      const { getLogs } = await import('../lib/logger');
      setLogs(getLogs());
      setStoreState('local');
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [dateFilter, debouncedSearch, limit, offset]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const filteredLogs = logs; // Server-side filtered; client just renders current page

  const uniquePages = Array.from(new Set(logs.map(l => l.page)));
  const uniqueEventTypes = Array.from(new Set(logs.map(l => l.eventType).filter(Boolean))).sort();

  const goPrev = () => setOffset(Math.max(0, offset - limit));
  const goNext = () => setOffset(offset + limit);
  const canGoPrev = offset > 0;
  const canGoNext = offset + limit < total;

  const exportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(filteredLogs, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", "security_audit_logs.json");
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const exportCSV = () => {
    const headers = ['ID', 'Timestamp', 'Event Type', 'Severity', 'Page', 'User', 'IP Address', 'Details'];
    const rows = filteredLogs.map(l => [
      l.id, l.timestamp, l.eventType, severityOf(l.eventType), l.page, l.user || '', l.ipAddress || '', l.details
    ].map(sanitizeCsvCell).join(','));
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join("\n");
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", encodeURI(csvContent));
    downloadAnchorNode.setAttribute("download", "security_audit_logs.csv");
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const requestClear = () => {
    exportJSON(); // export-first: the pre-clear snapshot downloads on this click gesture
    setClearStage('confirm');
    setClearText('');
    setClearReason('');
    setClearError('');
  };

  const confirmClear = async () => {
    if (clearText.trim() !== 'CLEAR') {
      setClearError('Type CLEAR exactly to confirm.');
      return;
    }
    setClearStage('clearing');
    setClearError('');
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${API_URL}/api/logs`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: clearReason })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.success) {
        throw new Error((data && data.message) || 'Clear refused by server.');
      }
      localStorage.setItem('netamps_audit_logs', '[]');
      setClearStage('idle');
      setRefreshKey((k) => k + 1); // refetch — the LOGS_CLEARED tombstone appears
    } catch (err: any) {
      setClearError(err?.message || 'Clear failed.');
      setClearStage('confirm');
    }
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Database className="w-6 h-6 text-indigo-600" />
              Website Event Logs (Industry Standard View)
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Retrieved from the central audit store (D1) when available, with on-device fallback. Stores up to 5000 recent events.
            </p>
            {storeState !== 'd1' && (
              <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                Central audit store not connected — showing on-device logs only. Attach the D1
                database binding in Cloudflare Pages → Settings → Functions → Production, then redeploy.
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Filters & Export */}
        <div className="p-4 border-b border-slate-200 bg-white flex flex-wrap gap-4 justify-between items-center">
          <div className="flex gap-4 flex-wrap">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search logs..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64 text-slate-900 bg-white placeholder-slate-400"
              />
            </div>
            <input 
              type="date" 
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 bg-white"
            />
            <select 
              value={pageFilter}
              onChange={(e) => setPageFilter(e.target.value)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-slate-900"
            >
              <option value="">All Pages</option>
              {uniquePages.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select
              value={eventTypeFilter}
              onChange={(e) => setEventTypeFilter(e.target.value)}
              aria-label="Filter by event type"
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-slate-900 max-w-[220px]"
            >
              <option value="">All Event Types</option>
              {uniqueEventTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select 
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'asc'|'desc')}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-slate-900"
            >
              <option value="desc">Newest First</option>
              <option value="asc">Oldest First</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-sm font-semibold hover:bg-emerald-100 transition-colors">
              <Download className="w-4 h-4" /> Export CSV (Excel)
            </button>
            <button onClick={exportJSON} className="flex items-center gap-2 px-4 py-2 bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-sm font-semibold hover:bg-slate-100 transition-colors">
              <FileText className="w-4 h-4" /> Export JSON
            </button>
            <button onClick={requestClear} disabled={clearStage !== 'idle'} className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-semibold hover:bg-red-100 transition-colors disabled:opacity-50">
              <X className="w-4 h-4" /> Clear Logs
            </button>
          </div>
        </div>

        {/* Counter + Pagination (top) */}
        <div className="px-4 py-3 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-slate-600 font-medium">
            Showing <span className="font-mono text-indigo-700">{Math.min(total, offset + filteredLogs.length)}</span> of <span className="font-mono text-indigo-700">{total.toLocaleString()}</span> events
          </span>
          <div className="flex items-center gap-2">
            <select
              value={limit}
              onChange={(e) => { setLimit(Number(e.target.value)); setOffset(0); }}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
              <option value={250}>250 / page</option>
              <option value={500}>500 / page</option>
            </select>
            <button onClick={goPrev} disabled={!canGoPrev || loading} className="p-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" aria-label="Previous page">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <span className="px-2 text-xs text-slate-500 font-mono">
              Page {Math.floor(offset / limit) + 1} of {Math.max(1, Math.ceil(total / limit))}
            </span>
            <button onClick={goNext} disabled={!canGoNext || loading} className="p-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" aria-label="Next page">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>

        {clearStage !== 'idle' && (
          <div className="px-4 py-3 border-b border-red-200 bg-red-50/60 flex flex-wrap items-center gap-3" role="alert">
            <p className="text-xs text-red-800 font-medium flex-1 min-w-[220px]">
              Clearing is permanent and recorded as a tombstone. A pre-clear export just downloaded — type <span className="font-mono font-bold">CLEAR</span> to confirm.
            </p>
            <input
              type="text"
              value={clearReason}
              onChange={(e) => setClearReason(e.target.value)}
              placeholder="Reason (recorded)"
              maxLength={280}
              disabled={clearStage === 'clearing'}
              className="px-3 py-2 border border-red-200 rounded-lg text-xs bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 w-48"
            />
            <input
              type="text"
              value={clearText}
              onChange={(e) => setClearText(e.target.value)}
              placeholder="Type CLEAR"
              disabled={clearStage === 'clearing'}
              aria-label="Type CLEAR to confirm log deletion"
              className="px-3 py-2 border border-red-200 rounded-lg text-xs font-mono bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 w-32"
            />
            <button
              onClick={confirmClear}
              disabled={clearStage === 'clearing'}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
            >
              {clearStage === 'clearing' ? 'Clearing…' : 'Confirm clear'}
            </button>
            <button
              onClick={() => { setClearStage('idle'); setClearError(''); }}
              disabled={clearStage === 'clearing'}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            {clearError && <span className="text-xs font-bold text-red-700 w-full">{clearError}</span>}
          </div>
        )}

        {/* Data Table */}
        <div className="flex-1 overflow-auto bg-slate-50/50">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100/80 text-slate-500 text-xs uppercase tracking-wider sticky top-0 z-10 shadow-sm">
                <th className="px-6 py-4 font-bold border-b border-slate-200">Timestamp</th>
                <th className="px-6 py-4 font-bold border-b border-slate-200">Event Type</th>
                <th className="px-6 py-4 font-bold border-b border-slate-200">User / IP</th>
                <th className="px-6 py-4 font-bold border-b border-slate-200">Page</th>
                <th className="px-6 py-4 font-bold border-b border-slate-200 w-1/3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    No logs found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4 text-xs font-mono text-slate-500 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${SEVERITY_STYLES[severityOf(log.eventType)]}`}>
                        {log.eventType}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-slate-900">{log.user || 'System'}</div>
                      <div className="text-xs text-slate-500 font-mono">{log.ipAddress}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{log.page}</td>
                    <td className="px-6 py-4 text-sm text-slate-700">
                      {log.details}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Counter + Pagination (bottom) */}
        <div className="px-4 py-3 border-t border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-slate-600 font-medium">
            Showing <span className="font-mono text-indigo-700">{Math.min(total, offset + filteredLogs.length)}</span> of <span className="font-mono text-indigo-700">{total.toLocaleString()}</span> events
          </span>
          <div className="flex items-center gap-2">
            <button onClick={goPrev} disabled={!canGoPrev || loading} className="p-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" aria-label="Previous page">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <span className="px-2 text-xs text-slate-500 font-mono">
              Page {Math.floor(offset / limit) + 1} of {Math.max(1, Math.ceil(total / limit))}
            </span>
            <button onClick={goNext} disabled={!canGoNext || loading} className="p-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" aria-label="Next page">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
