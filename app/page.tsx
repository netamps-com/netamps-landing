"use client";

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence, useAnimationFrame, useMotionValue } from 'framer-motion';
import { ArrowRight, CheckCircle, Mail, MapPin, Phone, Shield, Server, Lock, Fingerprint, Activity, Network, Cloud, Key, AlertTriangle, Eye, Menu } from 'lucide-react';

const fadeInUp = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.25, 0.1, 0.25, 1] } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.15 } }
};

const heroImages = [
  "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=1000",
  "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&q=80&w=1000",
  "https://images.unsplash.com/photo-1563206767-5b18f218e8de?auto=format&fit=crop&q=80&w=1000",
  "https://images.unsplash.com/photo-1510511459019-5d01a80c9e65?auto=format&fit=crop&q=80&w=1000",
  "https://images.unsplash.com/photo-1614064641913-6b71a3061283?auto=format&fit=crop&q=80&w=1000",
  "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=1000",
  "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&q=80&w=1000",
  "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&q=80&w=1000",
  "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=1000",
  "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=1000",
  "https://images.unsplash.com/photo-1504384764586-bb4cdc1707b0?auto=format&fit=crop&q=80&w=1000",
  "https://images.unsplash.com/photo-1523961131990-5ea7c61b2107?auto=format&fit=crop&q=80&w=1000"
];

const heroBadges = [
  { status: "SYSTEM SECURE", text: "24/7 SOC Monitoring", bgClass: "bg-emerald-100", textClass: "text-emerald-600", borderClass: "border-emerald-200", icon: Shield },
  { status: "THREAT DETECTED", text: "Incident Response Active", bgClass: "bg-rose-100", textClass: "text-rose-600", borderClass: "border-rose-200", icon: AlertTriangle },
  { status: "DATA ENCRYPTED", text: "Zero Trust Architecture", bgClass: "bg-indigo-100", textClass: "text-indigo-600", borderClass: "border-indigo-200", icon: Key },
  { status: "NETWORK SCANNED", text: "Vulnerability Management", bgClass: "bg-purple-100", textClass: "text-purple-600", borderClass: "border-purple-200", icon: Activity },
  { status: "ACCESS VERIFIED", text: "Identity & Access Control", bgClass: "bg-cyan-100", textClass: "text-cyan-600", borderClass: "border-cyan-200", icon: Eye },
  { status: "FORENSICS LOGGED", text: "Digital Forensics (DFIR)", bgClass: "bg-amber-100", textClass: "text-amber-600", borderClass: "border-amber-200", icon: Fingerprint }
];

const expertiseAreas = [
  { title: "Digital Forensics (DFIR)", desc: "Deep-dive forensic analysis, chain-of-custody preservation, and rapid incident post-mortems for critical infrastructure breaches.", color: "border-indigo-400/50 bg-indigo-500/20 text-indigo-100" },
  { title: "Risk & Compliance", desc: "Enterprise architecture alignment with stringent global frameworks including ISO 27001, SOC 2, HIPAA, and GDPR.", color: "border-emerald-400/50 bg-emerald-500/20 text-emerald-100" },
  { title: "Network Security", desc: "Implementation of Zero Trust Network Access (ZTNA), Next-Gen IPS/IDS, and dynamic micro-segmentation protocols.", color: "border-blue-400/50 bg-blue-500/20 text-blue-100" },
  { title: "Dark Web Monitoring", desc: "Continuous OSINT and darknet surveillance to intercept leaked credentials, proprietary source code, and imminent threat indicators.", color: "border-purple-400/50 bg-purple-500/20 text-purple-100" },
  { title: "Breach Response", desc: "Immediate containment orchestration, payload eradication, and system restoration to minimize operational downtime.", color: "border-rose-400/50 bg-rose-500/20 text-rose-100" },
  { title: "Security Procurement", desc: "Strategic acquisition and deployment of enterprise-grade hardware, SIEM solutions, and advanced cryptography tools.", color: "border-teal-400/50 bg-teal-500/20 text-teal-100" },
  { title: "Malware Analysis", desc: "Advanced reverse-engineering of polymorphic malware and zero-day payloads to extract actionable IOCs and TTPs.", color: "border-amber-400/50 bg-amber-500/20 text-amber-100" },
  { title: "Penetration Testing (VAPT)", desc: "Full-scope adversarial simulations, red teaming, and continuous vulnerability assessments across hybrid environments.", color: "border-cyan-400/50 bg-cyan-500/20 text-cyan-100" }
];

