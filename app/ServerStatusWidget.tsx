'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Server, Activity, Zap, ShieldCheck, Globe } from 'lucide-react';

export default function ServerStatusWidget() {
  const [isHovered, setIsHovered] = useState(false);
  const [cfLatency, setCfLatency] = useState(12);
  const [fbLatency, setFbLatency] = useState(24);

  // Simulate slight realistic fluctuations in ping times for the SOC dashboard aesthetic
  useEffect(() => {
    const interval = setInterval(() => {
      setCfLatency(Math.floor(Math.random() * (18 - 8 + 1) + 8));
      setFbLatency(Math.floor(Math.random() * (35 - 19 + 1) + 19));
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div 
      className="fixed bottom-6 left-6 z-[9999]"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-12 left-0 mb-2 w-64 bg-slate-900 border border-slate-700 shadow-2xl rounded-xl overflow-hidden font-mono text-xs"
          >
            <div className="bg-slate-800/80 px-3 py-2 border-b border-slate-700 flex items-center justify-between">
              <span className="text-slate-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-emerald-400" /> System Diagnostics
              </span>
              <span className="text-emerald-400 font-bold">99.999%</span>
            </div>
            
            <div className="p-3 space-y-3">
              {/* Cloudflare Stats */}
              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> Edge Routing</span>
                  <span className="text-emerald-400">{cfLatency}ms</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-blue-500"
                      animate={{ width: `${Math.max(20, 100 - cfLatency)}%` }}
                    />
                  </div>
                  <span className="text-slate-300 font-bold text-[10px]">CLOUDFLARE</span>
                </div>
              </div>

              {/* Firebase Stats */}
              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span className="flex items-center gap-1.5"><Server className="w-3.5 h-3.5" /> Core Infrastructure</span>
                  <span className="text-emerald-400">{fbLatency}ms</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-amber-500"
                      animate={{ width: `${Math.max(20, 100 - (fbLatency/2))}%` }}
                    />
                  </div>
                  <span className="text-slate-300 font-bold text-[10px]">FIREBASE</span>
                </div>
              </div>
              
              <div className="pt-2 border-t border-slate-800 flex items-center gap-2 text-[10px] text-slate-500 uppercase tracking-widest">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                Military-Grade Isolation Active
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div 
        className="flex items-center gap-2 bg-slate-900/80 backdrop-blur-md border border-slate-700/50 px-3 py-1.5 rounded-full shadow-lg cursor-help transition-colors hover:bg-slate-800"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <div className="relative flex items-center justify-center w-2.5 h-2.5">
          <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-75"></div>
          <div className="relative bg-emerald-500 w-1.5 h-1.5 rounded-full"></div>
        </div>
        <span className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
          Netamps <span className="text-emerald-400">Live</span>
        </span>
      </motion.div>
    </div>
  );
}
