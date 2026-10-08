/**
 * Session verification for Cloudflare Workers
 * Verifies user session from cookie or Authorization header
 */

const COOKIE_NAME = 'netamps_session';

export async function verifySession(env, request) {
  try {
    // Try to get session from cookie
    const cookieHeader = request.headers.get('Cookie') || '';
    const sessionCookie = cookieHeader
      .split(';')
      .map(c => c.trim())
      .find(c => c.startsWith(`${COOKIE_NAME}=`));
    
    let sessionToken = null;
    
    if (sessionCookie) {
      sessionToken = sessionCookie.split('=')[1];
    } else {
      // Try Authorization header
      const authHeader = request.headers.get('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        sessionToken = authHeader.slice(7);
      }
    }
    
    if (!sessionToken) {
      return null;
    }
    
    // Verify session with Firebase Auth or custom token validation
    // For now, return a mock user object - replace with actual validation
    // In production, validate the token with Firebase Admin SDK or your auth provider
    if (env.FIREBASE_API_KEY && env.FIREBASE_AUTH_DOMAIN) {
      // Firebase token verification would go here
      // const decoded = await admin.auth().verifyIdToken(sessionToken);
      // return { email: decoded.email, uid: decoded.uid };
    }
    
    // Fallback: decode JWT manually (not secure for production without validation)
    try {
      const payload = JSON.parse(atob(sessionToken.split('.')[1]));
      if (payload.exp && payload.exp * 1000 > Date.now()) {
        return { email: payload.email, uid: payload.uid };
      }
    } catch {}
    
    return null;
  } catch (error) {
    console.error('[verifySession] Error:', error);
    return null;
  }
}

export function createSessionCookie(token, options = {}) {
  const defaults = {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 14, // 14 days
    path: '/'
  };
  
  const cookieOptions = { ...defaults, ...options };
  const parts = [`${COOKIE_NAME}=${token}`];
  
  Object.entries(cookieOptions).forEach(([key, value]) => {
    if (value !== undefined) {
      parts.push(`${key}=${value}`);
    }
  });
  
  return parts.join('; ');
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/`;
}