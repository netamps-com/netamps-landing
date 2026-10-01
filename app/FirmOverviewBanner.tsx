'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';

const BANNER_IMAGES = [
  "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&q=80&w=2000",
  "https://images.unsplash.com/photo-1614064641913-6b71a3061283?auto=format&fit=crop&q=80&w=2000",
  "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=2000",
  "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&q=80&w=2000",
  "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=2000",
  "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=2000"
];

export default function FirmOverviewBanner() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const ref = useRef(null);
  const isInView = useInView(ref, { margin: "0px 0px -200px 0px" });

  useEffect(() => {
    let interval: NodeJS.Timeout;

    // Only rotate images if the component is in view
    if (isInView) {
      interval = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % BANNER_IMAGES.length);
      }, 10000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isInView]);

  return (
    <motion.div 
      ref={ref}
      initial={{ opacity: 0, y: 40 }} 
      whileInView={{ opacity: 1, y: 0 }} 
      viewport={{ once: true, margin: "-50px" }} 
      transition={{ duration: 0.8 }} 
      className="mb-20 rounded-[2.5rem] overflow-hidden h-[350px] md:h-[500px] relative shadow-2xl group"
    >
      <div className="absolute inset-0 bg-slate-900/40 z-10"></div>
      
      <AnimatePresence mode="popLayout">
        <motion.img 
          key={currentIndex}
          src={BANNER_IMAGES[currentIndex]} 
          alt="Advanced Cyber Security Network" 
          initial={{ opacity: 0, scale: 1.1 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 2.5, ease: "easeInOut" }}
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-[10s] ease-out" 
        />
      </AnimatePresence>

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
