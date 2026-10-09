'use client';

import { useState, useEffect } from 'react';
import { Smartphone, Monitor } from 'lucide-react';

export default function DeviceSwitcher() {
  const [isForcedMobile, setIsForcedMobile] = useState(false);

  useEffect(() => {
    // This allows desktop browsers to test the mobile layout by forcing CSS constraints
    if (isForcedMobile) {
      document.body.classList.add('force-mobile-view');
    } else {
      document.body.classList.remove('force-mobile-view');
    }
  }, [isForcedMobile]);

  return (
    <div className="fixed bottom-24 right-4 z-[100] md:bottom-8 md:right-8">
      <button
        onClick={() => setIsForcedMobile(!isForcedMobile)}
        className="flex items-center justify-center w-12 h-12 bg-slate-900 text-white rounded-full shadow-2xl active:scale-95 hover:bg-slate-800 transition-all focus-visible:ring-4 focus-visible:ring-blue-500/50"
        aria-label="Toggle device view override"
        title="Toggle device view (Debug)"
      >
        {isForcedMobile ? (
          <Monitor className="w-5 h-5" />
        ) : (
          <Smartphone className="w-5 h-5" />
        )}
      </button>
      
      {/* CSS to force the tailwind breakpoints override for testing */}
      <style dangerouslySetInnerHTML={{__html: `
        body.force-mobile-view header { display: none !important; }
        body.force-mobile-view nav.md\\:hidden { display: block !important; }
        body.force-mobile-view { max-width: 430px; margin: 0 auto; border-x: 1px solid #e5e7eb; min-height: 100vh; }
      `}} />
    </div>
  );
}
