import { NextResponse } from 'next/server';

type StatusType = 'operational' | 'degraded' | 'outage' | 'maintenance';

interface Service {
  id: string;
  name: string;
  category: 'Core Infrastructure' | 'Edge/CDN' | 'Monitoring Services';
  status: StatusType;
  uptime: number;
  latency: number;
  lastChecked: string;
  description: string;
}

interface StatusResponse {
  timestamp: string;
  overallStatus: StatusType;
  overallUptime: string;
  services: Service[];
}

export async function GET() {
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
      id: 'edge-3',
      name: 'WAF Rules Engine',
      category: 'Edge/CDN',
      status: 'operational',
      uptime: 99.998,
      latency: 5,
      lastChecked: now,
      description: 'Web Application Firewall rule evaluation'
    },
    {
      id: 'monitor-1',
      name: 'Uptime Monitoring',
      category: 'Monitoring Services',
      status: 'operational',
      uptime: 99.999,
      latency: 12,
      lastChecked: now,
      description: 'Synthetic checks for all public endpoints'
    },
    {
      id: 'monitor-2',
      name: 'Log Aggregation',
      category: 'Monitoring Services',
      status: 'operational',
      uptime: 99.995,
      latency: 28,
      lastChecked: now,
      description: 'Centralized logging pipeline'
    },
    {
      id: 'monitor-3',
      name: 'Metrics Pipeline',
      category: 'Monitoring Services',
      status: 'operational',
      uptime: 99.998,
      latency: 18,
      lastChecked: now,
      description: 'Prometheus metrics collection and alerting'
    },
    {
      id: 'monitor-4',
      name: 'Distributed Tracing',
      category: 'Monitoring Services',
      status: 'operational',
      uptime: 99.997,
      latency: 35,
      lastChecked: now,
      description: 'OpenTelemetry trace collection and analysis'
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
    services
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
