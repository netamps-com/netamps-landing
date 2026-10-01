'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Activity } from 'lucide-react';

interface NewsItem {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  source: string;
  desc: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  tag: string;
  timeLabel: string;
}

const RSS_FEEDS = [
  { source: 'The Hacker News', tag: 'THREAT ALERT', url: 'https://feeds.feedburner.com/TheHackersNews' },
  { source: 'Dark Reading', tag: 'INDUSTRY', url: 'https://www.darkreading.com/rss.xml' },
  { source: 'CISA Alerts', tag: 'COMPLIANCE', url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml' },
];

export default function LiveIntelligenceFeed() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Function to map string indices to a pseudo-random but deterministic severity
  const getSeverity = (title: string) => {
    const val = title.length % 4;
    const severities = ['Critical', 'High', 'Medium', 'Low'];
    return severities[val] as 'Critical' | 'High' | 'Medium' | 'Low';
  };

  const getTimeLabel = (dateStr: string) => {
    const pubDate = new Date(dateStr);
    const diffInMins = Math.floor((new Date().getTime() - pubDate.getTime()) / 60000);
    
    if (isNaN(diffInMins) || diffInMins < 0) return 'Just now';
    if (diffInMins < 60) return `${Math.max(1, diffInMins)}m ago`;
    const diffInHours = Math.floor(diffInMins / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    return `${Math.floor(diffInHours / 24)}d ago`;
  };

  useEffect(() => {
    const fetchFeeds = async () => {
      try {
        const fetchPromises = RSS_FEEDS.map(async (feed) => {
          const cacheBuster = `&_cb=${Date.now()}`;
          const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}${cacheBuster}`);
          if (!response.ok) return [];
          const data = await response.json();
          
          return (data.items || []).slice(0, 4).map((item: any, idx: number) => {
             // Strip HTML from description
             let plainDesc = (item.description || "").replace(/<[^>]+>/g, '').trim();
             // Decode HTML entities (basic)
             plainDesc = plainDesc.replace(/&nbsp;/g, ' ').replace(/&#8217;/g, "'").replace(/&quot;/g, '"');
             if (plainDesc.length > 120) plainDesc = plainDesc.substring(0, 117) + '...';
             
             return {
                id: `${feed.source.replace(/\s+/g, '')}-${item.guid || item.link}`,
                title: item.title,
                link: item.link,
                pubDate: item.pubDate,
                source: feed.source,
                desc: plainDesc || "No description available.",
                tag: feed.tag,
                severity: getSeverity(item.title),
                timeLabel: getTimeLabel(item.pubDate)
             };
          });
        });

        const results = await Promise.all(fetchPromises);
        let fetchedNews = results.flat();
        
        // Sort strictly by time and keep 4 most recent items
        fetchedNews = fetchedNews.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()).slice(0, 4);
        
        setNews(fetchedNews);
      } catch (error) {
        console.error("Failed to load live intelligence feeds");
      } finally {
        setLoading(false);
      }
    };

    fetchFeeds();
    const pollInterval = setInterval(fetchFeeds, 300000); // 5 mins
    return () => clearInterval(pollInterval);
  }, []);

  const handleLink = (url: string) => {
    if (url && url !== '#') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  // Fallback data while loading or if API fails
  const displayNews = news.length > 0 ? news : [
    { id: 'fb-1', timeLabel: "10m ago", tag: "THREAT ALERT", title: "New Zero-Day Vulnerability in Popular Enterprise VPN Services", severity: "High" as const, desc: "A critical flaw (CVE-2024-XXXX) allows unauthenticated remote code execution. Patch immediately.", link: "#" },
    { id: 'fb-2', timeLabel: "1h ago", tag: "INDUSTRY", title: "Global Ransomware Attacks Surge by 45% in Q3", severity: "Critical" as const, desc: "Financial and healthcare sectors face unprecedented multi-extortion campaigns driven by RaaS cartels.", link: "#" },
    { id: 'fb-3', timeLabel: "3h ago", tag: "ANALYSIS", title: "AI-Powered Phishing Campaigns Evade Traditional Defenses", severity: "Medium" as const, desc: "Attackers are utilizing LLMs to generate highly personalized spear-phishing emails with zero language errors.", link: "#" },
    { id: 'fb-4', timeLabel: "5h ago", tag: "COMPLIANCE", title: "Data Privacy Regulations Tighten Across Global Sectors", severity: "Low" as const, desc: "New mandates require stricter breach reporting timelines and enhanced data sovereignty controls.", link: "#" }
  ];

  return (
    <div className="w-full bg-white/40 backdrop-blur-xl border border-white/60 shadow-xl rounded-3xl p-6 overflow-hidden relative">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center relative">
          {loading && (
             <span className="absolute -top-1 -right-1 flex h-3 w-3">
               <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
               <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
             </span>
          )}
          <Activity className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h3 className="font-black text-slate-900 tracking-tight">Live Intelligence Feed</h3>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Global Security Updates</p>
        </div>
      </div>
      
      <div className="space-y-4">
        {displayNews.map((item, i) => (
          <motion.div 
            key={item.id || i}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 + (i * 0.15) }}
            onClick={() => handleLink(item.link)}
            className="group p-4 rounded-2xl bg-white/60 hover:bg-white border border-slate-100 hover:border-indigo-100 hover:shadow-md transition-all cursor-pointer overflow-hidden relative"
          >
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider">
                <span className="text-slate-400">{item.timeLabel}</span>
                <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                <span className={item.severity === 'Critical' || item.severity === 'High' ? 'text-rose-500' : 'text-indigo-500'}>{item.tag}</span>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                item.severity === 'Critical' ? 'bg-rose-100 text-rose-700' : 
                item.severity === 'High' ? 'bg-orange-100 text-orange-700' :
                item.severity === 'Medium' ? 'bg-amber-100 text-amber-700' :
                'bg-emerald-100 text-emerald-700'
              }`}>
                {item.severity}
              </span>
            </div>
            <p className="font-bold text-slate-700 text-sm leading-snug group-hover:text-primary transition-colors line-clamp-2">{item.title}</p>
            
            <div className="grid grid-rows-[0fr] group-hover:grid-rows-[1fr] transition-all duration-300 ease-in-out">
              <div className="overflow-hidden">
                <p className="text-xs text-slate-500 font-medium mt-2 leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-100">
                  {item.desc}
                </p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
