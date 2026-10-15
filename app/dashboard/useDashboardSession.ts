'use client';

/**
 * Identity and session control for the navigation rail, shared by every page
 * under /dashboard.
 *
 * Previously only the order list knew who was signed in or offered a way out —
 * the three sub-pages had no sign-out at all. The rail carries both, so every
 * page under /dashboard needs them, and duplicating cookie-reading plus the
 * revocation call four times would be four places to fix when either changes.
 *
 * The email is read from the `user_role` cookie that login already sets. This
 * decides only what the rail displays: server-side authorisation is unchanged
 * and reads the HttpOnly `session_id`, so a forged readable cookie can paint a
 * name in a sidebar but authorise nothing.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export function useDashboardSession() {
  const router = useRouter();
  const [email, setEmail] = useState('');

  useEffect(() => {
    let value = '';
    document.cookie.split(';').forEach((cookie) => {
      const [name, v] = cookie.trim().split('=');
      if (name === 'user_role' && v) value = v;
    });
    setEmail(value);
  }, []);

  // Server revocation first (D1 row + HttpOnly cookie — clearing cookies alone
  // leaves the session usable until expiry), then local cleanup + redirect.
  const terminate = useCallback(async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      await fetch(`${API_URL}/api/users/logout`, { method: 'POST', credentials: 'same-origin' });
    } catch {}
    document.cookie = 'session_id=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    document.cookie = 'user_role=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    router.push('/login');
  }, [router]);

  return {
    email,
    /** Same client-side admin test the order list has always used. */
    isAdmin: email === 'admin@netamps.com',
    role: email === 'admin@netamps.com' ? 'Administrator' : 'Staff',
    terminate,
  };
}
