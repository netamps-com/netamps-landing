"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendOrderEmail = sendOrderEmail;
exports.requestOTP = requestOTP;
exports.verifyOTP = verifyOTP;
const crypto_1 = __importDefault(require("crypto"));
const otplib_1 = require("otplib");
const redis_1 = require("redis");
const pg_1 = require("pg");
const nodemailer_1 = __importDefault(require("nodemailer"));
// ============================================================================
// 1. ENVIRONMENT CONFIGURATION & CLIENT INITIALIZATION
// ============================================================================
// Redis Ephemeral State Client (Token Bucket, Attempt Tracking, OTP Secrets)
const redisClient = (0, redis_1.createClient)({
    url: process.env.REDIS_URL || 'redis://default:default_password@localhost:6379',
    socket: {
        tls: process.env.NODE_ENV === 'production',
        rejectUnauthorized: process.env.NODE_ENV === 'production',
    }
});
redisClient.on('error', (err) => console.error('Redis Client Error', err));
redisClient.connect().catch(console.error);
// PostgreSQL Immutable Audit Log Client
const pgPool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://audit_user:audit_pass@localhost:5432/audit_db',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});
// Initialize Database Schema on Boot
pgPool.query(`
  CREATE TABLE IF NOT EXISTS security_audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type VARCHAR(50) NOT NULL,
      email_hash VARCHAR(64) NOT NULL,
      ip_address INET NOT NULL,
      details JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_audit_logs_ip ON security_audit_logs(ip_address);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_email_hash ON security_audit_logs(email_hash);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON security_audit_logs(created_at DESC);
`).catch(err => console.error('Failed to initialize PostgreSQL schema:', err));
// SMTP Nodemailer Transport (TLS Encrypted)
const transporter = nodemailer_1.default.createTransport({
    host: process.env.SMTP_HOST || 'smtp.example.com',
    port: Number(process.env.SMTP_PORT) || 465,
    secure: Number(process.env.SMTP_PORT) === 465, // true for 465, false for other ports (use STARTTLS)
    auth: {
        user: process.env.SMTP_USER || 'smtp_user',
        pass: process.env.SMTP_PASS || 'smtp_pass',
    },
    tls: {
        minVersion: 'TLSv1.2'
    }
});
// Configure otplib for SOC 2 standard strictness
otplib_1.authenticator.options = {
    step: 300, // 5-minute validity window
    window: 0, // No drift allowance
    digits: 6
};
// ============================================================================
// 2. HELPER UTILITIES
// ============================================================================
/**
 * Irreversibly hashes PII (Email Address) for Data Minimization at rest.
 */
function hashIdentity(email) {
    return crypto_1.default.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}
/**
 * Immutable security event logger written directly to PostgreSQL.
 */
async function logSecurityAudit(eventType, emailHash, ipAddress, details = {}) {
    const query = `
    INSERT INTO security_audit_logs (event_type, email_hash, ip_address, details, created_at)
    VALUES ($1, $2, $3, $4, NOW());
  `;
    try {
        await pgPool.query(query, [eventType, emailHash, ipAddress, JSON.stringify(details)]);
    }
    catch (error) {
        console.error('CRITICAL: Failed to write to immutable audit log.', error);
    }
}
/**
 * Exponential backoff wrapper for SMTP dispatch to handle transient network drops.
 */
async function sendEmailWithRetry(to, otpCode, retries = 3, backoff = 1000) {
    const mailOptions = {
        from: `"Security Team" <${process.env.SMTP_FROM || 'no-reply@example.com'}>`,
        to,
        subject: 'Your Secure Verification Code',
        text: `Your verification code is ${otpCode}. It will expire in 5 minutes. Do not share this code.`,
        html: `<p>Your verification code is <strong>${otpCode}</strong>. It will expire in 5 minutes. Do not share this code.</p>`
    };
    for (let i = 0; i < retries; i++) {
        try {
            await transporter.sendMail(mailOptions);
            return true;
        }
        catch (error) {
            if (i === retries - 1)
                throw error;
            await new Promise((res) => setTimeout(res, backoff * Math.pow(2, i))); // Exponential backoff
        }
    }
    return false;
}
async function sendOrderEmail(to, orderDetails) {
    let productsHtml = orderDetails.products.map((p) => `<li><strong>${p.category.replace('_', ' ')}</strong> (x${p.quantity}): ${p.details} <br/> 
    <em>Price Evaluated: ${p.price !== undefined ? '₹' + p.price : 'Pending'}</em></li>`).join('');
    const mailOptions = {
        from: `"Netamps ITAD" <${process.env.SMTP_FROM || 'no-reply@example.com'}>`,
        to,
        subject: `Order Update: ${orderDetails.id} - ${orderDetails.status}`,
        html: `<h2>Hello ${orderDetails.name},</h2>
    <p>Your request (<strong>${orderDetails.id}</strong>) has been <strong>${orderDetails.status}</strong>.</p>
    <p><strong>Intent:</strong> ${orderDetails.intent.toUpperCase()}</p>
    <h3>Equipment & Pricing details:</h3>
    <ul>
      ${productsHtml}
    </ul>
    <p>Please track your ID on our portal for the most up-to-date information.</p>
    <br/>
    <p>Regards,<br/>Netamps Technologies</p>`
    };
    try {
        await transporter.sendMail(mailOptions);
        return true;
    }
    catch (error) {
        console.error('Failed to send order email:', error);
        return false;
    }
}
// ============================================================================
// 3. CORE DOMAIN LOGIC (REQUEST & VERIFY)
// ============================================================================
/**
 * Generates and dispatches an OTP. Enforces Token Bucket Rate Limiting (3/hr).
 */
