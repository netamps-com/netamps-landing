/**
 * Alert — standard notification banner.
 * Variants: 'success' | 'warning' | 'error' | 'info'
 */
'use client';

import * as React from 'react';
import { COMPONENTS } from '../../lib/theme';

export function Alert({
  className = '',
  variant = 'info',
  icon,
  children,
}: {
  className?: string;
  variant?: 'success' | 'warning' | 'error' | 'info';
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const variants: Record<string, string> = {
    success: COMPONENTS.alertSuccess,
    warning: COMPONENTS.alertWarning,
    error: COMPONENTS.alertError,
    info: COMPONENTS.alertInfo,
  };
  return (
    <div className={`border rounded-xl p-3 flex items-start gap-3 text-sm ${variants[variant]} ${className}`}>
      {icon && <span className="shrink-0 mt-0.5">{icon}</span>}
      <div>{children}</div>
    </div>
  );
}
Alert.displayName = 'Alert';
