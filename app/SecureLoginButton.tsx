'use client';

import { useState } from 'react';
import { Shield, KeyRound } from 'lucide-react';

export default function SecureLoginButton() {
  // Dropdown open state. The Sign-In button ONLY toggles this menu —
  // it never navigates itself. Only the links inside the menu navigate.
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="rainbow-btn flex items-center gap-2 bg-slate-900 text-white px-5 py-2 rounded-full font-bold text-sm hover:shadow-[0_0_15px_rgba(16,185,129,0.4)] hover:border-emerald-500 transition-all border border-slate-700 shadow-md focus:outline-none focus:ring-2 focus:ring-slate-400 overflow-hidden relative"
      >
        <KeyRound className="w-4 h-4 text-emerald-400 transition-transform relative z-10" />
        <span className="relative z-10 transition-colors">Sign-In</span>
        <svg
          className={`w-3.5 h-3.5 text-slate-400 ml-1 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
        </svg>
      </button>

      {/* Dropdown Menu — only these links navigate */}
      <div
        role="menu"
        className={`absolute top-full right-0 mt-2 w-48 transition-all duration-200 z-50 origin-top-right ${
          isOpen ? 'opacity-100 visible translate-y-0' : 'opacity-0 invisible translate-y-2'
        }`}
      >
        <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-xl overflow-hidden p-2 flex flex-col gap-1 backdrop-blur-xl">
          <a
            href="/login"
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            className="flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-emerald-400 hover:bg-slate-800/60 transition-colors px-3 py-2.5 rounded-lg w-full text-left"
          >
            <Shield className="w-4 h-4" />
            Netamps Connect
          </a>
          <a
            href="https://webmail.netamps.in"
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            className="flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-indigo-400 hover:bg-slate-800/60 transition-colors px-3 py-2.5 rounded-lg w-full text-left"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
            Webmail Login
          </a>
        </div>
      </div>
    </div>
  );
}
