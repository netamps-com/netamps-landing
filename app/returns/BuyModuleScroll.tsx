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
      { id: 1, name: 'Rack & Blade Servers' },
      { id: 2, name: 'Mainframes & Micro-servers' },
      { id: 3, name: 'Server Components' }
    ]
  },
  {
    id: 2,
    title: 'Data Storage Arrays',
    iconComponent: HardDrive,
    items: [
      { id: 4, name: 'Storage Systems' },
      { id: 5, name: 'Hard Drives (HDDs)' },
      { id: 6, name: 'Solid State Drives (SSDs)' }
    ]
  },
  {
    id: 3,
    title: 'Networking & Telecom Equipment',
    iconComponent: Globe,
    items: [
      { id: 8, name: 'Switches & Routers' },
      { id: 9, name: 'Firewalls & Security' },
      { id: 10, name: 'Wireless Infrastructure' }
    ]
  },
  {
    id: 4,
    title: 'End-User Mobility & Workstations',
    iconComponent: Laptop2,
    items: [
      { id: 12, name: 'Corporate Laptops' },
      { id: 13, name: 'Business Desktops' },
      { id: 14, name: 'Workstations' }
    ]
  },
  {
    id: 5,
    title: 'Monitors & Displays',
    iconComponent: Monitor,
    items: [
      { id: 16, name: 'Flat Panel Displays' },
      { id: 17, name: 'Specialized Displays' }
    ]
  },
  {
    id: 6,
    title: 'Power & Cooling Infrastructure',
    iconComponent: Zap,
    items: [
      { id: 18, name: 'UPS' },
      { id: 19, name: 'PDUs' }
    ]
  },
  {
    id: 7,
    title: 'Peripherals & Point of Sale (POS)',
    iconComponent: Mouse,
    items: [
      { id: 20, name: 'Office Peripherals' },
      { id: 21, name: 'POS Terminals' }
    ]
  }
];

interface CategoryItem {
  id: number;
  name: string;
}

function CategoryItemUI({ item, index }: { item: CategoryItem; index: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const scrolled = rect.top < viewportHeight && rect.bottom > 0;
      // No state set - just ensuring the element is in view
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div
      ref={ref}
      key={item.id}
      className="group border-b border-slate-200/50 pb-3 last:pb-0 hover:text-indigo-600 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl bg-white/5 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
          <Server className="h-4 w-4 text-indigo-400" />
        </div>
        <span className="font-medium text-slate-600 transition-colors text-sm">{item.name}</span>
      </div>
    </div>
  );
}

export default function BuyModuleScroll() {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Pure CSS animation - no JS scroll listeners needed
    return;
  }, []);

  return (
    <div
      ref={scrollRef}
      className="fixed left-0 top-0 bottom-0 w-64 h-full bg-white border-r border-slate-200/50 overflow-y-auto z-20 upward-animation"
    >
      <div className="space-y-1 padding-y-8">
        {CATEGORIES.map((category) => (
          <div key={category.id} className="space-y-0.5">
            {category.items.map((item) => (
              <CategoryItemUI item={item} index={item.id} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}