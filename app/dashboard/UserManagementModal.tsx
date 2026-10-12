import React, { useState, useEffect, useCallback } from 'react';
import { Key, UserPlus, X, AlertCircle, CheckCircle2, UserX, UserCheck, Trash2, Lock, ShieldAlert } from 'lucide-react';

interface UserRow {
  email: string;
  hash: string;
  role: string;
  status: string;
}

interface UserManagementModalProps {
  onClose: () => void;
  currentUserRole: string; // email of the logged in user
}

export default function UserManagementModal({ onClose, currentUserRole }: UserManagementModalProps) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [targetAccount, setTargetAccount] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('staff');
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [isUpdatingPwd, setIsUpdatingPwd] = useState(false);
  const [mode, setMode] = useState<'modify' | 'create' | 'manage'>('modify');
  
  // Delete/Suspend/Restore confirmation states
  const [actionTarget, setActionTarget] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'suspend' | 'restore' | 'hard-delete' | null>(null);
  const [actionConfirmText, setActionConfirmText] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${API_URL}/api/users`);
      const data = await res.json();
      if (data.success && data.users) {
        const mapped = (data.users || []).map((u: any) => ({
          email: u.email,
          hash: u.hash,
          role: u.role || 'staff',
          status: u.status || 'active'
        }));
        setUsers(mapped);
        if (mapped.length > 0) {
          setTargetAccount(mapped[0].email);
        }
      }
    } catch (err) {
      console.error('Failed to fetch users', err);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const hashPassword = async (password: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const logEvent = async (action: string, details: string) => {
    try {
      const { logEvent: loggerLogEvent } = await import('../lib/logger');
      loggerLogEvent(action, 'Dashboard', details, currentUserRole);
    } catch (err) {}
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingPwd(true);
    setPwdError('');
    setPwdSuccess('');

    try {
      const hashedInput = await hashPassword(currentPassword);

      if (newPassword.length < 8) {
        setPwdError('New password must be at least 8 characters.');
        setIsUpdatingPwd(false);
        return;
      }

      const newHashed = await hashPassword(newPassword);
      
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      let res: Response;
      try {
        res = await fetch(`${API_URL}/api/users/modify-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: targetAccount, passwordHash: newHashed, currentPasswordHash: hashedInput })
        });
      } catch {
        setPwdError('Could not reach the server. Check your connection and retry.');
        setIsUpdatingPwd(false);
        return;
      }
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        setPwdError('Server returned an unreadable response. Retry shortly.');
        setIsUpdatingPwd(false);
        return;
      }
      
      if (!res.ok || !data.success) {
        const ref = data && data.stage ? ` (ref: ${data.stage})` : '';
        setPwdError(`${(data && data.message) || 'Password change refused by server.'}${ref}`);
        setIsUpdatingPwd(false);
        return;
      }

      const updatedUsers = users.map(u => 
        u.email === targetAccount ? { ...u, hash: newHashed } : u
      );
      setUsers(updatedUsers);

      setPwdSuccess(`Successfully updated secure password for ${targetAccount}`);
      logEvent('PASSWORD_CHANGE_SUCCESS', `Changed password for ${targetAccount}`);
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setPwdError('Unexpected error preparing the request. Retry shortly.');
    }
    setIsUpdatingPwd(false);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingPwd(true);
    setPwdError('');
    setPwdSuccess('');

    try {
      if (newUserPassword.length < 8) {
        setPwdError('Password must be at least 8 characters.');
        setIsUpdatingPwd(false);
        return;
      }

      if (users.find(u => u.email === newUserEmail)) {
        setPwdError('User already exists.');
        setIsUpdatingPwd(false);
        return;
      }

      const newHashed = await hashPassword(newUserPassword);
      
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      let res: Response;
      try {
        res = await fetch(`${API_URL}/api/users/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: newUserEmail, passwordHash: newHashed, role: newUserRole })
        });
      } catch {
        setPwdError('Could not reach the server. Check your connection and retry.');
        setIsUpdatingPwd(false);
        return;
      }
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        setPwdError('Server returned an unreadable response. Retry shortly.');
        setIsUpdatingPwd(false);
        return;
      }
      
      if (!res.ok || !data.success) {
        const ref = data && data.stage ? ` (ref: ${data.stage})` : '';
        setPwdError(`${data.message || 'User creation refused by server.'}${ref}`);
        setIsUpdatingPwd(false);
        return;
      }

      const updatedUsers = [...users, { email: newUserEmail, hash: newHashed, role: newUserRole, status: 'active' }];
      setUsers(updatedUsers);

      setPwdSuccess(`Successfully created user ${newUserEmail}`);
      logEvent('USER_CREATED', `Created new user ${newUserEmail}`);
      setNewUserEmail('');
      setNewUserPassword('');
    } catch (err) {
      setPwdError('Unexpected error preparing the request. Retry shortly.');
    }
    setIsUpdatingPwd(false);
  };

  // ── Admin account lifecycle actions (suspend / restore / hard delete) ──
  const handleLifecycleAction = async (email: string, type: 'suspend' | 'restore' | 'hard-delete') => {
    setActionTarget(email);
    setActionType(type);
    setActionConfirmText('');
    setActionError('');
  };

  const confirmLifecycleAction = async () => {
    if (!actionTarget || !actionType) return;
    const required = actionType === 'hard-delete' ? actionTarget : 'CONFIRM';
    if (actionConfirmText.trim() !== required) {
      setActionError(actionType === 'hard-delete' ? `Type the exact email (${actionTarget}) to confirm hard delete.` : 'Type CONFIRM to proceed.');
      return;
    }
    setActionLoading(true);
    setActionError('');
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const endpoint = actionType === 'suspend' ? '/api/users/delete' : (actionType === 'restore' ? '/api/users/restore' : '/api/users/delete');
      const body = actionType === 'hard-delete' ? { email: actionTarget, hard: true, confirmDelete: actionTarget } : { email: actionTarget };
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.success) {
        throw new Error((data && data.message) || 'Action refused by server.');
      }
      // Refresh user list
      await fetchUsers();
      setActionTarget(null);
      setActionType(null);
      setPwdSuccess(`User ${actionTarget} ${actionType === 'suspend' ? 'suspended' : actionType === 'restore' ? 'restored' : 'permanently deleted'}.`);
      logEvent(`USER_${actionType.toUpperCase().replace('-', '_')}`, `${actionType} user ${actionTarget}`);
    } catch (err: any) {
      setActionError(err?.message || 'Action failed.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Key className="w-5 h-5 text-indigo-600" />
            User Management
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-slate-100">
          <button 
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${mode === 'modify' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
            onClick={() => { setMode('modify'); setPwdError(''); setPwdSuccess(''); }}
          >
            Modify Password
          </button>
          {currentUserRole === 'admin@netamps.com' && (
            <>
              <button 
                className={`flex-1 py-3 text-sm font-semibold transition-colors ${mode === 'create' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                onClick={() => { setMode('create'); setPwdError(''); setPwdSuccess(''); }}
              >
                Add User
              </button>
              <button 
                className={`flex-1 py-3 text-sm font-semibold transition-colors ${mode === 'manage' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                onClick={() => { setMode('manage'); setPwdError(''); setPwdSuccess(''); }}
              >
                Manage
              </button>
            </>
          )}
        </div>

        {currentUserRole === 'admin@netamps.com' && (
          <div className="px-6 pt-4">
            <a
              href="/admin/invites"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-indigo-200 bg-indigo-50/50 text-indigo-700 text-sm font-bold hover:bg-indigo-100 transition-colors"
            >
              <UserPlus className="w-4 h-4" /> Invite console — provision by invitation
            </a>
            <p className="text-[11px] text-slate-500 mt-1.5 text-center">Admin accounts can only be created through an approved invitation.</p>
          </div>
        )}

        <div className="p-6">
          {pwdError && (
            <div className="mb-4 bg-red-50 text-red-600 text-sm p-3 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <div>{pwdError}</div>
                {pwdError.toLowerCase().includes('invitation') && (
                  <a href="/admin/invites" className="inline-block mt-1 font-bold underline underline-offset-2 hover:text-red-700">
                    Open the invite console →
                  </a>
                )}
              </div>
            </div>
          )}
          {pwdSuccess && (
            <div className="mb-4 bg-emerald-50 text-emerald-600 text-sm p-3 rounded-lg flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {pwdSuccess}
            </div>
          )}

          {mode === 'modify' ? (
            <form onSubmit={handlePasswordChange} className="space-y-4">
              {currentUserRole === 'admin@netamps.com' ? (
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Target Account</label>
                  <select 
                    value={targetAccount}
                    onChange={(e) => setTargetAccount(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-slate-900"
                  >
                    <option value="" disabled>Select Target Account</option>
                    {users.map(u => (
                      <option key={u.email} value={u.email}>{u.email}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Target Account</label>
                  <input type="text" disabled value={currentUserRole} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-500 cursor-not-allowed" />
                </div>
              )}
              
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Your Current Password</label>
                <input 
                  type="password" 
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-slate-900 placeholder:text-slate-400"
                  placeholder="Verify your authority"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">New Secure Password</label>
                <input 
                  type="password" 
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-slate-900 placeholder:text-slate-400"
                  placeholder="Enter new 8+ char password"
                />
              </div>
              <button 
                type="submit" 
                disabled={isUpdatingPwd}
                className="w-full py-2.5 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {isUpdatingPwd ? 'Encrypting...' : 'Update Password Securely'}
              </button>
            </form>
          ) : mode === 'create' ? (
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">New User Email</label>
                <input 
                  type="email" 
                  required
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-slate-900 placeholder:text-slate-400"
                  placeholder="e.g. manager@netamps.com"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Secure Password</label>
                <input 
                  type="password" 
                  required
                  minLength={8}
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-slate-900 placeholder:text-slate-400"
                  placeholder="Enter 8+ char password"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Role Type</label>
                <select 
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-slate-900"
                >
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                  <option value="user">User</option>
                </select>
              </div>
              <button 
                type="submit" 
                disabled={isUpdatingPwd}
                className="w-full py-2.5 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                {isUpdatingPwd ? 'Encrypting...' : 'Create User'}
              </button>
            </form>
          ) : mode === 'manage' && currentUserRole === 'admin@netamps.com' ? (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              <div className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                User Accounts — click action to confirm
              </div>
              {users.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">No users found.</div>
              ) : (
                users.map(u => {
                  const isSelf = u.email === currentUserRole;
                  const isLastAdmin = u.role === 'admin' && users.filter(x => x.role === 'admin').length <= 1;
                  const isSuspended = u.status === 'suspended';
                  const canAct = !isSelf && !(isLastAdmin && u.role === 'admin');
                  return (
                    <div key={u.email} className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-900 truncate">{u.email}</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                              u.role === 'admin' ? 'bg-red-500/10 text-red-700 border border-red-500/20' : 
                              u.role === 'user' ? 'bg-slate-500/10 text-slate-700 border border-slate-500/20' :
                              'bg-indigo-500/10 text-indigo-700 border border-indigo-500/20'
                            }`}>
                              {u.role}
                            </span>
                          </div>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono ${
                            isSuspended ? 'bg-amber-500/10 text-amber-700' : 'bg-emerald-500/10 text-emerald-700'
                          }`}>
                            {isSuspended ? (
                              <> <Lock className="w-3 h-3" /> Suspended</>
                            ) : (
                              <> <ShieldAlert className="w-3 h-3" /> Active</>
                            )}
                          </span>
                        </div>
                        {isSelf && (
                          <span className="px-2 py-1 text-xs text-slate-500 bg-slate-100 rounded">You</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {isSuspended ? (
                          <button
                            type="button"
                            onClick={() => handleLifecycleAction(u.email, 'restore')}
                            disabled={actionLoading || !canAct}
                            className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                          >
                            <UserCheck className="w-4 h-4" /> Restore
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleLifecycleAction(u.email, 'suspend')}
                            disabled={actionLoading || !canAct}
                            className="flex-1 py-2 px-3 bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                          >
                            <UserX className="w-4 h-4" /> Suspend
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleLifecycleAction(u.email, 'hard-delete')}
                          disabled={actionLoading || !canAct}
                          className="flex-1 py-2 px-3 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                          title={isLastAdmin ? 'Cannot delete the last admin' : 'Permanent — requires typed email confirmation'}
                        >
                          <Trash2 className="w-4 h-4" /> Delete
                        </button>
                      </div>
                      {isLastAdmin && u.role === 'admin' && (
                        <p className="text-[11px] text-amber-600 mt-2">Protected: last admin — create another admin first.</p>
                      )}
                      {isSelf && !isSuspended && (
                        <p className="text-[11px] text-slate-500 mt-2">You cannot suspend or delete your own account.</p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          ) : null}
        </div>

        {/* Lifecycle Action Confirmation Modal */}
        {actionTarget && actionType && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                <h4 className="text-lg font-bold text-slate-900">
                  {actionType === 'suspend' ? 'Suspend Account' : actionType === 'restore' ? 'Restore Account' : 'Permanently Delete Account'}
                </h4>
              </div>
              <div className="p-6">
                <p className="text-sm text-slate-600 mb-4">
                  {actionType === 'suspend' && `This will immediately suspend <strong class="text-slate-900">{actionTarget}</strong>. The user cannot sign in but all data is preserved.`}
                  {actionType === 'restore' && `This will restore access for <strong class="text-slate-900">{actionTarget}</strong>. They can sign in with their existing password.`}
                  {actionType === 'hard-delete' && `This will PERMANENTLY DELETE <strong class="text-slate-900">{actionTarget}</strong>. All sessions and invites are revoked. Audit logs are preserved. This cannot be undone.`}
                </p>
                {actionError && (
                  <div className="mb-4 bg-red-50 text-red-600 text-sm p-3 rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {actionError}
                  </div>
                )}
                <div className="mb-4">
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    {actionType === 'hard-delete' ? `Type the exact email (${actionTarget})` : 'Type CONFIRM'}
                  </label>
                  <input
                    type="text"
                    value={actionConfirmText}
                    onChange={(e) => setActionConfirmText(e.target.value)}
                    disabled={actionLoading}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-slate-900 font-mono"
                    placeholder={actionType === 'hard-delete' ? actionTarget : 'CONFIRM'}
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => { setActionTarget(null); setActionType(null); setActionError(''); }}
                    disabled={actionLoading}
                    className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-lg font-bold hover:bg-slate-200 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmLifecycleAction}
                    disabled={actionLoading}
                    className={`flex-1 py-2.5 rounded-lg font-bold transition-colors disabled:opacity-50 ${
                      actionType === 'hard-delete' ? 'bg-red-600 text-white hover:bg-red-500' :
                      actionType === 'suspend' ? 'bg-amber-600 text-white hover:bg-amber-500' :
                      'bg-emerald-600 text-white hover:bg-emerald-500'
                    }`}
                  >
                    {actionLoading ? 'Processing…' : actionType === 'hard-delete' ? 'Delete Permanently' : actionType === 'suspend' ? 'Suspend Account' : 'Restore Account'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
