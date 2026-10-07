import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, Download, Filter, FileText, Database } from 'lucide-react';
import type { AuditLog } from '../lib/logger';

interface LogViewerModalProps {
  onClose: () => void;
}

export default function LogViewerModal({ onClose }: LogViewerModalProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [pageFilter, setPageFilter] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc'|'asc'>('desc');

  useEffect(() => {
    const fetchLogs = async () => {
      const { getLogs } = await import('../lib/logger');
      setLogs(getLogs());
    };
    fetchLogs();
  }, []);

  const filteredLogs = useMemo(() => {
    return logs
      .filter(log => 
        (searchTerm === '' || log.eventType.toLowerCase().includes(searchTerm.toLowerCase()) || log.details.toLowerCase().includes(searchTerm.toLowerCase()) || log.user?.toLowerCase().includes(searchTerm.toLowerCase())) &&
        (dateFilter === '' || log.timestamp.startsWith(dateFilter)) &&
        (pageFilter === '' || log.page === pageFilter)
      )
      .sort((a, b) => sortOrder === 'desc' 
        ? new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        : new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
  }, [logs, searchTerm, dateFilter, pageFilter, sortOrder]);

  const uniquePages = Array.from(new Set(logs.map(l => l.page)));

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
    const headers = ['ID', 'Timestamp', 'Event Type', 'Page', 'User', 'IP Address', 'Details'];
    const rows = filteredLogs.map(l => [
      l.id, l.timestamp, l.eventType, l.page, l.user || '', l.ipAddress || '', `"${l.details.replace(/"/g, '""')}"`
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join("\n");
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", encodeURI(csvContent));
    downloadAnchorNode.setAttribute("download", "security_audit_logs.csv");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
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
              Data is securely retrieved from PostgreSQL / Cloudflare R2 proxy. Stores logs up to 1 year or 500MB.
            </p>
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
                className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64"
              />
            </div>
            <input 
              type="date" 
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <select 
              value={pageFilter}
              onChange={(e) => setPageFilter(e.target.value)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">All Pages</option>
              {uniquePages.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select 
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'asc'|'desc')}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
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
          </div>
        </div>

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
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold
                        ${log.eventType.includes('SUCCESS') ? 'bg-emerald-100 text-emerald-800' : 
                          log.eventType.includes('FAILED') || log.eventType.includes('ERROR') ? 'bg-red-100 text-red-800' : 
                          'bg-indigo-100 text-indigo-800'}`}>
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
      </div>
    </div>
  );
}
