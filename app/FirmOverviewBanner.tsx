'use client';

import { motion } from 'framer-motion';

const BANNER_IMAGE = "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&q=80&w=2000";

export default function FirmOverviewBanner() {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 40 }} 
      whileInView={{ opacity: 1, y: 0 }} 
      viewport={{ once: true, margin: "-50px" }} 
      transition={{ duration: 0.8 }} 
      className="mb-20 rounded-[2.5rem] overflow-hidden h-[350px] md:h-[500px] relative shadow-2xl group"
    >
      <div className="absolute inset-0 bg-slate-900/40 z-10"></div>
      
      <img 
        src={BANNER_IMAGE} 
        alt="Advanced Cyber Security Network" 
        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-[10s] ease-out" 
      />

      <div className="absolute inset-0 z-20 flex items-center p-6 md:p-16">
        <div className="bg-white/90 backdrop-blur-2xl border border-white p-8 md:p-12 rounded-3xl max-w-2xl shadow-[0_20px_40px_rgba(0,0,0,0.1)] transform transition-transform duration-500 group-hover:translate-x-2">
          <h2 className="text-3xl md:text-5xl font-black text-slate-900 leading-[1.1] tracking-tight">
            Augmenting <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">technology</span> with human intelligence.
          </h2>
          <div className="w-12 h-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full mt-6"></div>
        </div>
      </div>
    </motion.div>
  );
}
