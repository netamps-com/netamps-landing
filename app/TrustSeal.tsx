'use client';

import { ShieldCheck, Lock } from 'lucide-react';
import { motion, useScroll, useTransform } from "motion/react";
import { useState, useEffect } from 'react';

export default function TrustSeal() {
  const { scrollY } = useScroll();
  const fadeOpacity = useTransform(scrollY, [0, 150], [1, 0.15]);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null;

  return (
    <motion.div 
      style={{ opacity: fadeOpacity }}
      initial={{ y: 20 }}
      animate={{ y: 0 }}
      transition={{ delay: 0.5, duration: 0.5 }}
      className="fixed bottom-6 left-6 z-[9999] flex flex-col gap-2 group cursor-default hover:!opacity-100 transition-opacity duration-300"
    >
      <div className="flex items-center gap-2 bg-slate-900/60 backdrop-blur-sm border border-slate-700/30 p-1.5 pr-3 rounded-full shadow-lg hover:bg-slate-800 transition-colors">
        <div className="bg-emerald-500/20 p-1.5 rounded-full relative">
          <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-20"></div>
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 relative z-10" />
        </div>
        <div className="flex flex-col">
          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-tight">Verified</span>
          <span className="text-[10px] font-bold text-white flex items-center gap-1 leading-tight"><Lock className="w-2 h-2" /> 256-Bit SSL</span>
        </div>
      </div>
    </motion.div>
  );
}
