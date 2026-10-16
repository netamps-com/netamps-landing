/**
 * PageShell — standard page wrapper for all modules.
 * Provides consistent background, max-width container, and padding.
 */
'use client';

import * as React from 'react';

export function PageShell({
  className = '',
  children,
}: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`min-h-screen bg-slate-50/20 text-slate-900 flex flex-col ${className}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {children}
      </div>
    </div>
  );
}
PageShell.displayName = 'PageShell';
