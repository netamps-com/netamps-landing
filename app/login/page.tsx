'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Mail, Lock, ArrowRight, ShieldCheck, Laptop, AlertCircle } from 'lucide-react';
import NetampsLogo from '../NetampsLogo';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const router = useRouter();
  const [errorMsg, setErrorMsg] = useState('');

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
      const hashedPassword = await hashPassword(password);
      
      // Known hashes for Netamps2026! 
      // In a real app, this verification happens on the backend database.
      const EXPECTED_HASH = '1f1cd5f7c00af26a1e80ea4eb4306352934ff24cf24cbf130fccb483b28b6d85'; // Hash of 'Netamps2026!'

      if ((email === 'admin@netamps.com' || email === 'staff@netamps.com') && hashedPassword === EXPECTED_HASH) {
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
          Access your ITAD portal
        </h2>
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
                  placeholder="admin@company.com"
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
                href="https://webmail.netamps.in/"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-slate-700 rounded-xl shadow-sm text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-slate-500 transition-all"
              >
                <Mail className="w-4 h-4" />
                Webmail Login
              </a>
            </div>
          </div>
        </motion.div>
        
        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-500 font-medium">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Protected by Enterprise TLS 1.3 & SOC2 Compliance</span>
        </div>
      </div>
    </div>
  );
}
