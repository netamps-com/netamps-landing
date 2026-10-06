'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogOut, Package, Search, Filter, ArchiveX, Key, X, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Tag, FileImage, Video } from 'lucide-react';
import NetampsLogo from '../NetampsLogo';

interface ProductItem {
  id: string;
  category: string;
  details: string;
  quantity: number;
}

interface ReturnRequest {
  id: string;
  intent: 'sell' | 'buy';
  name: string;
  company: string;
  email: string;
  phone: string;
  products: ProductItem[];
  attachedFiles?: string[];
  date: string;
  status: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  
  // Password Management State
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [targetAccount, setTargetAccount] = useState('admin');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [isUpdatingPwd, setIsUpdatingPwd] = useState(false);

  // Helper to hash password
  const hashPassword = async (password: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingPwd(true);
    setPwdError('');
    setPwdSuccess('');

    try {
      const DEFAULT_HASH = 'bfc7e9309e970b4802affde33a9c07151af5897ef4b4d251b119c171d24a4bec';
      const currentAdminHash = localStorage.getItem('netamps_admin_hash') || DEFAULT_HASH;
      const hashedInput = await hashPassword(currentPassword);

      if (hashedInput !== currentAdminHash) {
        setPwdError('Current admin password incorrect. Verification failed.');
        setIsUpdatingPwd(false);
        return;
      }

      if (newPassword.length < 12) {
        setPwdError('New password must be at least 12 characters for high security.');
        setIsUpdatingPwd(false);
        return;
      }

      const newHashed = await hashPassword(newPassword);
      if (targetAccount === 'admin') {
        localStorage.setItem('netamps_admin_hash', newHashed);
      } else {
        localStorage.setItem('netamps_staff_hash', newHashed);
      }

      setPwdSuccess(`Successfully updated secure password for ${targetAccount}@netamps.com`);
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setPwdError('Failed to process encryption.');
    }
    setIsUpdatingPwd(false);
  };

  useEffect(() => {
    // Check industry-standard session ID cookie
    const checkAuth = () => {
      const cookies = document.cookie.split(';');
      let hasSession = false;
      let role = '';
      
      cookies.forEach(cookie => {
        const [name, value] = cookie.trim().split('=');
        if (name === 'session_id' && value) hasSession = true;
        if (name === 'user_role') role = value;
      });

      if (!hasSession) {
        router.push('/login');
      } else {
        setIsAuthenticated(true);
        setUserRole(role);
        // Load data from mock database (localStorage)
        const stored = localStorage.getItem('netamps_returns');
        if (stored) {
          try {
            setReturns(JSON.parse(stored));
          } catch (e) {
            console.error(e);
          }
        }
      }
    };

    checkAuth();
  }, [router]);

  const handleLogout = () => {
    // Securely terminate session by destroying cookies
    document.cookie = 'session_id=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    document.cookie = 'user_role=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    router.push('/login');
  };

  const toggleRow = (id: string) => {
    const newSet = new Set(expandedRows);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedRows(newSet);
  };

  const handleUpdateStatus = (id: string, newStatus: string) => {
    const updatedReturns = returns.map(req => 
      req.id === id ? { ...req, status: newStatus } : req
    );
    setReturns(updatedReturns);
    localStorage.setItem('netamps_returns', JSON.stringify(updatedReturns));
  };

  const handleDeleteRequest = (id: string) => {
    if (window.confirm('Are you sure you want to permanently delete this request?')) {
      const updatedReturns = returns.filter(req => req.id !== id);
      setReturns(updatedReturns);
      localStorage.setItem('netamps_returns', JSON.stringify(updatedReturns));
    }
  };

  if (!isAuthenticated) return null; // Prevent flash of content

