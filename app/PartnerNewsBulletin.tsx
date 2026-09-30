'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Rss, Activity, ShieldAlert, TerminalSquare } from 'lucide-react';
import AdSenseBlock from './AdSenseBlock';

interface NewsItem {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

const RSS_FEEDS = [
  { source: 'Microsoft Security', url: 'https://www.microsoft.com/en-us/security/blog/feed/' },
  { source: 'Cisco Talos', url: 'https://blogs.cisco.com/security/feed' },
  { source: 'SonicWall Threat', url: 'https://blog.sonicwall.com/en-us/feed/' },
  { source: 'Intel Security', url: 'https://www.intel.com/content/www/us/en/newsroom/rss-feed.html' },
  { source: 'Seagate Tech', url: 'https://www.seagate.com/blog/feed/' },
  { source: 'Xcitium Labs', url: 'https://www.xcitium.com/feed/' },
  { source: 'Sectigo Insights', url: 'https://sectigo.com/rss.xml' },
  { source: 'Hanwha Vision', url: 'https://hanwhavision.com/feed/' }
];

export default function PartnerNewsBulletin() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const fetchFeeds = async () => {
      try {
        const fetchPromises = RSS_FEEDS.map(async (feed) => {
          // Bypass CORS using rss2json proxy securely
          // Added random query to bypass aggressive browser caching on polls
          const cacheBuster = `&_cb=${Date.now()}`;
          const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}${cacheBuster}`);
          if (!response.ok) return [];
          const data = await response.json();
          
          return (data.items || []).slice(0, 3).map((item: any, idx: number) => ({
            id: `${feed.source.replace(/\s+/g, '')}-${item.guid || item.link}`,
            title: item.title,
            link: item.link,
            pubDate: new Date(item.pubDate).toLocaleString('en-US', { hour12: false }),
            source: feed.source
          }));
        });

        const results = await Promise.all(fetchPromises);
        const fetchedNews = results.flat();
        
        setNews((prevNews) => {
          // Deduplicate by strict URL matching to guarantee no repetitions
          const newUniqueItems = fetchedNews.filter(n => !prevNews.some(p => p.link === n.link));
          if (newUniqueItems.length === 0) return prevNews;
          
          // Merge, sort strictly by time, and slice to keep the interface fast
          return [...newUniqueItems, ...prevNews]
            .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
            .slice(0, 12);
        });
      } catch (error) {
        console.error("Failed to load partner RSS feeds");
      } finally {
        setLoading(false);
      }
    };

    // Initial fetch on component mount
    fetchFeeds();
    
    // Background polling every 5 minutes without user intervention
    const pollInterval = setInterval(fetchFeeds, 300000);
    return () => clearInterval(pollInterval);
  }, []);

  // Auto-rotate items unless hovered
  useEffect(() => {
    if (news.length === 0 || isPaused) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % news.length);
    }, 4500);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [news.length, isPaused]);

  // Click handler to prevent exposing hyperlinks in the DOM
  const handleSecureNavigation = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return (
      <div className="w-full max-w-4xl mx-auto my-12 bg-slate-950/80 backdrop-blur border border-emerald-900/50 rounded-lg p-6 flex flex-col items-center justify-center h-40 font-mono">
        <Activity className="w-6 h-6 text-emerald-500 animate-pulse mb-3" />
        <span className="text-emerald-500/70 text-xs tracking-widest uppercase">Initializing Protocol...</span>
        <span className="text-emerald-400 text-sm mt-1">ESTABLISHING SECURE HANDSHAKES WITH OEM DATASTREAMS</span>
      </div>
    );
  }

  if (news.length === 0) return null;

  const currentItem = news[activeIndex];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="w-full max-w-4xl mx-auto my-16 bg-slate-950 border border-slate-800 rounded-lg overflow-hidden shadow-[0_0_30px_rgba(16,185,129,0.05)] font-mono"
    >
      <div className="bg-slate-900 border-b border-slate-800 p-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TerminalSquare className="w-4 h-4 text-emerald-500" />
          <h3 className="text-slate-300 font-bold text-xs uppercase tracking-widest">Global OEM Threat Intel</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
          <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Live Sync</span>
        </div>
      </div>
      
      <div 
        className="p-6 relative min-h-[140px] flex items-center"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentItem.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="w-full"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-indigo-400" />
                <span className="text-[11px] font-bold tracking-widest uppercase text-indigo-400 bg-indigo-950/50 px-2 py-0.5 rounded border border-indigo-900/50">
                  {currentItem.source}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 font-medium font-mono border border-slate-800 px-2 py-0.5 rounded bg-slate-900/50">
                TS: {currentItem.pubDate}
              </span>
            </div>
            
            <button 
              onClick={() => handleSecureNavigation(currentItem.link)}
              className="w-full text-left group focus:outline-none"
            >
              <h4 className="text-base font-bold text-slate-300 group-hover:text-emerald-400 leading-relaxed transition-colors line-clamp-2">
                <span className="text-emerald-500 mr-2 opacity-50">&gt;</span>
                {currentItem.title}
                <span className="inline-block w-2 h-4 bg-emerald-500 ml-2 animate-pulse align-middle opacity-0 group-hover:opacity-100"></span>
              </h4>
              <p className="text-[10px] text-slate-600 uppercase tracking-widest mt-4 group-hover:text-slate-400 transition-colors">
                [ Click to decrypt full bulletin ]
              </p>
            </button>
          </motion.div>
        </AnimatePresence>
        
        {/* Progress bar indicator */}
        <div className="absolute bottom-0 left-0 h-1 bg-slate-800 w-full">
          <motion.div 
            key={`${currentItem.id}-progress`}
            initial={{ width: "0%" }}
            animate={{ width: isPaused ? "100%" : "100%" }}
            transition={{ duration: isPaused ? 0 : 4.5, ease: "linear" }}
            className={`h-full ${isPaused ? 'bg-indigo-500/50' : 'bg-emerald-500/50'}`}
          />
        </div>
      </div>
      
      <div className="bg-slate-900/50 border-t border-slate-800 p-2 flex justify-center gap-1.5">
        {news.map((_, idx) => (
          <button
            key={idx}
            onClick={() => {
              setActiveIndex(idx);
              setIsPaused(true);
            }}
            className={`w-1.5 h-1.5 rounded-full transition-all ${idx === activeIndex ? 'bg-emerald-500 scale-125' : 'bg-slate-700 hover:bg-slate-500'}`}
            aria-label={`Go to slide ${idx + 1}`}
          />
        ))}
      </div>
    </motion.div>
  );
}
