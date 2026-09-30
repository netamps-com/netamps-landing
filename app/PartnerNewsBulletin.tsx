'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Rss, ExternalLink, Activity } from 'lucide-react';

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

const RSS_FEEDS = [
  { source: 'Microsoft Security', url: 'https://www.microsoft.com/en-us/security/blog/feed/' },
  { source: 'Cisco Security', url: 'https://blogs.cisco.com/security/feed' },
  { source: 'SonicWall', url: 'https://blog.sonicwall.com/en-us/feed/' }
];

export default function PartnerNewsBulletin() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFeeds = async () => {
      try {
        const fetchPromises = RSS_FEEDS.map(async (feed) => {
          // Using a public RSS-to-JSON proxy to bypass browser CORS restrictions securely
          const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}`);
          if (!response.ok) return [];
          const data = await response.json();
          
          return (data.items || []).slice(0, 3).map((item: any) => ({
            title: item.title,
            link: item.link,
            pubDate: new Date(item.pubDate).toLocaleDateString(),
            source: feed.source
          }));
        });

        const results = await Promise.all(fetchPromises);
        // Flatten array, sort by date, and keep top 6 latest news items
        const allNews = results.flat().sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()).slice(0, 6);
        setNews(allNews);
      } catch (error) {
        console.error("Failed to load partner RSS feeds");
      } finally {
        setLoading(false);
      }
    };

    fetchFeeds();
  }, []);

  if (loading) {
    return (
      <div className="w-full max-w-4xl mx-auto my-12 bg-slate-900/50 backdrop-blur border border-slate-800 rounded-2xl p-6 flex items-center justify-center h-48">
        <Activity className="w-6 h-6 text-emerald-500 animate-pulse" />
        <span className="ml-3 text-slate-400 font-medium tracking-wide">Synchronizing Partner Threat Feeds...</span>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="w-full max-w-4xl mx-auto my-16 bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl overflow-hidden shadow-2xl"
    >
      <div className="bg-slate-800/80 border-b border-slate-700/50 p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500/20 p-2 rounded-lg">
            <Rss className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-white font-bold text-lg">Partner Security Bulletin</h3>
            <p className="text-xs text-slate-400 font-medium">Live Intelligence Feed</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-bold text-emerald-500 uppercase tracking-wider">Live</span>
        </div>
      </div>
      
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        {news.map((item, idx) => (
          <a 
            key={idx}
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="group block p-4 bg-slate-800/30 rounded-xl border border-slate-700/30 hover:bg-slate-800 hover:border-emerald-500/30 transition-all duration-300"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black tracking-widest uppercase text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded">
                {item.source}
              </span>
              <span className="text-xs font-medium text-slate-500">{item.pubDate}</span>
            </div>
            <h4 className="text-sm font-semibold text-slate-200 group-hover:text-white leading-relaxed mb-2 line-clamp-2">
              {item.title}
            </h4>
            <div className="flex items-center text-xs font-bold text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity">
              Read Briefing <ExternalLink className="w-3 h-3 ml-1" />
            </div>
          </a>
        ))}
      </div>
    </motion.div>
  );
}
