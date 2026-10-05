// Cloudflare Pages Function
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const MAX_REQUESTS = 3;

function getClientIp(req) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

function isRateLimited(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record || now - record.firstRequest > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, firstRequest: now });
    return false;
  }
  record.count++;
  return record.count > MAX_REQUESTS;
}

function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>"'`]/g, '').trim().slice(0, 2000);
}

export async function onRequestPost(context) {
  try {
    const { request } = context;
    const ip = getClientIp(request);
    if (isRateLimited(ip)) {
      return new Response(JSON.stringify({ success: false, error: 'Too many requests. Please try again later.' }), { status: 429, headers: { 'Content-Type': 'application/json' } });
    }

    const raw = await request.json();

    const firstName = sanitize(raw?.firstName);
    const lastName = sanitize(raw?.lastName);
    const email = sanitize(raw?.email);
    const message = sanitize(raw?.message);

    if (!firstName || !email || !message) {
      return new Response(JSON.stringify({ success: false, error: 'Required fields missing.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid email address.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    await new Promise(resolve => setTimeout(resolve, 800));

    return new Response(JSON.stringify({ success: true, message: 'Inquiry received. Our team will respond shortly.' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: 'An error occurred. Please try again.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
