import { Client } from 'pg';
import { AwsClient } from 'aws4fetch';

export async function onRequestPost({ request, env }) {
  try {
    const log = await request.json();

    // Store in Cloudflare D1
    if (env.DB) {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id TEXT PRIMARY KEY,
          timestamp TEXT,
          event_type TEXT,
          page TEXT,
          details TEXT,
          username TEXT,
          ip_address TEXT
        )
      `).run();
      
      await env.DB.prepare(
        'INSERT INTO audit_logs (id, timestamp, event_type, page, details, username, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(log.id, log.timestamp, log.eventType, log.page, log.details, log.user, log.ipAddress).run();
    } else if (env.DATABASE_URL) {
      const client = new Client({ connectionString: env.DATABASE_URL });
      await client.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id VARCHAR(255) PRIMARY KEY,
          timestamp TIMESTAMP,
          event_type VARCHAR(255),
          page VARCHAR(255),
          details TEXT,
          username VARCHAR(255),
          ip_address VARCHAR(255)
        )
      `);
      await client.query(
        'INSERT INTO audit_logs (id, timestamp, event_type, page, details, username, ip_address) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [log.id, log.timestamp, log.eventType, log.page, log.details, log.user, log.ipAddress]
      );
      await client.end();
    }

    // Try Cloudflare R2 Binding first
    if (env.LOGS_BUCKET) {
      await env.LOGS_BUCKET.put(`logs/${log.id}.json`, JSON.stringify(log));
    } else if (env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY) {
      const aws = new AwsClient({
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        service: 's3',
        region: 'auto',
      });
      const bucketName = env.R2_BUCKET_NAME || 'netamps-logs';
      const endpoint = new URL(`https://${bucketName}.${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/logs/${log.id}.json`);
      await aws.fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(log)
      });
    }

    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('Log API Error:', err);
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function onRequestGet({ env }) {
  try {
    if (env.DB) {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id TEXT PRIMARY KEY,
          timestamp TEXT,
          event_type TEXT,
          page TEXT,
          details TEXT,
          username TEXT,
          ip_address TEXT
        )
      `).run();
      const { results } = await env.DB.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 5000').all();
      const formattedLogs = results.map((row) => ({
        id: row.id,
        timestamp: row.timestamp,
        eventType: row.event_type,
        page: row.page,
        details: row.details,
        user: row.username,
        ipAddress: row.ip_address
      }));
      return new Response(JSON.stringify({ success: true, logs: formattedLogs }), { headers: { 'Content-Type': 'application/json' } });
    } else if (env.DATABASE_URL) {
      const client = new Client({ connectionString: env.DATABASE_URL });
      await client.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id VARCHAR(255) PRIMARY KEY,
          timestamp TIMESTAMP,
          event_type VARCHAR(255),
          page VARCHAR(255),
          details TEXT,
          username VARCHAR(255),
          ip_address VARCHAR(255)
        )
      `);
      const res = await client.query('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 5000');
      await client.end();
      
      const formattedLogs = res.rows.map(row => ({
        id: row.id,
        timestamp: row.timestamp,
        eventType: row.event_type,
        page: row.page,
        details: row.details,
        user: row.username,
        ipAddress: row.ip_address
      }));
      return new Response(JSON.stringify({ success: true, logs: formattedLogs }), { headers: { 'Content-Type': 'application/json' } });
    } else {
      return new Response(JSON.stringify({ success: true, logs: [] }), { headers: { 'Content-Type': 'application/json' } });
    }
  } catch (err) {
    console.error('Log API GET Error:', err);
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
