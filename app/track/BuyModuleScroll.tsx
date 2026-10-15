'use client';

import { Handshake, Lock, BadgeCheck, Mail, Send, Server as ServerIcon, Shield, LayoutGrid, Monitor, Sun, Gift, Package, Headphones, Keyboard, Mouse, Printer, Flag, Heart, Star } from 'lucide-react';

type CategoryItem = {
  id: string;
  title: string;
  category: string;
  description: string;
  offer?: string;
  discount?: string;
};

const CATEGORIES: CategoryItem[] = [
  {
    id: '1',
    title: 'Enterprise Infrastructure & Compute',
    category: 'Infrastructure',
    description:
      'Rack & Blade Servers: Dell PowerEdge, HPE ProLiant, Cisco UCS, IBM/Lenovo System x; Mainframes & Micro-servers; Server Components: CPUs (Intel Xeon, AMD EPYC), Server RAM, Motherboards, Power Supplies (PSUs)',
    offer: 'Free Shipping',
    discount: '15% off',
  },
  {
    id: '2',
    title: 'Data Storage Arrays',
    category: 'Storage',
    description:
      'Storage Systems: SAN, NAS, and DAS systems; Hard Drives (HDDs): Enterprise SAS, SATA, and Fibre Channel mechanical drives; SSDs: NVMe, M.2, and SATA enterprise flash storage; Tape Drives & Libraries: LTO tape cartridges, autoloaders, and backup systems',
    offer: 'Buy 2 Get 1',
    discount: '20% off',
  },
  {
    id: '3',
    title: 'Networking & Telecom Equipment',
    category: 'Networking',
    description:
      'Switches & Routers: Enterprise-managed core switches, PoE switches, and edge routers; Firewalls & Security: Network security appliances and VPN gateways; Wireless Infrastructure: Controller-based Access Points (APs) and wireless LAN controllers; Telecom Systems: VoIP phones, PBX systems, and unified communications hardware',
    offer: 'Bundle & Save',
    discount: '25% off',
  },
  {
    id: '4',
    title: 'End-User Mobility & Workstations',
    category: 'Mobility',
    description:
      'Corporate Laptops: Professional notebooks (Lenovo ThinkPad, Dell Latitude, HP EliteBook, Apple MacBook); Business Desktops: Standard towers, Mini PCs, and All-in-One (AiO) systems; Workstations: High-compute engineering and graphics desktops; Mobile Devices: Corporate-issued smartphones (iOS, Android) and tablets',
    offer: 'Corp Discount',
    discount: '10% off',
  },
  {
    id: '5',
    title: 'Monitors & Displays',
    category: 'Displays',
    description:
      'Flat Panel Displays: LCD, LED, and OLED office monitors; Specialized Displays: Touchscreen kiosks, medical-grade displays, and smart TVs',
    offer: 'Volume Pricing',
    discount: '18% off',
  },
  {
    id: '6',
    title: 'Power & Cooling Infrastructure',
    category: 'Infrastructure',
    description:
      'Uninterruptible Power Supplies (UPS): Rackmount and standalone battery backups; Power Distribution Units (PDUs): Basic, monitored, and switched server rack PDUs',
    offer: 'Free Setup',
    discount: '12% off',
  },
  {
    id: '7',
    title: 'Peripherals & Point of Sale (POS)',
    category: 'Accessories',
    description:
      'Office Peripherals: Docking stations, keyboards, mice, and external webcams; POS Terminals: Receipt printers, barcode scanners, card readers, and cash drawers',
    offer: 'Seasonal Deal',
    discount: '30% off',
  },
];

