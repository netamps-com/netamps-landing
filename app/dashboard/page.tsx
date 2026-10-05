'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogOut, Package, Server, Smartphone, Laptop, Search, Filter, ArchiveX } from 'lucide-react';
import NetampsLogo from '../NetampsLogo';

interface ReturnRequest {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  equipment: string;
  details: string;
  date: string;
  status: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [returns, setReturns] = useState<ReturnRequest[]>([]);

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
                ITAD Admin
              </span>
            </div>
            
            <div className="flex items-center gap-6">
              <div className="text-sm font-medium text-slate-300">
                Logged in as <span className="text-white capitalize">{userRole}</span>
              </div>
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Incoming Return Requests</h1>
            <p className="mt-2 text-sm text-slate-400">Manage equipment decommissioning and logistics requests securely.</p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input type="text" placeholder="Search RMAs..." className="pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500 w-64" />
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
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">RMA ID</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Client Details</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Equipment</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Date Submitted</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                  <th scope="col" className="px-6 py-4 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-900">
                {returns.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                      <ArchiveX className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      <p>No return requests found in the database.</p>
                      <p className="text-xs mt-1">Submit a test request at /returns</p>
                    </td>
                  </tr>
                ) : (
                  returns.map((req) => (
                    <tr key={req.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-indigo-400">
                        {req.id}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-bold text-white">{req.name}</div>
                        <div className="text-xs text-slate-400">{req.company} &bull; {req.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-slate-500" />
                          <span className="text-sm text-slate-300 capitalize">{req.equipment}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                        {new Date(req.date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2.5 py-1 text-xs font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-full">
                          {req.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button className="text-indigo-400 hover:text-indigo-300 transition-colors">Review</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
