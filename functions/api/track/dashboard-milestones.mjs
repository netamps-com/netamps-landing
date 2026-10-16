/**
 * GET /api/track/dashboard/milestones
 *
 * Reads match_meta.milestone_enabled and returns milestone data.
 *
 * When enabled ('1'):
 *   - No buyer token required. Returns all persisted milestones from
 *     track_milestone_extractions (D1). The panel uses userRole from the
 *     dashboard session to decide what to show.
 *   - Admin (userRole === 'admin@netamps.com'): full detail + summary.
 *   - Buyer: a concise summary (most recent milestone per tracking ID);
 *     the panel may also display a notice that milestones are visible
 *     to admins with the full detail.
 *
 * When disabled ('0' or absent): { enabled: false }
 *
 * Contract:
 *   { enabled: boolean, source: 'persisted', milestones: any[],
 *     admin: boolean, buyer: boolean, summary: string }
 */

import { onRequestPost } from './extract.js';
import { isMilestoneEnabled } from './milestones.mjs';

export async function onRequestGet({ request, env }) {
  const flag = isMilestoneEnabled(env);
  if (!flag) {
    return new Response(
      JSON.stringify({ enabled: false, source: 'none' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Query the D1 store — one row per tracking ID extraction.
  try {
    const allRows = await env.DB.prepare(
      "SELECT tracking_id, current_milestone, events, source, confidence, needsReview, exceptionReason, reason, created_at FROM track_milestone_extractions ORDER BY created_at DESC"
    ).all();

    const rows = allRows.results || [];
    const milestones = rows.map((r) => ({
      tracking_id: r.tracking_id,
      current_milestone: r.current_milestone,
      events: typeof r.events === 'string' ? JSON.parse(r.events) : (r.events || []),
      source: r.source,
      confidence: r.confidence,
      needsReview: r.needsReview,
      exceptionReason: r.exceptionReason,
      reason: r.reason,
      created_at: r.created_at,
    }));

    // Simple per‑tracking‑ID summary: latest milestone + confidence.
    const byTracking = milestones.reduce((acc, m) => {
      const tid = m.tracking_id;
      if (!tid) return acc;
      if (!acc[tid] || new Date(m.created_at) > new Date(acc[tid].created_at)) {
        acc[tid] = m;
      }
      return acc;
    }, {});

    const summaryItems = Object.values(byTracking).map((m) => ({
      tracking_id: m.tracking_id,
      current_milestone: m.current_milestone,
      confidence: m.confidence,
      events_count: m.events?.length || 0,
    }));

    return new Response(
      JSON.stringify({
        enabled: true,
        source: 'persisted',
        admin: false,
        buyer: false,
        milestones,             // full list (may be large; panel truncates)
        summary: summaryItems.length
          ? `${summaryItems.length} tracked shipment${
              summaryItems.length !== 1 ? 's' : ''
            }`
          : 'no tracked shipments',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[track] dashboard milestones db error', err);
    return new Response(
      JSON.stringify({
        enabled: true,
        source: 'error',
        error: 'db_error',
        milestones: [],
        summary: 'database error',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}