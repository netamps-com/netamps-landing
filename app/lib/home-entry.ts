// Homepage-only entry gate (UX gate, not a security boundary).
//
// /login and /returns render only when this tab session began at the homepage
// (or arrived via same-origin navigation). Direct deep links, bookmarks, and
// external links are redirected to "/" instead of rendering the form.
//
// NOT a security boundary: client-side checks are bypassable via devtools/curl,
// and every state-changing API still enforces its own auth, Turnstile, rate
// limits, and idle termination. This gate is about entry flow, not trust.
// Real transport/embedding/API protections live in middleware + Functions.

export const HOME_ENTRY_KEY = 'netamps_home_entry';

export function markHomeEntry(): void {
  try {
    sessionStorage.setItem(HOME_ENTRY_KEY, String(Date.now()));
  } catch {
    // Storage unavailable (private mode) — referrer check still applies.
  }
}

export function hasHomeEntry(): boolean {
  try {
    return sessionStorage.getItem(HOME_ENTRY_KEY) !== null;
  } catch {
    return false;
  }
}

export function hasInternalReferrer(): boolean {
  try {
    const ref = document.referrer;
    if (!ref) return false;
    return new URL(ref).origin === window.location.origin;
  } catch {
    return false;
  }
}
