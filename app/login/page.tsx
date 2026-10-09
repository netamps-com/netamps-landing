'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from "motion/react";
import { Lock, ArrowRight, ShieldCheck, Laptop, AlertCircle, Activity, ExternalLink, Mail } from 'lucide-react';
import NetampsLogo from '../NetampsLogo';

const statusColors = {
  operational: 'bg-emerald-500 text-emerald-400',
  degraded: 'bg-amber-500 text-amber-400',
  maintenance: 'bg-blue-500 text-blue-400',
  outage: 'bg-red-500 text-red-400',
  unknown: 'bg-slate-500 text-slate-400'
};

const HealthStatusWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [healthStatus, setHealthStatus] = useState<{
    database: { status: string; latency: number | null };
    api: { status: string };
    payload: { status: string; latency: number | null };
    cdn: { status: string; colo: string };
    timestamp: string;
  } | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    const fetchHealthStatus = async () => {
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
        const res = await fetch(`${API_URL}/api/health/live`);
        if (res.ok) {
          const data = await res.json();
          setHealthStatus(data);
        }
      } catch (err) {
        console.error('Health check failed:', err);
      } finally {
        setHealthLoading(false);
      }
    };
    fetchHealthStatus();
    const interval = setInterval(fetchHealthStatus, 30000); // Every 30 seconds
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (healthLoading || !healthStatus) {
    return (
      <div className="absolute top-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700">
        <div className="w-2 h-2 rounded-full bg-slate-500 animate-pulse"></div>
        <span className="text-xs text-slate-400">Loading health...</span>
      </div>
    );
  }

  const getOverallStatus = () => {
    const statuses = [healthStatus.database?.status, healthStatus.api?.status, healthStatus.payload?.status, healthStatus.cdn?.status].filter(Boolean);
    if (statuses.includes('outage')) return 'outage';
    if (statuses.includes('degraded')) return 'degraded';
    if (statuses.includes('maintenance')) return 'maintenance';
    return 'operational';
  };

  const overall = getOverallStatus();

  return (
    <div className="absolute top-4 right-4 z-50 relative flex items-center gap-3">
      {/* Overall Status Indicator */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors bg-white/90 backdrop-blur-md shadow-md cursor-pointer hover:scale-105"
        onClick={() => setIsOpen(!isOpen)}
        style={{ 
          borderColor: overall === 'operational' ? 'rgba(16, 185, 129, 0.3)' : 
                      overall === 'degraded' ? 'rgba(245, 158, 11, 0.3)' :
                      overall === 'outage' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(59, 130, 246, 0.3)'
        }}>
        <div className={`w-2 h-2 rounded-full animate-ping ${overall === 'operational' ? 'bg-emerald-500' : 
                          overall === 'degraded' ? 'bg-amber-500' :
                          overall === 'outage' ? 'bg-red-500' : 'bg-blue-500'}`}></div>
        <span className={`text-xs font-bold ${overall === 'operational' ? 'text-emerald-500' : 
                          overall === 'degraded' ? 'text-amber-500' :
                          overall === 'outage' ? 'text-red-500' : 'text-blue-500'}`}>
          {overall.charAt(0).toUpperCase() + overall.slice(1)}
        </span>
      </div>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 z-50 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200">
          <div className="p-3 border-b border-slate-700 flex justify-between items-start">
            <div>
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                Live System Metrics
              </h4>
              <p className="text-[10px] text-slate-500 mt-1">Updated: {healthStatus.timestamp ? new Date(healthStatus.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString()}</p>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-slate-300">
               <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          
          <div className="p-3 space-y-3">
            {/* Internet Connection */}
            <div className="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-red-500'} split x`}></div>
                <span className="text-xs font-medium text-slate-200">Internet Connection</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono text-slate-400">{isOnline ? 'Connected' : 'Offline'}</span>
              </div>
            </div>

            {/* Database */}
            <div className="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${statusColors[healthStatus.database?.status as keyof typeof statusColors] || statusColors.unknown} split x`}></div>
                <span className="text-xs font-medium text-slate-200">Database</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono text-emerald-400">{healthStatus.database?.latency ? `${healthStatus.database.latency}ms` : 'N/A'}</span>
              </div>
            </div>

            {/* API */}
            <div className="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${statusColors[healthStatus.api?.status as keyof typeof statusColors] || statusColors.unknown} split x`}></div>
                <span className="text-xs font-medium text-slate-200">API Gateway</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono text-slate-400">Online</span>
              </div>
            </div>

            {/* Payload */}
            <div className="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${statusColors[healthStatus.payload?.status as keyof typeof statusColors] || statusColors.unknown} split x`}></div>
                <span className="text-xs font-medium text-slate-200">Website Payload</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono text-indigo-400">{healthStatus.payload?.latency ? `${healthStatus.payload.latency}ms` : 'N/A'}</span>
              </div>
            </div>

            {/* CDN */}
            <div className="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${statusColors[healthStatus.cdn?.status as keyof typeof statusColors] || statusColors.unknown} split x`}></div>
                <span className="text-xs font-medium text-slate-200">Edge CDN</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">{healthStatus.cdn?.colo || 'Global'}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);


  const router = useRouter();
  const [errorMsg, setErrorMsg] = useState('');

  const [showStatus, setShowStatus] = useState(false);

  useEffect(() => {
    document.title = 'Netamps Connect';
  }, []);

  useEffect(() => {
    // Independent Login Session ID in URL (CSPRNG)
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has('sid')) {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        const sid = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
        url.searchParams.set('sid', sid);
        window.history.replaceState({}, '', url.toString());
      }
    } catch {
      // URL manipulation unavailable
    }
  }, []);

  // Helper to hash password (Industry standard SHA-256 for client-side transmission simulation)
  const hashPassword = async (password: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    setIsSubmitting(true);

    try {
      await processLogin('no_captcha');
    } catch (err) {
      setErrorMsg('Encryption error occurred.');
      setIsSubmitting(false);
    }
  };

  const processLogin = async (captchaToken: string) => {
    try {
      const hashedPassword = await hashPassword(password);
      
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${API_URL}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email, passwordHash: hashedPassword })
      });
      const data = await res.json();

      if (data.success) {
        // Note: `Secure` cookies require HTTPS. Localhost HTTP will drop them. Use Pages preview URLs.
        document.cookie = `session_id=${data.sessionId}; path=/; max-age=28800; SameSite=Strict; Secure`;
        document.cookie = `user_role=${email}; path=/; max-age=28800; SameSite=Strict; Secure`;
        
        try {
          const { logEvent } = await import('../lib/logger');
          logEvent('AUTH_SUCCESS', 'Login Page', 'User logged in successfully', email);
        } catch(e) {}
        
        router.push('/dashboard');
        return;
      }

      setErrorMsg(data.message || 'Invalid credentials');
      setIsSubmitting(false);
      try {
        const { logEvent } = await import('../lib/logger');
        logEvent('AUTH_FAILED_INVALID', 'Login Page', 'Invalid credentials provided', email);
      } catch(e) {}
    } catch (err) {
      const { logEvent } = await import('../lib/logger');
      logEvent('AUTH_ERROR', 'Login Page', 'Encryption error during login', email);
      setErrorMsg('Network error. Check connection.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/20 text-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      
      {/* Floating Status Widget */}
      <HealthStatusWidget />

      {/* Ambient Glassmorphism Background */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-grid-pattern opacity-50">
        <div className="absolute top-0 right-0 w-[50vw] h-[50vw] bg-indigo-200/50 blur-[100px] rounded-full mix-blend-multiply opacity-50"></div>
        <div className="absolute bottom-0 left-0 w-[50vw] h-[50vw] bg-emerald-200/40 blur-[100px] rounded-full mix-blend-multiply opacity-50"></div>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center mb-8">
          <Link href="/" className="scale-125 transform origin-center transition-transform hover:scale-110">
            <NetampsLogo />
          </Link>
        </div>
        <h2 className="mt-2 text-center text-3xl font-black tracking-tight text-slate-900">
          Netamps Connect
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/90 backdrop-blur-xl py-8 px-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:rounded-3xl sm:px-10 border border-slate-200/60"
        >
          <form className="space-y-6" onSubmit={handleSubmit}>
            {errorMsg && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                {errorMsg}
              </div>
            )}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                Email address
              </label>
              <div className="mt-2 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-all"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                Password
              </label>
              <div className="mt-2 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-all"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-500">
                  Remember me
                </label>
              </div>
            </div>


            <div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    Sign in to Portal <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
          
          </motion.div>
        
        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-500 font-medium">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Protected by Enterprise TLS 1.3 & SOC2 Compliance</span>
        </div>
      </div>
    </div>
  );
}
