'use client';

import { Lock, Shield } from 'lucide-react';
import { motion, useScroll, useTransform, AnimatePresence } from "motion/react";
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

// Trust chrome belongs only where no page owns a dedicated strip. Allowlist
// (fail-closed): new pages get no seal unless consciously added here.
const SEAL_ROUTES = ['/privacy', '/status'];

const seals = [
  {
    label: 'Role-Gated',
    sublabel: 'Access',
    icon: Shield,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    ping: 'bg-blue-500',
  },
  {
    label: 'Scanned',
    sublabel: 'Uploads',
    icon: Lock,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    ping: 'bg-amber-500',
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
      className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-6 z-[9999] flex flex-col gap-2 group cursor-pointer hover:!opacity-100 transition-opacity duration-300"
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
      onClick={() => setIsExpanded((v) => !v)}
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
                className="flex items-center gap-2 bg-white/90 backdrop-blur-md border border-slate-200 p-1.5 pr-3 rounded-full shadow-lg"
              >
                <div className={`${seal.bg} p-1.5 rounded-full relative`}>
                  <seal.icon className={`w-3 h-3 ${seal.color} relative z-10`} />
                </div>
                <div className="flex flex-col">
                  <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest leading-tight">{seal.sublabel}</span>
                  <span className="text-[10px] font-bold text-slate-900 leading-tight">{seal.label}</span>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collapsed main badge */}
      <div className="flex items-center gap-2 bg-white/90 backdrop-blur-sm border border-slate-200 p-1.5 pr-3 rounded-full shadow-lg hover:bg-slate-50 transition-colors">
        <div className="bg-blue-50 p-1.5 rounded-full relative">
          <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-20"></div>
          <Shield className="w-3.5 h-3.5 text-blue-600 relative z-10" />
        </div>
        <div className="flex flex-col">
          <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest leading-tight">Role-Gated</span>
          <span className="text-[10px] font-bold text-slate-900 flex items-center gap-1 leading-tight"><Shield className="w-2 h-2" /> Access Controlled</span>
        </div>
      </div>
    </motion.div>
  );
}