export default function Home() {
  const [news, setNews] = useState<{title: string, link: string, source: string}[]>([]);
  const [heroImageIndex, setHeroImageIndex] = useState(0);
  const [badgeIndex, setBadgeIndex] = useState(0);
  const [hoveredExpertise, setHoveredExpertise] = useState<number | null>(null);
  const hoverTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  
  // Contact Form State
  // Contact state removed
  
  // Ticker animation state
  const baseX = useMotionValue(0);
  const [isFeedHovered, setIsFeedHovered] = useState(false);
  const velocity = useMotionValue(-1.5);

  useAnimationFrame((t, delta) => {
    // Smoothly interpolate velocity: -0.2 (slow) when hovered, -1.5 (normal) when not
    const target = isFeedHovered ? -0.2 : -1.5;
    velocity.set(velocity.get() + (target - velocity.get()) * 0.1); 
    
    // Apply movement
    baseX.set(baseX.get() + velocity.get() * (delta / 16));
    
    // Wrap around seamlessly (assuming content is long enough)
    if (baseX.get() <= -3500) {
      baseX.set(0);
    }
  });

  const handleMouseEnter = (index: number) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    // 1500ms delay to prevent accidental expansion on quick flyovers
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredExpertise(index);
    }, 1500); 
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setHoveredExpertise(null);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setHeroImageIndex((prev) => (prev + 1) % heroImages.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const badgeInterval = setInterval(() => {
      setBadgeIndex((prev) => (prev + 1) % heroBadges.length);
    }, 2000);
    return () => clearInterval(badgeInterval);
  }, []);

  useEffect(() => {
    fetch('/api/feed')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setNews([...data, ...data]); // Duplicate for seamless infinite scroll
        }
      })
      .catch(console.error);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50/20 text-slate-900 flex flex-col overflow-x-hidden pt-[112px] relative">
      {/* Ambient Glassmorphism Background */}
      <div className="fixed inset-0 z-[-1] pointer-events-none overflow-hidden bg-grid-pattern opacity-50">
        <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-indigo-200/50 blur-[100px] mix-blend-multiply animate-blob"></div>
        <div className="absolute top-[20%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-purple-200/50 blur-[100px] mix-blend-multiply animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-[-10%] left-[20%] w-[50vw] h-[50vw] rounded-full bg-emerald-200/40 blur-[100px] mix-blend-multiply animate-blob animation-delay-4000"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] rounded-full bg-blue-100/30 blur-[120px] mix-blend-multiply animate-blob animation-delay-2000"></div>
      </div>
      {/* NAVIGATION */}
      <motion.header 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="fixed top-0 left-0 right-0 w-full z-50 backdrop-blur-3xl bg-slate-50/70 border-b border-slate-200/50 shadow-sm transition-all"
      >
        <div className="container mx-auto px-6 h-20 flex items-center justify-between">
          <a href="#" className="flex items-center gap-3 group focus:outline-none focus:ring-2 focus:ring-primary rounded-lg shrink-0">
            <div className="relative flex items-center justify-center w-10 h-10 transition-all duration-500 group-hover:scale-110">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/80 to-indigo-600 rounded-xl shadow-[0_0_15px_rgba(79,70,229,0.5)] transform rotate-45 group-hover:rotate-90 transition-all duration-500"></div>
              <div className="absolute inset-[2px] bg-slate-900 rounded-[10px] transform rotate-45 group-hover:rotate-90 transition-all duration-500"></div>
              <span className="relative z-10 font-bold text-lg text-transparent bg-clip-text bg-gradient-to-br from-cyan-400 to-indigo-400 tracking-tighter lowercase">nt</span>
            </div>
            <span className="font-black text-xl tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-cyan-400 to-indigo-600 animate-text-glitter drop-shadow-sm hidden sm:block">NETAMPS TECHNOLOGIES</span>
          </a>
          <div className="flex items-center gap-6">
            <nav className="hidden lg:flex items-center gap-4">
              {[
                { name: 'Home', href: '#' },
                { name: 'About Us', href: '#about' },
                { name: 'Services', href: '#services' },
                { name: 'Solutions', href: '#solutions' },
                { name: 'CSR', href: '#csr' }
              ].map((item) => (
                <a 
                  key={item.name}
                  href={item.href} 
                  className="text-sm font-bold text-slate-600 hover:text-primary transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-primary rounded px-2 py-1"
                >
                  {item.name}
                </a>
              ))}
            </nav>
            <a href="mailto:contact@netamps.com" className="rainbow-btn hidden md:inline-flex items-center justify-center px-6 py-2.5 rounded-full bg-slate-900 text-white font-bold text-sm transition-all duration-300 shadow-md hover:shadow-lg hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-primary/50 whitespace-nowrap">
              Get Started
            </a>
            <button className="lg:hidden p-2 text-slate-600 bg-white/20 rounded-full border border-slate-200 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-primary">
              <Menu className="w-6 h-6" />
            </button>
          </div>
        </div>
      </motion.header>

      {/* NON-STOP NEWS TICKER */}
      {news.length > 0 && (
        <div className="fixed top-20 left-0 right-0 z-40 bg-slate-900 border-b border-slate-800 py-2.5 overflow-hidden flex text-slate-300 shadow-md">
          <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-slate-900 to-transparent z-10 pointer-events-none"></div>
          <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-slate-900 to-transparent z-10 pointer-events-none"></div>
          <div className="flex items-center justify-center gap-2 px-6 bg-primary text-white font-bold text-[10px] uppercase tracking-widest absolute left-0 z-20 h-full top-0 shadow-[4px_0_15px_rgba(0,0,0,0.5)]">
            <Activity className="w-3.5 h-3.5 animate-pulse" /> CYBER FEED
          </div>
          <motion.div 
            style={{ x: baseX }}
            onMouseEnter={() => setIsFeedHovered(true)}
            onMouseLeave={() => setIsFeedHovered(false)}
            className="flex items-center whitespace-nowrap pl-[180px] cursor-pointer"
          >
            {[...news, ...news, ...news, ...news].map((item, i) => {
              let badgeColor = "bg-primary text-white";
              let icon = <Activity className="w-3 h-3" />;
              
              if (item.source === 'AWS Security') {
                badgeColor = "bg-orange-500 text-white";
                icon = <Cloud className="w-3 h-3" />;
              } else if (item.source === 'CrowdStrike') {
                badgeColor = "bg-red-600 text-white";
                icon = <Shield className="w-3 h-3" />;
              } else if (item.source === 'BleepingComputer') {
                badgeColor = "bg-blue-600 text-white";
                icon = <Network className="w-3 h-3" />;
              } else if (item.source === 'Cisco Security') {
                badgeColor = "bg-teal-600 text-white";
                icon = <Server className="w-3 h-3" />;
              }
              
              return (
                <a key={i} href={item.link} target="_blank" rel="noopener noreferrer" className="flex items-center text-xs font-semibold hover:text-white transition-colors mx-8 group">
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider mr-4 shadow-sm ${badgeColor}`}>
                    {icon} {item.source}
                  </div>
                  <span className="rainbow-text-hover">{item.title}</span>
                </a>
              );
            })}
          </motion.div>
        </div>
      )}

      <main className="flex-grow">
        {/* SECTION 1: HERO */}
        <section className="relative pt-24 pb-20 lg:pt-32 lg:pb-32 overflow-hidden bg-transparent border-b border-white/20">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[100px] -z-10" />
          <div className="container mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center relative z-10">
            <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="max-w-3xl">
              <motion.div variants={fadeInUp} className="inline-block mb-6">
                <span className="text-xs font-extrabold tracking-[0.2em] text-primary uppercase bg-primary/10 border border-primary/20 px-4 py-1.5 rounded-full shadow-sm">
                  Welcome to the Future of Security
                </span>
              </motion.div>
              <motion.h1 variants={fadeInUp} className="text-5xl lg:text-[4.5rem] font-black tracking-tighter mb-6 leading-[1.05] text-slate-900 flex flex-col gap-1">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-cyan-400 to-indigo-600 pb-2 drop-shadow-sm animate-text-glitter" style={{ filter: 'drop-shadow(0 10px 20px rgba(79,70,229,0.25))' }}>
                  NETAMPS TECHNOLOGIES
                </span>
              </motion.h1>
              <motion.p variants={fadeInUp} className="text-lg lg:text-xl text-slate-600 mb-10 leading-relaxed font-medium">
                Advanced Threat Intelligence, Digital Forensics, and Incident Response (DFIR) solutions designed to safeguard critical infrastructure against evolving threat vectors.
              </motion.p>
              <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-4">
                <a href="#contact" className="rainbow-btn bg-primary text-white px-8 py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all shadow-xl shadow-primary/20 hover:-translate-y-1 focus:outline-none focus:ring-4 focus:ring-primary/50 focus:ring-offset-2">
                  Engage Our Experts <ArrowRight className="w-5 h-5" />
                </a>
                <a href="#about" className="rainbow-btn bg-white text-slate-700 border border-slate-200 px-8 py-4 rounded-xl font-bold text-lg transition-all text-center hover:-translate-y-1 shadow-sm focus:outline-none focus:ring-4 focus:ring-primary/50 focus:ring-offset-2">
                  Explore Capabilities
                </a>
              </motion.div>
            </motion.div>
            
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 1, ease: "easeOut" }} className="relative hidden lg:block">
              <div className="aspect-[4/3] rounded-3xl bg-slate-100 border border-slate-200 shadow-2xl overflow-hidden relative group">
                <AnimatePresence mode="wait">
                  <motion.img 
                    key={heroImageIndex}
                    src={heroImages[heroImageIndex]} 
                    alt="Cyber Security Operations" 
                    initial={{ opacity: 0, scale: 1.1 }}
                    animate={{ opacity: 1, scale: 1.05 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.5 }}
                    className="absolute inset-0 w-full h-full object-cover" 
                  />
                </AnimatePresence>
                <div className="absolute inset-0 bg-gradient-to-t from-white/90 via-white/20 to-transparent z-10 pointer-events-none"></div>
                <div className="absolute bottom-6 left-6 right-6 z-20">
                  <AnimatePresence mode="wait">
                    <motion.div 
                      key={badgeIndex}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.3 }}
                      className="flex justify-between items-end bg-white/80 backdrop-blur-md p-4 rounded-2xl border border-white shadow-sm"
                    >
                      <div>
                        <div className={`text-xs font-bold px-2 py-1 rounded inline-block mb-1 border ${heroBadges[badgeIndex].bgClass} ${heroBadges[badgeIndex].textClass} ${heroBadges[badgeIndex].borderClass}`}>
                          {heroBadges[badgeIndex].status}
                        </div>
                        <div className="font-bold text-lg text-slate-900">{heroBadges[badgeIndex].text}</div>
                      </div>
                      <motion.div animate={{ rotate: 360 }} transition={{ duration: 12, repeat: Infinity, ease: "linear" }} className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                        {React.createElement(heroBadges[badgeIndex].icon, { className: "w-5 h-5 text-primary" })}
                      </motion.div>
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* SECTION: AUTHORIZED PARTNERS */}
        <section className="py-16 border-y border-white/20 bg-transparent overflow-hidden relative">
          <div className="container mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-extrabold mb-4 text-slate-900">Strategic Vendor Ecosystem</h2>
              <p className="text-slate-600 max-w-2xl mx-auto font-medium">Integrating world-class technologies to deliver zero-trust security and robust infrastructure solutions.</p>
            </div>
            
            <p className="text-xs font-bold text-slate-400 mb-8 uppercase tracking-widest flex items-center gap-4">
              Technology Alliances <span className="flex-grow h-px bg-slate-200"></span>
            </p>
            <div className="flex flex-wrap items-center justify-center gap-6">
              {[
                { name: 'Intel', domain: 'intel.com', extra: 'Gold Partner' },
                { name: 'HPE Aruba', domain: 'arubanetworks.com' },
                { name: 'Seagate', domain: 'seagate.com' },
                { name: 'Microsoft', domain: 'microsoft.com' },
                { name: 'Cisco', domain: 'cisco.com' },
                { name: 'Sectigo', domain: 'sectigo.com' },
                { name: 'Synology', domain: 'synology.com' },
                { name: 'Sonicwall', domain: 'sonicwall.com' },
                { name: 'Acer', domain: 'acer.com' },
                { name: 'Asus', domain: 'asus.com' },
                { name: 'Logitech', domain: 'logitech.com' }
              ].map((partner, i) => (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05, duration: 0.5 }}
                  key={i} 
                  className="flex items-center gap-4 px-4 py-3 hover:scale-110 transition-transform duration-500 min-w-[180px]"
                >
                  <img 
                    src={`https://www.google.com/s2/favicons?domain=${partner.domain}&sz=128`} 
                    alt={partner.name} 
                    className="h-8 w-8 object-contain rounded-md" 
                    onError={(e) => { 
                      e.currentTarget.onerror = null; 
                      e.currentTarget.src = `https://ui-avatars.com/api/?name=${partner.name}&background=f1f5f9&color=0f172a&rounded=true&bold=true`; 
                    }} 
                  />
                  <div className="flex flex-col text-left">
                    <span className="font-bold text-base text-slate-800 tracking-tight leading-none">{partner.name}</span>
                    {partner.extra && <span className="text-[9px] uppercase text-primary font-bold tracking-widest mt-1">{partner.extra}</span>}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION: ABOUT US & VALUES */}
        <section id="about" className="py-24 bg-transparent relative border-b border-white/20">
          <div className="container mx-auto px-6">
            <motion.div initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }} className="mb-20 rounded-[2.5rem] overflow-hidden h-[350px] md:h-[500px] relative shadow-2xl group">
               <div className="absolute inset-0 bg-slate-900/20 z-10"></div>
               <img src="https://images.unsplash.com/photo-1573164713988-8665fc963095?auto=format&fit=crop&q=80&w=2000" alt="Cyber Security Team" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-[4s] ease-out" />
               <div className="absolute inset-0 z-20 flex items-center p-6 md:p-16">
                 <div className="bg-white/90 backdrop-blur-2xl border border-white p-8 md:p-12 rounded-3xl max-w-2xl shadow-[0_20px_40px_rgba(0,0,0,0.1)] transform transition-transform duration-500 group-hover:translate-x-2">
                   <h2 className="text-3xl md:text-5xl font-black text-slate-900 leading-[1.1] tracking-tight">
                     Augmenting <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">technology</span> with human intelligence.
                   </h2>
                   <div className="w-12 h-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full mt-6"></div>
                 </div>
               </div>
            </motion.div>
            
            <div className="grid lg:grid-cols-2 gap-16 items-start">
              <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={staggerContainer}>
                <motion.h2 variants={fadeInUp} className="text-4xl font-extrabold mb-8 flex items-center gap-4 text-slate-900">
                  <span className="w-10 h-1.5 bg-primary rounded-full shrink-0"></span>
                  Firm Overview
                </motion.h2>
                <div className="pl-14">
                  <motion.p variants={fadeInUp} className="text-slate-600 leading-relaxed mb-6 text-lg font-medium text-justify">
                    At <strong className="text-slate-900">Netamps Technologies</strong>, our expertise is defined by our ability to architect, engineer, and deliver resilient solutions across an increasingly complex cyberspace. While no digital infrastructure can be considered absolutely impervious to compromise, we enable organizations to establish robust layers of defense designed to mitigate risk, safeguard critical information, and protect digital assets against unauthorized access and manipulation.
                  </motion.p>
                  <motion.p variants={fadeInUp} className="text-slate-600 leading-relaxed mb-6 text-lg font-medium text-justify">
                    The rapid proliferation of technology has fundamentally transformed how enterprises operate and create value. We believe that the convergence of cutting-edge technological innovation with human intelligence and strategic thinking creates a powerful foundation for solving complex enterprise security challenges.
                  </motion.p>
                  <motion.p variants={fadeInUp} className="text-slate-600 leading-relaxed mb-10 text-lg font-medium text-justify">
                    Our approach is rooted in a simple principle: technology becomes truly transformative when intelligent systems are guided by human insight. By combining our deep expertise in Digital Forensics and Cyber Security with an understanding of the evolving digital landscape, we deliver next-generation solutions that are secure, scalable, and purpose-built for the challenges of tomorrow.
                  </motion.p>
                </div>
              </motion.div>

              <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={staggerContainer} className="space-y-6">
                <motion.h2 variants={fadeInUp} className="text-3xl font-extrabold mb-8 text-slate-900 pl-6 border-l-4 border-primary">Core Principles</motion.h2>
                
                {[
                  { title: "Human Capital & Operational Excellence", desc: "We believe human expertise is the cornerstone of every successful organization. We logically align technology with human insight to solve complex security challenges efficiently." },
                  { title: "Integrity & Governance", desc: "Our methodology is strictly bound by ethical principles. We maintain a robust governance framework and culture that drives exceptional value and compliance for our clientele." },
                  { title: "Strategic Vision", desc: "Our objective is to architect resilient cyber environments by leveraging emerging technologies to redefine security paradigms in Cyberspace and Digital Forensics." }
                ].map((val, i) => (
                  <motion.div key={i} variants={fadeInUp} className="p-6 hover:translate-x-2 transition-transform duration-500 group">
                    <h3 className="text-xl font-bold text-slate-900 mb-3 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                        <CheckCircle className="w-4 h-4 text-primary" />
                      </div>
                      {val.title}
                    </h3>
                    <p className="text-slate-600 text-base leading-relaxed font-medium pl-11 text-justify">{val.desc}</p>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </div>
        </section>

        {/* SECTION: SERVICES / AREA OF EXPERTISE */}
        <section id="services" className="py-24 bg-transparent relative border-y border-white/20 overflow-hidden">
          {/* Ambient Background Glows */}
          <div className="absolute top-1/4 left-0 w-96 h-96 bg-blue-400/10 rounded-full blur-[100px] -z-10 mix-blend-multiply"></div>
          <div className="absolute bottom-1/4 right-0 w-96 h-96 bg-purple-400/10 rounded-full blur-[100px] -z-10 mix-blend-multiply"></div>
          
          <div className="container mx-auto px-6 relative z-10">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={staggerContainer} className="text-center max-w-3xl mx-auto mb-20">
              <motion.div variants={fadeInUp} className="inline-block mb-4">
                <span className="text-xs font-black tracking-[0.2em] text-indigo-600 uppercase bg-indigo-50 border border-indigo-100 px-4 py-1.5 rounded-full shadow-sm">
                  Area of Expertise
                </span>
              </motion.div>
              <motion.h2 variants={fadeInUp} className="text-4xl lg:text-5xl font-black mb-6 text-transparent bg-clip-text bg-gradient-to-r from-slate-900 via-indigo-900 to-slate-900 tracking-tighter">
                Core Capabilities
              </motion.h2>
              <motion.p variants={fadeInUp} className="text-lg text-slate-600 font-medium">
                We provide the critical expertise required to effectively investigate breaches and formulate comprehensive Incident Response plans.
              </motion.p>
            </motion.div>
            
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={staggerContainer} className="grid md:grid-cols-3 gap-8">
              {[
                { icon: Server, title: "Security Operations Center", gradient: "from-blue-500 to-indigo-500", desc: "Continuous 24/7/365 infrastructure monitoring. We detect, triage, and respond to threats while deploying proactive tactics to minimize attack surfaces.", items: ['24/7/365 SOC Monitoring', 'SOAR Orchestration', 'Incident Response', 'Next-Gen Firewall Management'] },
                { icon: Activity, title: "Vulnerability & Risk Management", gradient: "from-purple-500 to-pink-500", desc: "Proactively shield your enterprise against lateral movement and vulnerabilities introduced by configuration drift, third-party integrations, or shadow IT.", items: ['Vulnerability Assessments', 'User Behavior Analytics (UBA)', 'Zero Trust Network Access', 'Continuous Risk Monitoring'] },
                { icon: Lock, title: "Data Protection & Privacy", gradient: "from-emerald-400 to-teal-500", desc: "Mitigate risk before exploitation. We implement comprehensive data lifecycle protections, resolving endpoint vulnerabilities and enforcing encryption.", items: ['Endpoint Detection & Response', 'Enterprise Email Security', 'Data Loss Prevention (DLP)', 'Cryptographic Controls'] }
              ].map((svc, i) => (
                <motion.div key={i} variants={fadeInUp} className="group relative p-[1px] rounded-[2rem] bg-gradient-to-b from-white/60 to-white/10 hover:from-primary/30 hover:to-transparent transition-all duration-700 overflow-hidden shadow-xl hover:shadow-2xl hover:-translate-y-2">
                  {/* Inner Card */}
                  <div className="absolute inset-[1px] rounded-[2rem] bg-white/40 backdrop-blur-xl z-0 transition-colors duration-500 group-hover:bg-white/50"></div>
                  
                  <div className="relative z-10 p-8 flex flex-col h-full">
                    {/* Glowing Icon Container */}
                    <div className="relative w-16 h-16 mb-8 group-hover:scale-110 transition-transform duration-500">
                      <div className={`absolute inset-0 bg-gradient-to-br ${svc.gradient} rounded-2xl opacity-20 blur-md group-hover:opacity-40 transition-opacity duration-500`}></div>
                      <div className={`relative w-full h-full bg-gradient-to-br ${svc.gradient} rounded-2xl flex items-center justify-center shadow-lg border border-white/20`}>
                        {React.createElement(svc.icon, { className: "w-8 h-8 text-white drop-shadow-md" })}
                      </div>
                    </div>
                    
                    <h3 className="text-2xl font-bold mb-4 text-slate-900 tracking-tight">{svc.title}</h3>
                    <p className="text-slate-600 leading-relaxed mb-8 flex-grow font-medium">
                      {svc.desc}
                    </p>
                    
                    <ul className="space-y-4 text-sm text-slate-700 font-bold">
                      {svc.items.map((item, idx) => (
                        <li key={idx} className="flex items-center gap-3 group/item">
                          <div className={`w-5 h-5 rounded-full bg-gradient-to-br ${svc.gradient} flex items-center justify-center opacity-80 group-hover/item:opacity-100 group-hover/item:scale-110 transition-all shadow-sm`}>
                            <CheckCircle className="w-3 h-3 text-white" />
                          </div>
                          <span className="group-hover/item:text-slate-900 transition-colors">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* SECTION: ADVANCED SOLUTIONS */}
        <section id="solutions" className="py-24 bg-transparent border-y border-white/20">
          <div className="container mx-auto px-6">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={staggerContainer} className="mb-16 text-center">
              <motion.div variants={fadeInUp} className="inline-block px-4 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-600 font-bold text-xs mb-4 uppercase tracking-widest">
                Next-Gen Solutions
              </motion.div>
              <motion.h2 variants={fadeInUp} className="text-4xl lg:text-5xl font-extrabold text-slate-900 mb-6">Advanced Threat Defense</motion.h2>
            </motion.div>

            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={staggerContainer} className="grid md:grid-cols-2 gap-6">
              {[
                { icon: Key, title: "Zero Trust Architecture", desc: "Never trust, always verify. We implement micro-segmentation and continuous authentication.", bg: "bg-amber-100", color: "text-amber-600" },
                { icon: Cloud, title: "Cloud Security Posture", desc: "Automated identification and remediation of risks across AWS, Azure, and GCP environments.", bg: "bg-cyan-100", color: "text-cyan-600" },
                { icon: AlertTriangle, title: "Advanced Threat Hunting", desc: "Proactive searching through networks to detect and isolate advanced persistent threats.", bg: "bg-rose-100", color: "text-rose-600" },
                { icon: Eye, title: "Identity & Access Management", desc: "Streamline user identities and access privileges with MFA and SSO integration.", bg: "bg-pink-100", color: "text-pink-600" }
              ].map((sol, i) => (
                <motion.div key={i} variants={fadeInUp} className="group flex gap-6 p-6 rounded-2xl hover:-translate-y-2 transition-all duration-500">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${sol.bg} ${sol.color} group-hover:scale-110 transition-transform`}>
                    <sol.icon className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900 mb-2">{sol.title}</h3>
                    <p className="text-slate-600 leading-relaxed font-medium">{sol.desc}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* SECTION: WE SUPPORT */}
        <section className="py-24 bg-transparent overflow-hidden border-b border-white/20">
          <div className="container mx-auto px-6">
            <motion.div initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }} className="bg-primary/80 backdrop-blur-2xl border border-white/20 p-10 md:p-16 rounded-[3rem] relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl mix-blend-overlay"></div>
              
              <div className="text-center max-w-2xl mx-auto mb-12 relative z-10">
                <h2 className="text-4xl font-extrabold mb-4 text-white">Areas of Expertise</h2>
                <p className="text-indigo-100 text-lg font-medium">Our deep specialization spans across critical domains of enterprise security and compliance.</p>
              </div>

              <div className="flex flex-wrap justify-center gap-4 relative z-10 max-w-4xl mx-auto">
                {expertiseAreas.map((item, i) => (
                  <motion.div 
                    key={i} 
                    layout
                    onMouseEnter={() => handleMouseEnter(i)}
                    onMouseLeave={handleMouseLeave}
                    className={`flex flex-col items-center justify-center gap-2 backdrop-blur-md px-6 py-4 rounded-[2rem] shadow-lg text-white overflow-hidden cursor-pointer transition-colors duration-500 ${hoveredExpertise === i ? item.color : 'bg-white/10 border border-white/20'}`}
                    animate={{ 
                      scale: hoveredExpertise === i ? 1.05 : 1
                    }}
                    transition={{ layout: { duration: 0.4, type: "spring", bounce: 0.15 } }}
                  >
                    <motion.div layout="position" className="flex items-center gap-3">
                      <CheckCircle className={`w-5 h-5 flex-shrink-0 ${hoveredExpertise === i ? 'text-white' : 'text-white/70'}`} />
                      <span className="font-bold tracking-wide whitespace-nowrap">{item.title}</span>
                    </motion.div>
                    <AnimatePresence>
                      {hoveredExpertise === i && (
                        <motion.div
                          initial={{ opacity: 0, height: 0, marginTop: 0 }}
                          animate={{ opacity: 1, height: "auto", marginTop: 12 }}
                          exit={{ opacity: 0, height: 0, marginTop: 0 }}
                          className="text-white/90 text-sm max-w-xs text-center leading-relaxed font-medium"
                        >
                          {item.desc}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* SECTION: CSR */}
        <section id="csr" className="py-24 bg-transparent relative border-y border-white/20">
          <div className="container mx-auto px-6">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={staggerContainer} className="text-center max-w-3xl mx-auto mb-16">
              <motion.div variants={fadeInUp} className="inline-block px-4 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 font-bold text-xs mb-4 uppercase tracking-widest">
                Corporate Social Responsibility
              </motion.div>
              <motion.h2 variants={fadeInUp} className="text-4xl lg:text-5xl font-black mb-6 text-slate-900 tracking-tighter">
                Securing a Sustainable Future
              </motion.h2>
            </motion.div>

            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={staggerContainer} className="grid md:grid-cols-2 gap-8">
              {[
                { 
                  icon: "🌐", title: "Digital Inclusion", 
                  subtitle: "Bridging the digital divide and securing the next generation.",
                  desc: "We believe technology should empower everyone. We actively donate refurbished hardware to schools and community organisations to provide vital digital access. Additionally, we fund cybersecurity scholarships to help cultivate and diversify the next generation of tech talent.",
                  bg: "bg-blue-100", text: "text-blue-600"
                },
                { 
                  icon: "🌱", title: "E-Waste & Green IT", 
                  subtitle: "Responsible lifecycle management for a cleaner planet.",
                  desc: "Technology should move us forward, not clutter our planet. We partner exclusively with certified e-waste recyclers to ensure old, decommissioned client hardware is disposed of or repurposed responsibly, keeping hazardous materials out of landfills.",
                  bg: "bg-emerald-100", text: "text-emerald-600"
                },
                { 
                  icon: "🔒", title: "Data Ethics & Trust", 
                  subtitle: "Uncompromising transparency, security, and integrity.",
                  desc: "Trust is our core currency. We maintain absolute transparency in how we handle and protect client data. We strictly adhere to ethical data practices and refuse to support or sell technologies involved in unethical AI processing or mass surveillance.",
                  bg: "bg-purple-100", text: "text-purple-600"
                },
                { 
                  icon: "☁️", title: "Carbon-Neutral Cloud Solutions", 
                  subtitle: "Powering the future of IT with sustainable infrastructure.",
                  desc: "We help our clients scale efficiently and sustainably. By intentionally partnering with leading data center providers (such as AWS, Microsoft Azure, and Google Cloud) that commit to 100% renewable energy, we ensure your IT infrastructure leaves a minimal carbon footprint.",
                  bg: "bg-cyan-100", text: "text-cyan-600"
                }
              ].map((csr, i) => (
                <motion.div key={i} variants={fadeInUp} className="group p-8 rounded-3xl bg-white/40 backdrop-blur-xl border border-white/60 shadow-xl hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 relative overflow-hidden flex flex-col md:flex-row gap-6 items-start">
                  <div className={`absolute top-0 right-0 w-32 h-32 ${csr.bg} rounded-full blur-[80px] -z-10 opacity-50 group-hover:opacity-100 transition-opacity duration-500`}></div>
                  <div className="text-4xl filter drop-shadow-sm group-hover:scale-110 transition-transform flex-shrink-0">{csr.icon}</div>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900 mb-2">{csr.title}</h3>
                    <h4 className={`text-sm font-bold ${csr.text} mb-3 leading-snug`}>{csr.subtitle}</h4>
                    <p className="text-slate-600 font-medium leading-relaxed">{csr.desc}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>
      </main>

      {/* SECTION: FOOTER */}
      <footer className="border-t border-white/20 pt-20 pb-10 bg-transparent">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-12 mb-16">
            <div className="col-span-2 lg:col-span-2">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center font-bold text-lg text-white">N</div>
                <span className="font-bold text-xl tracking-tight text-slate-900">Netamps Technologies</span>
              </div>
              <p className="text-slate-600 mb-8 max-w-sm font-medium">Leveraging big in the field of Digital Forensics & Cyber Security with emerging technologies.</p>
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-widest">Live Threat Trends</h4>
                <div className="bg-white/20 backdrop-blur-md border border-white/30 rounded-xl p-4 w-full max-w-sm">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Threats Neutralized (24h)</span>
                    <span className="text-[10px] font-bold text-emerald-600 flex items-center bg-emerald-50 px-1.5 py-0.5 rounded"><Activity className="w-3 h-3 mr-1" /> +14.2%</span>
                  </div>
                  <div className="flex items-end gap-1.5 h-12 w-full">
                    {[35, 45, 30, 65, 50, 75, 40, 85, 60, 100].map((h, i) => (
                      <motion.div 
                        key={i} 
                        initial={{ height: 0 }}
                        whileInView={{ height: `${h}%` }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.05, duration: 0.8, type: "spring" }}
                        className="flex-1 bg-gradient-to-t from-primary to-indigo-400 rounded-t-sm opacity-80 hover:opacity-100 cursor-pointer"
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="font-bold text-slate-900 mb-6">Services</h4>
              <ul className="space-y-4 text-slate-600 text-sm font-bold">
                <li><a href="#services" className="rainbow-text-hover transition-colors focus:outline-none focus:ring-2 focus:ring-primary rounded px-1 -ml-1">Infrastructure</a></li>
                <li><a href="#services" className="rainbow-text-hover transition-colors focus:outline-none focus:ring-2 focus:ring-primary rounded px-1 -ml-1">Risk & Vulnerability</a></li>
                <li><a href="#services" className="rainbow-text-hover transition-colors focus:outline-none focus:ring-2 focus:ring-primary rounded px-1 -ml-1">Data Security</a></li>
                <li><a href="#support" className="rainbow-text-hover transition-colors focus:outline-none focus:ring-2 focus:ring-primary rounded px-1 -ml-1">Digital Forensics</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-bold text-slate-900 mb-6">Company</h4>
              <ul className="space-y-4 text-slate-600 text-sm font-bold">
                <li><a href="#about" className="rainbow-text-hover transition-colors focus:outline-none focus:ring-2 focus:ring-primary rounded px-1 -ml-1">About Us</a></li>
                <li><a href="#about" className="rainbow-text-hover transition-colors focus:outline-none focus:ring-2 focus:ring-primary rounded px-1 -ml-1">Our Values</a></li>
                <li><a href="#csr" className="rainbow-text-hover transition-colors focus:outline-none focus:ring-2 focus:ring-primary rounded px-1 -ml-1">CSR</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-slate-900 mb-6">Connect</h4>
              <ul className="space-y-4 text-slate-600 text-sm font-bold">
                <li>
                  <a href="mailto:contact@netamps.com" className="hover:text-primary transition-colors flex items-center gap-2">
                    <Mail className="w-4 h-4" /> contact@netamps.com
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-200 pt-8 pb-4 flex flex-col lg:flex-row justify-between items-center gap-6 text-xs text-slate-500 font-bold">
            <div className="flex flex-col gap-1.5 text-center lg:text-left">
              <p className="text-slate-600 uppercase tracking-widest font-black">Netamps Technologies Private Limited <span className="text-slate-400 font-medium ml-2">CIN: U72900KA2022PTC167699</span></p>
              <p>&copy; {new Date().getFullYear()} Netamps Technologies. All rights reserved. All trademarks, logos and brand names are the property of their respective owners.</p>
            </div>
            <div className="flex items-center justify-center lg:justify-end gap-1.5 bg-slate-100/50 backdrop-blur-sm px-5 py-2 rounded-full border border-slate-200/50 shadow-sm">
              <span className="text-slate-500 font-bold text-xs uppercase tracking-widest mt-0.5">Powered by</span>
              <span className="font-bold text-[1.1rem] tracking-tight leading-none flex items-center" style={{ fontFamily: 'Product Sans, sans-serif' }}>
                <span className="text-[#4285F4]">G</span>
                <span className="text-[#EA4335]">o</span>
                <span className="text-[#FBBC05]">o</span>
                <span className="text-[#4285F4]">g</span>
                <span className="text-[#34A853]">l</span>
                <span className="text-[#EA4335]">e</span>
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
