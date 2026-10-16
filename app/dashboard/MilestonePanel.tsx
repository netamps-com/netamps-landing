'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity } from 'lucide-react';

export default function MilestonePanel() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdmin, setShowAdmin] = useState(false);
  const [milestones, setMilestones] = useState<any[]>([]);
  const [summary, setSummary] = useState<string>('');

  const router = useRouter();

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || ''}/api/track/dashboard/milestones`,
          { cache: 'no-store' }
        );
        const data = await res.json();

        if (data.enabled === false) {
          setEnabled(false);
          setLoading(false);
          return;
        }

        setEnabled(true);
        setMilestones(data.milestones || []);
        setSummary(data.summary || '');

        const isAdmin =
          typeof window !== 'undefined' && (window as any).netampsUserRole === 'admin@netamps.com';
        setShowAdmin(!!isAdmin);
      } catch (err) {
        console.error('[dashboard] milestone panel fetch error', err);
        setEnabled(false);
      } finally {
        setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  if (enabled === false || loading) return null;
  if (!milestones.length) {
    return (
      <div className="text-sm text-slate-500">
        {showAdmin ? 'No milestones found in the system.' : 'No tracked shipments.'}
      </div>
    );
  }

  // Aggregate counts
  const byMilestone: Record<number, number> = { 5: 0, 6: 0, 8: 0, 9: 0, 10: 0 };
  const byStatus = { needsReview: 0, unmatched: 0 };
  for (const m of milestones) {
    if (m.current_milestone && m.current_milestone in byMilestone) byMilestone[m.current_milestone]++;
    if (m.needsReview) byStatus.needsReview++;
    if (m.unmatched) byStatus.unmatched++;
  }
  const uniqueTracking = milestones.reduce(
    (s, m) => (m.tracking_id ? s.add(m.tracking_id) : s),
    new Set<string>()
  ).size;

  // Milestone label map
  const labelMap: Record<number, string> = {
    5: 'Picked Up / In Transit',
    6: 'Sorting Hub',
    8: 'Out for Delivery',
    9: 'Delivered',
    10: 'Exception / Delayed'
  };

  // Color class per key
  const colorClass: Record<number, string> = {
    5: 'text-slate-400',
    6: 'text-slate-400',
    8: 'text-amber-600',
    9: 'text-emerald-600',
    10: 'text-red-600'
  };

  // Admin view only
  const latest: Record<string, any> = {};
  for (const m of milestones) {
    if (m.tracking_id && (!latest[m.tracking_id] || new Date(m.created_at) > new Date(latest[m.tracking_id].created_at))) {
      latest[m.tracking_id] = m;
    }
  }
  const recent = Object.values(latest).slice(0, 15);

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
        System Milestones
      </h2>
      <p className="text-[10px] text-slate-400">
        {milestones.length} milestones across {uniqueTracking} tracking{uniqueTracking > 1 ? 's' : ''}
      </p>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {[5, 6, 8, 9, 10].map((key) => {
          const lbl = labelMap[key];
          const clr = colorClass[key];
          return (
            <div
              key={key}
              className={`rounded-xl border border-slate-200 bg-slate-50/60 px-2.5 py-1.5 text-${clr}`}
            >
              {lbl}: {byMilestone[key] || 0}
            </div>
          )}
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="text-sm text-slate-500">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="p-2 text-xs font-bold uppercase tracking-wider text-slate-600">Tracking ID</th>
              <th className="p-2 text-xs font-bold uppercase tracking-wider text-slate-600">Current Milestone</th>
              <th className="p-2 text-xs font-bold uppercase tracking-wider text-slate-600">Confidence</th>
              <th className="p-2 text-xs font-bold uppercase tracking-wider text-slate-600">Events</th>
              <th className="p-2 text-xs font-bold uppercase tracking-wider text-slate-600">Updated</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((m: any, i: number) => (
              <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="p-2 font-mono text-[10px]">{m.tracking_id || '—'}</td>
                <td className="p-2">{labelMap[m.current_milestone] || '—'}</td>
                <td className="p-2">{m.confidence !== undefined ? m.confidence.toFixed(2) : '—'}</td>
                <td className="p-2 text-[10px]">{m.events?.length || 0}</td>
                <td className="p-2 text-[10px]">{m.created_at ? new Date(m.created_at).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}