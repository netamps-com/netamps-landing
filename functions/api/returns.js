export async function onRequestPost({ request, env }) {
  try {
    const returnReq = await request.json();

    // Money contract: evaluated prices are paise integers (pricePaise).
    // Legacy records carry rupee floats in `price` — converted once here,
    // never mixed with paise values in the same sum.
    const evalPaiseOf = (p) => {
      if (p && Number.isInteger(p.pricePaise) && p.pricePaise >= 0) return p.pricePaise;
      const legacy = Number(p && p.price);
      if (!Number.isFinite(legacy) || legacy < 0) return 0;
      return Math.round(legacy * 100);
    };
    const pricingBasis = returnReq.pricingBasis === 'lot' ? 'lot' : 'per_product';
    const lotPaise = Number.isInteger(returnReq.lotConsiderationPaise) && returnReq.lotConsiderationPaise >= 0
      ? returnReq.lotConsiderationPaise : null;

    let totalAmount = 0;
    (returnReq.products || []).forEach(p => {
       totalAmount += evalPaiseOf(p) * (Number(p.quantity) || 1);
    });

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
          status TEXT,
          totalAmount REAL,
          manifest TEXT,
          pricingBasis TEXT,
          lotConsiderationPaise INTEGER
        )
      `).run();
      
      try { await env.DB.prepare('ALTER TABLE returns ADD COLUMN totalAmount REAL').run(); } catch(e){}
      try { await env.DB.prepare('ALTER TABLE returns ADD COLUMN manifest TEXT').run(); } catch(e){}
      try { await env.DB.prepare('ALTER TABLE returns ADD COLUMN pricingBasis TEXT').run(); } catch(e){}
      try { await env.DB.prepare('ALTER TABLE returns ADD COLUMN lotConsiderationPaise INTEGER').run(); } catch(e){}

      await env.DB.prepare(
        'INSERT INTO returns (id, intent, name, company, email, phone, products, attachedFiles, emailDeliveryStatus, date, status, totalAmount, manifest, pricingBasis, lotConsiderationPaise) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
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
        returnReq.status,
        totalAmount,
        returnReq.manifest ? JSON.stringify(returnReq.manifest) : null,
        pricingBasis,
        lotPaise
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
          status VARCHAR(50),
          totalamount NUMERIC,
          manifest TEXT,
          pricingbasis TEXT,
          lotconsiderationpaise NUMERIC
        )
      `);
      try { await client.query('ALTER TABLE returns ADD COLUMN totalamount NUMERIC'); } catch(e){}
      try { await client.query('ALTER TABLE returns ADD COLUMN manifest TEXT'); } catch(e){}
      try { await client.query('ALTER TABLE returns ADD COLUMN pricingbasis TEXT'); } catch(e){}
      try { await client.query('ALTER TABLE returns ADD COLUMN lotconsiderationpaise NUMERIC'); } catch(e){}

      const pgPricingBasis = returnReq.pricingBasis === 'lot' ? 'lot' : 'per_product';
      const pgLotPaise = Number.isInteger(returnReq.lotConsiderationPaise) && returnReq.lotConsiderationPaise >= 0
        ? returnReq.lotConsiderationPaise : null;
      await client.query(
        'INSERT INTO returns (id, intent, name, company, email, phone, products, attachedFiles, emailDeliveryStatus, date, status, totalamount, manifest, pricingbasis, lotconsiderationpaise) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)',
        [
          returnReq.id, returnReq.intent, returnReq.name, returnReq.company, returnReq.email, returnReq.phone,
          JSON.stringify(returnReq.products || []), JSON.stringify(returnReq.attachedFiles || []),
          returnReq.emailDeliveryStatus || '', returnReq.date, returnReq.status, totalAmount,
          returnReq.manifest ? JSON.stringify(returnReq.manifest) : null, pgPricingBasis, pgLotPaise
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
      
      const parseManifest = (raw) => {
        if (!raw) return null;
        try { return JSON.parse(raw); } catch { return null; }
      };
      const parseFinalPrice = (raw) => {
        if (!raw) return null;
        try {
          const fp = JSON.parse(raw);
          if (fp && Number.isInteger(fp.version) && Number.isInteger(fp.totalPaise)) return fp;
          return null;
        } catch { return null; }
      };
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
        status: row.status,
        totalAmount: Number(row.totalAmount || row.totalamount || 0),
        pricingBasis: row.pricingBasis === 'lot' ? 'lot' : 'per_product',
        lotConsiderationPaise: Number.isInteger(row.lotConsiderationPaise) ? row.lotConsiderationPaise : null,
        manifest: parseManifest(row.manifest),
        finalPrice: parseFinalPrice(row.finalPrice)
      }));
      return new Response(JSON.stringify({ success: true, returns }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } });
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
      const parseManifestPg = (raw) => {
        if (!raw) return null;
        try { return JSON.parse(raw); } catch { return null; }
      };
      const parseFinalPricePg = (raw) => {
        if (!raw) return null;
        try {
          const fp = JSON.parse(raw);
          if (fp && Number.isInteger(fp.version) && Number.isInteger(fp.totalPaise)) return fp;
          return null;
        } catch { return null; }
      };
      const returns = rows.map(row => ({
        id: row.id,
        intent: row.intent,
        name: row.name,
        company: row.company,
        email: row.email,
        phone: row.phone,
        products: JSON.parse(row.products || '[]'),
        attachedFiles: JSON.parse(row.attachedfiles || row.attachedFiles || '[]'),
        emailDeliveryStatus: row.emaildeliverystatus || row.emailDeliveryStatus || undefined,
        date: row.date,
        status: row.status,
        totalAmount: Number(row.totalAmount || row.totalamount || 0),
        pricingBasis: row.pricingbasis === 'lot' ? 'lot' : 'per_product',
        lotConsiderationPaise: (row.lotconsiderationpaise === null || row.lotconsiderationpaise === undefined)
          ? null
          : (Number.isInteger(Number(row.lotconsiderationpaise)) ? Number(row.lotconsiderationpaise) : null),
        manifest: parseManifestPg(row.manifest),
        finalPrice: parseFinalPricePg(row.finalprice)
      }));
      return new Response(JSON.stringify({ success: true, returns }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } });
    }
    return new Response(JSON.stringify({ success: true, returns: [] }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function onRequestPut({ request, env }) {
  try {
    const update = await request.json();
    if (!update.id) throw new Error('ID required');

    // FinalPriceSnapshot validation: malformed snapshots are rejected, never
    // partially stored. Status and snapshot write atomically in one UPDATE.
    const validFinalPrice = (fp) => {
      if (fp === null || fp === undefined) return null;
      if (!fp || typeof fp !== 'object') throw new Error('Invalid finalPrice snapshot');
      if (!Number.isInteger(fp.version) || fp.version < 1) throw new Error('Invalid finalPrice snapshot');
      if (!Number.isInteger(fp.totalPaise) || fp.totalPaise < 0) throw new Error('Invalid finalPrice snapshot');
      if (!['evaluated', 'consideration', 'negotiated'].includes(fp.basis)) throw new Error('Invalid finalPrice snapshot');
      if (typeof fp.decidedAt !== 'string' || typeof fp.decidedBy !== 'string') throw new Error('Invalid finalPrice snapshot');
      if (!Array.isArray(fp.lines)) throw new Error('Invalid finalPrice snapshot');
      for (const l of fp.lines) {
        if (!l || typeof l.productId !== 'string') throw new Error('Invalid finalPrice snapshot');
        for (const k of ['askPaise', 'evaluatedPaise', 'settledPaise']) {
          if (l[k] !== null && !(Number.isInteger(l[k]) && l[k] >= 0)) throw new Error('Invalid finalPrice snapshot');
        }
      }
      if (fp.manifestHashAtApproval !== null && fp.manifestHashAtApproval !== undefined && typeof fp.manifestHashAtApproval !== 'string') {
        throw new Error('Invalid finalPrice snapshot');
      }
      return {
        version: fp.version,
        decidedAt: fp.decidedAt,
        decidedBy: fp.decidedBy,
        basis: fp.basis,
        totalPaise: fp.totalPaise,
        lines: fp.lines,
        manifestHashAtApproval: fp.manifestHashAtApproval ?? null
      };
    };

    if (env.DB) {
      try { await env.DB.prepare('ALTER TABLE returns ADD COLUMN finalPrice TEXT').run(); } catch(e){}
      if (update.action === 'status') {
        if (update.finalPrice !== undefined) {
          const fp = validFinalPrice(update.finalPrice);
          await env.DB.prepare('UPDATE returns SET status = ?, finalPrice = ? WHERE id = ?').bind(update.status, fp ? JSON.stringify(fp) : null, update.id).run();
        } else {
          await env.DB.prepare('UPDATE returns SET status = ? WHERE id = ?').bind(update.status, update.id).run();
        }
      } else if (update.action === 'emailDelivery') {
        await env.DB.prepare('UPDATE returns SET emailDeliveryStatus = ? WHERE id = ?').bind(update.emailDeliveryStatus, update.id).run();
      } else if (update.action === 'price') {
        // fetching existing products to update price (paise-integer contract;
        // legacy rupee-float `price` preserved untouched for old readers)
        const { results } = await env.DB.prepare('SELECT products FROM returns WHERE id = ?').bind(update.id).all();
        if (results.length > 0) {
          const products = JSON.parse(results[0].products || '[]');
          const updatedProducts = products.map(p => {
            if (p.id !== update.productId) return p;
            const next = { ...p };
            if (update.pricePaise === null || update.pricePaise === undefined) {
              delete next.pricePaise;
            } else if (Number.isInteger(update.pricePaise) && update.pricePaise >= 0) {
              next.pricePaise = update.pricePaise;
            }
            return next;
          });
          const evalPaiseOf = (p) => {
            if (Number.isInteger(p.pricePaise) && p.pricePaise >= 0) return p.pricePaise;
            const legacy = Number(p.price);
            if (!Number.isFinite(legacy) || legacy < 0) return 0;
            return Math.round(legacy * 100);
          };
          let totalAmount = 0;
          updatedProducts.forEach(p => { totalAmount += evalPaiseOf(p) * (Number(p.quantity) || 1); });
          try { await env.DB.prepare('ALTER TABLE returns ADD COLUMN totalAmount REAL').run(); } catch(e){}
          await env.DB.prepare('UPDATE returns SET products = ?, totalAmount = ? WHERE id = ?').bind(JSON.stringify(updatedProducts), totalAmount, update.id).run();
        }
      }
    } else if (env.DATABASE_URL) {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: env.DATABASE_URL });
      await client.connect();
      try { await client.query('ALTER TABLE returns ADD COLUMN finalprice TEXT'); } catch(e){}
      if (update.action === 'status') {
        if (update.finalPrice !== undefined) {
          const fp = validFinalPrice(update.finalPrice);
          await client.query('UPDATE returns SET status = $1, finalprice = $2 WHERE id = $3', [update.status, fp ? JSON.stringify(fp) : null, update.id]);
        } else {
          await client.query('UPDATE returns SET status = $1 WHERE id = $2', [update.status, update.id]);
        }
      } else if (update.action === 'emailDelivery') {
        await client.query('UPDATE returns SET emailDeliveryStatus = $1 WHERE id = $2', [update.emailDeliveryStatus, update.id]);
      } else if (update.action === 'price') {
        const { rows } = await client.query('SELECT products FROM returns WHERE id = $1', [update.id]);
        if (rows.length > 0) {
          const products = JSON.parse(rows[0].products || '[]');
          const updatedProducts = products.map(p => {
            if (p.id !== update.productId) return p;
            const next = { ...p };
            if (update.pricePaise === null || update.pricePaise === undefined) {
              delete next.pricePaise;
            } else if (Number.isInteger(update.pricePaise) && update.pricePaise >= 0) {
              next.pricePaise = update.pricePaise;
            }
            return next;
          });
          const evalPaiseOfPg = (p) => {
            if (Number.isInteger(p.pricePaise) && p.pricePaise >= 0) return p.pricePaise;
            const legacy = Number(p.price);
            if (!Number.isFinite(legacy) || legacy < 0) return 0;
            return Math.round(legacy * 100);
          };
          let totalAmount = 0;
          updatedProducts.forEach(p => { totalAmount += evalPaiseOfPg(p) * (Number(p.quantity) || 1); });
          try { await client.query('ALTER TABLE returns ADD COLUMN totalamount NUMERIC'); } catch(e){}
          await client.query('UPDATE returns SET products = $1, totalamount = $2 WHERE id = $3', [JSON.stringify(updatedProducts), totalAmount, update.id]);
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
