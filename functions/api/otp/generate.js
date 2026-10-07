import nodemailer from 'nodemailer';
import { Client } from 'pg';

export async function onRequestPost({ request, env }) {
  try {
    const { email } = await request.json();
    if (!email) return new Response(JSON.stringify({ success: false, message: 'Email required' }), { status: 400 });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // PostgreSQL connection
    if (env.DB) {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS otps (
          email TEXT PRIMARY KEY,
          code TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      
      await env.DB.prepare(
        'INSERT INTO otps (email, code) VALUES (?, ?) ON CONFLICT (email) DO UPDATE SET code = excluded.code, created_at = CURRENT_TIMESTAMP'
      ).bind(email, otp).run();
    } else if (env.DATABASE_URL) {
      const client = new Client({ connectionString: env.DATABASE_URL });
      await client.connect();
      
      await client.query(`
        CREATE TABLE IF NOT EXISTS otps (
          email VARCHAR(255) PRIMARY KEY,
          code VARCHAR(10),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      await client.query(
        'INSERT INTO otps (email, code) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET code = $2, created_at = CURRENT_TIMESTAMP',
        [email, otp]
      );
      await client.end();
    } else {
      console.warn('DATABASE_URL not set, skipping PG OTP storage.');
    }

    const transporter = nodemailer.createTransport({
      host: 'us2.smtp.mailhostbox.com',
      port: 587,
      secure: false, // TLS
      auth: {
        user: 'no-reply@netamps.in',
        pass: env.SMTP_PASSWORD || 'dummy_password',
      },
    });

    await transporter.sendMail({
      from: '"Netamps Portal" <no-reply@netamps.in>',
      to: email,
      subject: 'Your Netamps Verification Code',
      text: `Your OTP is: ${otp}. It will expire in 5 minutes.`,
      html: `<h3>Your Verification Code</h3><p>Your OTP is: <strong style="font-size:24px">${otp}</strong>.</p><p>It will expire in 5 minutes.</p>`,
    });

    return new Response(JSON.stringify({ success: true, message: 'OTP sent successfully' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('OTP Generate Error:', err);
    return new Response(JSON.stringify({ success: false, message: err.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