async function requestOTP(email, ipAddress) {
    const emailHash = hashIdentity(email);
    // 1. Sliding-Window Rate Limiter (Max 3 tokens per hour)
    const rateLimitKey = `rate_limit:email:${emailHash}`;
    const currentRequests = await redisClient.incr(rateLimitKey);
    if (currentRequests === 1) {
        await redisClient.expire(rateLimitKey, 3600); // Set 1-hour TTL on first request
    }
    if (currentRequests > 3) {
        await logSecurityAudit('OTP_RATE_LIMIT_EXCEEDED', emailHash, ipAddress);
        return { success: false, message: 'Too many requests. Please try again later.' };
    }
    // 2. Generate RFC 6238 TOTP Secret
    const secret = otplib_1.authenticator.generateSecret();
    const token = otplib_1.authenticator.generate(secret);
    // 3. Store Secret securely in Redis (5-minute TTL)
    const secretKey = `otp_secret:email:${emailHash}`;
    const attemptsKey = `otp_attempts:email:${emailHash}`;
    await redisClient.setEx(secretKey, 300, secret);
    await redisClient.setEx(attemptsKey, 300, '0'); // Reset attempts counter
    // 4. Dispatch Email with Exponential Backoff
    try {
        await sendEmailWithRetry(email, token);
        await logSecurityAudit('OTP_SENT_SUCCESS', emailHash, ipAddress);
        return { success: true, message: 'OTP dispatched successfully.' };
    }
    catch (error) {
        await logSecurityAudit('OTP_DISPATCH_FAILED', emailHash, ipAddress, { error: String(error) });
        return { success: false, message: 'Failed to dispatch email due to network error.' };
    }
}
/**
 * Verifies an OTP. Enforces brute-force limits (max 3 invalid attempts).
 */
async function verifyOTP(email, code, ipAddress) {
    const emailHash = hashIdentity(email);
    const secretKey = `otp_secret:email:${emailHash}`;
    const attemptsKey = `otp_attempts:email:${emailHash}`;
    const secret = await redisClient.get(secretKey);
    if (!secret) {
        await logSecurityAudit('OTP_AUTH_FAILED_EXPIRED', emailHash, ipAddress);
        return { success: false, message: 'OTP expired or not found.' };
    }
    // 1. Track Brute-Force Attempts
    const attempts = await redisClient.incr(attemptsKey);
    if (attempts > 3) {
        // Burn the token permanently upon threat detection
        await redisClient.del(secretKey);
        await redisClient.del(attemptsKey);
        await logSecurityAudit('OTP_BRUTE_FORCE_DETECTED', emailHash, ipAddress, { attempts });
        return { success: false, message: 'Too many invalid attempts. Token invalidated.' };
    }
    // 2. Verify Cryptographic Token
    const isValid = otplib_1.authenticator.verify({ token: code, secret });
    if (isValid) {
        // Instantly burn token upon success (replay attack prevention)
        await redisClient.del(secretKey);
        await redisClient.del(attemptsKey);
        await logSecurityAudit('OTP_AUTH_SUCCESS', emailHash, ipAddress);
        return { success: true, message: 'Authentication successful.' };
    }
    else {
        await logSecurityAudit('OTP_AUTH_FAILED_INVALID', emailHash, ipAddress, { attempts });
        return { success: false, message: 'Invalid code.' };
    }
}
