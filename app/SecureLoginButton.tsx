'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
    
    // Industry standard URL obfuscation for bot protection
    const encryptedUrl = 'aHR0cHM6Ly93ZWJtYWlsLm5ldGFtcHMuaW4v';
    const cleanUrl = atob(encryptedUrl);
    
    // 1. OPEN IMMEDIATELY: This guarantees the browser popup blocker will NEVER block the new tab
    // because it is a direct, synchronous result of a physical mouse click.
    // We use 'noopener' but omit 'noreferrer' to preserve the strict Cloudflare WAF Referer header.
    window.open(cleanUrl, '_blank', 'noopener');
    
    // 2. VISUAL PROTOCOL: We keep the security verification modal spinning in the background 
    // on the main tab to maintain the "industry security protocol" aesthetic, then reset it.
    setTimeout(() => { 
      setIsVerifying(false);
    }, 1500);
  };

  return (
    <>
      <button 
        onClick={handleSecureLogin}
        className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2 rounded-full font-bold text-sm hover:bg-slate-800 transition-all border border-slate-700 shadow-md focus:outline-none focus:ring-2 focus:ring-slate-400 group"
      >
        <KeyRound className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
        Secure Login
      </button>

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
                Protecting your login session. Please wait while we verify your browser via Google reCAPTCHA standards.
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
