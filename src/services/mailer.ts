import { config } from '../config';

export interface OutboundEmail {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{ filename: string; contentBase64: string; contentType: string }>;
}

export interface EmailProvider {
  readonly name: string;
  send(email: OutboundEmail): Promise<{ id: string }>;
}

/** Resend over plain fetch (DKIM/SPF enforced by the verified sending domain). */
export class ResendProvider implements EmailProvider {
  readonly name = 'resend';

  async send(email: OutboundEmail): Promise<{ id: string }> {
    if (!config.resendApiKey) throw new Error('RESEND_API_KEY is not configured');
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.resendApiKey}` },
      body: JSON.stringify({
        from: `${config.mailFromName} <${config.mailFromEmail}>`,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
        attachments: (email.attachments ?? []).map((a) => ({
          filename: a.filename,
          content: a.contentBase64,
          content_type: a.contentType,
        })),
      }),
    });
    if (!res.ok) throw new Error(`Resend rejected send: ${res.status}`);
    const data = (await res.json()) as { id?: string };
    return { id: data.id ?? 'unknown' };
  }
}
