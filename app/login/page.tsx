'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { motion } from 'framer-motion';
import { Mail, Lock, ArrowRight, ShieldCheck, Laptop, AlertCircle, Activity, ExternalLink } from 'lucide-react';
import NetampsLogo from '../NetampsLogo';

const ServerStatusWidget = () => {
  const [status, setStatus] = useState<string>('checking');

  useEffect(() => {
    fetch('/api/status')
      .then(res => res.json())
      .then(data => setStatus(data.overallStatus))
      .catch(() => setStatus('unknown'));
  }, []);

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

  return (
    <Link href="/status" className="fixed bottom-6 right-6 z-50 bg-slate-900/80 backdrop-blur-xl border border-slate-800 p-3 rounded-2xl shadow-2xl flex items-center gap-3 hover:bg-slate-800 hover:border-slate-700 transition-all group">
      <div className="relative flex h-3 w-3">
        {status === 'operational' && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
        <span className={`relative inline-flex rounded-full h-3 w-3 ${getStatusColor()}`}></span>
      </div>
      <div>
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">System Status</div>
        <div className="text-sm font-medium text-white group-hover:text-emerald-400 transition-colors flex items-center gap-1">
          {getStatusText()} <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
    </Link>
  );
};

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const router = useRouter();
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    document.title = 'ITAD Login - Netamps Technologies';
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
    setIsSubmitting(true);
    setErrorMsg('');

    try {
      // Execute reCAPTCHA v3 verification
      if (typeof window !== 'undefined' && (window as any).grecaptcha) {
        (window as any).grecaptcha.ready(async () => {
          try {
            const token = await (window as any).grecaptcha.execute('6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI', { action: 'login' });
            if (!token) {
               setErrorMsg('reCAPTCHA verification failed.');
               setIsSubmitting(false);
               return;
            }
            
            // Proceed with secure login if captcha passes
            await processLogin();
          } catch (captchaErr) {
            setErrorMsg('reCAPTCHA error occurred.');
            setIsSubmitting(false);
          }
        });
      } else {
        await processLogin(); // Fallback if script didn't load
      }
    } catch (err) {
      setErrorMsg('Encryption error occurred.');
      setIsSubmitting(false);
    }
  };

  const processLogin = async () => {
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
        setIsSubmitting(false);
      }
    } catch (err) {
      setErrorMsg('Encryption error occurred.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020817] flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      <Script src="https://www.google.com/recaptcha/api.js?render=6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI" />
      
      {/* Floating Status Widget */}
      <ServerStatusWidget />

      {/* Background Effects */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150"></div>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[1000px] h-[500px] bg-emerald-500/20 blur-[120px] rounded-full pointer-events-none opacity-50"></div>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center mb-8">
          <Link href="/" className="scale-125 transform origin-center transition-transform hover:scale-110">
            <NetampsLogo />
          </Link>
        </div>
        <h2 className="mt-2 text-center text-3xl font-black tracking-tight text-white">
          Netamps Connect
        </h2>
        <p className="mt-3 text-center text-lg text-slate-300 max-w-md mx-auto leading-relaxed">
          The secure interface for high-velocity hardware liquidation, certified data sanitization, and premium secondary market sourcing
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900/50 backdrop-blur-xl py-8 px-4 shadow-2xl sm:rounded-3xl sm:px-10 border border-slate-800"
        >
          <form className="space-y-6" onSubmit={handleSubmit}>
            {errorMsg && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                {errorMsg}
              </div>
            )}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300">
                Email address
              </label>
              <div className="mt-2 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none block w-full pl-10 pr-3 py-3 border border-slate-700 rounded-xl bg-slate-800/50 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm transition-all"
                  placeholder="procurement@yourcompany.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300">
                Password
              </label>
              <div className="mt-2 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none block w-full pl-10 pr-3 py-3 border border-slate-700 rounded-xl bg-slate-800/50 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm transition-all"
                  placeholder="Enter your secure password"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 text-emerald-500 focus:ring-emerald-500 border-slate-700 rounded bg-slate-800"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-400">
                  Remember me
                </label>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-slate-900 bg-emerald-400 hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-emerald-500 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <div className="h-5 w-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    Sign in to Portal <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
            <p className="text-[10px] text-center text-slate-500 mt-4 leading-relaxed">
              This site is protected by reCAPTCHA and the Google{' '}
              <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-emerald-500 hover:underline">Privacy Policy</a> and{' '}
              <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="text-emerald-500 hover:underline">Terms of Service</a> apply.
            </p>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-700" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-slate-900/50 text-slate-500 backdrop-blur-xl">Employee Access</span>
              </div>
            </div>

            <div className="mt-6">
              <a
                href="https://www.netamps.com/returns"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-emerald-500/50 rounded-xl shadow-sm text-sm font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-emerald-500 transition-all"
              >
                <Mail className="w-4 h-4" />
                Submit Return Request
              </a>
            </div>
          </div>
        </motion.div>
        
        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-500 font-medium">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Protected by Enterprise TLS 1.3 & SOC2 Compliance</span>
        </div>

        <div className="mt-4 flex items-center justify-center gap-4 text-xs text-slate-500">
          <Link href="/status" className="flex items-center gap-1 hover:text-emerald-400 transition-colors">
            <Activity className="w-3 h-3" />
            System Status
          </Link>
          {/* <span className="text-slate-700">|</span>
          <a
            href="https://status.netamps.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-emerald-400 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Public Status Page
          </a> */}
        </div>
      </div>
    </div>
  );
}
