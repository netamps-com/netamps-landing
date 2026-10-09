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
    const sid = crypto.randomUUID();
    response.cookies.set({
      name: 'sid',
      value: sid,
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
    });
  }

  // 2. Transport Security (HSTS)
  // Enforce HTTPS-only traffic for 1 year (31536000 seconds), include subdomains, and preload
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload'
  );

  // 3. Prevent Referer Leakage
  // Apply a strict Referrer-Policy to prevent leaking sensitive paths to third parties
  response.headers.set('Referrer-Policy', 'same-origin');

  return response;
}

export const config = {
  // Apply middleware to all routes except API, Next.js static assets, and images
  matcher: '/((?!api|_next/static|_next/image|favicon.ico|robots.txt).*)',
};
