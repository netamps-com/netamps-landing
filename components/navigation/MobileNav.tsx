'use client';

import { Home, ShoppingCart, User, Settings } from 'lucide-react';
import Link from 'next/link';

export default function MobileNav() {
  const navItems = [
    { name: 'Home', href: '/', icon: Home },
    { name: 'Shop', href: '/shop', icon: ShoppingCart },
    { name: 'Profile', href: '/profile', icon: User },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-t border-gray-200 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
      <ul className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => (
          <li key={item.name} className="flex-1 flex justify-center">
            <Link 
              href={item.href}
              className="flex flex-col items-center justify-center w-full h-full min-h-[48px] min-w-[48px] text-gray-500 hover:text-blue-600 active:text-blue-700 active:scale-95 transition-all duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg"
              prefetch={true}
            >
              <item.icon className="w-5 h-5 mb-1 stroke-[2.5]" />
              <span className="text-[10px] font-semibold tracking-wide leading-none">{item.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
