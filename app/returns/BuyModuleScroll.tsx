'use client';

import { useRef, useState, useEffect } from 'react';
import { Server, HardDrive, Cpu, Globe, Shield, Laptop2, Monitor, Zap, Mouse, Folder, CheckCircle, X, Heart, DollarSign } from 'lucide-react';

// Define categories data
const CATEGORIES = [
  {
    id: 1,
    title: 'Enterprise Infrastructure & Compute',
    iconComponent: Server,
    items: [
      { id: 1, name: 'Rack & Blade Servers', sub: 'Dell PowerEdge, HPE ProLiant, Cisco UCS, IBM/Lenovo System x' },
      { id: 2, name: 'Mainframes & Micro-servers', sub: 'Large-scale enterprise processing units' },
      { id: 3, name: 'Server Components', sub: 'CPUs (Intel Xeon, AMD EPYC), Server RAM, Motherboards, Power Supplies (PSUs)' }
    ]
  },
  {
    id: 2,
    title: 'Data Storage Arrays',
    iconComponent: HardDrive,
    items: [
      { id: 4, name: 'Storage Systems', sub: 'SAN (Storage Area Network), NAS (Network Attached Storage), and DAS systems' },
      { id: 5, name: 'Hard Drives (HDDs)', sub: 'Enterprise SAS, SATA, and Fibre Channel mechanical drives' },
      { id: 6, name: 'Solid State Drives (SSDs)', sub: 'NVMe, M.2, and SATA enterprise flash storage' },
      { id: 7, name: 'Tape Drives & Libraries', sub: 'LTO tape cartridges, autoloaders, and backup systems' }
    ]
  },
  {
    id: 3,
    title: 'Networking & Telecom Equipment',
    iconComponent: Globe,
    items: [
      { id: 8, name: 'Switches & Routers', sub: 'Enterprise-managed core switches, PoE switches, and edge routers' },
      { id: 9, name: 'Firewalls & Security', sub: 'Network security appliances and VPN gateways' },
      { id: 10, name: 'Wireless Infrastructure', sub: 'Controller-based Access Points (APs) and wireless LAN controllers' },
      { id: 11, name: 'Telecom Systems', sub: 'VoIP phones, PBX systems, and unified communications hardware' }
    ]
  },
  {
    id: 4,
    title: 'End-User Mobility & Workstations',
    iconComponent: Laptop2,
    items: [
      { id: 12, name: 'Corporate Laptops', sub: 'Professional notebooks (e.g., Lenovo ThinkPad, Dell Latitude, HP EliteBook, Apple MacBook)' },
      { id: 13, name: 'Business Desktops', sub: 'Standard towers, Mini PCs, and All-in-One (AiO) systems' },
      { id: 14, name: 'Workstations', sub: 'High-compute engineering and graphics desktops' },
      { id: 15, name: 'Mobile Devices', sub: 'Corporate-issued smartphones (iOS, Android) and tablets' }
    ]
  },
  {
    id: 5,
    title: 'Monitors & Displays',
    iconComponent: Monitor,
    items: [
      { id: 16, name: 'Flat Panel Displays', sub: 'LCD, LED, and OLED office monitors' },
      { id: 17, name: 'Specialized Displays', sub: 'Touchscreen kiosks, medical-grade displays, and smart TVs' }
    ]
  },
  {
    id: 6,
    title: 'Power & Cooling Infrastructure',
    iconComponent: Zap,
    items: [
      { id: 18, name: 'Uninterruptible Power Supplies (UPS)', sub: 'Rackmount and standalone battery backups' },
      { id: 19, name: 'Power Distribution Units (PDUs)', sub: 'Basic, monitored, and switched server rack PDUs' }
    ]
  },
  {
    id: 7,
    title: 'Peripherals & Point of Sale (POS)',
    iconComponent: Mouse,
    items: [
      { id: 20, name: 'Office Peripherals', sub: 'Docking stations, keyboards, mice, and external webcams' },
      { id: 21, name: 'POS Terminals', sub: 'Receipt printers, barcode scanners, card readers, and cash drawers' }
    ]
  }
];

interface CategoryItem {
  id: number;
  name: string;
  sub: string;
}

function CategoryCard({ category, item, index }: { category: typeof CATEGORIES[0]; item: CategoryItem; index: number }) {
  const [isHovering, setIsHovering] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const scrolled = rect.top < viewportHeight && rect.bottom > 0;
      setIsHovering(scrolled);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const delay = index * 80;

  return (
    <div
      ref={ref}
      key={item.id}
      className="group border-b border-slate-200/50 pb-6 last:pb-0 hover:no-underline"
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-white/5 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
          <category.iconComponent className={`h-5 w-5 text-indigo-400 group-hover:text-indigo-300 transition-colors ${isHovering ? 'text-indigo-300' : 'text-indigo-200'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-slate-900 group-hover:text-indigo-600 transition-colors text-sm">{item.name}</h3>
          <p className="text-slate-500 text-xs mt-1 line-clamp-1">{item.sub}</p>
        </div>
      </div>
    </div>
  );
}

interface BuyModuleScrollProps {
  className?: string;
}

export default function BuyModuleScroll({ className }: BuyModuleScrollProps) {
  const [showSection, setShowSection] = useState(false);
  const scrolRevealRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!scrolRevealRef.current) return;
      const rect = scrolRevealRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const scrolled = rect.top < viewportHeight && rect.bottom > 0;
      setShowSection(scrolled);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div
      ref={scrolRevealRef}
      className="hidden sm:block w-64 h-full bg-white border-r border-slate-200/50 sticky top-0 bottom-0 overflow-y-auto z-20"
      style={{ transition: 'opacity 0.3s ease, transform 0.3s ease' }}
    >
      <div className="p-6 pt-10">
        <h2 className="text-lg font-bold text-slate-900 mb-6 border-b border-slate-200/50 pb-4">
          BUY HARDWARE
        </h2>

        {/* Offers & Discount Section */}
        <div className="mt-8 pt-8 border-t border-slate-200/50">
          <h3 className="text-sm font-semibold text-amber-600 uppercase tracking-wider mb-4">Special Offers for Online Requests</h3>

          <div className="space-y-3">
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <Zap className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <p className="font-medium text-slate-900">Free Shipping on all orders over $5,000</p>
                  <p className="text-xs text-slate-500">Automatically applied at checkout</p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="h-4 w-4 text-indigo-600" />
                </div>
                <div>
                  <p className="font-medium text-slate-900">15% Early-Bird Discount</p>
                  <p className="text-xs text-slate-500">For orders placed within 48 hours</p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <Heart className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <p className="font-medium text-slate-900">Volume Pricing</p>
                  <p className="text-xs text-slate-500">5% off 3+ same-line items</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Categories List */}
        <div className="mt-10 space-y-2">
          {CATEGORIES.map((category) => (
            <div key={category.id} className="space-y-1">
              {category.items.map((item) => (
                <CategoryCard category={category} item={item} index={item.id} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}