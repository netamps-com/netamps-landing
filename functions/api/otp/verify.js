import { Client } from 'pg';

export async function onRequestPost({ request, env }) {
  try {
    const { email, code } = await request.json();
    if (!email || !code) return new Response(JSON.stringify({ success: false, message: 'Email and code required' }), { status: 400 });

    if (env.DB) {
      const { results } = await env.DB.prepare('SELECT code FROM otps WHERE email = ? ORDER BY created_at DESC LIMIT 1').bind(email).all();
      if (!results || results.length === 0 || results[0].code !== code) {
        return new Response(JSON.stringify({ success: false, message: 'Invalid OTP Code.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ success: true, message: 'OTP verified successfully' }), { headers: { 'Content-Type': 'application/json' } });
    } else if (env.DATABASE_URL) {
      const client = new Client({ connectionString: env.DATABASE_URL });
      await client.connect();
      const res = await client.query('SELECT code FROM otps WHERE email = $1 ORDER BY created_at DESC LIMIT 1', [email]);
      await client.end();
      if (res.rows.length === 0 || res.rows[0].code !== code) {
        return new Response(JSON.stringify({ success: false, message: 'Invalid OTP Code.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ success: true, message: 'OTP verified successfully' }), { headers: { 'Content-Type': 'application/json' } });
    } else {
      throw new Error('Database connection completely unavailable. Cannot verify OTP. Ensure D1 or Postgres is bound in Cloudflare Pages dashboard.');
    }
  } catch (err) {
    console.error('OTP Verify Error:', err);
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
