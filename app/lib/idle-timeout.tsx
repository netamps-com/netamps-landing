'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Mandatory uniform idle termination for every authenticated session.
 *
 * MANDATE (no exemptions, irrespective of role or policy): these constants
 * are intentionally module-private, NOT props — no caller may disable,
 * lengthen, shorten, or scope them. The server enforces the identical
 * boundary in verifySession (keep in sync):
 *   functions/api/intake/auth.js → IDLE_LIMIT_MS
 *   functions/api/users/touch.js → TOUCH_THROTTLE_MS
 * The client timer is UX (warning + orderly logout); the server gate is the
 * mandate (closed tabs, paused timers, and multi-tab drift still die there).
 *
 * Behavior: 30 min without pointer/key/scroll/touch activity → warning modal
 * with live mm:ss countdown for the final 2 min → at 0:00 full server logout
 * (D1 row + all cookies via /api/users/logout), SESSION_IDLE_TIMEOUT audit,
 * redirect to /login?expired=1. "Stay signed in" resets idle only — absolute
 * session TTL is never extended, for anyone. Hidden tabs accrue idle.
 */

const IDLE_LIMIT_MS = 30 * 60 * 1000;
const WARN_BEFORE_MS = 2 * 60 * 1000;
const TOUCH_EVERY_MS = 5 * 60 * 1000;

function apiUrl() {
  try {
    return process.env.NEXT_PUBLIC_API_URL || '';
  } catch {
    return '';
  }
}

async function serverTerminate() {
  try {
    await fetch(`${apiUrl()}/api/users/logout`, { method: 'POST', credentials: 'same-origin' });
  } catch {}
  try {
    document.cookie = 'session_id=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    document.cookie = 'user_role=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
  } catch {}
  try {
    const { logEvent } = await import('./logger');
    logEvent('SESSION_IDLE_TIMEOUT', 'Session Watchdog', 'Session terminated after 30 minutes idle', 'system');
  } catch {}
  window.location.href = '/login?expired=1';
}

async function serverTouch() {
  try {
    await fetch(`${apiUrl()}/api/users/touch`, { method: 'POST', credentials: 'same-origin' });
  } catch {}
}

function auditExtended() {
  import('./logger').then(({ logEvent }) => {
    try {
      logEvent('SESSION_EXTENDED', 'Session Watchdog', 'User extended session from idle warning', 'system');
    } catch {}
  }).catch(() => {});
}

export function useIdleTimeout() {
  const [warning, setWarning] = useState(false);
  const [remainingMs, setRemainingMs] = useState(IDLE_LIMIT_MS);
  const lastActivity = useRef(Date.now());
  const lastTouch = useRef(0);
  const terminated = useRef(false);

  const terminateNow = useCallback(async () => {
    if (terminated.current) return;
    terminated.current = true;
    await serverTerminate();
  }, []);

  const stay = useCallback(() => {
    if (terminated.current) return;
    lastActivity.current = Date.now();
    lastTouch.current = Date.now();
    setWarning(false);
    setRemainingMs(IDLE_LIMIT_MS);
    void serverTouch();
    auditExtended();
  }, []);

  useEffect(() => {
    const markActive = () => {
      if (terminated.current) return;
      lastActivity.current = Date.now();
      setWarning(false);
      if (Date.now() - lastTouch.current > TOUCH_EVERY_MS) {
        lastTouch.current = Date.now();
        void serverTouch();
      }
    };
    window.addEventListener('pointerdown', markActive);
    window.addEventListener('keydown', markActive);
    window.addEventListener('touchstart', markActive);
    window.addEventListener('scroll', markActive, { passive: true });
    const onVisibility = () => {
      if (!document.hidden) markActive();
    };
    document.addEventListener('visibilitychange', onVisibility);
    const tick = setInterval(() => {
      const remaining = IDLE_LIMIT_MS - (Date.now() - lastActivity.current);
      if (remaining <= 0) {
        void terminateNow();
        return;
      }
      setRemainingMs(remaining);
      setWarning(remaining <= WARN_BEFORE_MS);
    }, 1000);
    return () => {
      clearInterval(tick);
      window.removeEventListener('pointerdown', markActive);
      window.removeEventListener('keydown', markActive);
      window.removeEventListener('touchstart', markActive);
      window.removeEventListener('scroll', markActive);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [terminateNow]);

  return { warning, remainingMs, stay, terminateNow };
}

export function IdleTimeoutModal({
  remainingMs,
  onStay,
  onTerminate
}: {
  remainingMs: number;
  onStay: () => void;
  onTerminate: () => void;
}) {
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const mm = String(Math.floor(totalSec / 60)).padStart(1, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  const urgent = totalSec <= 30;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-label="Session expiring">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="p-6">
          <h3 className="text-lg font-bold text-slate-900">Session expiring</h3>
          <p className="text-sm text-slate-500 mt-1">
            No activity for nearly 30 minutes. For your security you will be signed out automatically in:
          </p>
          <p className={`mt-3 text-4xl font-mono font-black text-center ${urgent ? 'text-red-600' : 'text-amber-600'}`} aria-live="polite">
            {mm}:{ss}
          </p>
          <div className="mt-5 flex gap-3">
            <button
              onClick={onStay}
              autoFocus
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold transition-colors"
            >
              Stay signed in
            </button>
            <button
              onClick={onTerminate}
              className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold transition-colors"
            >
              Sign out now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
