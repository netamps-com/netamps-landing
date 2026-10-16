/**
 * Session management for cookie-based auth on /track page.
 * Uses the httpOnly netamps_session cookie set during /api/track/verify-otp.
 * Provides: checkSession(), logoutUser().
 *
 * NOTE: logoutUser() does NOT call useRouter() — it returns a Promise that
 * resolves when the server-side logout is complete. The caller (React component)
 * should handle the redirect to /login.
 */

export async function checkSession(): Promise<{ valid: boolean; reason?: string }> {
  // On the client, we can read the cookie via JavaScript, but for the initial
  // session validation we make a lightweight fetch that validates the cookie.
  // The fetch with credentials: 'include' will send the httpOnly cookie automatically.
  return new Promise(async resolve => {
    try {
      // Use the milestone endpoint since it's lightweight and validates the session
      const res = await fetch('/api/track/dashboard/milestones', {
        method: 'GET',
        credentials: 'include'
      });
      const data = await res.json();

      if (data.enabled === false) {
        resolve({ valid: false, reason: 'session_disabled' });
        return;
      }

      // Session is valid and milestone feature is enabled
      resolve({ valid: true });
    } catch (err) {
      console.error('[track] session check error:', err);
      resolve({ valid: false, reason: 'session_check_failed' });
    }
  });
}

export async function logoutUser(): Promise<void> {
  // Call the server-side logout endpoint which clears the httpOnly cookie
  // and deletes the session from D1.
  // The caller should handle the redirect to /login after this resolves.
  await fetch('/api/track/logout', {
    method: 'POST',
    credentials: 'include'
  });
}