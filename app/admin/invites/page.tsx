'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, UserPlus, CheckCircle, XCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import NetampsLogo from '../../NetampsLogo';

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
}

export default function AdminInvitesPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [notice, setNotice] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'staff' | 'admin'>('staff');
  const [creating, setCreating] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

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
        body: JSON.stringify({ action: 'list' })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.success) throw new Error((data && data.message) || 'Failed to load invites.');
      setInvites(Array.isArray(data.invites) ? data.invites : []);
    } catch (e: any) {
      setErrorMsg(e?.message || 'Failed to load invites.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void fetchInvites();
  }, [isAuthenticated, fetchInvites]);

  const createInvite = async (e: React.FormEvent) => {
    e.preventDefault();
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
      if (!res.ok || !data || !data.success) throw new Error((data && data.message) || 'Invite creation failed.');
      setNotice(`Invitation sent to ${email}${data.needsSecondApproval ? ' — a second admin must approve before activation.' : ''}`);
      setEmail('');
      await fetchInvites();
    } catch (e: any) {
      setErrorMsg(e?.message || 'Invite creation failed.');
    } finally {
      setCreating(false);
    }
  };

  const actOnInvite = async (id: string, action: 'approve' | 'revoke') => {
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
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-slate-800 flex justify-between items-center">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-400" /> Pending invitations ({invites.length})
            </h3>
            <button onClick={() => fetchInvites()} disabled={loading} className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors text-sm font-semibold disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {loading ? (
            <div className="p-12 text-center text-slate-500 text-sm">Loading…</div>
          ) : invites.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-sm">No pending invitations.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[720px]">
                <thead className="bg-slate-800/50 text-slate-300">
                  <tr>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Invited by</th>
                    <th className="px-4 py-3 font-medium">Expires</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {invites.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-800/50">
                      <td className="px-4 py-3 text-slate-200">{inv.email}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${inv.role === 'admin' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'}`}>
                          {inv.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs font-mono">{inv.status}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{inv.invited_by}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs font-mono">{inv.expires_at ? new Date(inv.expires_at).toLocaleString() : '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          {inv.status === 'pending-second' && (
                            <button
                              onClick={() => actOnInvite(inv.id, 'approve')}
                              disabled={!isAdmin || actingId === inv.id}
                              title="Approve (must differ from inviter — enforced server-side)"
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors disabled:opacity-50"
                            >
                              <CheckCircle className="w-3.5 h-3.5" /> Approve
                            </button>
                          )}
                          <button
                            onClick={() => actOnInvite(inv.id, 'revoke')}
                            disabled={!isAdmin || actingId === inv.id}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Revoke
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
