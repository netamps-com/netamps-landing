'use client';

/**
 * The operational KPI strip that sits above the orders table.
 *
 * WHAT IT IS. Eleven figures in the vocabulary an operations dashboard is
 * expected to speak — volume, where the volume is sitting on the lifecycle
 * ladder, how much money is in play, and how fast deals close. Each tile names
 * what it measures in plain words and states its own basis, because a KPI with
 * no denominator is a rumour with a font.
 *
 * WHERE THE NUMBERS COME FROM. `/api/returns/stats` aggregates server-side, so
 * these figures cannot drift from the table below them and the client never
 * downloads the customer PII payload just to draw eleven numbers. This
 * component renders; it does not tally. Anything it cannot render shows an em
 * dash — a tile that says "—" is honest about an unstated figure, where a tile
 * that says "0" would claim a measurement that was never made.
 *
 * LIVE TRACKING. `since` is the id of the previous payload. When a new one
 * arrives the changed tiles flash once, so a number moving is visible without
 * the strip re-laying-out or stealing attention. The poll only runs while the
 * tab is visible: a background tab has nobody reading it, and polling it anyway
 * is backend load spent on nothing.
 *
 * WHY EACH FIGURE IS DEFINED THE WAY IT IS — read before reusing a number:
 *  - Pipeline value sums visitor ASKS, not evaluations. It is intent, not
 *    revenue, and the tile says "Ask" so nobody files it as booked.
 *  - Win rate is decided orders only. Pending orders are excluded: an order
 *    nobody has ruled on cannot be a loss, and counting it as one would make
 *    the rate fall every time a new lead arrived.
 *  - Avg cycle time is sampled from closed-won orders with a real decision
 *    timestamp. It is labelled with the sample size, because a median over
 *    three orders is not the same claim as one over three hundred.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Clock, IndianRupee, Package, RefreshCw, TrendingUp, XCircle } from 'lucide-react';
import { formatPaise } from '../lib/money';

export type DashboardStats = {
  success: boolean;
  totals: {
    orders: number;
    open: number;
    awaitingTriage: number;
    inNegotiation: number;
    closedWon: number;
    declined: number;
    buy: number;
    sell: number;
  };
  rates: { winRatePct: number | null; partialAsks: number };
  money: {
    pipelineAskPaise: number | null;
    pipelinePartial: boolean;
    closedWonPaise: number | null;
    avgDealPaise: number | null;
    currency: string;
  };
  cycle: { avgCycleHours: number | null; sampleSize: number };
  generatedAt: string | null;
};

const POLL_MS = 15000;

function useStats() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Held in a ref, not state: it drives "did anything change?" and must not
  // itself cause a re-render or the comparison would loop.

  const load = useCallback(async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${API_URL}/api/returns/stats`, { cache: 'no-store' });
      if (!res.ok) throw new Error('stats');
      const data: DashboardStats = await res.json();
      setStats(data);
      setError(false);
      setSyncedAt(new Date().toLocaleTimeString('en-IN', { hour12: false }));
    } catch {
      // Keep the last good payload on screen. A transient blip must not blank
      // eleven figures the operator is mid-way through reading.
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      load();
      timer = setInterval(load, POLL_MS);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };

    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        start();
        load(); // catch up immediately rather than waiting out the interval
      }
    };

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load]);

  return { stats, error, syncedAt, loading, reload: load };
}

type Tile = {
  key: string;
  label: string;
  value: string;
  basis: string;
  icon: typeof Package;
  tone: string;
};

/** "—" for unstated, thousands-grouped for counts. */
function count(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('en-IN') : '—';
}

/** Compact rupee for a tile: full precision below a lakh, then ₹1.2 Cr. */
function compactRupees(paise: number | null | undefined): string {
  if (typeof paise !== 'number' || !Number.isFinite(paise)) return '—';
  const rupees = paise / 100;
  if (rupees >= 10000000) return `₹${(rupees / 10000000).toFixed(2)} Cr`;
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(2)} L`;
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(1)}K`;
  return formatPaise(paise);
}

