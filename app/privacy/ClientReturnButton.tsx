"use client";

import React from 'react';

export default function ClientReturnButton() {
  return (
    <button 
      onClick={() => window.location.href = '/'} 
      className="inline-flex items-center gap-2 text-primary font-bold hover:text-indigo-700 transition-colors bg-indigo-50 px-6 py-3 rounded-full"
    >
      &larr; Return to Homepage
    </button>
  );
}
