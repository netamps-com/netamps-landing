/**
 * Button — standard button for all modules.
 * Variants: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
 * Sizes: 'sm' | 'md'
 */
'use client';

import * as React from 'react';
import { COMPONENTS } from '../../lib/theme';

export function Button({
  className = '',
  variant = 'primary',
  size = 'md',
  disabled = false,
  children,
  ...props
}: {
  className?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md';
  disabled?: boolean;
  children: React.ReactNode;
  [key: string]: unknown;
}) {
  const variants: Record<string, string> = {
    primary: COMPONENTS.btnPrimary,
    secondary: COMPONENTS.btnSecondary,
    ghost: COMPONENTS.btnGhost,
    danger: COMPONENTS.btnDanger,
    outline: COMPONENTS.btnOutline,
  };
  return (
    <button
      className={`${variants[variant]} ${disabled ? 'opacity-70 cursor-not-allowed' : ''} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
Button.displayName = 'Button';
