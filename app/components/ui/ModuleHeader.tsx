/**
 * ModuleHeader — standard page header for all modules.
 * Shows module title, subtitle, and optional right-side actions.
 */
'use client';

import * as React from 'react';

export function ModuleHeader({
  className = '',
  title,
  subtitle,
  actions,
}: {
  className?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className={`mb-8 flex items-center justify-between ${className}`}>
      <div>
        <h2 className="text-2xl font-black tracking-tight text-slate-900">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-3">{actions}</div>}
    </div>
  );
}
ModuleHeader.displayName = 'ModuleHeader';
