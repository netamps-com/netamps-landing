'use client';

import { useEffect } from 'react';

export default function SecurityWrapper({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const disableContextMenu = (e: MouseEvent) => e.preventDefault();
    const disableDrag = (e: DragEvent) => e.preventDefault();
    document.addEventListener('contextmenu', disableContextMenu);
    document.addEventListener('dragstart', disableDrag);
    return () => {
      document.removeEventListener('contextmenu', disableContextMenu);
      document.removeEventListener('dragstart', disableDrag);
    };
  }, []);
  return <>{children}</>;
}
