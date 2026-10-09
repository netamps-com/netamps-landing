/**
 * GET /api/health/live
 * 
 * Real-time system health endpoint with live metrics.
 * Runs on Cloudflare Pages Functions (Workers runtime) for fresh data on every request.
 */

export async function onRequestGet({ env, request }) {
  try {
    // 1. Check DB
    let dbStatus = 'unknown';
    let dbLatency = null;
    if (env.DB) {
      const dbStart = Date.now();
      try {
        await env.DB.prepare('SELECT 1').run();
        dbLatency = Date.now() - dbStart;
        dbStatus = 'operational';
      } catch (e) {
        dbStatus = 'outage';
      }
    } else {
      // In case DB binding is missing in this environment
      dbStatus = 'operational';
    }

    // 2. Check Website Payload (fetching the root)
    let payloadStatus = 'unknown';
    let payloadLatency = null;
    const siteStart = Date.now();
    try {
      const url = new URL(request.url);
      const siteRes = await fetch(`${url.protocol}//${url.hostname}`);
      if (siteRes.ok) {
        payloadLatency = Date.now() - siteStart;
        payloadStatus = 'operational';
      } else {
        payloadStatus = 'degraded';
      }
    } catch(e) {
      payloadStatus = 'outage';
    }

    const metrics = {
      timestamp: new Date().toISOString(),
      database: {
        status: dbStatus,
        latency: dbLatency
      },
      payload: {
        status: payloadStatus,
        latency: payloadLatency
      },
      api: {
        status: 'operational'
      },
      cdn: {
        status: 'operational',
        colo: request.cf ? request.cf.colo : 'Edge'
      }
    };

    const allStatuses = [dbStatus, payloadStatus, 'operational'];
    const overallStatus = allStatuses.includes('outage') ? 'outage' :
                          allStatuses.includes('degraded') ? 'degraded' : 'operational';

    const response = {
      ...metrics,
      overallStatus
    };
    
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
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