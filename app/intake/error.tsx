'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';

export default function IntakeErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Intake Workbench Error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#020817] flex items-center justify-center p-4 font-sans text-white">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl text-center animate-in fade-in zoom-in duration-300">
        <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>
        
        <h2 className="text-xl font-bold text-white mb-2">Workbench Application Error</h2>
        <p className="text-slate-400 text-sm mb-6">
          A client-side exception has occurred in the Intake module. Our systems have logged the failure.
        </p>

        <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-left overflow-auto mb-8 max-h-32">
          <p className="text-xs font-mono text-red-400 break-words">
            {error.message || 'Unknown runtime exception'}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => reset()}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
          >
            <RefreshCw className="w-4 h-4" /> Try Again
          </button>
          
          <Link
            href="/dashboard"
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
