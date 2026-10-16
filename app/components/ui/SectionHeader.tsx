/**
 * SectionHeader — standard section heading inside a page.
 */
'use client';

import * as React from 'react';

export function SectionHeader({
  className = '',
  title,
  subtitle,
}: {
  className?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className={`mb-6 flex items-center gap-2 ${className}`}>
      <div>
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
    </div>
  );
}
SectionHeader.displayName = 'SectionHeader';
