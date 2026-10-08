import React, { useState, useEffect } from 'react';
import { Key, UserPlus, X, AlertCircle, CheckCircle2 } from 'lucide-react';

interface UserManagementModalProps {
  onClose: () => void;
  currentUserRole: string; // email of the logged in user
}

export default function UserManagementModal({ onClose, currentUserRole }: UserManagementModalProps) {
  const [users, setUsers] = useState<{email: string, hash: string}[]>([]);
  const [targetAccount, setTargetAccount] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('staff');
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [isUpdatingPwd, setIsUpdatingPwd] = useState(false);
  const [mode, setMode] = useState<'modify' | 'create'>('modify');

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
        const res = await fetch(`${API_URL}/api/users`);
        const data = await res.json();
        if (data.success && data.users) {
          setUsers(data.users);
          if (data.users.length > 0) {
            setTargetAccount(data.users[0].email);
          }
        }
      } catch (err) {
        console.error('Failed to fetch users', err);
      }
    };
    fetchUsers();
  }, []);

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
      const res = await fetch(`${API_URL}/api/users/modify-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetAccount, passwordHash: newHashed, currentPasswordHash: hashedInput })
      });
      const data = await res.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Failed to update password');
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
      setPwdError('Failed to process encryption.');
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
      const res = await fetch(`${API_URL}/api/users/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newUserEmail, passwordHash: newHashed, role: newUserRole })
      });
      const data = await res.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Failed to create user');
      }

      const updatedUsers = [...users, { email: newUserEmail, hash: newHashed }];
      setUsers(updatedUsers);

      setPwdSuccess(`Successfully created user ${newUserEmail}`);
      logEvent('USER_CREATED', `Created new user ${newUserEmail}`);
      setNewUserEmail('');
      setNewUserPassword('');
    } catch (err) {
      setPwdError('Failed to process encryption.');
    }
    setIsUpdatingPwd(false);
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
            <button 
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${mode === 'create' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
              onClick={() => { setMode('create'); setPwdError(''); setPwdSuccess(''); }}
            >
              Add User
            </button>
          )}
        </div>

        <div className="p-6">
          {pwdError && (
            <div className="mb-4 bg-red-50 text-red-600 text-sm p-3 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {pwdError}
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
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
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
                  <input type="text" disabled value={currentUserRole} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-500" />
                </div>
              )}
              
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Your Current Password</label>
                <input 
                  type="password" 
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder={pwdError ? "" : "Verify your authority"}
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
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder={pwdError ? "" : "Enter new 8+ char password"}
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
          ) : (
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">New User Email</label>
                <input 
                  type="email" 
                  required
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder={pwdError ? "" : "e.g. manager@netamps.com"}
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
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder={pwdError ? "" : "Enter 8+ char password"}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Role Type</label>
                <select 
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
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
          )}
        </div>
      </div>
    </div>
  );
}
