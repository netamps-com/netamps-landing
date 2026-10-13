'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, UserPlus, CheckCircle, XCircle, RefreshCw, ShieldCheck, Mail } from 'lucide-react';
import NetampsLogo from '../../NetampsLogo';
import { useIdleTimeout, IdleTimeoutModal } from '../../lib/idle-timeout';

// Admin invite console: the website surface for invite-only provisioning.
// Every action hits /api/invites (proven 22/22); the server enforces admin
// gates, separation of duties, and audit — this page is a thin operator UI.
interface InviteRow {
  id: string;
  email: string;
  role: string;
  status: string;
  invited_by: string;
  approved_by?: string | null;
  created_at: string;
  expires_at: string;
  accepted_at?: string | null;
  email_status?: string | null;
  email_sent_at?: string | null;
  // Server-derived activation truth (list computes it; UI renders verbatim).
  activation?: 'completed' | 'not-completed';
  detail?: string;
}

export default function AdminInvitesPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [notice, setNotice] = useState('');
  // Lifecycle filter: Active (default) mirrors the server default
  // (pending + approved). Every other state is one select away.
  const [statusFilter, setStatusFilter] = useState('');

  // Email Activation truth: server-derived per row (completed only on user
  // acceptance; everything else is Not Completed with the actionable reason).
  // Rendered verbatim — the console never re-derives activation client-side.
  const lifecycleOf = (inv: InviteRow): { dot: string; label: string; sub: string } => {
    // Deploy-window fallback: servers predating activation truth omit the
    // fields — derive from lifecycle status alone (transient, never blank).
    if (!inv.activation) {
      if (inv.status === 'accepted') {
        return { dot: 'bg-emerald-500', label: 'Email Activation Completed', sub: inv.accepted_at ? new Date(inv.accepted_at).toLocaleString() : '' };
      }
      if (inv.status === 'revoked') {
        return { dot: 'bg-slate-500', label: 'Email Activation Not Completed', sub: 'invitation revoked' };
      }
      if (inv.status === 'expired' || (inv.expires_at && new Date(inv.expires_at).getTime() <= Date.now() && inv.status !== 'accepted')) {
        return { dot: 'bg-red-500', label: 'Email Activation Not Completed', sub: inv.expires_at ? `invitation expired ${new Date(inv.expires_at).toLocaleString()}` : 'invitation expired' };
      }
      return { dot: 'bg-amber-500', label: 'Email Activation Not Completed', sub: inv.expires_at ? `expires ${new Date(inv.expires_at).toLocaleString()}` : '' };
    }
    if (inv.activation === 'completed') {
      return { dot: 'bg-emerald-500', label: 'Email Activation Completed', sub: inv.accepted_at ? new Date(inv.accepted_at).toLocaleString() : '' };
    }
    const expiry = inv.expires_at ? `expires ${new Date(inv.expires_at).toLocaleString()}` : '';
    switch (inv.detail) {
      case 'revoked':
        return { dot: 'bg-slate-500', label: 'Email Activation Not Completed', sub: 'invitation revoked' };
      case 'expired':
        return { dot: 'bg-red-500', label: 'Email Activation Not Completed', sub: inv.expires_at ? `invitation expired ${new Date(inv.expires_at).toLocaleString()}` : 'invitation expired' };
      case 'email-bounced':
        return { dot: 'bg-red-500', label: 'Email Activation Not Completed', sub: 'invitation email bounced — check address' };
      case 'email-failed':
        return { dot: 'bg-red-500', label: 'Email Activation Not Completed', sub: 'invitation email failed to send' };
      case 'pending-approval':
        return { dot: 'bg-amber-500', label: 'Email Activation Not Completed', sub: `awaiting second admin approval · ${expiry}` };
      default: {
        const delivered = inv.email_status === 'delivered';
        return {
          dot: 'bg-blue-500',
          label: 'Email Activation Not Completed',
          sub: `${delivered ? 'email delivered — awaiting user action' : 'invitation sent — awaiting user action'}${expiry ? ` · ${expiry}` : ''}`
        };
      }
    }
  };
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'staff' | 'admin'>('staff');
  const [creating, setCreating] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  // Mandatory idle watchdog: uniform 30-min termination for every role.
  // No props — the mandate cannot be disabled or retimed per caller.
  const idle = useIdleTimeout();

  useEffect(() => {
    document.title = 'Invite Console — Netamps';
    const cookies = Object.fromEntries(
      document.cookie.split(';').map((c) => {
        const i = c.indexOf('=');
        return [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1).trim())];
      })
    );
    if (!cookies['session_id']) {
      router.push('/login');
      return;
    }
    setIsAuthenticated(true);
    setIsAdmin(cookies['user_role'] === 'admin@netamps.com');
  }, [router]);

  const fetchInvites = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${API_URL}/api/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list', ...(statusFilter ? { status: statusFilter } : {}) })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.success) throw new Error((data && data.message) || 'Failed to load invites.');
      setInvites(Array.isArray(data.invites) ? data.invites : []);
    } catch (e: any) {
      setErrorMsg(e?.message || 'Failed to load invites.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (isAuthenticated) void fetchInvites();
  }, [isAuthenticated, fetchInvites]);

  // Real-time posture: 30s passive poll keeps lifecycle states (expiry in
  // particular) fresh without a reload. Manual refresh stays primary.
  useEffect(() => {
    if (!isAuthenticated) return;
    const t = setInterval(() => { void fetchInvites(); }, 30000);
    return () => clearInterval(t);
  }, [isAuthenticated, fetchInvites]);

  const createInvite = async (e: React.FormEvent) => {    e.preventDefault();
    setNotice('');
    setErrorMsg('');
    setCreating(true);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${API_URL}/api/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', email, role })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.success) {
        if (data && data.code === 'DUPLICATE_INVITE') {
          setNotice('An active invitation already exists for this mailbox — use Resend on its row below instead of creating another.');
          await fetchInvites();
          return;
        }
        throw new Error((data && data.message) || 'Invite creation failed.');
      }
      setNotice(`Invitation sent to ${email}${data.needsSecondApproval ? ' — a second admin must approve before activation.' : ''}`);
      setEmail('');
      await fetchInvites();
    } catch (e: any) {
      setErrorMsg(e?.message || 'Invite creation failed.');
    } finally {
      setCreating(false);
    }
  };

  // Prune duplicate live invites for one mailbox (keeps newest, revokes the
  // rest). Twins predate the duplicate-create guard; collapsing them is what
  // makes the per-mailbox activation binary agree with itself again.
  const dedupeInvite = async () => {
    if (!email.trim() || !isAdmin) return;
    setActingId('dedupe');
    setNotice('');
    setErrorMsg('');
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${API_URL}/api/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dedupe', email: email.trim() })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.success) throw new Error((data && data.message) || 'Dedupe failed.');
      setNotice((data.revoked || []).length === 0
        ? 'No duplicates for this mailbox — single live invitation.'
        : `Pruned ${data.revoked.length} duplicate${data.revoked.length > 1 ? 's' : ''} — newest invitation kept.`);
      await fetchInvites();
    } catch (e: any) {
      setErrorMsg(e?.message || 'Dedupe failed.');
    } finally {
      setActingId(null);
    }
  };

  const actOnInvite = async (id: string, action: 'approve' | 'revoke' | 'resend') => {
    setActingId(id);
    setNotice('');
    setErrorMsg('');
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const body: any = { action, id };
      if (action === 'revoke') body.reason = 'withdrawn from console';
      const res = await fetch(`${API_URL}/api/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.success) throw new Error((data && data.message) || `${action} failed.`);
      setNotice(action === 'approve'
        ? (data.bootstrap
          ? 'Approved under the bootstrap rule (sole admin — logged as such). Add a second admin to restore separation of duties.'
          : 'Invite approved.')
        : action === 'resend'
        ? (data.emailSent === false
          ? 'Invite rotated but the email failed to send — copy the fresh link from the server log or retry.'
          : 'Invitation re-sent — previous link revoked, fresh 48-hour window.')
        : 'Invite revoked.');
      await fetchInvites();
    } catch (e: any) {
      setErrorMsg(e?.message || `${action} failed.`);
    } finally {
      setActingId(null);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#020817] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020817] text-white font-sans flex flex-col">
      {idle.warning && (
        <IdleTimeoutModal
          remainingMs={idle.remainingMs}
          onStay={idle.stay}
          onTerminate={idle.terminateNow}
        />
      )}
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-4">
              <NetampsLogo />
              <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                Invite Console
              </span>
            </div>
            <Link href="/dashboard" className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back to Dashboard
            </Link>
          </div>
        </div>
      </nav>

      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
        {!isAdmin && (
          <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl p-4 text-sm text-amber-300">
            View-only: invite actions require an admin session. The server enforces this regardless of what this page shows.
          </div>
        )}
        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-4 text-sm text-red-300">{errorMsg}</div>
        )}
        {notice && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-sm text-emerald-300">{notice}</div>
        )}

        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
          <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
            <UserPlus className="w-5 h-5 text-indigo-400" /> Invite a staff member
          </h3>
          <form onSubmit={createInvite} className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@netamps.com"
              className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'staff' | 'admin')}
              aria-label="Invited role"
              className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="staff">staff</option>
              <option value="admin">admin (needs 2nd approval)</option>
            </select>
            <button
              type="submit"
              disabled={creating || !isAdmin}
              title={!isAdmin ? 'Admin session required' : 'Send invitation'}
              className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-colors disabled:opacity-50"
            >
              {creating ? 'Sending…' : 'Send invite'}
            </button>
          </form>
          <p className="text-xs text-slate-500 mt-3">48-hour single-use link, bound to the invited mailbox. Admin grants activate only after a second admin approves.</p>
          <button
            type="button"
            onClick={dedupeInvite}
            disabled={!isAdmin || !email.trim() || actingId === 'dedupe'}
            title="Revoke older live invitations for the address above, keeping the newest"
            className="mt-2 text-xs font-bold text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
          >
            {actingId === 'dedupe' ? 'Pruning…' : 'Prune duplicate invitations for this mailbox'}
          </button>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-slate-800 flex flex-wrap justify-between items-center gap-3">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-400" /> Invitations ({invites.length})
            </h3>
            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter by lifecycle state"
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="">Active (pending + approved)</option>
                <option value="all">All states</option>
                <option value="pending-second">Pending approval</option>
                <option value="approved">Approved — awaiting user</option>
                <option value="accepted">Activated</option>
                <option value="expired">Expired</option>
                <option value="revoked">Revoked</option>
              </select>
              <button onClick={() => fetchInvites()} disabled={loading} aria-label="Refresh invitations" className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors text-sm font-semibold disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
          {loading ? (
            <div className="p-12 text-center text-slate-500 text-sm">Loading…</div>
          ) : invites.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-sm">No invitations in this view.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[760px]">
                <thead className="bg-slate-800/50 text-slate-300">
                  <tr>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Activation</th>
                    <th className="px-4 py-3 font-medium">Invited by</th>
                    <th className="px-4 py-3 font-medium">Expires</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {invites.map((inv) => {
                    const life = lifecycleOf(inv);
                    const actionable = inv.status === 'pending-second' || inv.status === 'approved';
                    return (
                    <tr key={inv.id} className="hover:bg-slate-800/50">
                      <td className="px-4 py-3 text-slate-200">{inv.email}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${inv.role === 'admin' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'}`}>
                          {inv.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2 text-xs font-bold text-slate-200">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${life.dot}`} aria-hidden />
                          {life.label}
                        </span>
                        {life.sub && <span className="block text-[11px] text-slate-500 font-mono mt-0.5 ml-4">{life.sub}</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{inv.invited_by}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs font-mono">{inv.expires_at ? new Date(inv.expires_at).toLocaleString() : '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          {inv.status === 'pending-second' && (
                            <button
                              onClick={() => actOnInvite(inv.id, 'approve')}
                              disabled={!isAdmin || actingId === inv.id}
                              title="Approve (must differ from inviter — enforced server-side; sole-admin bootstrap logged)"
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors disabled:opacity-50"
                            >
                              <CheckCircle className="w-3.5 h-3.5" /> Approve
                            </button>
                          )}
                          {actionable && (
                          <button
                            onClick={() => actOnInvite(inv.id, 'resend')}
                            disabled={!isAdmin || actingId === inv.id}
                            title="Re-send invitation (rotates the link — the previous link stops working; fresh 48-hour window)"
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors disabled:opacity-50"
                          >
                            <Mail className="w-3.5 h-3.5" /> Resend
                          </button>
                          )}
                          {actionable && (
                          <button
                            onClick={() => actOnInvite(inv.id, 'revoke')}
                            disabled={!isAdmin || actingId === inv.id}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Revoke
                          </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