export default function BuyModuleScroll() {
  return (
    <section
      aria-label="IT Hardware Buying Module - Scroll Showcase"
      className="relative overflow-x-auto -mx-4 mb-8 rounded-2xl bg-slate-950/50 backdrop-blur-xl ring-1 ring-white/10 px-4 pb-8"
    >
      {/* Section Header */}
      <div className="flex flex-col items-center gap-4 pb-6 border-b border-slate-800/50">
        <h2 className="text-[clamp(1.25rem,3vw,1.5rem)] font-black text-white tracking-tight">
          Netamps Hardware Marketplace
        </h2>
        <p className="text-slate-400 text-sm max-w-md text-center">
          Curated enterprise IT hardware with exclusive online offers & discounts
        </p>
      </div>

      {/* Scroll Container */}
      <div className="flex flex-col sm:flex-row gap-4 overflow-x-scroll pb-4 sm:pb-0 scrollbar-hide">
        {/* Manual scrollbar */}
        <div
          className="w-2 h-[16px] bg-slate-800/50 rounded-full overflow-hidden absolute top-0 right-0"
        >
          <div
            className="h-full w-full bg-amber-500/20 transition-colors hover:bg-amber-500/30"
            style={{ height: '100%' }}
          />
        </div>

        <div className="flex gap-2 sm:gap-6 pt-2">
          {CATEGORIES.map((cat) => (
            <article
              key={cat.id}
              className="group w-full sm:w-80 flex flex-col items-center rounded-2xl bg-slate-900/80 backdrop-blur-sm p-5 px-4 transition-all hover:bg-slate-900/90 hover:shadow-xl duration-300 border border-white/10"
            >
              {/* Category Icon */}
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"
                style={{
                  background:
                    cat.category === 'Infrastructure'
                      ? 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)'
                      : cat.category === 'Storage'
                      ? 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)'
                      : cat.category === 'Networking'
                      ? 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)'
                      : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                }}
              >
                <svg
                  className="w-6 h-6"
                  style={{ color: 'var(--foreground)' }}
                >
                  <path
                    d="M2 7l10 5 10-5-10-5z"
                    fill="var(--foreground)"
                /></svg>
              </div>

              {/* Category Title */}
              <h3 className="text-[clamp(0.8rem,2vw,0.95rem)] font-semibold text-white mb-1">
                {cat.title}
              </h3>

              {/* Category Description */}
              <p className="text-[10px] text-slate-400 text-center lines-cl-3 mb-3">
                {cat.description}
              </p>

              {/* Offer & Discount Badges */}
              <div className="w-full flex justify-between items-center mt-3">
                {cat.offer || cat.discount ? (
                  <div className="flex items-center gap-2 mb-2">
                    {cat.offer && (
                      <div
                        className="inline-flex items-center gap-1 rounded-xl bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-300"
                      >
                        <Heart className="h-2 w-2" />
                        {cat.offer}
                      </div>
                    )}
                    {cat.discount && (
                      <div
                        className="inline-flex items-center gap-1 rounded-xl bg-teal-500/10 px-2.5 py-1 text-[10px] font-bold text-teal-400"
                      >
                        <Star className="h-2 w-2" />
                        {cat.discount}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="invisible" />
                )}
              </div>

              {/* "Make Offer" CTA Button */}
              <button
                onClick={() => {
                  // In a real app, this would navigate to negotiation or contact form
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="mt-3 w-full py-2.5 rounded-xl bg-amber-600 text-slate-950 font-bold text-sm hover:bg-amber-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Make Offer
              </button>
            </article>
          ))}
        </div>
      </div>

      {/* Offers Summary Bar - sticky on mobile */}
      <div
        className="fixed bottom-0 left-0 right-0 mx-4 mb-4 rounded-2xl bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-950/90 p-4 px-6 shadow-xl shadow-slate-500/10 backdrop-blur-lg border border-white/10"
        aria-label="Online offers summary"
      >
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-white">Live Offers & Discounts</h3>
          <BadgeCheck
            className="w-4 h-4 text-amber-400"
            aria-hidden="true"
          />
          <span className="text-slate-400 text-sm">Up to 30% off + Free Shipping</span>
        </div>
      </div>
    </section>
  );
}