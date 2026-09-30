'use client';

import { ShieldCheck, Lock } from 'lucide-react';
import { motion } from 'framer-motion';

export default function TrustSeal() {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1, duration: 0.5 }}
      className="fixed bottom-6 left-6 z-[9999] flex flex-col gap-2 group cursor-default"
    >
      <div className="flex items-center gap-3 bg-slate-900/80 backdrop-blur-md border border-slate-700/50 p-2 pr-4 rounded-full shadow-2xl hover:bg-slate-800 transition-colors">
        <div className="bg-emerald-500/20 p-2 rounded-full relative">
          <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-20"></div>
          <ShieldCheck className="w-5 h-5 text-emerald-400 relative z-10" />
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Verified Secure</span>
          <span className="text-xs font-black text-white flex items-center gap-1"><Lock className="w-3 h-3" /> 256-Bit SSL Encrypted</span>
        </div>
      </div>
    </motion.div>
  );
}