  return (
    <div className="min-h-screen bg-[#020817] text-white font-sans">
      {/* Top Navbar */}
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-4">
              <NetampsLogo />
              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                Enterprise DB
              </span>
            </div>
            
            <div className="flex items-center gap-6">
              <div className="text-sm font-medium text-slate-300">
                Logged in as <span className="text-white capitalize">{userRole}</span>
              </div>
              
              {userRole === 'admin' && (
                <button 
                  onClick={() => setShowPasswordModal(true)}
                  className="flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-1.5 rounded-lg transition-colors border border-emerald-500/20"
                >
                  <Key className="w-4 h-4" /> Manage Passwords
                </button>
              )}

              <button 
                onClick={handleLogout}
                className="flex items-center gap-2 text-sm text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors border border-slate-700"
              >
                <LogOut className="w-4 h-4" /> Terminate Session
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Password Management Modal */}
      {showPasswordModal && userRole === 'admin' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative">
            <div className="flex justify-between items-center p-6 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Key className="w-5 h-5 text-emerald-400" /> Security Settings
              </h3>
              <button onClick={() => setShowPasswordModal(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handlePasswordChange} className="p-6 space-y-5">
              {pwdError && (
                <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 flex items-center gap-2 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {pwdError}
                </div>
              )}
              {pwdSuccess && (
                <div className="bg-emerald-500/10 border border-emerald-500/50 rounded-lg p-3 flex items-center gap-2 text-emerald-400 text-sm">
                  <CheckCircle2 className="w-4 h-4 shrink-0" /> {pwdSuccess}
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Account to Update</label>
                <select 
                  value={targetAccount}
                  onChange={(e) => setTargetAccount(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-emerald-500"
                >
                  <option value="admin">admin@netamps.com</option>
                  <option value="staff">staff@netamps.com</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Current Admin Password (Verification)</label>
                <input 
                  type="password" 
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-emerald-500"
                  placeholder="Verify your identity..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">New Secure Password</label>
                <input 
                  type="password" 
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-emerald-500"
                  placeholder="Min 12 characters"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isUpdatingPwd}
                  className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-sm transition-colors disabled:opacity-70"
                >
                  {isUpdatingPwd ? 'Encrypting...' : 'Update Password Securely'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Active Requests Dashboard</h1>
            <p className="mt-2 text-sm text-slate-400">Manage all IT asset procurement (BUY) and liquidation (SELL) orders.</p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input type="text" placeholder="Search orders..." className="pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500 w-64" />
            </div>
            <button className="p-2 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors">
              <Filter className="w-4 h-4 text-slate-300" />
            </button>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-800">
              <thead className="bg-slate-800/50">
                <tr>
                  <th scope="col" className="w-10 px-4 py-4"></th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Tracking ID</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Client Details</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Order Size</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Date Submitted</th>
                  <th scope="col" className="px-6 py-4 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 bg-slate-900">
                {returns.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                      <ArchiveX className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      <p>No active requests found in the database.</p>
                      <p className="text-xs mt-1">New requests from the portal will appear here.</p>
                    </td>
                  </tr>
                ) : (
                  returns.map((req) => {
                    const isExpanded = expandedRows.has(req.id);
                    const isSell = req.intent === 'sell';
                    
                    return (
                      <React.Fragment key={req.id}>
                        <tr 
                          className="hover:bg-slate-800/30 transition-colors cursor-pointer group"
                          onClick={() => toggleRow(req.id)}
                        >
                          <td className="px-4 py-4 whitespace-nowrap text-slate-500 group-hover:text-white">
                            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2.5 py-1 text-xs font-bold rounded-lg border ${isSell ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                              {req.id}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-bold text-white">{req.name}</div>
                            <div className="text-xs text-slate-400">{req.company} &bull; {req.email}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <Package className="w-4 h-4 text-slate-500" />
                              <span className="text-sm text-slate-300 font-medium">{req.products?.length || 0} Products</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                            {new Date(req.date).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <span className={`px-2.5 py-1 text-xs font-medium border rounded-full ${
                              req.status === 'Approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                              req.status === 'Declined' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 
                              'bg-amber-500/10 text-amber-500 border-amber-500/20'
                            }`}>
                              {req.status}
                            </span>
                          </td>
                        </tr>
                        {/* Expandable Tree Row */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={6} className="px-0 py-0 bg-slate-950/50">
                              <div className="px-14 py-6 border-l-2 border-indigo-500/30 ml-8 my-4">
                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                                  <Tag className="w-4 h-4" /> Order Manifest
                                </h4>
                                <div className="space-y-3">
                                  {req.products && req.products.length > 0 ? (
                                    req.products.map((product, idx) => (
                                      <div key={product.id || idx} className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 flex justify-between items-center">
                                        <div>
                                          <div className="text-sm font-bold text-slate-200 capitalize mb-1">
                                            {product.category.replace('_', ' ')}
                                          </div>
                                          <div className="text-xs text-slate-400 max-w-2xl">
                                            {product.details}
                                          </div>
                                        </div>
                                        <div className="text-lg font-mono font-bold text-indigo-400 bg-indigo-500/10 px-4 py-2 rounded-lg border border-indigo-500/20">
                                          x{product.quantity}
                                        </div>
                                      </div>
                                    ))
                                  ) : (
                                    <div className="text-sm text-slate-500 italic">No products listed. (Legacy request)</div>
                                  )}
                                </div>
                                
                                {/* Evidence Section */}
                                {req.attachedFiles && req.attachedFiles.length > 0 && (
                                  <div className="mt-6">
                                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                                      <FileImage className="w-4 h-4" /> Attached Evidence ({req.attachedFiles.length})
                                    </h4>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                      {req.attachedFiles.map((fileKey, idx) => {
                                        const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL || 'https://netamps.cloudflareaccess.com/cdn';
                                        const fileUrl = `${cdnUrl}/${fileKey}`;
                                        const isVideo = fileKey.endsWith('.mp4') || fileKey.endsWith('.webm');
                                        return (
                                          <a key={idx} href={fileUrl} target="_blank" rel="noopener noreferrer" className="relative group block aspect-square rounded-xl overflow-hidden border border-slate-700 bg-slate-800/50 flex items-center justify-center hover:border-indigo-500 transition-colors">
                                            {isVideo ? (
                                              <div className="text-slate-400 group-hover:text-indigo-400 flex flex-col items-center gap-2">
                                                <Video className="w-8 h-8" />
                                                <span className="text-xs font-bold">Video</span>
                                              </div>
                                            ) : (
                                              <img src={fileUrl} alt="Evidence" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement?.classList.add('flex', 'items-center', 'justify-center'); }} />
                                            )}
                                          </a>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                <div className="mt-6 flex gap-3 border-t border-slate-800 pt-4">
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); handleUpdateStatus(req.id, 'Approved'); }}
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
                                  >
                                    Approve Request
                                  </button>
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); handleUpdateStatus(req.id, 'Declined'); }}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors"
                                  >
                                    Decline Request
                                  </button>
                                  {userRole === 'admin' && (
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); handleDeleteRequest(req.id); }}
                                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-red-400 text-sm font-medium rounded-lg transition-colors ml-auto border border-red-500/20"
                                    >
                                      Delete Request
                                    </button>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
