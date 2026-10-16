/**
 * Card — standard container for all module content panels.
 * Use THEME.card, THEME.cardElevated, or THEME.cardInteractive.
 */
'use client';

import * as React from 'react';
import { COMPONENTS } from '../../lib/theme';

export function Card({
  className = '',
  elevated = false,
  interactive = false,
  children,
}: {
  className?: string;
  elevated?: boolean;
  interactive?: boolean;
  children: React.ReactNode;
}) {
  const base = interactive
    ? COMPONENTS.cardInteractive
    : elevated
    ? COMPONENTS.cardElevated
    : COMPONENTS.card;
  return <div className={`${base} ${className}`}>{children}</div>;
}

Card.displayName = 'Card';

/**
 * CardHeader — header section inside a Card.
 */
export function CardHeader({
  className = '',
  children,
}: { className?: string; children: React.ReactNode }) {
  return <div className={`mb-4 ${className}`}>{children}</div>;
}
CardHeader.displayName = 'CardHeader';

/**
 * CardTitle — heading inside a CardHeader.
 */
export function CardTitle({
  className = '',
  children,
}: { className?: string; children: React.ReactNode }) {
  return (
    <h3 className={`text-lg font-bold text-slate-900 ${className}`}>{children}</h3>
  );
}
CardTitle.displayName = 'CardTitle';

/**
 * CardDescription — subtext inside a CardHeader.
 */
export function CardDescription({
  className = '',
  children,
}: { className?: string; children: React.ReactNode }) {
  return (
    <p className={`text-sm text-slate-500 mt-0.5 ${className}`}>{children}</p>
  );
}
CardDescription.displayName = 'CardDescription';
