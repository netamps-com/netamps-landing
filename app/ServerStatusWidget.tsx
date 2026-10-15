'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Zap, Wifi, WifiOff, Radio, ExternalLink } from 'lucide-react';

type InfraStatus = 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'CHECKING';

interface InfraNode {
  label: string;
  status: InfraStatus;
  latency: number | null;
}

export default function ServerStatusWidget() {
  const [loadTime, setLoadTime] = useState<number | string>('---');

  // Real browser online/offline state
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [networkType, setNetworkType] = useState<string>('');

  // Server infrastructure health states
  const [infraNodes, setInfraNodes] = useState<InfraNode[]>([
    { label: 'WEB_SRV', status: 'CHECKING', latency: null },
    { label: 'CDN_EDGE', status: 'CHECKING', latency: null },
  ]);

  const pingRef = useRef<NodeJS.Timeout | null>(null);

  // Probe a URL and measure round-trip latency
  const probeEndpoint = async (url: string): Promise<{ ok: boolean; latency: number }> => {
    const start = performance.now();
    try {
      await fetch(url, { method: 'HEAD', cache: 'no-store', mode: 'no-cors' });
      const latency = Math.round(performance.now() - start);
      return { ok: true, latency };
    } catch {
      return { ok: false, latency: -1 };
    }
  };

  const classifyStatus = (ok: boolean, latency: number): InfraStatus => {
    if (!ok) return 'OFFLINE';
    if (latency > 500) return 'DEGRADED';
    return 'ONLINE';
  };

  const runInfraCheck = async () => {
    const [webResult, cdnResult] = await Promise.all([
      probeEndpoint('https://netamps.com'),
      probeEndpoint('https://www.cloudflare.com'),
    ]);

    setInfraNodes([
      {
        label: 'WEB_SRV',
        status: classifyStatus(webResult.ok, webResult.latency),
        latency: webResult.ok ? webResult.latency : null,
      },
      {
        label: 'CDN_EDGE',
        status: classifyStatus(cdnResult.ok, cdnResult.latency),
        latency: cdnResult.ok ? cdnResult.latency : null,
      },
    ]);
  };

  useEffect(() => {
    // 1. Browser online/offline detection via Network Information API
    const updateOnlineStatus = () => {
      setIsOnline(navigator.onLine);
      const nav = navigator as Navigator & { connection?: { effectiveType?: string } };
      if (nav.connection?.effectiveType) {
        setNetworkType(nav.connection.effectiveType.toUpperCase());
      }
    };
    updateOnlineStatus();
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    // 2. Browser Performance API — real DOM load time
    if (typeof window !== 'undefined' && window.performance) {
      const updateLoadTime = () => {
        const navEntries = window.performance.getEntriesByType('navigation');
        if (navEntries.length > 0) {
          const navEntry = navEntries[0] as PerformanceNavigationTiming;
          setLoadTime(navEntry.loadEventEnd > 0
            ? Math.round(navEntry.loadEventEnd - navEntry.startTime)
            : Math.round(window.performance.now()));
        }
      };
      document.readyState === 'complete' ? updateLoadTime() : window.addEventListener('load', updateLoadTime);
    }

    // 3. Active server health probing every 30 seconds
    runInfraCheck();
    pingRef.current = setInterval(runInfraCheck, 30000);

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
      if (pingRef.current) clearInterval(pingRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusColor: Record<InfraStatus, string> = {
    ONLINE:   'text-emerald-600',
    DEGRADED: 'text-amber-600',
    OFFLINE:  'text-red-600',
    CHECKING: 'text-slate-500',
  };
  const dotColor: Record<InfraStatus, string> = {
    ONLINE:   'bg-emerald-500',
    DEGRADED: 'bg-amber-500',
    OFFLINE:  'bg-red-500',
    CHECKING: 'bg-slate-500',
  };

  return (
    <div className="hidden lg:flex items-center bg-white/90 backdrop-blur-xl border border-slate-200 rounded-lg shadow-inner overflow-hidden font-mono text-[9px] uppercase tracking-[0.2em] divide-x divide-slate-200 cursor-crosshair">

      {/* ── WEBSITE ONLINE/OFFLINE STATUS ── */}
      <div className={`flex items-center gap-2 px-3 py-1.5 transition-colors ${isOnline ? 'bg-slate-50' : 'bg-red-50'}`}>
        <div className="relative flex items-center justify-center w-2 h-2">
          <div className={`absolute inset-0 ${isOnline ? 'bg-emerald-500' : 'bg-red-500'} rounded-full ${isOnline ? 'animate-ping' : ''} opacity-75`}></div>
          <div className={`relative ${isOnline ? 'bg-emerald-500' : 'bg-red-500'} w-1 h-1 rounded-full`}></div>
        </div>
        {isOnline
          ? <Wifi className="w-3 h-3 text-emerald-600" />
          : <WifiOff className="w-3 h-3 text-red-600" />
        }
        <span className="font-bold text-slate-600">
          NET: <span className={isOnline ? 'text-emerald-600' : 'text-red-600'}>{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
        </span>
        {isOnline && networkType && (
          <span className="text-cyan-600 font-black">{networkType}</span>
        )}
      </div>

      {/* ── SERVER INFRASTRUCTURE NODES ── */}
      {infraNodes.map((node) => (
        <div key={node.label} className="flex items-center gap-1.5 px-3 py-1.5 text-slate-500 group">
          <Radio className="w-3 h-3 text-slate-600 group-hover:text-slate-700 transition-colors" />
          <span className="font-black text-slate-500 group-hover:text-slate-800 transition-colors">{node.label}</span>
          <div className="relative flex items-center justify-center w-1.5 h-1.5">
            {node.status === 'ONLINE' && <div className={`absolute inset-0 ${dotColor[node.status]} rounded-full animate-ping opacity-50`}></div>}
            <div className={`relative ${dotColor[node.status]} w-1.5 h-1.5 rounded-full`}></div>
          </div>
          <span className={`font-bold ${statusColor[node.status]}`}>
            {node.status === 'CHECKING' ? '...' : node.status}
          </span>
          {node.latency !== null && (
            <span className="text-slate-600 font-bold">{node.latency}ms</span>
          )}
        </div>
      ))}

      {/* ── BROWSER PERFORMANCE API (DOM LOAD, measured) ── */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-slate-500 group bg-slate-50">
        <Zap className="w-3 h-3 text-fuchsia-500 group-hover:text-fuchsia-400 transition-colors" />
        <span className="font-black text-slate-500 group-hover:text-slate-800 transition-colors">DOM_LOAD:</span>
        <span className="text-fuchsia-500 font-bold tracking-tighter drop-shadow-md group-hover:text-fuchsia-400">{loadTime}ms</span>
      </div>

      {/* ── STATUS PAGE LINK ── */}
      <Link
        href="/status"
        className="flex items-center gap-1.5 px-3 py-1.5 text-slate-500 hover:text-emerald-600 hover:bg-slate-100 transition-all cursor-pointer"
        title="View System Status Page"
      >
        <ExternalLink className="w-3 h-3" />
        <span className="font-bold">STATUS</span>
      </Link>

    </div>
  );
}
