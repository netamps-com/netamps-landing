'use client';

import { ShieldCheck, Lock, Shield, Award } from 'lucide-react';
import { motion, useScroll, useTransform, AnimatePresence } from "motion/react";
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

// Trust chrome belongs only where no page owns a dedicated strip. Allowlist
// (fail-closed): new pages get no seal unless consciously added here.
const SEAL_ROUTES = ['/privacy', '/status'];

const seals = [
  {
    label: 'TLS 1.3',
    sublabel: 'Encrypted',
    icon: ShieldCheck,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/20',
    ping: 'bg-emerald-500',
  },
  {
    label: 'Role-Gated',
    sublabel: 'Access',
    icon: Shield,
    color: 'text-blue-400',
    bg: 'bg-blue-500/20',
    ping: 'bg-blue-500',
  },
  {
    label: 'Scanned',
    sublabel: 'Uploads',
    icon: Lock,
    color: 'text-amber-400',
    bg: 'bg-amber-500/20',
    ping: 'bg-amber-500',
  },
  {
    label: 'Audit',
    sublabel: 'Trail',
    icon: Award,
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/20',
    ping: 'bg-indigo-500',
  },
] as const;

export default function TrustSeal() {
  const { scrollY } = useScroll();
  const fadeOpacity = useTransform(scrollY, [0, 150], [1, 0.15]);
  const [isMounted, setIsMounted] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null;
  if (!SEAL_ROUTES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  return (
    <motion.div
      style={{ opacity: fadeOpacity }}
      initial={{ y: 20 }}
      animate={{ y: 0 }}
      transition={{ delay: 0.5, duration: 0.5 }}
      className="fixed bottom-6 left-6 z-[9999] flex flex-col gap-2 group cursor-default hover:!opacity-100 transition-opacity duration-300"
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      {/* Expanded badges */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-1.5 mb-1"
          >
            {seals.map((seal, i) => (
              <motion.div
                key={seal.label}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ delay: i * 0.05, duration: 0.2 }}
                className="flex items-center gap-2 bg-slate-900/80 backdrop-blur-md border border-slate-700/40 p-1.5 pr-3 rounded-full shadow-lg"
              >
                <div className={`${seal.bg} p-1.5 rounded-full relative`}>
                  <seal.icon className={`w-3 h-3 ${seal.color} relative z-10`} />
                </div>
                <div className="flex flex-col">
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-tight">{seal.sublabel}</span>
                  <span className="text-[10px] font-bold text-white leading-tight">{seal.label}</span>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collapsed main badge */}
      <div className="flex items-center gap-2 bg-slate-900/60 backdrop-blur-sm border border-slate-700/30 p-1.5 pr-3 rounded-full shadow-lg hover:bg-slate-800 transition-colors">
        <div className="bg-emerald-500/20 p-1.5 rounded-full relative">
          <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-20"></div>
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 relative z-10" />
        </div>
        <div className="flex flex-col">
          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-tight">TLS 1.3 · Secured</span>
          <span className="text-[10px] font-bold text-white flex items-center gap-1 leading-tight"><Lock className="w-2 h-2" /> TLS Encrypted</span>
        </div>
      </div>
    </motion.div>
  );
}
