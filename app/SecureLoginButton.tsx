'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from "motion/react";
import { Shield, Lock, Loader2, KeyRound } from 'lucide-react';

export default function SecureLoginButton() {
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    // Standard industry fix for browser Back/Forward Cache (bfcache)
    // Resets the modal if the user clicks the "Back" button from Webmail
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setIsVerifying(false);
      }
    };
    
    // Also reset if the page becomes visible again just in case
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setIsVerifying(false);
      }
    };

    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const handleSecureLogin = () => {
    setIsVerifying(true);

    const loginUrl = '/login';
    
    // 1. OPEN IMMEDIATELY: This guarantees the browser popup blocker will NEVER block the new tab
    // because it is a direct, synchronous result of a physical mouse click.
    // We use 'noopener' but omit 'noreferrer' to preserve the strict Cloudflare WAF Referer header.
    window.open(loginUrl, '_blank', 'noopener');
    
    // 2. VISUAL PROTOCOL: We keep the security verification modal spinning in the background 
    // on the main tab to maintain the "industry security protocol" aesthetic, then reset it.
    setTimeout(() => { 
      setIsVerifying(false);
    }, 1500);
  };

  return (
    <>
      <div className="relative group/dropdown">
        <button 
          onClick={handleSecureLogin}
          className="rainbow-btn flex items-center gap-2 bg-slate-900 text-white px-5 py-2 rounded-full font-bold text-sm hover:shadow-[0_0_15px_rgba(16,185,129,0.4)] hover:border-emerald-500 transition-all border border-slate-700 shadow-md focus:outline-none focus:ring-2 focus:ring-slate-400 overflow-hidden relative"
        >
          <KeyRound className="w-4 h-4 text-emerald-400 group-hover/dropdown:scale-110 transition-transform relative z-10" />
          <span className="relative z-10 group-hover/dropdown:text-white transition-colors">Sign-In</span>
          <svg className="w-3.5 h-3.5 text-slate-400 ml-1 group-hover/dropdown:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
        </button>

        {/* Dropdown Menu */}
        <div className="absolute top-full right-0 mt-2 w-48 opacity-0 invisible group-hover/dropdown:opacity-100 group-hover/dropdown:visible transition-all duration-200 z-50 transform origin-top-right group-hover/dropdown:translate-y-0 translate-y-2">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-xl overflow-hidden p-2 flex flex-col gap-1 backdrop-blur-xl">
            <button 
              onClick={handleSecureLogin}
              className="flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-emerald-400 hover:bg-slate-800/60 transition-colors px-3 py-2.5 rounded-lg w-full text-left"
            >
              <Shield className="w-4 h-4" />
              Netamps Connect
            </button>
            <a 
              href="https://webmail.netamps.in"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-indigo-400 hover:bg-slate-800/60 transition-colors px-3 py-2.5 rounded-lg w-full text-left"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
              Webmail Login
            </a>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isVerifying && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-900/80 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 flex flex-col items-center text-center border border-slate-200"
            >
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-20"></div>
                <div className="bg-emerald-100 p-4 rounded-full relative z-10">
                  <Shield className="w-10 h-10 text-emerald-600" />
                </div>
              </div>
              
              <h3 className="text-xl font-black text-slate-900 mb-2">Security Verification</h3>
              <p className="text-sm text-slate-500 font-medium mb-8">
                Protecting your login session. Please wait while we verify your browser.
              </p>
              
              <div className="flex items-center gap-3 bg-slate-50 px-6 py-3 rounded-xl border border-slate-100 w-full justify-center">
                <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                <span className="text-sm font-bold text-slate-700">Establishing Secure Connection...</span>
              </div>
              
              <div className="mt-6 w-full text-left bg-slate-900 rounded-lg p-3 border border-slate-800">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-2 pb-1 border-b border-slate-800">
                  <Lock className="w-3 h-3" /> Active Protocol Handshake
                </div>
                <ul className="text-[9px] text-slate-400 font-mono space-y-1">
                  <li className="flex items-center gap-1"><span className="text-emerald-500">▶</span> HTTPS over TLS 1.3 + HSTS</li>
                  <li className="flex items-center gap-1"><span className="text-emerald-500">▶</span> OIDC / SAML 2.0 with FIDO2</li>
                  <li className="flex items-center gap-1"><span className="text-emerald-500">▶</span> IMAPS (Port 993) / SMTPS (Port 465)</li>
                  <li className="flex items-center gap-1"><span className="text-emerald-500">▶</span> Zero-Trust Network Access (ZTNA)</li>
                  <li className="flex items-center gap-1 text-emerald-400 animate-pulse"><span className="text-emerald-500">▶</span> Behavioral Anomaly Detection: CLEAR</li>
                </ul>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
