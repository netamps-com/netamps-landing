/**
 * LoadingSpinner — standard loading indicator.
 */
'use client';

import * as React from 'react';

export function LoadingSpinner({
  className = 'h-8 w-8',
}: { className?: string }) {
  return (
    <div className={`w-8 h-8 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin ${className}`} />
  );
}
LoadingSpinner.displayName = 'LoadingSpinner';
