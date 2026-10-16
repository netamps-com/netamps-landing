/**
 * EmptyState — standard empty state for list/table views.
 */
'use client';

import * as React from 'react';

export function EmptyState({
  className = '',
  icon,
  title,
  description,
  action,
}: {
  className?: string;
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={`text-center py-12 border-2 border-dashed border-slate-200 rounded-xl ${className}`}>
      {icon && <div className="mx-auto w-12 h-12 text-slate-400 mb-4">{icon}</div>}
      <h3 className="text-lg font-bold text-slate-900 mb-2">{title}</h3>
      <p className="text-sm text-slate-500 mb-6">{description}</p>
      {action}
    </div>
  );
}
EmptyState.displayName = 'EmptyState';
