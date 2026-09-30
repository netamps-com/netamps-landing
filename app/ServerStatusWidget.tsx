'use client';

import { useState, useEffect } from 'react';

import { Server, Activity, Zap, ShieldCheck, Globe } from 'lucide-react';

export default function ServerStatusWidget() {
  const [cfHistory, setCfHistory] = useState<number[]>(Array(8).fill(12));
  const [fbHistory, setFbHistory] = useState<number[]>(Array(8).fill(24));

  // Simulate slight realistic fluctuations in ping times for the SOC dashboard aesthetic
  useEffect(() => {
    const interval = setInterval(() => {
      const newCf = Math.floor(Math.random() * (18 - 8 + 1) + 8);
      const newFb = Math.floor(Math.random() * (35 - 19 + 1) + 19);
      
      setCfHistory(prev => [...prev.slice(1), newCf]);
      setFbHistory(prev => [...prev.slice(1), newFb]);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const cfLatency = cfHistory[cfHistory.length - 1];
  const fbLatency = fbHistory[cfHistory.length - 1];

  return (
    <div className="hidden lg:flex items-center bg-slate-900/90 backdrop-blur-xl border border-slate-700/60 rounded-lg shadow-inner overflow-hidden font-mono text-[9px] uppercase tracking-[0.2em] divide-x divide-slate-700/60 cursor-crosshair">
      
      {/* Live Indicator */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/80">
        <div className="relative flex items-center justify-center w-2 h-2">
          <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-75"></div>
          <div className="relative bg-emerald-500 w-1 h-1 rounded-full shadow-[0_0_8px_#10b981]"></div>
        </div>
        <span className="font-bold text-slate-300">
          SYS_OP: <span className="text-emerald-400">ONLINE</span>
        </span>
      </div>

      {/* Cloudflare Edge with Sparkline */}
      <div className="flex items-center gap-2 px-3 py-1.5 text-slate-400 group">
        <Globe className="w-3 h-3 group-hover:text-cyan-400 transition-colors" />
        <span className="font-black text-slate-500 group-hover:text-slate-300 transition-colors">WAF_EDGE</span>
        <div className="flex items-end h-3 gap-[1px]">
          {cfHistory.map((val, i) => (
            <div 
              key={i} 
              className="w-1 bg-cyan-500/80 rounded-t-[1px] transition-all duration-300 group-hover:bg-cyan-400"
              style={{ height: `${Math.max(20, 100 - (val * 2))}%` }}
            />
          ))}
        </div>
        <span className="text-cyan-400 font-bold w-6 text-right">{cfLatency}ms</span>
      </div>

      {/* Firebase Core with Sparkline */}
      <div className="flex items-center gap-2 px-3 py-1.5 text-slate-400 group">
        <Server className="w-3 h-3 group-hover:text-amber-400 transition-colors" />
        <span className="font-black text-slate-500 group-hover:text-slate-300 transition-colors">DB_CORE</span>
        <div className="flex items-end h-3 gap-[1px]">
          {fbHistory.map((val, i) => (
            <div 
              key={i} 
              className="w-1 bg-amber-500/80 rounded-t-[1px] transition-all duration-300 group-hover:bg-amber-400"
              style={{ height: `${Math.max(20, 100 - (val * 1.5))}%` }}
            />
          ))}
        </div>
        <span className="text-amber-400 font-bold w-6 text-right">{fbLatency}ms</span>
      </div>

      {/* Uptime */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/50">
        <Activity className="w-3 h-3 text-emerald-500" />
        <span className="text-slate-400 font-bold">SLA:</span>
        <span className="text-emerald-500 font-black tracking-tighter shadow-emerald-500/50 drop-shadow-md">99.999%</span>
      </div>
      
    </div>
  );
}
