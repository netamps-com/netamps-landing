'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogOut, Package, Search, Filter, ArchiveX, Key, X, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Tag, FileImage, Video, Mail, Database, Server, Wifi, HardDrive, Cpu, Zap, ExternalLink, RefreshCw } from 'lucide-react';
import NetampsLogo from '../NetampsLogo';
import UserManagementModal from './UserManagementModal';
import LogViewerModal from './LogViewerModal';

interface ProductItem {
  id: string;
  strategicTarget?: 'resale' | 'compliance';
  lifecycleAge?: string;
  category: string;
  details: string;
  quantity: number;
  price?: number;
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
}

const statusColors = {
  operational: 'bg-emerald-500 text-emerald-400',
  degraded: 'bg-amber-500 text-amber-400',
  maintenance: 'bg-blue-500 text-blue-400',
  outage: 'bg-red-500 text-red-400',
  unknown: 'bg-slate-500 text-slate-400'
};

const HealthStatusWidget = ({ status, loading }: { status: any; loading: boolean }) => {
  if (loading || !status) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700">
        <div className="w-2 h-2 rounded-full bg-slate-500 animate-pulse"></div>
        <span className="text-xs text-slate-400">Loading health...</span>
      </div>
    );
  }

  const getOverallStatus = () => {
    const statuses = [status.database?.status, status.api?.status, status.payload?.status, status.cdn?.status].filter(Boolean);
    if (statuses.includes('outage')) return 'outage';
    if (statuses.includes('degraded')) return 'degraded';
    if (statuses.includes('maintenance')) return 'maintenance';
    return 'operational';
  };

  const overall = getOverallStatus();

  return (
    <div className="relative flex items-center gap-3">
      {/* Overall Status Indicator */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors"
        style={{ 
          backgroundColor: overall === 'operational' ? 'rgba(16, 185, 129, 0.1)' : 
                          overall === 'degraded' ? 'rgba(245, 158, 11, 0.1)' :
                          overall === 'outage' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)',
          borderColor: overall === 'operational' ? 'rgba(16, 185, 129, 0.3)' : 
                      overall === 'degraded' ? 'rgba(245, 158, 11, 0.3)' :
                      overall === 'outage' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(59, 130, 246, 0.3)'
        }}>
        <div className={`w-2 h-2 rounded-full animate-ping ${overall === 'operational' ? 'bg-emerald-500' : 
                          overall === 'degraded' ? 'bg-amber-500' :
                          overall === 'outage' ? 'bg-red-500' : 'bg-blue-500'}`}></div>
        <span className={`text-xs font-bold ${overall === 'operational' ? 'text-emerald-400' : 
                          overall === 'degraded' ? 'text-amber-400' :
                          overall === 'outage' ? 'text-red-400' : 'text-blue-400'}`}>
          {overall.charAt(0).toUpperCase() + overall.slice(1)}
        </span>
      </div>

      {/* Detailed Status Dropdown */}
      <div className="relative">
        <button 
          className="flex items-center gap-1 px-2 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors"
          onClick={(e) => { e.stopPropagation(); }}
        >
          <Server className="w-3.5 h-3.5 text-slate-400" />
        </button>
        
        {/* Tooltip/Popover with detailed metrics */}
        <div className="absolute right-0 top-full mt-2 z-50 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200">
          <div className="p-3 border-b border-slate-700">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
              Live System Metrics
            </h4>
            <p className="text-[10px] text-slate-500 mt-1">Updated: {new Date(status.lastUpdated).toLocaleTimeString()}</p>
          </div>
          
          <div className="p-3 space-y-3">
            {/* Database */}
            <div className="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${statusColors[status.database?.status as keyof typeof statusColors] || statusColors.unknown} split x`}></div>
                <span className="text-xs font-medium text-slate-200">Database</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono text-emerald-400">{status.database?.latency}ms</span>
                <span className="text-[10px] text-slate-500 ml-1">{status.database?.uptime}% uptime</span>
              </div>
            </div>

            {/* API */}
            <div className="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${statusColors[status.api?.status as keyof typeof statusColors] || statusColors.unknown} split x`}></div>
                <span className="text-xs font-medium text-slate-200">API Gateway</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono text-emerald-400">{status.api?.latency}ms</span>
                <span className="text-[10px] text-slate-500 ml-1">{status.api?.uptime}% uptime</span>
              </div>
            </div>

            {/* Payload/Website Traffic */}
            <div className="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${statusColors[status.payload?.status as keyof typeof statusColors] || statusColors.unknown} split x`}></div>
                <span className="text-xs font-medium text-slate-200">Website Payload</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono text-indigo-400">{status.payload?.requestsPerMin}/min</span>
                <span className="text-[10px] text-slate-500 ml-1">{status.payload?.avgLatency}ms avg • {status.payload?.errorRate}% errors</span>
              </div>
            </div>

            {/* CDN */}
            <div className="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${statusColors[status.cdn?.status as keyof typeof statusColors] || statusColors.unknown} split x`}></div>
                <span className="text-xs font-medium text-slate-200">Edge CDN</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono text-emerald-400">{status.cdn?.latency}ms</span>
                <span className="text-[10px] text-slate-500 ml-1">{status.cdn?.cacheHitRate}% cache hit</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function DashboardPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  
  // Real-time health monitoring
  const [healthStatus, setHealthStatus] = useState<{
    database: { status: string; latency: number; uptime: number };
    api: { status: string; latency: number; uptime: number };
    payload: { status: string; requestsPerMin: number; avgLatency: number; errorRate: number };
    cdn: { status: string; latency: number; cacheHitRate: number };
    lastUpdated: string;
  } | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  
  // Modals
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);

  // Fetch real-time health status
  const fetchHealthStatus = useCallback(async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${API_URL}/api/health/live`);
      if (res.ok) {
        const data = await res.json();
        setHealthStatus(data);
      }
    } catch (err) {
      console.error('Health check failed:', err);
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealthStatus();
    const interval = setInterval(fetchHealthStatus, 30000); // Every 30 seconds
    return () => clearInterval(interval);
  }, [fetchHealthStatus]);

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
        const fetchReturns = async () => {
          try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
            const res = await fetch(`${API_URL}/api/returns`);
            const data = await res.json();
            if (data.success && data.returns.length > 0) {
              setReturns(data.returns);
              localStorage.setItem('netamps_returns', JSON.stringify(data.returns));
            } else {
              loadFallback();
            }
          } catch(e) {
            loadFallback();
          }
        };

        const loadFallback = () => {
          const stored = localStorage.getItem('netamps_returns');
          if (stored) {
            try {
              setReturns(JSON.parse(stored));
            } catch (e) {}
          }
        };
        fetchReturns();
      }
    };

    checkAuth();
  }, [router]);

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
    const price = parseFloat(newPrice);
    
    const updatedReturns = returns.map(req => {
      if (req.id === reqId) {
        return {
          ...req,
          products: req.products.map(p => p.id === productId ? { ...p, price: isNaN(price) ? undefined : price } : p)
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
        body: JSON.stringify({ id: reqId, action: 'price', productId, price: isNaN(price) ? null : price })
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
          intent: req.intent
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
              {/* Real-time Health Status Widget */}
              <HealthStatusWidget status={healthStatus} loading={healthLoading} />
              
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
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input type="text" placeholder="Search orders..." className="pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500 w-64" />
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
                                              <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Unit Price (INR)</label>
                                              <div className="relative">
                                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                                                <input
                                                  type="number"
                                                  min="0"
                                                  disabled={userRole !== 'admin@netamps.com'}
                                                  value={product.price || ''}
                                                  onChange={(e) => handlePriceChange(req.id, product.id, e.target.value)}
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
                                      </div>
                                    ))
                                  ) : (
                                    <div className="text-sm text-slate-500 italic">No products listed. (Legacy request)</div>
                                  )}
                                </div>
                                
                                {/* Asset Photos Section */}
                                {req.attachedFiles && req.attachedFiles.length > 0 && (
                                  <div className="mt-6">
                                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                                      <FileImage className="w-4 h-4" /> Attached Attach asset details of any type below ({req.attachedFiles.length})
                                    </h4>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                      {req.attachedFiles.map((fileKey, idx) => {
                                        const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL || '/api/cdn';
                                        const isDataUri = fileKey.startsWith('data:');
                                        const fileUrl = isDataUri ? fileKey : `${cdnUrl}/${fileKey}`;
                                        const isVideo = isDataUri ? fileKey.startsWith('data:video') : (fileKey.endsWith('.mp4') || fileKey.endsWith('.webm'));
                                        return (
                                          <a key={idx} href={fileUrl} target="_blank" rel="noopener noreferrer" className="relative group block aspect-square rounded-xl overflow-hidden border border-slate-700 bg-slate-800/50 flex items-center justify-center hover:border-indigo-500 transition-colors">
                                            {isVideo ? (
                                              <video src={fileUrl} controls preload="none" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                            ) : (
                                              <img src={fileUrl} alt="Attach asset details of any type below" loading="lazy" decoding="async" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                            )}
                                          </a>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                <div className="mt-6 flex gap-3 border-t border-slate-800 pt-4 items-center">
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
                                      onClick={(e) => { e.stopPropagation(); handleUpdateStatus(req.id, 'Approved'); }}
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
