'use client';

import { useCallback, useEffect, useState } from 'react';
import { Sparkles, ShieldAlert, Check, RefreshCw, Info } from 'lucide-react';

/**
 * Best-match candidate panel for BUY orders (advisory only).
 *
 * Reads the cached candidate set from POST /api/match {action:'candidates'}.
 * This component NEVER triggers a model call — candidates are computed once,
 * asynchronously, at submission time. It renders a suggestion; a human decides.
 *
 * Empty state is a first-class, honest outcome: "No comparable stock" is shown
 * when nothing clears the deterministic floor, not padded with weak matches.
 */

type Candidate = {
  buyLineIdx: number;
  sellOrderId: string;
  sellLineIdx: number;
  rank: number;
  fit: number | null;
  confidence: number | null;
  gaps: string | null;
  rationale: string | null;
  sellCategory: string | null;
  sellDetails: string | null;
  sellQty: number | null;
  model: string | null;
};

type CandidateResponse = {
  success: boolean;
  orderId?: string;
  enabled?: boolean;
  stale?: boolean;
  candidates?: Candidate[];
};

type ProductLike = { category?: string; details?: string; quantity?: number };

function pct(v: number | null | undefined) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return `${Math.round(v * 100)}%`;
}

export default function MatchCandidates({
  requestId,
  isAdmin,
  products,
}: {
  requestId: string;
  isAdmin: boolean;
  products: ProductLike[];
}) {
  const [data, setData] = useState<CandidateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${API_URL}/api/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'candidates', buyOrderId: requestId }),
        cache: 'no-store',
      });
      const json: CandidateResponse = await res.json();
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    load();
  }, [load]);

  const accept = async (c: Candidate) => {
    const key = `${c.buyLineIdx}:${c.sellOrderId}:${c.sellLineIdx}`;
    setBusyKey(key);
    setError(null);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${API_URL}/api/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'accept',
          buyOrderId: requestId,
          buyLineIdx: c.buyLineIdx,
          sellOrderId: c.sellOrderId,
          sellLineIdx: c.sellLineIdx,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Accept failed.');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Accept failed.');
    } finally {
      setBusyKey(null);
    }
  };

  // Render nothing at all until we know there is something worth showing:
  // feature disabled + no cached rows = zero pixels (no empty chrome on every
  // BUY order in the table).
  if (loading) return null;
  const candidates = data?.candidates || [];
  const enabled = Boolean(data?.enabled);
  const isBuy = (products || []).length > 0;
  if (!isBuy) return null;
  if (!enabled && candidates.length === 0) return null;

  const byLine = new Map<number, Candidate[]>();
  for (const c of candidates) {
    const arr = byLine.get(c.buyLineIdx) || [];
    arr.push(c);
    byLine.set(c.buyLineIdx, arr);
  }
  const lineIndexes = Array.from(byLine.keys()).sort((a, b) => a - b);

  return (
    <div className="mt-4 rounded-lg bg-slate-950/60 border border-indigo-500/20 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-indigo-400" />
        <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider">Suggested stock (best-match)</span>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
          Advisory — not a match
        </span>
        {data?.stale && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-300 border border-slate-600 inline-flex items-center gap-1">
            <Info className="w-3 h-3" /> stock changed since computed
          </span>
        )}
        <button
          type="button"
          onClick={load}
          title="Refresh suggestions"
          className="ml-auto text-slate-400 hover:text-white transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {lineIndexes.length === 0 ? (
        <p className="text-xs text-slate-500 italic">
          No comparable stock in current SELL inventory for this request.
        </p>
      ) : (
        <div className="space-y-4">
          {lineIndexes.map((lineIdx) => {
            const product = (products || [])[lineIdx] || {};
            return (
              <div key={lineIdx}>
                <div className="text-[11px] text-slate-400 mb-1.5">
                  Requested: <span className="text-slate-200 font-semibold capitalize">{product.category || '—'}</span>
                  <span className="text-slate-500"> · {product.details || ''}</span>
                </div>
                <div className="space-y-2">
                  {(byLine.get(lineIdx) || []).map((c) => {
                    const key = `${c.buyLineIdx}:${c.sellOrderId}:${c.sellLineIdx}`;
                    return (
                      <div key={key} className="rounded-md bg-slate-900 border border-slate-800 px-3 py-2">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-200 capitalize">
                              {c.sellCategory || '—'}
                              {c.sellDetails ? <span className="font-normal text-slate-400"> · {c.sellDetails}</span> : null}
                              {c.sellQty ? <span className="ml-2 text-slate-500">qty {c.sellQty}</span> : null}
                            </div>
                            {c.rationale && <div className="text-[11px] text-slate-400 mt-0.5">{c.rationale}</div>}
                            {c.gaps && (
                              <div className="text-[11px] text-amber-400/90 mt-0.5 inline-flex items-center gap-1">
                                <ShieldAlert className="w-3 h-3" /> {c.gaps}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right" title="Confidence computed by our validator from grounded evidence — not the model's self-report">
                              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Confidence</div>
                              <div className="text-sm font-mono font-bold text-emerald-400">{pct(c.confidence)}</div>
                            </div>
                            {isAdmin && (
                              <button
                                type="button"
                                disabled={busyKey === key}
                                onClick={() => accept(c)}
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-60 inline-flex items-center gap-1"
                                title="Accept this candidate as a match (recorded + audited)"
                              >
                                <Check className="w-3.5 h-3.5" />
                                {busyKey === key ? 'Accepting…' : 'Accept'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {error && <div className="text-[11px] text-red-400 mt-2">{error}</div>}
    </div>
  );
}
