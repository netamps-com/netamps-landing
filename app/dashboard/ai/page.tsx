'use client';

/**
 * NETAMPS AI — operator console for the governed model layer.
 *
 * Reports and manages every registered model module in one place: live health
 * (flags, budgets, today usage, 24h model ok-rate), the audited run history,
 * the suggestions inbox (filed by operators, reviewed by admins), and the
 * kill switches (per-module flags + budgets, global brake).
 *
 * Access is server-enforced: /api/ai answers 401 without a login session and
 * 403 for authenticated non-operators (see aiAuthorized). This page renders
 * the server's verdict — a forged cookie paints nothing, because every panel
 * fills only from an API response the server chose to send.
 */

import { useCallback, useEffect, useState } from 'react';
import { Sparkles, RefreshCw, ShieldCheck, ShieldAlert, Inbox, Send, Check, X, Rocket } from 'lucide-react';
import { DashboardShell } from '../DashboardNav';
import { buildNavSections } from '../nav';
import { useDashboardSession } from '../useDashboardSession';

const API = process.env.NEXT_PUBLIC_API_URL || '';

type ModuleHealth = {
  id: string; feature: string; owner: string; purpose: string;
  tier: string; route: string; enabled: boolean; dailyBudget: number;
  usedToday: number; calls24h: number; ok24h: number;
};

type Run = {
  id: string; module_id: string; actor: string | null; ok: number;
  reason: string | null; model: string | null; latency_ms: number | null;
  prompt_version: string | null; checks: string | null; created_at: string;
};

type Suggestion = {
  id: string; kind: string; title: string; detail: string | null;
  module_id: string | null; status: string; actor: string | null;
  reviewer: string | null; decided_at: string | null; created_at: string;
};

