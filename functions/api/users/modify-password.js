export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const { email, passwordHash, currentPasswordHash } = body;

    if (env.DB) {
      // Verify current password first
      const { results } = await env.DB.prepare('SELECT hash FROM users WHERE email = ?').bind(email).all();
      if (results.length === 0 || results[0].hash !== currentPasswordHash) {
        return new Response(JSON.stringify({ success: false, message: 'Your current password is incorrect. Verification failed.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
      }
      
      await env.DB.prepare('UPDATE users SET hash = ? WHERE email = ?').bind(passwordHash, email).run();
      return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
    } else if (env.DATABASE_URL) {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: env.DATABASE_URL });
      await client.connect();
      
      // Verify current password first (pg)
      const res = await client.query('SELECT hash FROM users WHERE email = $1', [email]);
      if (res.rows.length === 0 || res.rows[0].hash !== currentPasswordHash) {
        await client.end();
        return new Response(JSON.stringify({ success: false, message: 'Your current password is incorrect. Verification failed.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
      }

      await client.query('UPDATE users SET hash = $1 WHERE email = $2', [passwordHash, email]);
      await client.end();
      return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
    }
    
    return new Response(JSON.stringify({ success: false, message: 'DB not connected' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
