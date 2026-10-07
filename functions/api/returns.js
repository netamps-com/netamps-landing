export async function onRequestPost({ request, env }) {
  try {
    const returnReq = await request.json();

    if (env.DB) {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS returns (
          id TEXT PRIMARY KEY,
          intent TEXT,
          name TEXT,
          company TEXT,
          email TEXT,
          phone TEXT,
          products TEXT,
          attachedFiles TEXT,
          emailDeliveryStatus TEXT,
          date TEXT,
          status TEXT
        )
      `).run();
      
      await env.DB.prepare(
        'INSERT INTO returns (id, intent, name, company, email, phone, products, attachedFiles, emailDeliveryStatus, date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        returnReq.id, 
        returnReq.intent, 
        returnReq.name, 
        returnReq.company, 
        returnReq.email, 
        returnReq.phone, 
        JSON.stringify(returnReq.products || []), 
        JSON.stringify(returnReq.attachedFiles || []), 
        returnReq.emailDeliveryStatus || '', 
        returnReq.date, 
        returnReq.status
      ).run();
    } else if (env.DATABASE_URL) {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: env.DATABASE_URL });
      await client.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS returns (
          id VARCHAR(255) PRIMARY KEY,
          intent VARCHAR(50),
          name VARCHAR(255),
          company VARCHAR(255),
          email VARCHAR(255),
          phone VARCHAR(50),
          products TEXT,
          attachedFiles TEXT,
          emailDeliveryStatus VARCHAR(50),
          date VARCHAR(100),
          status VARCHAR(50)
        )
      `);
      await client.query(
        'INSERT INTO returns (id, intent, name, company, email, phone, products, attachedFiles, emailDeliveryStatus, date, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
        [
          returnReq.id, returnReq.intent, returnReq.name, returnReq.company, returnReq.email, returnReq.phone,
          JSON.stringify(returnReq.products || []), JSON.stringify(returnReq.attachedFiles || []),
          returnReq.emailDeliveryStatus || '', returnReq.date, returnReq.status
        ]
      );
      await client.end();
    }

    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function onRequestGet({ env }) {
  try {
    if (env.DB) {
      // create table if not exists just in case it's empty
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS returns (
          id TEXT PRIMARY KEY,
          intent TEXT,
          name TEXT,
          company TEXT,
          email TEXT,
          phone TEXT,
          products TEXT,
          attachedFiles TEXT,
          emailDeliveryStatus TEXT,
          date TEXT,
          status TEXT
        )
      `).run();

      const { results } = await env.DB.prepare('SELECT * FROM returns ORDER BY date DESC').all();
      
      const returns = results.map(row => ({
        id: row.id,
        intent: row.intent,
        name: row.name,
        company: row.company,
        email: row.email,
        phone: row.phone,
        products: JSON.parse(row.products || '[]'),
        attachedFiles: JSON.parse(row.attachedFiles || '[]'),
        emailDeliveryStatus: row.emailDeliveryStatus || undefined,
        date: row.date,
        status: row.status
      }));
      return new Response(JSON.stringify({ success: true, returns }), { headers: { 'Content-Type': 'application/json' } });
    } else if (env.DATABASE_URL) {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: env.DATABASE_URL });
      await client.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS returns (
          id VARCHAR(255) PRIMARY KEY,
          intent VARCHAR(50),
          name VARCHAR(255),
          company VARCHAR(255),
          email VARCHAR(255),
          phone VARCHAR(50),
          products TEXT,
          attachedFiles TEXT,
          emailDeliveryStatus VARCHAR(50),
          date VARCHAR(100),
          status VARCHAR(50)
        )
      `);
      const { rows } = await client.query('SELECT * FROM returns ORDER BY date DESC');
      await client.end();
      const returns = rows.map(row => ({
        id: row.id,
        intent: row.intent,
        name: row.name,
        company: row.company,
        email: row.email,
        phone: row.phone,
        products: JSON.parse(row.products || '[]'),
        attachedFiles: JSON.parse(row.attachedFiles || '[]'),
        emailDeliveryStatus: row.emaildeliverystatus || row.emailDeliveryStatus || undefined,
        date: row.date,
        status: row.status
      }));
      return new Response(JSON.stringify({ success: true, returns }), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ success: true, returns: [] }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function onRequestPut({ request, env }) {
  try {
    const update = await request.json();
    if (!update.id) throw new Error('ID required');

    if (env.DB) {
      if (update.action === 'status') {
        await env.DB.prepare('UPDATE returns SET status = ? WHERE id = ?').bind(update.status, update.id).run();
      } else if (update.action === 'emailDelivery') {
        await env.DB.prepare('UPDATE returns SET emailDeliveryStatus = ? WHERE id = ?').bind(update.emailDeliveryStatus, update.id).run();
      } else if (update.action === 'price') {
        // fetching existing products to update price
        const { results } = await env.DB.prepare('SELECT products FROM returns WHERE id = ?').bind(update.id).all();
        if (results.length > 0) {
          const products = JSON.parse(results[0].products || '[]');
          const updatedProducts = products.map(p => p.id === update.productId ? { ...p, price: update.price } : p);
          await env.DB.prepare('UPDATE returns SET products = ? WHERE id = ?').bind(JSON.stringify(updatedProducts), update.id).run();
        }
      }
    } else if (env.DATABASE_URL) {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: env.DATABASE_URL });
      await client.connect();
      if (update.action === 'status') {
        await client.query('UPDATE returns SET status = $1 WHERE id = $2', [update.status, update.id]);
      } else if (update.action === 'emailDelivery') {
        await client.query('UPDATE returns SET emailDeliveryStatus = $1 WHERE id = $2', [update.emailDeliveryStatus, update.id]);
      } else if (update.action === 'price') {
        const { rows } = await client.query('SELECT products FROM returns WHERE id = $1', [update.id]);
        if (rows.length > 0) {
          const products = JSON.parse(rows[0].products || '[]');
          const updatedProducts = products.map(p => p.id === update.productId ? { ...p, price: update.price } : p);
          await client.query('UPDATE returns SET products = $1 WHERE id = $2', [JSON.stringify(updatedProducts), update.id]);
        }
      }
      await client.end();
    }
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) throw new Error('ID required');

    if (env.DB) {
      await env.DB.prepare('DELETE FROM returns WHERE id = ?').bind(id).run();
    } else if (env.DATABASE_URL) {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: env.DATABASE_URL });
      await client.connect();
      await client.query('DELETE FROM returns WHERE id = $1', [id]);
      await client.end();
    }
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
