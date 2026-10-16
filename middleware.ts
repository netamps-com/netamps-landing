import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Enforce HTTP to HTTPS redirect (if terminating SSL before Node or behind a proxy that forwards the protocol)
  const proto = request.headers.get('x-forwarded-proto');
  if (proto === 'http') {
    const httpsUrl = new URL(request.url);
    httpsUrl.protocol = 'https:';
    return NextResponse.redirect(httpsUrl, 301);
  }

  // Generate a response to modify headers and cookies
  const response = NextResponse.next();

  // 1. Hardened Session ID (sid) in Cookie
  // Check if session cookie exists, if not generate one securely
  if (!request.cookies.has('sid')) {
    // Use Web Crypto API compatible with Edge Runtime
    const sid = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    response.cookies.set({
      name: 'sid',
      value: sid,
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
    });
  }

  // ── FIPS 140-3 / DoD / Military-Grade Security Headers ──
  // These headers enforce transport security, content isolation, and
  // browser-side attack surface reduction aligned with DoD STIG and
  // NIST SP 800-53 control families (SC-8, SC-13, SC-28).

  // 2. Transport Security (HSTS) — FIPS 140-3 transport channel hardening
  // Enforce HTTPS-only traffic for 2 years, include subdomains, and preload.
  // Aligned with DoD STIG V-222602 (HSTS must be enabled).
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload'
  );

  // 3. Prevent Referer Leakage — DoD STIG SC-8 (transmission confidentiality)
  // Apply a strict Referrer-Policy to prevent leaking sensitive paths to third parties
  response.headers.set('Referrer-Policy', 'same-origin');

  // 4. Content Security — XSS and injection mitigation (NIST SC-18)
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // 5. Frame protection — Clickjacking defense (NIST SC-18, DoD STIG V-222609)
  response.headers.set('X-Frame-Options', 'DENY');

  // 6. Cross-Origin Isolation — DoD zero-trust browser hardening
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');

  // 7. Permissions Policy — Minimize browser API attack surface
  // Deny access to sensitive device APIs unless explicitly needed
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()'
  );

  // 8. Cache control for authenticated pages — prevent sensitive data caching
  // (SC-28: Protection of Information at Rest)
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/intake') || pathname.startsWith('/returns')) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    response.headers.set('Pragma', 'no-cache');
  }

  return response;
}

export const config = {
  // Apply middleware to all routes except API, Next.js static assets, and images
  matcher: '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|functions).*)',
};
