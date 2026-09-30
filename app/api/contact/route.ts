import { NextResponse } from 'next/server';

// Simple in-memory rate limiter: max 3 submissions per IP per 5 minutes
const rateLimitMap = new Map<string, { count: number; firstRequest: number }>();
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_REQUESTS = 3;

function getClientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record || now - record.firstRequest > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, firstRequest: now });
    return false;
  }
  record.count++;
  return record.count > MAX_REQUESTS;
}

function sanitize(str: unknown): string {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>"'`]/g, '').trim().slice(0, 2000);
}

export async function POST(req: Request) {
  try {
    // Rate limiting
    const ip = getClientIp(req);
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const raw = await req.json();

    // Input validation + sanitisation — never trust client data
    const firstName = sanitize(raw?.firstName);
    const lastName = sanitize(raw?.lastName);
    const email = sanitize(raw?.email);
    const message = sanitize(raw?.message);

    if (!firstName || !email || !message) {
      return NextResponse.json(
        { success: false, error: 'Required fields missing.' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email address.' },
        { status: 400 }
      );
    }

    // =========================================================================
    // TODO FOR USER: Connect an SMTP transporter here (Resend, SendGrid etc.)
    // Example:
    // const transporter = nodemailer.createTransport({ ...smtpConfig });
    // await transporter.sendMail({
    //   from: email,
    //   to: 'contact@netamps.com',
    //   subject: `New Security Inquiry from ${firstName} ${lastName}`,
    //   text: message
    // });
    // =========================================================================

    // Simulate async processing — remove this once SMTP is connected
    await new Promise(resolve => setTimeout(resolve, 800));

    return NextResponse.json({ success: true, message: 'Inquiry received. Our team will respond shortly.' });
  } catch {
    return NextResponse.json({ success: false, error: 'An error occurred. Please try again.' }, { status: 500 });
  }
}
