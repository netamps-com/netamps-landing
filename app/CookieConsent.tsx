'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cookie, X } from 'lucide-react';

export default function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('netamps_cookie_notice_dismissed');
    if (!consent) {
      // Show banner after a short delay
      const timer = setTimeout(() => setIsVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem('netamps_cookie_notice_dismissed', 'true');
    setIsVisible(false);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50, transition: { duration: 0.3 } }}
          className="fixed bottom-4 right-4 z-[99999] max-w-sm bg-white/95 backdrop-blur-xl border border-slate-200 shadow-2xl rounded-2xl p-5"
        >
          <div className="flex items-start gap-4">
            <div className="bg-indigo-100 p-2.5 rounded-full shrink-0 text-indigo-600">
              <Cookie className="w-5 h-5" />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h4 className="font-black text-slate-800 text-sm">Strictly Necessary Cookies</h4>
                <button onClick={() => setIsVisible(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed font-medium">
                Strictly Necessary Cookies are mandatory for basic operation and performance and do not require user consent. These include Load-Balancing Cookies, State & Routing Cookies, CDN Configuration Cookies, CSRF (Cross-Site Request Forgery) Tokens, Authentication/Session Identifiers, and Bot-Prevention Cookies.
              </p>
              <div className="flex gap-3 mt-2">
                <button 
                  onClick={handleDismiss}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold py-2 px-4 rounded-lg transition-colors"
                >
                  Understood
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
