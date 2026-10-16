/**
 * Label — standard form label.
 */
'use client';

import * as React from 'react';

export function Label({
  className = '',
  children,
}: { className?: string; children: React.ReactNode }) {
  return (
    <label className={`block text-sm font-medium text-slate-700 mb-1 ${className}`}>
      {children}
    </label>
  );
}
Label.displayName = 'Label';

/**
 * InputError — inline field error message.
 */
export function InputError({
  className = '',
  children,
}: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`mt-1 text-xs text-red-600 font-medium flex items-center gap-1 ${className}`}>
      {children}
    </div>
  );
}
InputError.displayName = 'InputError';