async function post(action: string, extra: Record<string, unknown> = {}) {
  const res = await fetch(`${API}/api/ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...extra }),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

const KIND_STYLE: Record<string, string> = {
  review: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  roadmap: 'bg-amber-50 text-amber-700 border-amber-200',
  issue: 'bg-red-50 text-red-700 border-red-200',
};

const STATUS_STYLE: Record<string, string> = {
  open: 'bg-slate-100 text-slate-600 border-slate-200',
  accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  shipped: 'bg-teal-50 text-teal-700 border-teal-200',
};

export default function NetampsAiPage() {
  const session = useDashboardSession();
  const navSections = buildNavSections();
  const [modules, setModules] = useState<ModuleHealth[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [brakeOn, setBrakeOn] = useState<boolean | null>(null);
  const [runFilter, setRunFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState<'login' | 'operator' | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sTitle, setSTitle] = useState('');
  const [sKind, setSKind] = useState('review');
  const [sModule, setSModule] = useState('');
  const [sDetail, setSDetail] = useState('');
  const [suggestMsg, setSuggestMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [m, r, s, b] = await Promise.all([
        post('modules'),
        post('runs', { limit: 50 }),
        post('suggestions', { status: 'open' }),
        post('brake'),
      ]);
      for (const resp of [m, r, s, b]) {
        if (resp.status === 401) { setDenied('login'); return; }
        if (resp.status === 403) { setDenied('operator'); return; }
      }
      // Brake is admin-only: non-admins get 403 there while the rest loads.
      if (b.status === 200 && b.data?.success) setBrakeOn(!!b.data.enabled);
      else setBrakeOn(null);
      if (!m.data?.success) throw new Error(m.data?.message || 'Could not load modules.');
      setModules(m.data.modules || []);
      setRuns(r.data?.success ? r.data.runs || [] : []);
      setSuggestions(s.data?.success ? s.data.suggestions || [] : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Load failed.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadRuns = useCallback(async (moduleId: string) => {
    setRunFilter(moduleId);
    const r = await post('runs', { limit: 50, ...(moduleId ? { moduleId } : {}) });
    if (r.data?.success) setRuns(r.data.runs || []);
  }, []);

  const setFlag = async (id: string, patch: { enabled?: boolean; dailyBudget?: number }) => {
    setBusy(true);
    try {
      const r = await post('flags', { moduleId: id, ...patch });
      if (!r.data?.success) throw new Error(r.data?.message || 'Flag update failed.');
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Flag update failed.');
    } finally {
      setBusy(false);
    }
  };

  const setBrake = async (enabled: boolean) => {
    setBusy(true);
    try {
      const r = await post('brake', { enabled });
      if (!r.data?.success) throw new Error(r.data?.message || 'Brake update failed.');
      setBrakeOn(enabled);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Brake update failed.');
    } finally {
      setBusy(false);
    }
  };

  const submitSuggestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sTitle.trim()) return;
    setBusy(true);
    setSuggestMsg('');
    try {
      const r = await post('suggest', {
        kind: sKind, title: sTitle.trim(), detail: sDetail.trim() || null,
        moduleId: sModule || null,
      });
      if (!r.data?.success) throw new Error(r.data?.message || 'Submit failed.');
      setSTitle('');
      setSDetail('');
      setSModule('');
      setSuggestMsg('Filed for owner review.');
      const s = await post('suggestions', { status: 'open' });
      if (s.data?.success) setSuggestions(s.data.suggestions || []);
    } catch (e: unknown) {
      setSuggestMsg(e instanceof Error ? e.message : 'Submit failed.');
    } finally {
      setBusy(false);
    }
  };

  const review = async (id: string, decision: 'accepted' | 'rejected' | 'shipped') => {
    setBusy(true);
    try {
      const r = await post('review', { id, decision });
      if (!r.data?.success) throw new Error(r.data?.message || 'Review failed.');
      const s = await post('suggestions', { status: 'open' });
      if (s.data?.success) setSuggestions(s.data.suggestions || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Review failed.');
    } finally {
      setBusy(false);
    }
  };

  if (denied) {
    return (
      <DashboardShell
        sections={navSections}
        footer={{ email: session.email, role: session.role, onTerminate: session.terminate }}
      >
        <main className="max-w-3xl mx-auto px-4 py-16 text-center">
          <ShieldAlert className="w-10 h-10 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-black text-slate-900">NETAMPS AI is restricted</h1>
          <p className="text-sm text-slate-500 mt-2">
            {denied === 'login'
              ? 'Sign in with an authorized Netamps operator account to open this console.'
              : 'This account is signed in, but it is not an authorized Netamps operator. Only Netamps staff may access the AI module.'}
          </p>
        </main>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      sections={navSections}
      footer={{ email: session.email, role: session.role, onTerminate: session.terminate }}
    >
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-indigo-600" /> NETAMPS AI
            </h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">
              The governed model layer: every registered module, its live health, the audited
              run history, and the review inbox — operator access only.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {brakeOn !== null && (
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold ${brakeOn ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                <ShieldCheck className="w-3.5 h-3.5" /> Models {brakeOn ? 'ON' : 'BRAKED'}
              </span>
            )}
            <button onClick={() => void load()} className="p-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100" aria-label="Refresh">
              <RefreshCw className="w-4 h-4 text-slate-600" />
            </button>
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        {loading && <p className="mt-4 text-sm text-slate-500">Loading AI console…</p>}

        {!loading && (
          <>
            {/* ── Modules ── */}
            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-bold text-slate-900">Registered modules</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400">
                      <th className="py-1 pr-3">Module</th>
                      <th className="py-1 pr-3">Tier</th>
                      <th className="py-1 pr-3">Flag</th>
                      <th className="py-1 pr-3">Budget today</th>
                      <th className="py-1 pr-3">24h ok</th>
                      <th className="py-1 pr-3">Route</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modules.map((m) => (
                      <tr key={m.id} className="border-t border-slate-100">
                        <td className="py-2 pr-3">
                          <span className="font-mono font-bold text-slate-900">{m.id}</span>
                          <span className="block text-[11px] text-slate-500 font-normal">{m.owner}</span>
                        </td>
                        <td className="py-2 pr-3 font-mono text-xs">{m.tier}</td>
                        <td className="py-2 pr-3">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${m.enabled ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                            {m.enabled ? 'ON' : 'OFF'}
                          </span>
                        </td>
                        <td className="py-2 pr-3 font-mono text-xs">{m.usedToday}/{m.dailyBudget}</td>
                        <td className="py-2 pr-3 font-mono text-xs">{m.ok24h}/{m.calls24h}</td>
                        <td className="py-2 pr-3 text-xs text-slate-500">{m.route}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {session.isAdmin && (
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  {brakeOn !== null && (
                    <button
                      disabled={busy}
                      onClick={() => void setBrake(!brakeOn)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors disabled:opacity-50 ${brakeOn ? 'border-red-200 text-red-700 hover:bg-red-50' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'}`}
                    >
                      {brakeOn ? 'Engage global brake' : 'Release global brake'}
                    </button>
                  )}
                  <span className="text-[11px] text-slate-400">Per-module flags and budgets are set from the API (flags action); the brake above is the emergency stop.</span>
                </div>
              )}
            </section>

            {/* ── Runs ── */}
            <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="text-sm font-bold text-slate-900">Invocation history</h2>
                <select
                  value={runFilter}
                  onChange={(e) => void loadRuns(e.target.value)}
                  className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white"
                  aria-label="Filter runs by module"
                >
                  <option value="">All modules</option>
                  {modules.map((m) => (
                    <option key={m.id} value={m.id}>{m.id}</option>
                  ))}
                </select>
              </div>
              <ul className="mt-3 space-y-1.5 max-h-72 overflow-y-auto">
                {runs.length === 0 && <li className="text-xs text-slate-400">No runs recorded yet.</li>}
                {runs.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 text-xs font-mono border border-slate-100 rounded-lg px-2.5 py-1.5 flex-wrap">
                    <span className={`font-bold ${r.ok ? 'text-emerald-600' : 'text-red-600'}`}>{r.ok ? 'ok' : 'FAIL'}</span>
                    <span className="font-bold text-slate-800">{r.module_id}</span>
                    <span className="text-slate-500">{r.reason || r.model || ''}</span>
                    <span className="text-slate-400 ml-auto">{r.actor || ''} · {r.created_at ? new Date(r.created_at).toLocaleString() : ''}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* ── Suggestions inbox ── */}
            <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Inbox className="w-4 h-4 text-indigo-600" /> Review inbox
                <span className="text-[11px] font-medium text-slate-400">— suggestions and roadmap items awaiting owner review</span>
              </h2>
              <form onSubmit={submitSuggestion} className="mt-3 grid sm:grid-cols-2 gap-2">
                <input
                  value={sTitle} onChange={(e) => setSTitle(e.target.value)} maxLength={200}
                  placeholder="Title — e.g. Route normalize via orchestrator"
                  className="sm:col-span-2 px-3 py-2 border border-slate-300 rounded-xl bg-slate-50/50 text-sm"
                />
                <select value={sKind} onChange={(e) => setSKind(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-xl bg-white text-sm" aria-label="Suggestion kind">
                  <option value="review">Review</option>
                  <option value="roadmap">Roadmap</option>
                  <option value="issue">Issue</option>
                </select>
                <select value={sModule} onChange={(e) => setSModule(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-xl bg-white text-sm" aria-label="Related module">
                  <option value="">No specific module</option>
                  {modules.map((m) => (
                    <option key={m.id} value={m.id}>{m.id}</option>
                  ))}
                </select>
                <textarea
                  value={sDetail} onChange={(e) => setSDetail(e.target.value)} maxLength={4000} rows={2}
                  placeholder="Detail (optional)"
                  className="sm:col-span-2 px-3 py-2 border border-slate-300 rounded-xl bg-slate-50/50 text-sm"
                />
                <div className="sm:col-span-2 flex items-center gap-2">
                  <button
                    type="submit" disabled={busy || !sTitle.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-500 disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" /> File for review
                  </button>
                  {suggestMsg && <span className="text-xs text-slate-500">{suggestMsg}</span>}
                </div>
              </form>
              <ul className="mt-3 space-y-2">
                {suggestions.length === 0 && <li className="text-xs text-slate-400">Inbox empty — nothing awaiting review.</li>}
                {suggestions.map((s) => (
                  <li key={s.id} className="border border-slate-200 rounded-xl p-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${KIND_STYLE[s.kind] || KIND_STYLE.review}`}>{s.kind}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_STYLE[s.status] || STATUS_STYLE.open}`}>{s.status}</span>
                      {s.module_id && <span className="font-mono text-[11px] text-slate-500">{s.module_id}</span>}
                      <span className="text-[11px] text-slate-400 ml-auto">{s.actor || ''}</span>
                    </div>
                    <p className="mt-1 text-sm font-bold text-slate-900">{s.title}</p>
                    {s.detail && <p className="mt-0.5 text-xs text-slate-500 whitespace-pre-wrap">{s.detail}</p>}
                    {session.isAdmin && s.status === 'open' && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <button disabled={busy} onClick={() => void review(s.id, 'accepted')} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
                          <Check className="w-3 h-3" /> Accept
                        </button>
                        <button disabled={busy} onClick={() => void review(s.id, 'shipped')} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border border-teal-200 text-teal-700 hover:bg-teal-50 disabled:opacity-50">
                          <Rocket className="w-3 h-3" /> Ship
                        </button>
                        <button disabled={busy} onClick={() => void review(s.id, 'rejected')} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50">
                          <X className="w-3 h-3" /> Reject
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </main>
    </DashboardShell>
  );
}
