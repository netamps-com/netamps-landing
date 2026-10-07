'use client';

import { Turnstile } from '@marsidev/react-turnstile';

interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  resetSignal?: number;
}

export default function TurnstileWidget({ onVerify, onExpire, onError, resetSignal }: TurnstileWidgetProps) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  if (!siteKey) {
    return null;
  }

  // To re-render Turnstile upon resetSignal change, we can append it to a key
  return (
    <div className="flex justify-center" key={resetSignal}>
      <Turnstile
        siteKey={siteKey}
        onSuccess={onVerify}
        onExpire={onExpire}
        onError={onError}
        options={{
          action: 'submit',
          theme: 'light',
        }}
      />
    </div>
  );
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
