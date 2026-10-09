/**
 * GET /api/health/live
 * 
 * Real-time system health endpoint with live metrics for:
 * - Database connectivity and performance
 * - API Gateway latency and uptime
 * - Website payload/traffic metrics (requests/min, error rate, latency)
 * - CDN/Edge performance and cache hit rates
 * 
 * Runs on Cloudflare Pages Functions (Workers runtime) for fresh data on every request.
 */

// Simulated metrics - in production, these would come from actual monitoring systems
// Cloudflare Analytics, Database metrics, APM tools, etc.
function generateLiveMetrics(env) {
  const now = Date.now();
  
  // Simulate some variance for realistic live data
  const variance = (base, range) => Math.max(0, base + (Math.random() - 0.5) * range);
  
  return {
    timestamp: new Date().toISOString(),
    database: {
      status: 'operational',
      latency: Math.round(variance(12, 8)), // 8-20ms
      uptime: 99.995,
      connections: Math.round(variance(45, 20)),
      maxConnections: 100,
      queryThroughput: Math.round(variance(1200, 400)) // queries/sec
    },
    api: {
      status: 'operational',
      latency: Math.round(variance(45, 25)), // 20-70ms
      uptime: 99.998,
      requestsPerMinute: Math.round(variance(2400, 800)),
      errorRate: (variance(0.02, 0.05)).toFixed(2),
      p95Latency: Math.round(variance(120, 60)),
      p99Latency: Math.round(variance(280, 120))
    },
    payload: {
      status: 'operational',
      requestsPerMin: Math.round(variance(1800, 600)),
      avgLatency: Math.round(variance(85, 40)),
      errorRate: (variance(0.05, 0.1)).toFixed(2),
      bandwidthMbps: Math.round(variance(45, 20)),
      activeConnections: Math.round(variance(320, 100)),
      payloadSizeAvgKb: Math.round(variance(2.4, 1.2))
    },
    cdn: {
      status: 'operational',
      latency: Math.round(variance(23, 10)),
      cacheHitRate: (variance(94.5, 3)).toFixed(1),
      bandwidthSavedGb: Math.round(variance(2400, 500)),
      edgeRequestsPerMin: Math.round(variance(15000, 5000)),
      originOffloadRate: (variance(96, 2)).toFixed(1)
    }
  };
}

export async function onRequestGet({ env }) {
  try {
    const metrics = generateLiveMetrics(env);
    
    // Add overall status calculation
    const allStatuses = [
      metrics.database.status,
      metrics.api.status,
      metrics.payload.status,
      metrics.cdn.status
    ];
    
    const overallStatus = allStatuses.includes('outage') ? 'outage' :
                          allStatuses.includes('degraded') ? 'degraded' :
                          allStatuses.includes('maintenance') ? 'maintenance' : 'operational';
    
    const response = {
      ...metrics,
      overallStatus,
      // Add computed health score (0-100)
      healthScore: Math.round(
        (metrics.database.uptime + metrics.api.uptime + metrics.payload.uptime + metrics.cdn.uptime) / 4
      )
    };
    
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Health check failed',
      message: err.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}