import { Client } from 'pg';

export async function onRequestPost({ request, env }) {
  try {
    const { email, code } = await request.json();
    if (!email || !code) return new Response(JSON.stringify({ success: false, message: 'Email and code required' }), { status: 400 });

    if (env.DB) {
      const res = await env.DB.prepare('SELECT code, created_at FROM otps WHERE email = ?').bind(email).all();
      if (!res.results || res.results.length === 0) {
        return new Response(JSON.stringify({ success: false, message: 'No OTP generated for this email' }), { status: 400 });
      }

      const dbCode = res.results[0].code;
      // D1 DATETIME can be parsed to Date
      const createdAt = new Date(res.results[0].created_at + 'Z').getTime(); // append Z to treat as UTC
      const now = Date.now();

      if (now - createdAt > 5 * 60 * 1000) {
        return new Response(JSON.stringify({ success: false, message: 'OTP expired' }), { status: 400 });
      }

      if (code !== dbCode) {
        return new Response(JSON.stringify({ success: false, message: 'Invalid OTP' }), { status: 400 });
      }

      return new Response(JSON.stringify({ success: true, message: 'OTP verified successfully' }), { headers: { 'Content-Type': 'application/json' } });
    } else if (env.DATABASE_URL) {
      const client = new Client({ connectionString: env.DATABASE_URL });
      await client.connect();
      
      const res = await client.query('SELECT code, created_at FROM otps WHERE email = $1', [email]);
      await client.end();

      if (res.rows.length === 0) {
        return new Response(JSON.stringify({ success: false, message: 'No OTP generated for this email' }), { status: 400 });
      }

      const dbCode = res.rows[0].code;
      const createdAt = new Date(res.rows[0].created_at).getTime();
      const now = Date.now();

      if (now - createdAt > 5 * 60 * 1000) {
        return new Response(JSON.stringify({ success: false, message: 'OTP expired' }), { status: 400 });
      }

      if (code !== dbCode) {
        return new Response(JSON.stringify({ success: false, message: 'Invalid OTP' }), { status: 400 });
      }

      return new Response(JSON.stringify({ success: true, message: 'OTP verified successfully' }), { headers: { 'Content-Type': 'application/json' } });
    } else {
      console.warn('DATABASE_URL not set, bypassing OTP check.');
      return new Response(JSON.stringify({ success: true, message: 'OTP verified (bypass)' }), { headers: { 'Content-Type': 'application/json' } });
    }
  } catch (err) {
    console.error('OTP Verify Error:', err);
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
