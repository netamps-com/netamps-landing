import { NextResponse } from 'next/server';

type StatusType = 'operational' | 'degraded' | 'outage' | 'maintenance';
type IncidentSeverity = 'investigating' | 'identified' | 'monitoring' | 'resolved';

interface Service {
  id: string;
  name: string;
  category: 'Core Infrastructure' | 'Edge/CDN' | 'Application Services' | 'Business Functions';
  status: StatusType;
  uptime: number;
  latency: number;
  lastChecked: string;
  description: string;
}

interface IncidentUpdate {
  timestamp: string;
  message: string;
  severity: IncidentSeverity;
}

interface Incident {
  id: string;
  title: string;
  severity: IncidentSeverity;
  status: StatusType;
  startTime: string;
  endTime?: string;
  affectedServices: string[];
  updates: IncidentUpdate[];
}

interface MaintenanceWindow {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  affectedServices: string[];
  description: string;
}

interface StatusResponse {
  timestamp: string;
  overallStatus: StatusType;
  overallUptime: string;
  services: Service[];
  incidents: Incident[];
  maintenanceWindows: MaintenanceWindow[];
}

export async function GET() {
  // In production, this would fetch from Cloudflare KV / D1 / Workers
  const now = new Date().toISOString();

  const services: Service[] = [
    {
      id: 'core-1',
      name: 'API Gateway',
      category: 'Core Infrastructure',
      status: 'operational',
      uptime: 99.998,
      latency: 45,
      lastChecked: now,
      description: 'Primary API endpoint for all client requests'
    },
    {
      id: 'core-2',
      name: 'Database Cluster',
      category: 'Core Infrastructure',
      status: 'operational',
      uptime: 99.995,
      latency: 12,
      lastChecked: now,
      description: 'Multi-region PostgreSQL cluster with automatic failover'
    },
    {
      id: 'core-3',
      name: 'Message Queue',
      category: 'Core Infrastructure',
      status: 'operational',
      uptime: 99.999,
      latency: 8,
      lastChecked: now,
      description: 'Redis-based pub/sub for async processing'
    },
    {
      id: 'edge-1',
      name: 'Cloudflare CDN',
      category: 'Edge/CDN',
      status: 'operational',
      uptime: 99.999,
      latency: 23,
      lastChecked: now,
      description: 'Global edge network for static assets and caching'
    },
    {
      id: 'edge-2',
      name: 'DDoS Protection',
      category: 'Edge/CDN',
      status: 'operational',
      uptime: 99.999,
      latency: 0,
      lastChecked: now,
      description: 'Layer 3/4/7 DDoS mitigation'
    },
    {
      id: 'app-1',
      name: 'Web Application',
      category: 'Application Services',
      status: 'operational',
      uptime: 99.997,
      latency: 67,
      lastChecked: now,
      description: 'Next.js web application server'
    },
    {
      id: 'app-2',
      name: 'Authentication Service',
      category: 'Application Services',
      status: 'operational',
      uptime: 99.999,
      latency: 34,
      lastChecked: now,
      description: 'OAuth 2.0 / JWT token management'
    },
    {
      id: 'app-3',
      name: 'Notification Service',
      category: 'Application Services',
      status: 'degraded',
      uptime: 99.980,
      latency: 156,
      lastChecked: now,
      description: 'Email and push notification delivery'
    },
    {
      id: 'business-1',
      name: 'User Dashboard',
      category: 'Business Functions',
      status: 'operational',
      uptime: 99.996,
      latency: 89,
      lastChecked: now,
      description: 'Customer-facing dashboard interface'
    },
    {
      id: 'business-2',
      name: 'Reporting Engine',
      category: 'Business Functions',
      status: 'operational',
      uptime: 99.994,
      latency: 234,
      lastChecked: now,
      description: 'Analytics and reporting generation'
    },
    {
      id: 'business-3',
      name: 'Payment Processing',
      category: 'Business Functions',
      status: 'operational',
      uptime: 99.999,
      latency: 45,
      lastChecked: now,
      description: 'Stripe integration for billing'
    }
  ];

  const incidents: Incident[] = [
    {
      id: 'inc-1',
      title: 'Elevated latency in Notification Service',
      severity: 'monitoring',
      status: 'degraded',
      startTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      affectedServices: ['app-3'],
      updates: [
        {
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          message: 'Investigating elevated latency in notification delivery',
          severity: 'investigating'
        },
        {
          timestamp: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
          message: 'Identified the issue with third-party email provider API',
          severity: 'identified'
        },
        {
          timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
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
      startTime: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      endTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      affectedServices: ['edge-1'],
      updates: [
        {
          timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          message: 'Reports of stale content being served from edge locations',
          severity: 'investigating'
        },
        {
          timestamp: new Date(Date.now() - 2.5 * 24 * 60 * 60 * 1000).toISOString(),
          message: 'Issue resolved with cache purge mechanism',
          severity: 'resolved'
        }
      ]
    }
  ];

  const maintenanceWindows: MaintenanceWindow[] = [
    {
      id: 'maint-1',
      title: 'Database maintenance - PostgreSQL upgrade',
      startTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      endTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString(),
      affectedServices: ['core-2'],
      description: 'Planned upgrade to PostgreSQL 16 with minimal downtime expected'
    }
  ];

  const overallStatus: StatusType = services.some(s => s.status === 'outage')
    ? 'outage'
    : services.some(s => s.status === 'degraded')
    ? 'degraded'
    : services.some(s => s.status === 'maintenance')
    ? 'maintenance'
    : 'operational';

  const avgUptime = services.reduce((sum, s) => sum + s.uptime, 0) / services.length;

  const response: StatusResponse = {
    timestamp: now,
    overallStatus,
    overallUptime: avgUptime.toFixed(3),
    services,
    incidents,
    maintenanceWindows
  };

  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
