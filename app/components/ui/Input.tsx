/**
 * Input — standard text input for all modules.
 */
'use client';

import * as React from 'react';
import { COMPONENTS } from '../../lib/theme';

export function Input({
  className = '',
  icon,
  ...props
}: {
  className?: string;
  icon?: React.ReactNode;
  [key: string]: unknown;
}) {
  return (
    <div className="relative">
      {icon && (
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          {icon}
        </div>
      )}
      <input className={`${COMPONENTS.inputWithIcon} ${className}`} {...props} />
    </div>
  );
}
Input.displayName = 'Input';
