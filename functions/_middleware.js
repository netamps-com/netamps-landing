// functions/_middleware.js

/**
 * 1. Global TLS & Security Headers Middleware
 * Enforces Absolute TLS, URL Parameter Purges, and Strict Referrer Isolation.
 */
const enforceTLSAndHeaders = async (context) => {
  const url = new URL(context.request.url);

  // Absolute TLS Enforcement
  if (url.protocol === 'http:') {
    url.protocol = 'https:';
    return Response.redirect(url.toString(), 301);
  }

  // URL Parameter Purge: No URL may carry sensitive context tokens
  const forbiddenParams = ['sid', 'session_id', 'client_id', 'csrf', 'csrf_token'];
  for (const param of forbiddenParams) {
    if (url.searchParams.has(param)) {
      return new Response(JSON.stringify({ error: 'Security Violation: Context tokens forbidden in URL parameters' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  const response = await context.next();

  // Strict Referrer Isolation & Transport Security
  const headers = new Headers(response.headers);
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: headers,
  });
};

/**
 * 2. CSRF & State Mutation Validation Middleware
 * Validates Request Intent (CSRF) vs Authentication Context (Session)
 */
const validateStateMutations = async (context) => {
  const { request } = context;
  const method = request.method.toUpperCase();

  // Safe HTTP methods are read-only and bypass CSRF checks
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return context.next();
  }

  const url = new URL(request.url);
  // Apply intent validation strictly to API mutations
  if (!url.pathname.startsWith('/api/')) {
    return context.next();
  }

  // Allow the login endpoint to establish the initial contexts
  if (url.pathname === '/api/users' && method === 'POST') {
    return context.next();
  }

  const cookies = request.headers.get('Cookie') || '';
  const sessionToken = getCookie(cookies, 'session_token');
  const csrfCookie = getCookie(cookies, 'csrf_token');
  const csrfHeader = request.headers.get('X-CSRF-Token');

  // If a session exists, enforce cryptographic intent validation (Double-Submit)
  if (sessionToken) {
    if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
      console.warn(`[SECURITY ALERT] Intent context mismatch for session. Terminating request.`);
      return new Response(JSON.stringify({ 
        error: 'Security Violation: Intent context (CSRF) verification failed.' 
      }), { 
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  return context.next();
};

function getCookie(cookieString, name) {
  const match = cookieString.match(new RegExp('(^| )' + name + '=([^;]+)'));
  if (match) return match[2];
  return null;
}

export const onRequest = [enforceTLSAndHeaders, validateStateMutations];
