'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { motion } from "motion/react";
import {
  Server,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Zap,
  RefreshCw
} from 'lucide-react';
import NetampsLogo from '../NetampsLogo';

type StatusType = 'operational' | 'degraded' | 'outage' | 'maintenance';

type ServiceCategory = 'Core Infrastructure' | 'Edge/CDN';

interface Service {
  id: string;
  name: string;
  category: ServiceCategory;
  status: StatusType;
  latency: number | null; // measured per request; null = probe failed
  lastChecked: Date;
  description: string;
  note?: string; // probe error detail (e.g. binding not attached)
}

const CATEGORIES: Array<'All' | ServiceCategory> = [
  'All',
  'Core Infrastructure',
  'Edge/CDN'
];

const CATEGORY_META: Record<ServiceCategory, { icon: string; blurb: string }> = {
  'Core Infrastructure': {
    icon: 'server',
    blurb: 'Functions runtime, database and mail delivery — probed live.'
  },
  'Edge/CDN': {
    icon: 'globe',
    blurb: 'Edge storage and bot defense — probed live.'
  }
};

export default function StatusPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<'All' | ServiceCategory>('All');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  // Feed health: false until the first successful /api/status read. While
  // false with zero services the banner renders neutral "unavailable" —
  // never green-by-default. Cached rows (if any) are marked stale.
  const [feedOk, setFeedOk] = useState(false);
  const [sessionId] = useState(() =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/status', { cache: 'no-store' });
      if (!res.ok) throw new Error('status api failed');
      const data = await res.json();
      const allowed: ServiceCategory[] = ['Core Infrastructure', 'Edge/CDN'];
      const mapped: Service[] = (data.services ?? [])
        .filter((s: Service) => allowed.includes(s.category))
        .map((s: Service & { lastChecked: string }) => ({
          ...s,
          latency: typeof s.latency === 'number' ? s.latency : null,
          lastChecked: new Date(s.lastChecked)
        }));
      if (mapped.length > 0) {
        setServices(mapped);
        setFeedOk(true);
        setLastRefresh(new Date());
        return;
      }
      throw new Error('status feed empty');
    } catch {
      // No static fallback: an unreachable feed renders "unavailable", never
      // a green snapshot. Previously cached rows (if any) stay with a stale flag.
      setFeedOk(false);
      setLastRefresh(new Date());
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    try {
      sessionStorage.setItem('netamps_sid', sessionId);
    } catch {
      // storage unavailable — links still carry ?sid=
    }
  }, [sessionId]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadData();
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadData]);

  const filteredServices =
    selectedCategory === 'All' ? services : services.filter((s) => s.category === selectedCategory);

  const overallStatus = (): StatusType => {
    if (services.some((s) => s.status === 'outage')) return 'outage';
    if (services.some((s) => s.status === 'degraded')) return 'degraded';
    if (services.some((s) => s.status === 'maintenance')) return 'maintenance';
    return 'operational';
  };

  const getStatusIcon = (status: StatusType) => {
    switch (status) {
      case 'operational':
        return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
      case 'degraded':
        return <AlertTriangle className="w-5 h-5 text-amber-400" />;
      case 'outage':
        return <XCircle className="w-5 h-5 text-red-400" />;
      case 'maintenance':
        return <Clock className="w-5 h-5 text-blue-400" />;
    }
  };

  const getStatusColor = (status: StatusType) => {
    switch (status) {
      case 'operational':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50';
      case 'degraded':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/50';
      case 'outage':
        return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'maintenance':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
    }
  };

  const operationalCount = services.filter((s) => s.status === 'operational').length;

  const bannerTone =
    !feedOk && services.length === 0
      ? 'bg-slate-800/60 text-slate-300 border-slate-700'
      : getStatusColor(overallStatus());

  const grouped = (['Core Infrastructure', 'Edge/CDN'] as ServiceCategory[])
    .map((cat) => ({
      category: cat,
      items: filteredServices.filter((s) => s.category === cat)
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="min-h-screen bg-[#020817] text-white">
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                <NetampsLogo />
              </Link>
              <span className="sr-only">System Status</span>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  autoRefresh
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
                Auto-refresh
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mb-8 p-6 rounded-2xl border backdrop-blur-xl ${bannerTone}`}
        >
          {!feedOk && services.length === 0 ? (
            <div className="flex items-center gap-4">
              <Clock className="w-8 h-8 text-slate-400 shrink-0" />
              <div>
                <h2 className="text-2xl font-bold">Status feed unavailable</h2>
                <p className="text-sm opacity-80 mt-1">
                  Live checks unreachable — retrying. Last attempt: {lastRefresh.toLocaleTimeString()} · Source: /api/status · Refresh: 30s
                </p>
              </div>
            </div>
          ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="scale-150">{getStatusIcon(overallStatus())}</div>
              <div>
                <h2 className="text-2xl font-bold">
                  {overallStatus() === 'operational' && 'All Systems Operational'}
                  {overallStatus() === 'degraded' && 'Some Systems Degraded'}
                  {overallStatus() === 'outage' && 'System Outage Detected'}
                  {overallStatus() === 'maintenance' && 'Scheduled Maintenance'}
                </h2>
                <p className="text-sm opacity-80 mt-1">
                  Last updated: {lastRefresh.toLocaleTimeString()} · Source: /api/status · Refresh: 30s{!feedOk ? ' · showing last known (stale)' : ''}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold">{operationalCount}/{services.length}</div>
              <div className="text-sm opacity-80">Services Operational</div>
            </div>
          </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Server className="w-5 h-5 text-slate-400" />
              Service Status
            </h3>
            <div className="flex items-center gap-2">
              <div className="flex gap-1 flex-wrap">
                {CATEGORIES.map((category) => (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      selectedCategory === category
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                        : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {grouped.map((group) => (
            <div key={group.category} className="mb-6">
              <div className="flex items-baseline justify-between mb-3">
                <h4 className="text-md font-semibold text-slate-200">{group.category}</h4>
                <p className="text-xs text-slate-500">{CATEGORY_META[group.category].blurb}</p>
              </div>
              <div className="grid gap-4">
                {group.items.map((service) => (
                  <motion.div
                    key={service.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          {getStatusIcon(service.status)}
                          <h4 className="font-semibold">{service.name}</h4>
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium border ${getStatusColor(
                              service.status
                            )}`}
                          >
                            {service.status.charAt(0).toUpperCase() + service.status.slice(1)}
                          </span>
                        </div>
                        <p className="text-sm text-slate-400 mb-3">{service.description}</p>
                        {service.note && (
                          <p className="text-[11px] font-mono text-amber-300/80 mb-3 truncate" title={service.note}>
                            Probe note: {service.note}
                          </p>
                        )}
                        <div className="flex items-center gap-6 text-xs text-slate-500 flex-wrap">
                          <div className="flex items-center gap-1">
                            <Zap className="w-3 h-3" />
                            {service.latency === null || service.latency === undefined ? 'latency unknown' : `${service.latency}ms latency (measured)`}
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {service.lastChecked.toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 px-2 py-1 bg-slate-800 rounded whitespace-nowrap">
                          {service.category}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </motion.div>
      </main>

      <footer className="border-t border-slate-800 mt-16 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between text-sm text-slate-500">
            <div className="flex items-center gap-4">
              <Link href="/" className="hover:text-slate-300 transition-colors">
                Back to Home
              </Link>
              <Link href={`/login?sid=${sessionId}`} className="hover:text-slate-300 transition-colors">
                Login
              </Link>
              <Link href={`/returns?sid=${sessionId}`} className="hover:text-slate-300 transition-colors">
                Returns
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <span>© {new Date().getFullYear()} Netamps Technologies</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
