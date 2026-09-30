'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Megaphone } from 'lucide-react';

interface AdSenseBlockProps {
  adClient?: string;
  adSlot?: string;
  className?: string;
}

export default function AdSenseBlock({ 
  adClient = 'ca-pub-2386994198437604', // Replace with actual Publisher ID
  adSlot = 'XXXXXXXXXX',               // Replace with actual Ad Slot ID
  className = '' 
}: AdSenseBlockProps) {

  useEffect(() => {
    try {
      // @ts-ignore
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (err) {
      console.error('AdSense error:', err);
    }
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      className={`w-full bg-slate-900/40 border border-slate-800/60 rounded-lg overflow-hidden relative group ${className}`}
    >
      <div className="absolute top-0 right-0 bg-slate-800/80 backdrop-blur-md px-2 py-0.5 rounded-bl-lg border-b border-l border-slate-700/50 z-10 flex items-center gap-1.5">
        <Megaphone className="w-3 h-3 text-slate-400" />
        <span className="text-[9px] uppercase tracking-widest text-slate-400 font-bold">Advertisement</span>
      </div>
      
      <div className="p-4 flex items-center justify-center min-h-[120px]">
        {/* Google AdSense In-Feed Tag */}
        <ins 
          className="adsbygoogle"
          style={{ display: 'block', width: '100%', textAlign: 'center' }}
          data-ad-layout="in-article"
          data-ad-format="fluid"
          data-ad-client={adClient}
          data-ad-slot={adSlot}
        />
      </div>
    </motion.div>
  );
}
