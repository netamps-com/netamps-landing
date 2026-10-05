'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  Server,
  Globe,
  Database,
  Cloud,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Calendar,
  Bell,
  Zap,
  TrendingUp,
  ArrowRight,
  ExternalLink,
  Download,
  RefreshCw,
  Filter,
  Search,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Shield,
  Users,
  Settings,
  Info,
  Copy,
  Check
} from 'lucide-react';
import NetampsLogo from '../NetampsLogo';

type StatusType = 'operational' | 'degraded' | 'outage' | 'maintenance';
type IncidentSeverity = 'investigating' | 'identified' | 'monitoring' | 'resolved';

interface Service {
  id: string;
  name: string;
  category: 'Core Infrastructure' | 'Edge/CDN' | 'Application Services' | 'Business Functions';
  status: StatusType;
  uptime: number;
  latency: number;
  lastChecked: Date;
  description: string;
}

interface Incident {
  id: string;
  title: string;
  severity: IncidentSeverity;
  status: StatusType;
  startTime: Date;
  endTime?: Date;
  affectedServices: string[];
  updates: {
    timestamp: Date;
    message: string;
    severity: IncidentSeverity;
  }[];
}

interface MaintenanceWindow {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  affectedServices: string[];
  description: string;
}

export default function StatusPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [maintenanceWindows, setMaintenanceWindows] = useState<MaintenanceWindow[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d' | '90d'>('90d');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [subscribedEmail, setSubscribedEmail] = useState('');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [expandedIncident, setExpandedIncident] = useState<string | null>(null);

  // Mock data loading function - In production, this would come from Cloudflare Workers / KV / D1
  const loadMockData = () => {
    const mockServices: Service[] = [
      {
        id: 'core-1',
        name: 'API Gateway',
        category: 'Core Infrastructure',
        status: 'operational',
        uptime: 99.998,
        latency: 45,
        lastChecked: new Date(),
        description: 'Primary API endpoint for all client requests'
      },
      {
        id: 'core-2',
        name: 'Database Cluster',
        category: 'Core Infrastructure',
        status: 'operational',
        uptime: 99.995,
        latency: 12,
        lastChecked: new Date(),
        description: 'Multi-region PostgreSQL cluster with automatic failover'
      },
      {
        id: 'core-3',
        name: 'Message Queue',
        category: 'Core Infrastructure',
        status: 'operational',
        uptime: 99.999,
        latency: 8,
        lastChecked: new Date(),
        description: 'Redis-based pub/sub for async processing'
      },
      {
        id: 'edge-1',
        name: 'Cloudflare CDN',
        category: 'Edge/CDN',
        status: 'operational',
        uptime: 99.999,
        latency: 23,
        lastChecked: new Date(),
        description: 'Global edge network for static assets and caching'
      },
      {
        id: 'edge-2',
        name: 'DDoS Protection',
        category: 'Edge/CDN',
        status: 'operational',
        uptime: 99.999,
        latency: 0,
        lastChecked: new Date(),
        description: 'Layer 3/4/7 DDoS mitigation'
      },
      {
        id: 'app-1',
        name: 'Web Application',
        category: 'Application Services',
        status: 'operational',
        uptime: 99.997,
        latency: 67,
        lastChecked: new Date(),
        description: 'Next.js web application server'
      },
      {
        id: 'app-2',
        name: 'Authentication Service',
        category: 'Application Services',
        status: 'operational',
        uptime: 99.999,
        latency: 34,
        lastChecked: new Date(),
        description: 'OAuth 2.0 / JWT token management'
      },
      {
        id: 'app-3',
        name: 'Notification Service',
        category: 'Application Services',
        status: 'degraded',
        uptime: 99.980,
        latency: 156,
        lastChecked: new Date(),
        description: 'Email and push notification delivery'
      },
      {
        id: 'business-1',
        name: 'User Dashboard',
        category: 'Business Functions',
        status: 'operational',
        uptime: 99.996,
        latency: 89,
        lastChecked: new Date(),
        description: 'Customer-facing dashboard interface'
      },
      {
        id: 'business-2',
        name: 'Reporting Engine',
        category: 'Business Functions',
        status: 'operational',
        uptime: 99.994,
        latency: 234,
        lastChecked: new Date(),
        description: 'Analytics and reporting generation'
      },
      {
        id: 'business-3',
        name: 'Payment Processing',
        category: 'Business Functions',
        status: 'operational',
        uptime: 99.999,
        latency: 45,
        lastChecked: new Date(),
        description: 'Stripe integration for billing'
      }
    ];

    const mockIncidents: Incident[] = [
      {
        id: 'inc-1',
        title: 'Elevated latency in Notification Service',
        severity: 'monitoring',
        status: 'degraded',
        startTime: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        affectedServices: ['app-3'],
        updates: [
          {
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
            message: 'Investigating elevated latency in notification delivery',
            severity: 'investigating'
          },
          {
            timestamp: new Date(Date.now() - 90 * 60 * 1000),
            message: 'Identified the issue with third-party email provider API',
            severity: 'identified'
          },
          {
            timestamp: new Date(Date.now() - 30 * 60 * 1000),
            message: 'Implemented fallback provider. Monitoring delivery rates',
            severity: 'monitoring'
          }
        ]
      },
      {
        id: 'inc-2',
        title: 'CDN cache invalidation delay',
        severity: 'resolved',
        status: 'operational',
        startTime: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        endTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        affectedServices: ['edge-1'],
        updates: [
          {
            timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
            message: 'Reports of stale content being served from edge locations',
            severity: 'investigating'
          },
          {
            timestamp: new Date(Date.now() - 2.5 * 24 * 60 * 60 * 1000),
            message: 'Issue resolved with cache purge mechanism',
            severity: 'resolved'
          }
        ]
      }
    ];

    const mockMaintenance: MaintenanceWindow[] = [
      {
        id: 'maint-1',
        title: 'Database maintenance - PostgreSQL upgrade',
        startTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        endTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000),
        affectedServices: ['core-2'],
        description: 'Planned upgrade to PostgreSQL 16 with minimal downtime expected'
      }
    ];

    setServices(mockServices);
    setIncidents(mockIncidents);
    setMaintenanceWindows(mockMaintenance);
  };

  // Mock data - In production, this would come from Cloudflare Workers / KV / D1
  useEffect(() => {
    loadMockData();
  }, []);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        loadMockData();
        setLastRefresh(new Date());
      }, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const categories = ['All', 'Core Infrastructure', 'Edge/CDN', 'Application Services', 'Business Functions'];

  const filteredServices = selectedCategory === 'All'
    ? services
    : services.filter(s => s.category === selectedCategory);

  const overallStatus = (): StatusType => {
    if (services.some(s => s.status === 'outage')) return 'outage';
    if (services.some(s => s.status === 'degraded')) return 'degraded';
    if (services.some(s => s.status === 'maintenance')) return 'maintenance';
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

  const getSeverityColor = (severity: IncidentSeverity) => {
    switch (severity) {
      case 'investigating':
        return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
      case 'identified':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/50';
      case 'monitoring':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
      case 'resolved':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50';
    }
  };

  const calculateOverallUptime = () => {
    const avgUptime = services.reduce((sum, s) => sum + s.uptime, 0) / services.length;
    return avgUptime.toFixed(3);
  };

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    // In production, this would subscribe to Cloudflare Workers / email service
    setIsSubscribed(true);
    setSubscribedEmail('');
  };

  const copyPageUrl = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const exportStatusData = () => {
    const data = {
      timestamp: new Date().toISOString(),
      overallStatus: overallStatus(),
      services: services,
      incidents: incidents,
      maintenanceWindows: maintenanceWindows
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `netamps-status-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-[#020817] text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                <NetampsLogo />
              </Link>
              <div className="h-6 w-px bg-slate-700" />
              <h1 className="text-xl font-bold">System Status</h1>
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
              <button
                onClick={exportStatusData}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700 transition-all"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
              <button
                onClick={copyPageUrl}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700 transition-all"
              >
                {copySuccess ? <Check className="w-4 h-4 text-emerald-400" /> <Copy className="w-4 h-4" />}
                {copySuccess ? 'Copied!' : 'Share'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Overall Status Banner */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mb-8 p-6 rounded-2xl border backdrop-blur-xl ${getStatusColor(overallStatus())}`}
        >
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
                  Last updated: {lastRefresh.toLocaleTimeString()}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold">{calculateOverallUptime()}%</div>
              <div className="text-sm opacity-80">Overall Uptime</div>
            </div>
          </div>
        </motion.div>

        {/* Active Incidents */}
        {incidents.filter(i => i.status !== 'operational').length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Active Incidents
            </h3>
            <div className="space-y-4">
              {incidents
                .filter(i => i.status !== 'operational')
                .map(incident => (
                  <div
                    key={incident.id}
                    className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-xl p-6"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h4 className="font-semibold text-lg">{incident.title}</h4>
                        <p className="text-sm text-slate-400 mt-1">
                          Started {incident.startTime.toLocaleString()}
                        </p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getSeverityColor(incident.severity)}`}>
                        {incident.severity.charAt(0).toUpperCase() + incident.severity.slice(1)}
                      </span>
                    </div>
                    <button
                      onClick={() => setExpandedIncident(expandedIncident === incident.id ? null : incident.id)}
                      className="text-sm text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                    >
                      {expandedIncident === incident.id ? (
                        <>
                          <ChevronUp className="w-4 h-4" />
                          Hide updates
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-4 h-4" />
                          View {incident.updates.length} updates
                        </>
                      )}
                    </button>
                    <AnimatePresence>
                      {expandedIncident === incident.id && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-4 space-y-3"
                        >
                          {incident.updates.map((update, idx) => (
                            <div
                              key={idx}
                              className="pl-4 border-l-2 border-slate-700 relative"
                            >
                              <div className="absolute -left-2 top-0 w-4 h-4 rounded-full bg-slate-800 border-2 border-slate-600" />
                              <div className="text-xs text-slate-500 mb-1">
                                {update.timestamp.toLocaleString()}
                              </div>
                              <p className="text-sm">{update.message}</p>
                            </div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
            </div>
          </motion.div>
        )}

        {/* Services Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Server className="w-5 h-5 text-slate-400" />
              Service Status
            </h3>
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {categories.map(category => (
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

          <div className="grid gap-4">
            {filteredServices.map(service => (
              <motion.div
                key={service.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {getStatusIcon(service.status)}
                      <h4 className="font-semibold">{service.name}</h4>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getStatusColor(service.status)}`}>
                        {service.status.charAt(0).toUpperCase() + service.status.slice(1)}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400 mb-3">{service.description}</p>
                    <div className="flex items-center gap-6 text-xs text-slate-500">
                      <div className="flex items-center gap-1">
                        <Activity className="w-3 h-3" />
                        {service.uptime.toFixed(3)}% uptime
                      </div>
                      <div className="flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        {service.latency}ms latency
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {service.lastChecked.toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 px-2 py-1 bg-slate-800 rounded">
                      {service.category}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Historical Incidents */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-8"
        >
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-slate-400" />
            Incident History
          </h3>
          <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              {(['24h', '7d', '30d', '90d'] as const).map(range => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    timeRange === range
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                      : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
            <div className="space-y-3">
              {incidents.map(incident => (
                <div
                  key={incident.id}
                  className="flex items-start gap-4 p-4 bg-slate-800/50 rounded-lg"
                >
                  <div className="mt-1">{getStatusIcon(incident.status)}</div>
                  <div className="flex-1">
                    <h4 className="font-medium">{incident.title}</h4>
                    <p className="text-sm text-slate-400 mt-1">
                      {incident.startTime.toLocaleString()} - {incident.endTime ? incident.endTime.toLocaleString() : 'Ongoing'}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium border ${getSeverityColor(incident.severity)}`}>
                    {incident.severity.charAt(0).toUpperCase() + incident.severity.slice(1)}
                  </span>
                </div>
              ))}
              {incidents.length === 0 && (
                <div className="text-center py-8 text-slate-500">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No incidents in this time period</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Upcoming Maintenance */}
        {maintenanceWindows.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mb-8"
          >
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-400" />
              Scheduled Maintenance
            </h3>
            <div className="space-y-4">
              {maintenanceWindows.map(maintenance => (
                <div
                  key={maintenance.id}
                  className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-6"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="font-semibold">{maintenance.title}</h4>
                      <p className="text-sm text-slate-400 mt-1">{maintenance.description}</p>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/50">
                      Scheduled
                    </span>
                  </div>
                  <div className="flex items-center gap-6 text-sm text-slate-400">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {maintenance.startTime.toLocaleString()}
                    </div>
                    <div className="flex items-center gap-1">
                      <ArrowRight className="w-4 h-4" />
                      {maintenance.endTime.toLocaleString()}
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-xs text-slate-500 mb-2">Affected services:</div>
                    <div className="flex flex-wrap gap-2">
                      {maintenance.affectedServices.map(serviceId => {
                        const service = services.find(s => s.id === serviceId);
                        return service ? (
                          <span
                            key={serviceId}
                            className="px-2 py-1 bg-slate-800 rounded text-xs"
                          >
                            {service.name}
                          </span>
                        ) : null;
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Subscribe to Updates */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-xl p-6"
        >
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Bell className="w-5 h-5 text-slate-400" />
            Subscribe to Status Updates
          </h3>
          {isSubscribed ? (
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
              <span>You're subscribed to status updates</span>
            </div>
          ) : (
            <form onSubmit={handleSubscribe} className="flex gap-3">
              <input
                type="email"
                value={subscribedEmail}
                onChange={(e) => setSubscribedEmail(e.target.value)}
                placeholder="Enter your email"
                required
                className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
              <button
                type="submit"
                className="px-6 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold rounded-lg transition-all"
              >
                Subscribe
              </button>
            </form>
          )}
          <p className="text-xs text-slate-500 mt-3">
            Get notified about incidents and maintenance windows via email
          </p>
        </motion.div>

        {/* API Status Endpoint */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-8 bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-xl p-6"
        >
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <ExternalLink className="w-5 h-5 text-slate-400" />
            API Status Endpoint
          </h3>
          <div className="bg-slate-800 rounded-lg p-4 font-mono text-sm text-slate-300">
            <code>GET /api/status</code>
          </div>
          <p className="text-sm text-slate-400 mt-3">
            Machine-readable status data for monitoring integrations and third-party tools
          </p>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 mt-16 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between text-sm text-slate-500">
            <div className="flex items-center gap-4">
              <Link href="/" className="hover:text-slate-300 transition-colors">
                Back to Home
              </Link>
              <Link href="/login" className="hover:text-slate-300 transition-colors">
                Login
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              <span>Powered by Cloudflare Pages + Workers</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
