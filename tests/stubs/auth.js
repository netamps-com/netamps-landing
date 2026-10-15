/**
 * Test double for `functions/api/intake/auth.js`.
 *
 * The stats route is gated by `verifySession`, and a live session needs a real
 * KV binding and a signed cookie. The aggregation maths has nothing to do with
 * authentication, so tests substitute this instead of standing up a session —
 * which keeps them honest about what they are actually testing.
 *
 * `MODE` decides the answer:
 *   'valid'        → a staff session (the normal case under test)
 *   'unauthorized' → null, to assert the route fails closed
 */
export const MODE = process.env.NETAMPS_TEST_AUTH || 'valid';

export async function verifySession(env, request) {
  if (MODE === 'unauthorized') return null;
  // Also honour an explicit header, so a single test can cover both paths.
  if (request.headers.get('x-test-anon') === '1') return null;
  return { email: 'test@netamps.com', role: 'admin' };
}