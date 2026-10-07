export async function onRequestPost({ request, env }) {
  try {
    const { action, email, passwordHash, role } = await request.json();

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
          const sessionId = crypto.randomUUID();
          return new Response(JSON.stringify({ success: true, role: results[0].role, sessionId }), { headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ success: false, message: 'Invalid credentials' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }

      if (action === 'add') {
        await env.DB.prepare('INSERT INTO users (email, hash, role) VALUES (?, ?, ?)').bind(email, passwordHash, role || 'staff').run();
        return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
      }
      
      if (action === 'update_password') {
        await env.DB.prepare('UPDATE users SET hash = ? WHERE email = ?').bind(passwordHash, email).run();
        return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
      }
    }
    
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
    }
    return new Response(JSON.stringify({ success: false, message: 'DB not connected' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
