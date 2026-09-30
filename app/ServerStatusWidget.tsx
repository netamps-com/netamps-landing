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
    <div className="hidden lg:flex items-center bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-full shadow-lg overflow-hidden font-mono text-[10px] uppercase tracking-wider divide-x divide-slate-700/50 cursor-default">
      
      {/* Live Indicator */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50">
        <div className="relative flex items-center justify-center w-2 h-2">
          <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-75"></div>
          <div className="relative bg-emerald-500 w-1 h-1 rounded-full"></div>
        </div>
        <span className="font-bold text-slate-300">
          <span className="text-emerald-400">Netamps</span> Live
        </span>
      </div>

      {/* Cloudflare Edge with Sparkline */}
      <div className="flex items-center gap-2 px-3 py-1.5 text-slate-400 group">
        <Globe className="w-3 h-3 group-hover:text-blue-400 transition-colors" />
        <div className="flex items-end h-3 gap-[1px]">
          {cfHistory.map((val, i) => (
            <div 
              key={i} 
              className="w-1 bg-blue-500/80 rounded-t-sm transition-all duration-300"
              style={{ height: `${Math.max(20, 100 - (val * 2))}%` }}
            />
          ))}
        </div>
        <span className="text-emerald-400 font-bold w-6 text-right">{cfLatency}ms</span>
      </div>

      {/* Firebase Core with Sparkline */}
      <div className="flex items-center gap-2 px-3 py-1.5 text-slate-400 group">
        <Server className="w-3 h-3 group-hover:text-amber-400 transition-colors" />
        <div className="flex items-end h-3 gap-[1px]">
          {fbHistory.map((val, i) => (
            <div 
              key={i} 
              className="w-1 bg-amber-500/80 rounded-t-sm transition-all duration-300"
              style={{ height: `${Math.max(20, 100 - (val * 1.5))}%` }}
            />
          ))}
        </div>
        <span className="text-emerald-400 font-bold w-6 text-right">{fbLatency}ms</span>
      </div>

      {/* Uptime */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/30">
        <Activity className="w-3 h-3 text-emerald-500" />
        <span className="text-emerald-500 font-black tracking-tight">99.999%</span>
      </div>
      
    </div>
  );
}
