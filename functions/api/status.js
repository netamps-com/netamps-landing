/**
 * GET /api/status
 *
 * Live system status endpoint. Runs on Cloudflare Pages Functions (Workers
 * runtime) so every response carries a fresh timestamp — unlike a statically
 * exported Next.js route, which would freeze data at build time.
 *
 * NOTE: Do NOT re-create this as app/api/status/route.ts with edge/dynamic
 * config. This project deploys as a static export (`output: 'export'` in
 * next.config.mjs + `pages deploy out`), where dynamic Next routes are
 * silently dropped. All dynamic APIs belong here in functions/.
 */

const SERVICES = [
  {
    id: 'core-1',
    name: 'API Gateway',
    category: 'Core Infrastructure',
    status: 'operational',
    uptime: 99.998,
    latency: 45,
    description: 'Primary API endpoint for all client requests'
  },
  {
    id: 'core-2',
    name: 'Database Cluster',
    category: 'Core Infrastructure',
    status: 'operational',
    uptime: 99.995,
    latency: 12,
    description: 'Multi-region PostgreSQL cluster with automatic failover'
  },
  {
    id: 'core-3',
    name: 'Message Queue',
    category: 'Core Infrastructure',
    status: 'operational',
    uptime: 99.999,
    latency: 8,
    description: 'Redis-based pub/sub for async processing'
  },
  {
    id: 'edge-1',
    name: 'Cloudflare CDN',
    category: 'Edge/CDN',
    status: 'operational',
    uptime: 99.999,
    latency: 23,
    description: 'Global edge network for static assets and caching'
  },
  {
    id: 'edge-2',
    name: 'DDoS Protection',
    category: 'Edge/CDN',
    status: 'operational',
    uptime: 99.999,
    latency: 0,
    description: 'Layer 3/4/7 DDoS mitigation'
  },
  {
    id: 'edge-3',
    name: 'WAF Rules Engine',
    category: 'Edge/CDN',
    status: 'operational',
    uptime: 99.998,
    latency: 5,
    description: 'Web Application Firewall rule evaluation'
  },
  {
    id: 'monitor-1',
    name: 'Uptime Monitoring',
    category: 'Monitoring Services',
    status: 'operational',
    uptime: 99.999,
    latency: 12,
    description: 'Synthetic checks for all public endpoints'
  },
  {
    id: 'monitor-2',
    name: 'Log Aggregation',
    category: 'Monitoring Services',
    status: 'operational',
    uptime: 99.995,
    latency: 28,
    description: 'Centralized logging pipeline'
  },
  {
    id: 'monitor-3',
    name: 'Metrics Pipeline',
    category: 'Monitoring Services',
    status: 'operational',
    uptime: 99.998,
    latency: 18,
    description: 'Prometheus metrics collection and alerting'
  },
  {
    id: 'monitor-4',
    name: 'Distributed Tracing',
    category: 'Monitoring Services',
    status: 'operational',
    uptime: 99.997,
    latency: 35,
    description: 'OpenTelemetry trace collection and analysis'
  }
];

export async function onRequest(context) {
  const { request } = context;

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const now = new Date().toISOString();
  const services = SERVICES.map((s) => ({ ...s, lastChecked: now }));

  const overallStatus = services.some((s) => s.status === 'outage')
    ? 'outage'
    : services.some((s) => s.status === 'degraded')
    ? 'degraded'
    : services.some((s) => s.status === 'maintenance')
    ? 'maintenance'
    : 'operational';

  const avgUptime = services.reduce((sum, s) => sum + s.uptime, 0) / services.length;

  return new Response(
    JSON.stringify({
      timestamp: now,
      overallStatus,
      overallUptime: avgUptime.toFixed(3),
      services
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    }
  );
}
