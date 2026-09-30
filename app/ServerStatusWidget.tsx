'use client';

import { useState, useEffect } from 'react';

import { Server, Activity, Zap, ShieldCheck, Globe } from 'lucide-react';

export default function ServerStatusWidget() {
  
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

      {/* Cloudflare Edge */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-slate-400 group">
        <Globe className="w-3 h-3 group-hover:text-blue-400 transition-colors" />
        <span className="font-bold">Edge:</span>
        <span className="text-emerald-400 font-bold w-6">{cfLatency}ms</span>
      </div>

      {/* Firebase Core */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-slate-400 group">
        <Server className="w-3 h-3 group-hover:text-amber-400 transition-colors" />
        <span className="font-bold">Core:</span>
        <span className="text-emerald-400 font-bold w-6">{fbLatency}ms</span>
      </div>

      {/* Uptime */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/30">
        <Activity className="w-3 h-3 text-emerald-500" />
        <span className="text-emerald-500 font-black tracking-tight">99.999%</span>
      </div>
      
    </div>
  );
}
