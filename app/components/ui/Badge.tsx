/**
 * Badge — status pill.
 * Variants: 'success' | 'warning' | 'error' | 'info' | 'neutral'
 */
'use client';

import * as React from 'react';
import { COMPONENTS } from '../../lib/theme';

export function Badge({
  className = '',
  variant = 'neutral',
  children,
}: { className?: string; variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral'; children: React.ReactNode }) {
  const variants: Record<string, string> = {
    success: COMPONENTS.badgeSuccess,
    warning: COMPONENTS.badgeWarning,
    error: COMPONENTS.badgeError,
    info: COMPONENTS.badgeInfo,
    neutral: COMPONENTS.badgeNeutral,
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
}
Badge.displayName = 'Badge';
