'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  resetSignal?: number;
}

export default function TurnstileWidget({ onVerify, onExpire, onError, resetSignal }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const callbacksRef = useRef({ onVerify, onExpire, onError });
  callbacksRef.current = { onVerify, onExpire, onError };

  useEffect(() => {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';
    if (!siteKey) return;
    let cancelled = false;

    const renderWidget = () => {
      if (cancelled || !window.turnstile || !containerRef.current || widgetIdRef.current) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token: string) => callbacksRef.current.onVerify(token),
        'expired-callback': () => callbacksRef.current.onExpire?.(),
        'error-callback': () => callbacksRef.current.onError?.(),
      });
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      const existing = document.querySelector('script[data-turnstile]') as HTMLScriptElement | null;
      if (!existing) {
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
        script.async = true;
        script.defer = true;
        script.setAttribute('data-turnstile', 'true');
        script.onload = () => {
          script.setAttribute('data-loaded', 'true');
          renderWidget();
        };
        document.head.appendChild(script);
      } else if (existing.getAttribute('data-loaded') === 'true') {
        renderWidget();
      } else {
        existing.addEventListener('load', renderWidget, { once: true });
      }
    }

    return () => {
      cancelled = true;
      if (window.turnstile && widgetIdRef.current) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (resetSignal && resetSignal > 0 && window.turnstile && widgetIdRef.current) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, [resetSignal]);

  if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
    return null;
  }

  return <div ref={containerRef} className="flex justify-center" />;
}

/**
 * Verify a Turnstile token against the server-side endpoint
 * (Cloudflare Pages Function at /api/verify-turnstile).
 * Returns true only when Cloudflare confirms the token.
 */
export async function verifyTurnstileToken(token: string, action: string): Promise<boolean> {
  try {
    const res = await fetch('/api/verify-turnstile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action })
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}
