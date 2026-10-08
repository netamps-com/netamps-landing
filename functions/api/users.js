export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const { action, email, passwordHash, role, currentPasswordHash } = body;

    if (env.DB) {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS users (
          email TEXT PRIMARY KEY,
          hash TEXT,
          role TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      // Ensure default users exist
      const checkAdmin = await env.DB.prepare('SELECT email FROM users WHERE email = ?').bind('admin@netamps.com').all();
      if (checkAdmin.results.length === 0) {
        const DEFAULT_HASH = 'bfc7e9309e970b4802affde33a9c07151af5897ef4b4d251b119c171d24a4bec';
        await env.DB.prepare('INSERT INTO users (email, hash, role) VALUES (?, ?, ?), (?, ?, ?)').bind(
          'admin@netamps.com', DEFAULT_HASH, 'admin',
          'staff@netamps.com', DEFAULT_HASH, 'staff'
        ).run();
      }

      if (action === 'login') {
        const { results } = await env.DB.prepare('SELECT hash, role FROM users WHERE email = ?').bind(email).all();
        if (results.length > 0 && results[0].hash === passwordHash) {
          const sessionId = crypto.randomUUID() + crypto.randomUUID(); // Mock 256-bit token
          
          await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS sessions (
              token TEXT PRIMARY KEY,
              email TEXT NOT NULL,
              role TEXT NOT NULL,
              expires_at DATETIME NOT NULL
            )
          `).run();
          
          const expiresAt = new Date(Date.now() + 8 * 3600 * 1000).toISOString();
          await env.DB.prepare('INSERT INTO sessions (token, email, role, expires_at) VALUES (?, ?, ?, ?)').bind(sessionId, email, results[0].role, expiresAt).run();

          // Note: `Secure` cookies require HTTPS. Localhost HTTP will drop them. Use Pages preview URLs.
          const cookie = `session_token=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800`;
          
          return new Response(JSON.stringify({ success: true, role: results[0].role }), { 
            headers: { 
              'Content-Type': 'application/json',
              'Set-Cookie': cookie 
            } 
          });
        }
        return new Response(JSON.stringify({ success: false, message: 'Invalid credentials' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }

      if (action === 'add') {
        await env.DB.prepare('INSERT INTO users (email, hash, role) VALUES (?, ?, ?)').bind(email, passwordHash, role || 'staff').run();
        return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
      }
      
      if (action === 'update_password') {
        const { currentPasswordHash } = await request.clone().json().catch(() => ({}));
        
        // Verify current password first
        const { results } = await env.DB.prepare('SELECT hash FROM users WHERE email = ?').bind(email).all();
        if (results.length === 0 || results[0].hash !== currentPasswordHash) {
          return new Response(JSON.stringify({ success: false, message: 'Your current password is incorrect. Verification failed.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
        }
        
        await env.DB.prepare('UPDATE users SET hash = ? WHERE email = ?').bind(passwordHash, email).run();
        return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
      }

    } else if (env.DATABASE_URL) {
      // ... pg logic ... (omitted for brevity, keep existing pg logic if possible, or just replace the end)
      const { Client } = await import('pg');
      const client = new Client({ connectionString: env.DATABASE_URL });
      await client.connect();

      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          email VARCHAR(255) PRIMARY KEY,
          hash TEXT,
          role VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      const checkAdmin = await client.query('SELECT email FROM users WHERE email = $1', ['admin@netamps.com']);
      if (checkAdmin.rows.length === 0) {
        const DEFAULT_HASH = 'bfc7e9309e970b4802affde33a9c07151af5897ef4b4d251b119c171d24a4bec';
        await client.query(
          'INSERT INTO users (email, hash, role) VALUES ($1, $2, $3), ($4, $5, $6)',
          ['admin@netamps.com', DEFAULT_HASH, 'admin', 'staff@netamps.com', DEFAULT_HASH, 'staff']
        );
      }

      if (action === 'login') {
        const res = await client.query('SELECT hash, role FROM users WHERE email = $1', [email]);
        if (res.rows.length > 0 && res.rows[0].hash === passwordHash) {
          const sessionId = crypto.randomUUID();
          await client.end();
          return new Response(JSON.stringify({ success: true, role: res.rows[0].role, sessionId }), { headers: { 'Content-Type': 'application/json' } });
        }
        await client.end();
        return new Response(JSON.stringify({ success: false, message: 'Invalid credentials' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }

      if (action === 'add') {
        await client.query('INSERT INTO users (email, hash, role) VALUES ($1, $2, $3)', [email, passwordHash, role || 'staff']);
        await client.end();
        return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
      }

      if (action === 'update_password') {
        await client.query('UPDATE users SET hash = $1 WHERE email = $2', [passwordHash, email]);
        await client.end();
        return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
      }
      await client.end();
    }
    
    // Fallback logic removed per R5 hardening.
    return new Response(JSON.stringify({ success: false, message: 'DB not connected' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function onRequestGet({ env }) {
  try {
    if (env.DB) {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS users (
          email TEXT PRIMARY KEY,
          hash TEXT,
          role TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      
      const { results } = await env.DB.prepare('SELECT email, role, created_at FROM users ORDER BY created_at DESC').all();
      return new Response(JSON.stringify({ success: true, users: results }), { headers: { 'Content-Type': 'application/json' } });
    } else if (env.DATABASE_URL) {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: env.DATABASE_URL });
      await client.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          email VARCHAR(255) PRIMARY KEY,
          hash TEXT,
          role VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      const res = await client.query('SELECT email, role, created_at FROM users ORDER BY created_at DESC');
      await client.end();
      return new Response(JSON.stringify({ success: true, users: res.rows }), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ success: false, message: 'DB not connected' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