function duration(hours: number | null | undefined): string {
  if (typeof hours !== 'number' || !Number.isFinite(hours)) return '—';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

function buildTiles(stats: DashboardStats | null): Tile[] {
  const t = stats?.totals;
  const m = stats?.money;
  const c = stats?.cycle;

  return [
    {
      key: 'open',
      label: 'Open Orders',
      value: count(t?.open),
      basis: 'not yet closed',
      icon: Package,
      tone: 'text-slate-900'
    },
    {
      key: 'triage',
      label: 'Awaiting Triage',
      value: count(t?.awaitingTriage),
      basis: 'pending review',
      icon: Activity,
      tone: 'text-amber-600'
    },
    {
      key: 'negotiation',
      label: 'In Negotiation',
      value: count(t?.inNegotiation),
      basis: 'accepted to agreed',
      icon: TrendingUp,
      tone: 'text-indigo-600'
    },
    {
      key: 'won',
      label: 'Closed-Won',
      value: count(t?.closedWon),
      basis: 'deal approved',
      icon: TrendingUp,
      tone: 'text-emerald-600'
    },
    {
      key: 'lost',
      label: 'Declined',
      value: count(t?.declined),
      basis: 'no agreement',
      icon: XCircle,
      tone: 'text-red-600'
    },
    {
      key: 'winrate',
      label: 'Win Rate',
      value: stats?.rates.winRatePct != null ? `${stats.rates.winRatePct}%` : '—',
      basis: 'decided orders only',
      icon: TrendingUp,
      tone: 'text-emerald-600'
    },
    {
      key: 'pipeline',
      label: 'Pipeline (Ask)',
      value: compactRupees(m?.pipelineAskPaise),
      basis: m?.pipelinePartial ? 'visitor ask · partial' : 'visitor ask',
      icon: IndianRupee,
      tone: 'text-slate-900'
    },
    {
      key: 'wonvalue',
      label: 'Closed-Won Value',
      value: compactRupees(m?.closedWonPaise),
      basis: 'settled total',
      icon: IndianRupee,
      tone: 'text-emerald-600'
    },
    {
      key: 'avgdeal',
      label: 'Avg Deal Size',
      value: compactRupees(m?.avgDealPaise),
      basis: 'per closed-won order',
      icon: IndianRupee,
      tone: 'text-slate-900'
    },
    {
      key: 'cycle',
      label: 'Avg Cycle Time',
      value: duration(c?.avgCycleHours),
      basis: c?.sampleSize ? `n=${c.sampleSize} won` : 'no closed sample',
      icon: Clock,
      tone: 'text-slate-900'
    },
    {
      key: 'mix',
      label: 'BUY / SELL Mix',
      value: `${count(t?.buy)} / ${count(t?.sell)}`,
      basis: `${count(t?.orders)} total`,
      icon: Package,
      tone: 'text-slate-900'
    }
  ];
}

export default function StatsBar() {
  const { stats, error, syncedAt, loading, reload } = useStats();
  const [flash, setFlash] = useState<string[]>([]);
  // Held in a ref, not state: it records the previous rendered values to diff
  // against, and must not itself trigger a re-render or the comparison loops.
  const prevValuesRef = useRef<Record<string, string> | null>(null);

  // Memoised on the payload: rebuilt on every render otherwise, which would
  // re-run the change-detection effect on every unrelated state update.
  const tiles = useMemo(() => buildTiles(stats), [stats]);

  // Flash only what actually moved. The previous values are kept as a map
  // rather than one serialised string so a changed field can be identified by
  // key — comparing each tile against `tiles[i]` would be comparing it with
  // itself and would never light up.
  useEffect(() => {
    if (!stats) return;
    const next: Record<string, string> = {};
    for (const tile of tiles) next[tile.key] = tile.value;

    const prev = prevValuesRef.current;
    prevValuesRef.current = next;
    if (prev === null) return; // first paint is not a change

    const changed = Object.keys(next).filter((k) => prev[k] !== undefined && prev[k] !== next[k]);
    if (changed.length === 0) return;

    setFlash(changed);
    const t = setTimeout(() => setFlash([]), 1200);
    return () => clearTimeout(t);
  }, [stats, tiles]);

  return (
    <section
      aria-label="Operational summary"
      className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Operational Summary
        </h2>
        <div className="flex items-center gap-3">
          {error && (
            <span className="text-[11px] font-semibold text-amber-600">
              Stale — retrying
            </span>
          )}
          <span className="text-[11px] font-medium text-slate-400">
            {loading ? 'Syncing…' : syncedAt ? `Synced ${syncedAt}` : 'Synced'}
          </span>
          <button
            type="button"
            onClick={reload}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            title="Refresh summary"
            aria-label="Refresh summary"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          const lit = flash.includes(tile.key);
          return (
            <div
              key={tile.key}
              className={`rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 transition-colors duration-500 ${
                lit ? 'border-emerald-300 bg-emerald-50' : ''
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Icon className={`h-3.5 w-3.5 shrink-0 ${tile.tone}`} aria-hidden="true" />
                <span className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {tile.label}
                </span>
              </div>
              <div className={`mt-1 text-lg font-black leading-none ${tile.tone}`}>{tile.value}</div>
              <div className="mt-1 truncate text-[10px] font-medium text-slate-400">{tile.basis}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}