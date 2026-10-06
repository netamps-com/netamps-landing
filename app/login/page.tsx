'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Mail, Lock, ArrowRight, ShieldCheck, Laptop, AlertCircle, Activity, ExternalLink } from 'lucide-react';
import NetampsLogo from '../NetampsLogo';
import TurnstileWidget, { verifyTurnstileToken } from '../TurnstileWidget';

const TURNSTILE_ENABLED = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

const ServerStatusWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<string>('checking');

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/status')
      .then(res => res.json())
      .then(data => setStatus(data.overallStatus))
      .catch(() => setStatus('unknown'));
  }, [isOpen]);

  const getStatusColor = () => {
    if (status === 'operational') return 'bg-emerald-500';
    if (status === 'degraded') return 'bg-amber-500';
    if (status === 'outage') return 'bg-red-500';
    if (status === 'checking') return 'bg-slate-500 animate-pulse';
    return 'bg-slate-500';
  };

  const getStatusText = () => {
    if (status === 'operational') return 'All Systems Operational';
    if (status === 'degraded') return 'Degraded Performance';
    if (status === 'outage') return 'System Outage';
    if (status === 'checking') return 'Checking status...';
    return 'Status Unknown';
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)} 
        className="absolute top-4 right-4 z-50 bg-white/90 backdrop-blur-md border border-slate-200 p-2.5 rounded-full shadow-md text-slate-500 hover:text-indigo-600 transition-all hover:scale-110 focus:outline-none"
        title="View System Status"
      >
        <Activity className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div className="absolute top-4 right-4 z-50 bg-white border border-slate-200 p-3 rounded-xl shadow-lg flex items-center gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex items-center gap-3">
        <div className="relative flex h-3 w-3">
          {status === 'operational' && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
          <span className={`relative inline-flex rounded-full h-3 w-3 ${getStatusColor()}`}></span>
        </div>
        <div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">System Status</div>
          <div className="text-sm font-medium text-slate-900 flex items-center gap-1">
            {getStatusText()}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 border-l border-slate-100 pl-3">
        <Link href="/status" className="text-slate-400 hover:text-indigo-600 transition-colors" title="View Full Status">
          <ExternalLink className="w-4 h-4" />
        </Link>
        <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors" title="Close">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    </div>
  );
};

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileReset, setTurnstileReset] = useState(0);

  const router = useRouter();
  const [errorMsg, setErrorMsg] = useState('');

  const [showStatus, setShowStatus] = useState(false);

  useEffect(() => {
    document.title = 'ITAD Login - Netamps Technologies';
  }, []);

  useEffect(() => {
    // Independent Login Session ID in URL
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has('sid')) {
        const sid = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
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

    // Cloudflare Turnstile verification (bypassed only when no site key is configured, e.g. local dev)
    if (TURNSTILE_ENABLED && !turnstileToken) {
      setErrorMsg('Please complete the security check below.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Server-side Turnstile verification — never trust the client token alone
      if (TURNSTILE_ENABLED) {
        const verified = await verifyTurnstileToken(turnstileToken, 'login');
        if (!verified) {
          setErrorMsg('Security verification failed. Please try again.');
          resetTurnstile();
          setIsSubmitting(false);
          return;
        }
      }
      await processLogin(turnstileToken);
    } catch (err) {
      setErrorMsg('Encryption error occurred.');
      resetTurnstile();
      setIsSubmitting(false);
    }
  };

  const resetTurnstile = () => {
    setTurnstileToken('');
    setTurnstileReset((n) => n + 1);
  };

  const processLogin = async (captchaToken: string) => {
    try {
      const hashedPassword = await hashPassword(password);
      
      const DEFAULT_HASH = 'bfc7e9309e970b4802affde33a9c07151af5897ef4b4d251b119c171d24a4bec'; // Netamps2026!
      
      let expectedHash = '';
      if (email === 'admin@netamps.com') {
        expectedHash = localStorage.getItem('netamps_admin_hash') || DEFAULT_HASH;
      } else if (email === 'staff@netamps.com') {
        expectedHash = localStorage.getItem('netamps_staff_hash') || DEFAULT_HASH;
      }

      // Strictly allow ONLY admin and staff, and ONLY with correct hashes
      if ((email === 'admin@netamps.com' || email === 'staff@netamps.com') && expectedHash && hashedPassword === expectedHash) {
        // Create secure session ID
        const sessionId = crypto.randomUUID();
        document.cookie = `session_id=${sessionId}; path=/; max-age=3600; SameSite=Strict; Secure`;
        document.cookie = `user_role=${email.split('@')[0]}; path=/; max-age=3600; SameSite=Strict; Secure`;
        
        // Redirect to dashboard
        router.push('/dashboard');
      } else {
        setErrorMsg('Invalid credentials. Please try again.');
        resetTurnstile();
        setIsSubmitting(false);
      }
    } catch (err) {
      setErrorMsg('Encryption error occurred.');
      resetTurnstile();
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/20 text-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      
      {/* Floating Status Widget */}
      <ServerStatusWidget />

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
                  placeholder="john.doe@example.com"
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
                  placeholder="••••••••"
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
              <TurnstileWidget
                onVerify={(token) => setTurnstileToken(token)}
                onExpire={() => setTurnstileToken('')}
                onError={() => setTurnstileToken('')}
                resetSignal={turnstileReset}
              />
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
            <p className="text-[10px] text-center text-slate-500 mt-4 leading-relaxed">
              Protected by Cloudflare Turnstile. See the{' '}
              <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">Cloudflare Privacy Policy</a> and{' '}
              <a href="https://www.cloudflare.com/website-terms/" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">Terms of Service</a> for details.
            </p>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white/90 text-slate-500 backdrop-blur-xl">Employee Access</span>
              </div>
            </div>

            <div className="mt-6">
              <a
                href="https://webmail.netamps.in/"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-slate-200 rounded-xl shadow-sm text-sm font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all"
              >
                <Mail className="w-4 h-4" />
                Employee Login
              </a>
            </div>
          </div>
        </motion.div>
        
        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-500 font-medium">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Protected by Enterprise TLS 1.3 & SOC2 Compliance</span>
        </div>
      </div>
    </div>
  );
}
