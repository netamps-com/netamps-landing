"use client";

import React, { useEffect, useState, useCallback } from 'react';
import SecureLoginButton from './SecureLoginButton';
import FirmOverviewBanner from './FirmOverviewBanner';
import ServerStatusWidget from './ServerStatusWidget';
import NetampsLogo from './NetampsLogo';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, Mail, Shield, Server, Lock, Fingerprint, Activity, Network, Cloud, Key, AlertTriangle, Eye, Menu, X, BookOpen, Cctv, Cpu, Repeat, Target, ShoppingCart } from 'lucide-react';

const fadeInUp = {
  hidden: { opacity: 0, y: 60, scale: 0.95, filter: "blur(10px)" },
  visible: { 
    opacity: 1, 
    y: 0, 
    scale: 1, 
    filter: "blur(0px)",
    transition: { 
      type: "spring",
      stiffness: 60,
      damping: 14,
      mass: 1,
      bounce: 0.2
    } 
  }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1, 
    transition: { 
      staggerChildren: 0.1,
      delayChildren: 0.05
    } 
  }
};

const expertiseAreas = [
  { title: "Digital Forensics & Incident Response (DFIR)", desc: "Rapid artifact acquisition, chain-of-custody preservation, and post-mortem root cause analysis for critical enterprise breaches.", color: "border-indigo-200 bg-indigo-100 text-indigo-600", icon: Fingerprint, bgImage: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&q=80&w=600" },
  { title: "Governance, Risk, and Compliance (GRC)", desc: "Strategic enterprise architecture alignment with stringent regulatory frameworks including ISO 27001, SOC 2, HIPAA, and GDPR.", color: "border-emerald-200 bg-emerald-100 text-emerald-600", icon: Shield, bgImage: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&q=80&w=600" },
  { title: "Enterprise Network Infrastructure & Next-Gen IPS/IDS", desc: "Architecting resilient, scalable routing/switching backbones fortified with Next-Generation Intrusion Prevention Systems.", color: "border-blue-200 bg-blue-100 text-blue-600", icon: Network, bgImage: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&q=80&w=600" },
  { title: "AI-Augmented Surveillance & Behavioral Analytics", desc: "Deployment of intelligent optical networks utilizing AI telemetry for physical security and real-time anomaly detection.", color: "border-purple-200 bg-purple-100 text-purple-600", icon: Cctv, bgImage: "https://images.unsplash.com/photo-1557597774-9d273605dfa9?auto=format&fit=crop&q=80&w=600" },
  { title: "IoT Security & Edge Network Protection", desc: "Hardening and administering vast interconnected device ecosystems to mitigate edge-compute vulnerabilities and endpoint compromises.", color: "border-rose-200 bg-rose-100 text-rose-600", icon: Cpu, bgImage: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=600" },
  { title: "Enterprise Hardware & SIEM Procurement", desc: "Strategic acquisition, provisioning, and lifecycle management of enterprise-grade hardware, SIEM platforms, and tactical tools.", color: "border-teal-200 bg-teal-100 text-teal-600", icon: ShoppingCart, bgImage: "https://images.unsplash.com/photo-1591405351990-4726e331f141?auto=format&fit=crop&q=80&w=600" },
  { title: "Secure IT Asset Disposition (ITAD) & Reverse Logistics", desc: "Cryptographic data erasure, compliant e-waste decommissioning, and secure hardware extraction adhering to DoD standards.", color: "border-amber-200 bg-amber-100 text-amber-600", icon: Repeat, bgImage: "https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&q=80&w=600" },
  { title: "Vulnerability Assessment & Penetration Testing (VAPT)", desc: "Full-scope adversarial simulations, red teaming, and continuous attack surface management across dynamic environments.", color: "border-cyan-200 bg-cyan-100 text-cyan-600", icon: Target, bgImage: "https://images.unsplash.com/photo-1510511459019-5d01a80c9e65?auto=format&fit=crop&q=80&w=600" },
  { title: "Smart Enterprise & EdTech Infrastructure", desc: "Engineering next-generation collaborative environments integrated with secure network connectivity and unified communications.", color: "border-orange-200 bg-orange-100 text-orange-600", icon: BookOpen, bgImage: "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&q=80&w=600" },
  { title: "Managed Cloud Architecture Services (MSP)", desc: "End-to-end cloud lifecycle administration, workload migration, and FinOps resource optimization across distributed infrastructures.", color: "border-fuchsia-200 bg-fuchsia-100 text-fuchsia-600", icon: Server, bgImage: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=600" }
];

export default function Home() {
  const [hoveredExpertise, setHoveredExpertise] = useState<number | null>(null);
  const hoverTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const [currentTimeIST, setCurrentTimeIST] = useState<string>('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
      setCurrentTimeIST(formatter.format(now) + ' IST');
    };
    
    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Generate Session ID if missing
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (!url.searchParams.has('sid')) {
        const sid = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        url.searchParams.set('sid', sid);
        window.history.replaceState({}, '', url.toString());
      }
    }

  }, []);

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


  return (

    <div className="min-h-screen bg-slate-50/20 text-slate-900 flex flex-col overflow-x-hidden pt-[80px] relative">
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
          <a href="#" aria-label="Netamps Technologies – Home" className="flex items-center gap-3 group focus:outline-none rounded-lg shrink-0">
            <div className="relative p-[3px] bg-white rounded-xl shadow-sm border border-slate-200 group-hover:shadow-[0_0_20px_rgba(79,70,229,0.2)] group-hover:border-indigo-300 transition-all duration-500">
              <NetampsLogo className="h-10 w-10 md:h-12 md:w-12 group-hover:scale-[1.03] transition-transform duration-500" />
            </div>
            <div className="hidden sm:flex flex-col">
              <span className="font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-indigo-700 via-purple-700 to-indigo-900 text-2xl leading-none">NETAMPS</span>
              <span className="text-[10px] font-black text-transparent bg-clip-text bg-gradient-to-r from-slate-600 to-slate-400 tracking-[0.3em] leading-none mt-1">TECHNOLOGIES</span>
            </div>
          </a>
          <div className="flex items-center gap-6">
            {currentTimeIST && (
              <div className="hidden md:flex items-center gap-2 text-xs font-bold text-slate-500 bg-white/50 backdrop-blur-sm px-3 py-1.5 rounded-full border border-slate-200 shadow-sm cursor-default hover:text-slate-900 transition-colors">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                {currentTimeIST}
              </div>
            )}
              <nav className="hidden lg:flex items-center gap-4">
              {[
                { name: 'Home', href: '#' },
                { name: 'Services', href: '#services' },
                { name: 'Solutions', href: '#solutions' },
                { name: 'ESG Initiatives', href: '#csr', hasDropdown: true }
              ].map((item) => (
                item.hasDropdown ? (
                  <div key={item.name} className="relative group">
                    <a 
                      href={item.href}
                      className="rainbow-btn relative px-4 py-2 text-sm font-bold text-slate-800 bg-white/50 backdrop-blur-sm border border-slate-200 rounded-full hover:-translate-y-0.5 hover:shadow-[0_0_15px_rgba(79,70,229,0.3)] hover:border-indigo-400 transition-all focus:outline-none focus:ring-2 focus:ring-primary shadow-sm overflow-hidden block group-hover:rounded-b-none group-hover:border-b-transparent z-10"
                    >
                      <span className="relative z-10 group-hover:text-white transition-colors flex items-center gap-1">{item.name} <svg className="w-3.5 h-3.5 opacity-70 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg></span>
                    </a>
                    <div className="absolute left-0 mt-0 w-48 bg-white border border-slate-200 border-t-0 rounded-b-xl rounded-tr-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50 overflow-hidden transform origin-top group-hover:scale-y-100 scale-y-95">
                      <a 
                        href="/returns"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block px-4 py-3 text-sm font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                      >
                        Request a Return
                      </a>
                    </div>
                  </div>
                ) : (
                  <a 
                    key={item.name}
                    href={item.href}
                    className="rainbow-btn relative px-4 py-2 text-sm font-bold text-slate-800 bg-white/50 backdrop-blur-sm border border-slate-200 rounded-full hover:-translate-y-0.5 hover:shadow-[0_0_15px_rgba(79,70,229,0.3)] hover:border-indigo-400 transition-all focus:outline-none focus:ring-2 focus:ring-primary shadow-sm group overflow-hidden block"
                  >
                    <span className="relative z-10 group-hover:text-white transition-colors">{item.name}</span>
                  </a>
                )
              ))}
              <SecureLoginButton />
            </nav>
            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="lg:hidden p-2 text-slate-600 bg-white/20 rounded-full border border-slate-200 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-primary z-[60] relative">
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="lg:hidden bg-white/95 backdrop-blur-3xl border-b border-slate-200 shadow-xl overflow-hidden"
            >
              <div className="container mx-auto px-6 py-6 flex flex-col gap-4">
                {[
                  { name: 'Home', href: '#' },
                  { name: 'Services', href: '#services' },
                  { name: 'Solutions', href: '#solutions' },
                  { name: 'ESG Initiatives', href: '#csr', hasDropdown: true }
                ].map((item) => (
                  <div key={item.name}>
                    <a 
                      href={item.href}
                      onClick={() => !item.hasDropdown && setIsMobileMenuOpen(false)} 
                      className="block w-full text-left text-lg font-bold text-slate-800 hover:text-primary transition-colors py-2 border-b border-slate-100 flex justify-between items-center"
                    >
                      {item.name}
                    </a>
                    {item.hasDropdown && (
                      <a 
                        href="/returns"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setIsMobileMenuOpen(false)} 
                        className="block w-full text-left text-base font-semibold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition-colors py-2 pl-4 border-b border-slate-100"
                      >
                        ↳ Request a Return
                      </a>
                    )}
                  </div>
                ))}
                <div className="pt-2 border-t border-slate-100 flex justify-center mt-2 w-full">
                  <SecureLoginButton />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.header>



      <main className="flex-grow">
        
        {/* SECTION: FIRM OVERVIEW */}
        <section className="py-16 lg:py-20 bg-transparent relative border-b border-white/20">
          <div className="container mx-auto px-6">
            <FirmOverviewBanner />
            <div className="grid lg:grid-cols-2 gap-16 items-start">
              <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-50px" }} variants={staggerContainer}>
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
              <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-50px" }} variants={staggerContainer} className="space-y-6">
                <motion.h2 variants={fadeInUp} className="text-3xl font-extrabold mb-8 text-slate-900 pl-6 border-l-4 border-primary">Core Principles</motion.h2>
                {[
                  { title: "Human Capital & Operational Excellence", desc: "We believe human expertise is the cornerstone of every successful organization. We logically align technology with human insight to solve complex security challenges efficiently." },
                  { title: "Integrity & Governance", desc: "Our methodology is strictly bound by ethical principles. We maintain a robust governance framework and culture that drives exceptional value and compliance for our clientele." },
                  { title: "Strategic Vision", desc: "Our objective is to architect resilient cyber environments by leveraging emerging technologies to redefine security paradigms in Cyberspace and Digital Forensics." }
                ].map((val, i) => (
                  <motion.div key={i} variants={fadeInUp} className="p-6 hover:translate-x-2 transition-transform duration-500 group">
                    <h3 className="text-xl font-bold text-slate-900 mb-3 flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                        <CheckCircle className="w-3 h-3 text-primary" />
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

        {/* SECTION: AUTHORIZED PARTNERS */}

        <section className="py-12 border-y border-white/20 bg-transparent overflow-hidden relative">
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
                { name: 'AWS', domain: 'aws.amazon.com' },
                { name: 'Google Cloud', domain: 'cloud.google.com' },
                { name: 'Intel', domain: 'intel.com', extra: 'Gold Partner' },
                { name: 'HPE Aruba', domain: 'arubanetworks.com' },
                { name: 'Seagate', domain: 'seagate.com' },
                { name: 'Microsoft', domain: 'microsoft.com' },
                { name: 'Cisco', domain: 'cisco.com' },
                { name: 'Sectigo', domain: 'sectigo.com' },
                { name: 'Hanwha Vision', domain: 'hanwhavision.com' },
                { name: 'Xcitium Enterprise', domain: 'xcitium.com' },
                { name: 'Synology', domain: 'synology.com' },
                { name: 'Sonicwall', domain: 'sonicwall.com' },
                { name: 'Acer', domain: 'acer.com' },
                { name: 'Asus', domain: 'asus.com' },
                { name: 'Logitech', domain: 'logitech.com' }
              ].map((partner, i) => (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
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



        {/* SECTION: SERVICES / AREA OF EXPERTISE */}
        <section id="services" className="py-16 lg:py-20 bg-transparent relative border-y border-white/20 overflow-hidden">
          {/* Ambient Background Glows */}
          <div className="absolute top-1/4 left-0 w-96 h-96 bg-blue-400/10 rounded-full blur-[100px] -z-10 mix-blend-multiply"></div>
          <div className="absolute bottom-1/4 right-0 w-96 h-96 bg-purple-400/10 rounded-full blur-[100px] -z-10 mix-blend-multiply"></div>
          
          <div className="container mx-auto px-6 relative z-10">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-50px" }} variants={staggerContainer} className="text-center max-w-3xl mx-auto mb-20">
              <motion.div variants={fadeInUp} className="inline-block mb-4">
                <span className="text-xs font-black tracking-[0.2em] text-indigo-600 uppercase bg-indigo-50 border border-indigo-100 px-4 py-1.5 rounded-full shadow-sm">
                  Next-Gen Solutions
                </span>
              </motion.div>
              <motion.h2 variants={fadeInUp} className="text-4xl lg:text-5xl font-black mb-6 text-transparent bg-clip-text bg-gradient-to-r from-slate-900 via-indigo-900 to-slate-900 tracking-tighter">
                Advanced Cyber Defense Operations
              </motion.h2>
              <motion.p variants={fadeInUp} className="text-lg text-slate-600 font-medium">
                Delivering military-grade cyber defense infrastructure, continuous adversarial simulation, and sovereign data governance to preempt and neutralize advanced persistent threats.
              </motion.p>
            </motion.div>
            
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-50px" }} variants={staggerContainer} className="grid md:grid-cols-3 gap-8">
              {[
                { 
                  icon: Server, 
                  title: "Next-Generation Security Operations Center (NG-SOC)", 
                  gradient: "from-blue-500 to-indigo-500", 
                  desc: "Next-generation 24/7/365 infrastructure monitoring aligned with the MITRE ATT&CK framework and NIST SP 800-61 Rev. 2. We utilize AI-driven SIEM and automated threat intelligence feeds to detect, triage, and execute rapid incident response protocols before lateral movement occurs.", 
                  items: ['MITRE ATT&CK Aligned Threat Hunting', 'Automated SOAR Playbooks', 'NIST-Compliant Incident Response', 'Cloud-Native XDR Integration'] 
                },
                { 
                  icon: Activity, 
                  title: "Continuous Threat Exposure Management (CTEM)", 
                  gradient: "from-purple-500 to-pink-500", 
                  desc: "Enterprise risk quantification and continuous attack surface management mapped to CIS Controls v8 and ISO/IEC 27001 standards. We actively prevent exploitation caused by configuration drift, supply chain vulnerabilities, and shadow IT environments.", 
                  items: ['Continuous Automated Red Teaming (CART)', 'CIS v8 Benchmark Auditing', 'Zero Trust Architecture (ZTA) Mapping', 'Third-Party Risk Management (TPRM)'] 
                },
                { 
                  icon: Lock, 
                  title: "Data Security Posture Management (DSPM)", 
                  gradient: "from-emerald-400 to-teal-500", 
                  desc: "Comprehensive data lifecycle governance ensuring strict compliance with global mandates like GDPR, CCPA, and HIPAA. We enforce cryptographic controls, granular role-based access (RBAC), and endpoint protections to maintain sovereign data integrity.", 
                  items: ['FIPS 140-3 Validated Cryptography', 'Regulatory Compliance Mapping', 'Data Loss Prevention (DLP) Policies', 'Identity-First Security (IAM/MFA)'] 
                }
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
`n        {/* SECTION: ADVANCED SOLUTIONS */}
        <section id="solutions" className="py-16 lg:py-20 bg-transparent border-y border-white/20">
          <div className="container mx-auto px-6">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-50px" }} variants={staggerContainer} className="mb-16 text-center">
              <motion.div variants={fadeInUp} className="inline-block px-4 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-600 font-bold text-xs mb-4 uppercase tracking-widest">
                Area of Expertise
              </motion.div>
              <motion.h2 variants={fadeInUp} className="text-4xl lg:text-5xl font-extrabold text-slate-900 mb-6">Core Capabilities</motion.h2>
            </motion.div>

            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-50px" }} variants={staggerContainer} className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                { icon: Key, title: "Zero Trust Network Access (ZTNA) & Micro-Segmentation", desc: "Implementation of continuous authentication and granular perimeter-less security to enforce strict least-privilege access.", color: "border-amber-200 bg-amber-100 text-amber-600", bgImage: "https://images.unsplash.com/photo-1614064641913-6b71a3061283?auto=format&fit=crop&q=80&w=600" },
                { icon: Cloud, title: "Cloud Security Posture Management (CSPM) & CWPP", desc: "Automated risk identification, compliance monitoring, and remediation across hybrid multi-cloud environments (AWS, Azure, GCP).", color: "border-cyan-200 bg-cyan-100 text-cyan-600", bgImage: "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&q=80&w=600" },
                { icon: AlertTriangle, title: "Advanced Persistent Threat (APT) Hunting & Threat Intel", desc: "Proactive network traversal utilizing behavioral analytics and threat intelligence to detect and isolate sophisticated adversaries.", color: "border-rose-200 bg-rose-100 text-rose-600", bgImage: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&q=80&w=600" },
                { icon: Eye, title: "Identity & Access Management (IAM) & Privileged Access", desc: "Centralized identity lifecycle management integrating SSO, MFA, and Privileged Access Management (PAM) controls.", color: "border-pink-200 bg-pink-100 text-pink-600", bgImage: "https://images.unsplash.com/photo-1555949963-aa79dcee981c?auto=format&fit=crop&q=80&w=600" },
                ...expertiseAreas
              ].map((sol, i) => (
                <motion.div key={i} variants={fadeInUp} className="group relative flex flex-col md:flex-row gap-6 p-6 rounded-2xl hover:-translate-y-2 transition-all duration-500 hover:shadow-xl bg-white/40 hover:bg-white/80 backdrop-blur-sm border border-slate-200/50 overflow-hidden z-10">
                  <div 
                    className="absolute inset-0 opacity-0 group-hover:opacity-15 transition-opacity duration-700 bg-cover bg-center -z-10"
                    style={{ backgroundImage: `url(${sol.bgImage})` }}
                  ></div>
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${sol.color} group-hover:scale-110 transition-transform shadow-sm relative z-10`}>
                    <sol.icon className="w-7 h-7" />
                  </div>
                  <div className="relative z-10">
                    <h3 className="text-xl font-bold text-slate-900 mb-2">{sol.title}</h3>
                    <p className="text-slate-600 leading-relaxed font-medium">{sol.desc}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>



        {/* SECTION: CSR */}
        <section id="csr" className="py-16 lg:py-20 bg-transparent relative border-y border-white/20">
          <div className="container mx-auto px-6">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-50px" }} variants={staggerContainer} className="text-center max-w-3xl mx-auto mb-16">
              <motion.div variants={fadeInUp} className="inline-block px-4 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 font-bold text-xs mb-4 uppercase tracking-widest">
                Responsible Business Practices
              </motion.div>
              <motion.h2 variants={fadeInUp} className="text-4xl lg:text-5xl font-black mb-6 text-slate-900 tracking-tighter">
                Responsible technology. Wider access. Thoughtful product life cycles.
              </motion.h2>
              <motion.p variants={fadeInUp} className="text-slate-600 font-medium text-lg mb-8 leading-relaxed">
                Netamps Technologies works to make technology more useful and responsible. Our priorities are digital inclusion, responsible product life cycles, data trust and more efficient digital operations. We aim to expand access to digital learning and, where suitable, support the safe reuse of equipment through appropriate partners. We protect the information entrusted to us and work to reduce avoidable resource use in our operations.
              </motion.p>
            </motion.div>

            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-50px" }} variants={staggerContainer} className="grid md:grid-cols-2 gap-8">
              {[
                { 
                  icon: "🌐", title: "Digital Inclusion", 
                  subtitle: "Support access to digital learning and useful technology.",
                  desc: "Where feasible, assess suitable equipment for secure data erasure, safety testing and reuse through appropriate community or education partners.",
                  bg: "bg-blue-100", text: "text-blue-600"
                },
                { 
                  icon: "♻️", title: "Circular Products & E-Waste", 
                  subtitle: "Responsible lifecycle management for decommissioned products.",
                  desc: "Prioritise continued use or repair where safe and suitable; send end-of-life equipment and batteries through the applicable authorized channels.",
                  bg: "bg-emerald-100", text: "text-emerald-600"
                },
                { 
                  icon: "🔒", title: "Data Ethics & Trust", 
                  subtitle: "Protect personal and client information with absolute integrity.",
                  desc: "Use access controls, handle data transparently and assess privacy and security risks. These are business conduct commitments essential to our operations.",
                  bg: "bg-purple-100", text: "text-purple-600"
                },
                { 
                  icon: "🏢", title: "Responsible Digital Infrastructure", 
                  subtitle: "Improve energy and resource efficiency in our own operations.",
                  desc: "Consider environmental information when selecting digital infrastructure. We make no carbon-neutral or renewable-energy claim without reliable evidence and a defined boundary.",
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

            {/* E-Waste & Product Take-Back Banner */}
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="mt-12 p-8 lg:p-12 rounded-3xl bg-slate-900 text-white shadow-2xl relative overflow-hidden flex flex-col lg:flex-row items-center justify-between gap-8 border border-slate-800">
              <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[100px] -z-10"></div>
              <div className="flex-1">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-xs mb-4 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Product Stewardship
                </div>
                <h3 className="text-3xl font-black mb-4">E-waste and Product Take-Back</h3>
                <p className="text-slate-300 font-medium leading-relaxed max-w-3xl text-lg mb-4">
                  We commit to receiving eligible decommissioned products supplied by Netamps Technologies or other vendors. We assess returned equipment for safe reuse or refurbishment where appropriate and route end-of-life products to authorized channels under applicable requirements.
                </p>
              </div>
              <div className="shrink-0 w-full lg:w-auto">
                <a href="/returns" target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center w-full lg:w-auto px-8 py-4 font-bold bg-white hover:bg-slate-100 text-slate-900 rounded-full transition-colors shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(255,255,255,0.2)]">
                  Request a Return
                </a>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      {/* SECTION: FOOTER */}
      <footer className="border-t border-slate-200 pt-8 pb-10 bg-transparent">
        <div className="container mx-auto px-6">
          <div className="flex flex-col lg:flex-row justify-between items-center gap-6 text-xs text-slate-500 font-bold">
            <div className="flex flex-col gap-1.5 text-center lg:text-left">
              <div className="flex flex-col md:flex-row gap-2 md:gap-4 items-center md:items-start text-slate-600 uppercase tracking-widest font-black">
                <span>Netamps Technologies Private Limited</span>
                <span className="text-slate-400 font-medium">CIN: U72900KA2022PTC167699</span>
                <span className="text-slate-300 hidden md:inline">|</span>
                <button 
                  onClick={(e) => {
                    e.preventDefault();
                    window.location.href = 'mailto:' + ['contact', 'netamps.com'].join('@');
                  }}
                  className="hover:text-primary transition-colors flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-primary rounded px-1 -ml-1 cursor-pointer font-bold normal-case tracking-normal"
                >
                  <Mail className="w-3.5 h-3.5" /> 
                  <span>contact<span className="hidden">.spam.trap</span>@<span className="hidden">do.not.scrape.</span>netamps.com</span>
                </button>
              </div>
              <div className="flex items-center flex-wrap gap-2 justify-center md:justify-start">
                <p>&copy; {new Date().getFullYear()} Netamps Technologies. All rights reserved. All trademarks, logos and brand names are the property of their respective owners.</p>
                <span className="text-slate-300 hidden md:inline">|</span>
                <button onClick={(e) => { e.preventDefault(); window.location.href = '/privacy'; }} className="hover:text-primary transition-colors underline decoration-slate-300 underline-offset-2">Privacy Policy</button>
              </div>
              <div className="mt-2 flex flex-col sm:flex-row items-center sm:items-start lg:items-center gap-2 text-slate-400">
                <span>Website developed & maintained by</span>
                <div className="flex items-center gap-2 bg-slate-100/80 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm transition-all duration-300 hover:shadow-md hover:border-indigo-300/50 cursor-default">
                  <NetampsLogo className="w-4 h-4 rounded-[3px]" />
                  <span className="font-black text-transparent bg-clip-text bg-gradient-to-r from-slate-900 via-indigo-900 to-slate-900 tracking-tight" style={{ fontFamily: 'var(--font-outfit)' }}>NETAMPS TECHNOLOGIES</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </footer>
    </div>
  );
}








