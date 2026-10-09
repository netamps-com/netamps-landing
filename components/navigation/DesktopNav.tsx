'use client';

import Link from 'next/link';
import { Home, ShoppingCart, User, Settings, ShieldCheck } from 'lucide-react';

export default function DesktopNav() {
  const navItems = [
    { name: 'Home', href: '/', icon: Home },
    { name: 'Solutions', href: '/shop', icon: ShieldCheck },
    { name: 'Client Portal', href: '/profile', icon: User },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  return (
    <header className="hidden md:block sticky top-0 z-50 w-full border-b border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <Link href="/" className="flex-shrink-0 flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-md">
              <span className="font-bold text-xl tracking-tight text-gray-900 flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-blue-600" />
                Netamps
              </span>
            </Link>
          </div>
          
          <nav className="flex items-center space-x-8">
            {navItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="group flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-blue-700 transition-colors py-2 px-3 rounded-md hover:bg-blue-50 outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <item.icon className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition-colors" />
                {item.name}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
