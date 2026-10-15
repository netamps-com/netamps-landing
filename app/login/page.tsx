'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from "motion/react";
import { Turnstile } from '@marsidev/react-turnstile';
import { Lock, ArrowRight, ShieldCheck, Laptop, AlertCircle, Activity, ExternalLink, Mail } from 'lucide-react';
import NetampsLogo from '../NetampsLogo';

const statusColors = {
  operational: 'bg-emerald-500 text-emerald-600',
  degraded: 'bg-amber-500 text-amber-600',
  maintenance: 'bg-blue-500 text-blue-600',
  outage: 'bg-red-500 text-red-600',
  unknown: 'bg-slate-500 text-slate-500'
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
      <div className="absolute top-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 bg-white/90 rounded-lg border border-slate-200">
        <div className="w-2 h-2 rounded-full bg-slate-500 animate-pulse"></div>
        <span className="text-xs text-slate-500">Loading health...</span>
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
        <div className="absolute right-0 top-full mt-2 z-50 w-72 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200">
          <div className="p-3 border-b border-slate-200 flex justify-between items-start">
            <div>
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
                Live System Metrics
              </h4>
              <p className="text-[10px] text-slate-500 mt-1">Updated: {healthStatus.timestamp ? new Date(healthStatus.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString()}</p>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-slate-700">
               <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          
          <div className="p-3 space-y-3">
            {/* Internet Connection */}
            <div className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-red-500'} split x`}></div>
                <span className="text-xs font-medium text-slate-900">Internet Connection</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono text-slate-500">{isOnline ? 'Connected' : 'Offline'}</span>
              </div>
            </div>

            {/* Database */}
            <div className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${statusColors[healthStatus.database?.status as keyof typeof statusColors] || statusColors.unknown} split x`}></div>
                <span className="text-xs font-medium text-slate-900">Database</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono text-emerald-600">{healthStatus.database?.latency ? `${healthStatus.database.latency}ms` : 'N/A'}</span>
              </div>
            </div>

            {/* API */}
            <div className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${statusColors[healthStatus.api?.status as keyof typeof statusColors] || statusColors.unknown} split x`}></div>
                <span className="text-xs font-medium text-slate-900">API Gateway</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono text-slate-500">Online</span>
              </div>
            </div>

            {/* Payload */}
            <div className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${statusColors[healthStatus.payload?.status as keyof typeof statusColors] || statusColors.unknown} split x`}></div>
                <span className="text-xs font-medium text-slate-900">Website Payload</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono text-indigo-600">{healthStatus.payload?.latency ? `${healthStatus.payload.latency}ms` : 'N/A'}</span>
              </div>
            </div>

            {/* CDN */}
            <div className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${statusColors[healthStatus.cdn?.status as keyof typeof statusColors] || statusColors.unknown} split x`}></div>
                <span className="text-xs font-medium text-slate-900">Edge CDN</span>
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
  // Turnstile bot gate (action-pinned 'login'). Dormant when the site key is
  // unset (.env.example contract) — the gate activates on key configuration.
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileKey, setTurnstileKey] = useState(0);

  const resetTurnstile = () => {
    setTurnstileToken('');
    setTurnstileKey((k) => k + 1); // remount mints a fresh single-use token
  };


  const router = useRouter();
  const [errorMsg, setErrorMsg] = useState('');
  const [showStatus, setShowStatus] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  // Invite acceptance (?invite=TOKEN): token-bound account activation.
  // Rendered INSTEAD of the sign-in form — never alongside it.
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteConfirm, setInviteConfirm] = useState('');
  const [inviteMsg, setInviteMsg] = useState('');
  const [inviteDone, setInviteDone] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  // Self-service password reset (?reset=TOKEN): same token discipline as
  // invites (single-use, 15-min TTL, identical errors). Rendered INSTEAD of
  // the sign-in form — staff/user set their own password, admins never see it.
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetMsg, setResetMsg] = useState('');
  const [resetDone, setResetDone] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetRequestMsg, setResetRequestMsg] = useState('');
  const [resetRequestBusy, setResetRequestBusy] = useState(false);
  // Idle-timeout arrival (?expired=1): the watchdog revoked the session after
  // 30 minutes without activity. Informational only — never alongside
  // invite/reset views (those render instead of the sign-in form).
  const [expiredNotice, setExpiredNotice] = useState(false);

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
      const inv = new URL(window.location.href).searchParams.get('invite');
      if (inv) setInviteToken(inv);
      const rst = new URL(window.location.href).searchParams.get('reset');
      if (rst) setResetToken(rst);
      const exp = new URL(window.location.href).searchParams.get('expired');
      if (exp === '1') setExpiredNotice(true);
    } catch {
      // URL manipulation unavailable
    }
  }, []);

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetMsg('');
    if (!resetToken) return;
    if (resetPassword.length < 8) {
      setResetMsg('Choose a password of at least 8 characters.');
      return;
    }
    if (resetPassword !== resetConfirm) {
      setResetMsg('Passwords do not match.');
      return;
    }
    setResetBusy(true);
    try {
      const hashedPassword = await hashPassword(resetPassword);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${API_URL}/api/users/password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset', token: resetToken, passwordHash: hashedPassword })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.success) {
        setResetMsg('This reset link is invalid or has expired. Request a fresh one below.');
        return;
      }
      setResetDone(true);
    } catch {
      setResetMsg('Network error. Try again shortly.');
    } finally {
      setResetBusy(false);
    }
  };

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetRequestMsg('');
    if (!email.trim()) {
      setResetRequestMsg('Enter your account email above first.');
      return;
    }
    setResetRequestBusy(true);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      await fetch(`${API_URL}/api/users/password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request', email: email.trim() })
      });
      // Identical either way (server never confirms nor denies existence).
      setResetRequestMsg('If this mailbox holds an account, a reset link is on its way (15 minutes, single use).');
    } catch {
      setResetRequestMsg('If this mailbox holds an account, a reset link is on its way (15 minutes, single use).');
    } finally {
      setResetRequestBusy(false);
    }
  };

  const handleInviteAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteMsg('');
    if (!inviteToken) return;
    if (invitePassword.length < 8) {
      setInviteMsg('Choose a password of at least 8 characters.');
      return;
    }
    if (invitePassword !== inviteConfirm) {
      setInviteMsg('Passwords do not match.');
      return;
    }
    setInviteBusy(true);
    try {
      const hashedPassword = await hashPassword(invitePassword);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${API_URL}/api/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept', token: inviteToken, passwordHash: hashedPassword })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.success) {
        // PENDING_APPROVAL is shown plainly (the holder already owns the
        // token — nothing leaks); everything else stays identical.
        if (data && data.code === 'PENDING_APPROVAL') {
          setInviteMsg('This invitation is waiting for admin approval. You will be notified once approved — no need to request again.');
        } else {
          setInviteMsg('This invitation link is invalid or has expired. Ask your administrator for a new one.');
        }
        return;
      }
      setInviteDone(true);
    } catch {
      setInviteMsg('Network error. Try again shortly.');
    } finally {
      setInviteBusy(false);
    }
  };

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

    // Bot gate: token presence checked here; the single siteverify happens
    // server-side inside /api/users (tokens are single-use — verifying twice
    // burns the token and every login would fail).
    if (turnstileSiteKey && !turnstileToken) {
      setErrorMsg('Complete the human verification challenge before signing in.');
      return;
    }

    setIsSubmitting(true);

    try {
      await processLogin(turnstileSiteKey ? turnstileToken : 'no_captcha');
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
        body: JSON.stringify({ action: 'login', email, passwordHash: hashedPassword, remember: rememberMe, turnstileToken: captchaToken === 'no_captcha' ? undefined : captchaToken })
      });
      const data = await res.json();

      if (data.success) {
        // Remember-me decides persistence: checked → 30-day cookies,
        // unchecked → session cookies that die with the tab.
        // session_id carries the server-signed value (forgery-dead); it stays
        // JS-writable until the dashboard presence check moves off
        // document.cookie (coordinated cutover — see deploy notes).
        const age = rememberMe ? '; max-age=2592000' : '';
        if (data.sessionId) {
          document.cookie = `session_id=${data.sessionId}; path=/${age}; SameSite=Strict; Secure`;
        }
        document.cookie = `user_role=${email}; path=/${age}; SameSite=Strict; Secure`;
        
        try {
          const { logEvent } = await import('../lib/logger');
          logEvent('AUTH_SUCCESS', 'Login Page', 'User logged in successfully', email);
        } catch(e) {}
        
        router.push('/dashboard');
        return;
      }

      setErrorMsg(data.message || 'Invalid credentials');
      setIsSubmitting(false);
      if (turnstileSiteKey) resetTurnstile(); // token is single-use — mint a fresh one
      try {
        const { logEvent } = await import('../lib/logger');
        logEvent('AUTH_FAILED_INVALID', 'Login Page', 'Invalid credentials provided', email);
      } catch(e) {}
    } catch (err) {
      const { logEvent } = await import('../lib/logger');
      logEvent('AUTH_ERROR', 'Login Page', 'Encryption error during login', email);
      setErrorMsg('Network error. Check connection.');
      setIsSubmitting(false);
      if (turnstileSiteKey) resetTurnstile();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/20 text-slate-900 flex items-center justify-center px-4 py-8 relative overflow-hidden">
      {/* Floating Status Widget */}
      <HealthStatusWidget />

      {/* Ambient Glassmorphism Background */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-grid-pattern opacity-50">
        <div className="absolute top-0 right-0 w-[40vw] h-[40vw] bg-indigo-200/50 blur-[100px] rounded-full mix-blend-multiply opacity-50"></div>
        <div className="absolute bottom-0 left-0 w-[40vw] h-[40vw] bg-emerald-200/40 blur-[100px] rounded-full mix-blend-multiply opacity-50"></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/90 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl p-6 sm:p-8 border border-slate-200/60 flex flex-col gap-5"
        >
          {/* Brand lockup. The logo and product name come BACK - they say which
              system this form belongs to, so removing them cost meaning to buy
              spacing. What changed is that they are no longer their own stacked
              block with mb-8 above and mt-8 below: they are the first rows of
              the one column, and the space around them is the card's `gap`.
              Sized explicitly at 48px rather than the old `scale-125` wrapper,
              which rendered a 48px mark as roughly 60px and pushed the rest of
              the card toward the fold. */}
          <div className="flex flex-col items-center gap-2.5">
            <Link
              href="/"
              aria-label="Netamps Technologies – Home"
              className="transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg"
            >
              <NetampsLogo className="h-12 w-12" />
            </Link>
            <h2 className="text-xl font-black tracking-tight text-slate-900">
              Netamps Connect
            </h2>
          </div>

          {resetToken ? (
            <div className="space-y-6">
              <div className="text-center">
                <h3 className="text-xl font-black text-slate-900">Choose a new password</h3>
                <p className="text-sm text-slate-500 mt-1">This link works once and expires 15 minutes after issue.</p>
              </div>
              {resetDone ? (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center">
                  <p className="text-sm font-bold text-emerald-700">Password updated — sign in below with your new password.</p>
                  <button
                    type="button"
                    onClick={() => { setResetToken(null); setResetPassword(''); setResetConfirm(''); setResetMsg(''); }}
                    className="mt-3 text-sm font-bold text-indigo-600 hover:underline"
                  >
                    Go to sign in
                  </button>
                </div>
              ) : (
                <form className="space-y-4" onSubmit={handleResetSubmit}>
                  {resetMsg && (
                    <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 flex items-center gap-2 text-red-500 text-sm">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {resetMsg}
                    </div>
                  )}
                  <div>
                    <label htmlFor="reset-password" className="block text-sm font-medium text-slate-700">New password (min 8 characters)</label>
                    <input
                      id="reset-password"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      className="mt-2 appearance-none block w-full px-3 py-3 border border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="reset-confirm" className="block text-sm font-medium text-slate-700">Confirm password</label>
                    <input
                      id="reset-confirm"
                      type="password"
                      autoComplete="new-password"
                      required
                      value={resetConfirm}
                      onChange={(e) => setResetConfirm(e.target.value)}
                      className="mt-2 appearance-none block w-full px-3 py-3 border border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={resetBusy}
                    className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-all disabled:opacity-70"
                  >
                    {resetBusy ? <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Set new password'}
                  </button>
                </form>
              )}
            </div>
          ) : inviteToken ? (
            <div className="space-y-6">
              <div className="text-center">
                <h3 className="text-xl font-black text-slate-900">Accept staff invitation</h3>
                <p className="text-sm text-slate-500 mt-1">This link works once and is bound to your mailbox. Set your password to activate.</p>
              </div>
              {inviteDone ? (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center">
                  <p className="text-sm font-bold text-emerald-700">Account active — sign in below with the password you just set. If this was not you, use “Locked out? Email me a reset link” on the sign-in form immediately.</p>
                  <button
                    type="button"
                    onClick={() => { setInviteToken(null); setInvitePassword(''); setInviteConfirm(''); setInviteMsg(''); }}
                    className="mt-3 text-sm font-bold text-indigo-600 hover:underline"
                  >
                    Go to sign in
                  </button>
                </div>
              ) : (
                <form className="space-y-4" onSubmit={handleInviteAccept}>
                  {inviteMsg && (
                    <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 flex items-center gap-2 text-red-500 text-sm">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {inviteMsg}
                    </div>
                  )}
                  <div>
                    <label htmlFor="invite-password" className="block text-sm font-medium text-slate-700">New password (min 8 characters)</label>
                    <input
                      id="invite-password"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      value={invitePassword}
                      onChange={(e) => setInvitePassword(e.target.value)}
                      className="mt-2 appearance-none block w-full px-3 py-3 border border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="invite-confirm" className="block text-sm font-medium text-slate-700">Confirm password</label>
                    <input
                      id="invite-confirm"
                      type="password"
                      autoComplete="new-password"
                      required
                      value={inviteConfirm}
                      onChange={(e) => setInviteConfirm(e.target.value)}
                      className="mt-2 appearance-none block w-full px-3 py-3 border border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={inviteBusy}
                    className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-all disabled:opacity-70"
                  >
                    {inviteBusy ? <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Activate account'}
                  </button>
                </form>
              )}
            </div>
          ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            {expiredNotice && (
              <div className="bg-amber-500/10 border border-amber-500/50 rounded-lg p-3 flex items-center gap-2 text-amber-600 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Signed out after 30 minutes of inactivity. Sign in again to continue.
              </div>
            )}
            {errorMsg && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 flex items-center gap-2 text-red-600 text-sm">
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
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-500">
                  Remember me
                </label>
              </div>
            </div>

            {turnstileSiteKey && (
              <div className="flex justify-center">
                <Turnstile
                  key={turnstileKey}
                  siteKey={turnstileSiteKey}
                  options={{ theme: 'light', action: 'login', appearance: 'always' }}
                  onSuccess={(token) => setTurnstileToken(token)}
                  onExpire={() => setTurnstileToken('')}
                  onError={() => setTurnstileToken('')}
                />
              </div>
            )}

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
            <div className="text-center space-y-1">
              <button
                type="button"
                onClick={handleResetRequest}
                disabled={resetRequestBusy}
                className="text-sm font-bold text-indigo-600 hover:underline disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
              >
                {resetRequestBusy ? 'Sending…' : 'Locked out? Email me a reset link'}
              </button>
              {resetRequestMsg && <p className="text-xs text-slate-500">{resetRequestMsg}</p>}
            </div>
          </form>
          )}
          
          {/* Bottom trust badge. Inside the card, not after it — a top border
              only reads as a divider when it is attached to something, and
              dangling under the card it read as a stray rule. */}
          <div className="flex items-center justify-center gap-2 text-xs text-slate-500 font-medium pt-1 border-t border-slate-200/60">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Verified Sessions · Role-Gated Access</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
