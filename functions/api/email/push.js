import nodemailer from 'nodemailer';

export async function onRequestPost({ request, env }) {
  try {
    const { email, requestId, products, intent } = await request.json();
    if (!email || !requestId) return new Response(JSON.stringify({ success: false, message: 'Email and requestId required' }), { status: 400 });

    let totalValue = 0;
    if (products && Array.isArray(products)) {
      products.forEach((p) => {
        totalValue += (p.price || 0) * (p.quantity || 1);
      });
    }

    const formattedTotal = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(totalValue);

    const htmlContent = `
      <h3>Netamps Request Notification</h3>
      <p>Hello,</p>
      <p>Your ${intent === 'sell' ? 'SELL' : 'BUY'} request <strong>${requestId}</strong> has been updated.</p>
      <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 600px;">
        <thead>
          <tr style="background-color: #f8fafc;">
            <th>Product</th>
            <th>Qty</th>
            <th>Price</th>
          </tr>
        </thead>
        <tbody>
          ${products?.map((p) => `
            <tr>
              <td>${p.category} - ${p.details}</td>
              <td align="center">${p.quantity}</td>
              <td align="right">${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(p.price || 0)}</td>
            </tr>
          `).join('') || '<tr><td colspan="3">No products listed.</td></tr>'}
        </tbody>
      </table>
      <p style="font-size: 16px; margin-top: 15px;">
        <strong>Total Value: ${formattedTotal}</strong>
      </p>
      <p style="font-size: 12px; color: #64748b;">
        <em>* All prices and total values mentioned are exclusive of applicable GST rates.</em>
      </p>
    `;

    // Dynamically find the password in case it was named differently
    const smtpPassword = env.SMTP_PASSWORD || env.SMTP_PASS || env.EMAIL_PASSWORD || env.MAIL_PASSWORD || env.PASSWORD || (Object.keys(env).find(k => k.toLowerCase().includes('pass')) ? env[Object.keys(env).find(k => k.toLowerCase().includes('pass'))] : null);

    if (smtpPassword) {
      const transporter = nodemailer.createTransport({
        host: 'us2.smtp.mailhostbox.com',
        port: 587,
        secure: false, // TLS
        auth: {
          user: 'no-reply@netamps.in',
          pass: smtpPassword,
        },
      });
      await transporter.sendMail({
        from: '"Netamps Portal" <no-reply@netamps.in>',
        to: email,
        subject: `Update on Request ${requestId}`,
        html: htmlContent,
      });
    } else {
      // Native Cloudflare MailChannels delivery
      const senderEmail = `no-reply@netamps.in`;

      const mcRes = await fetch("https://api.mailchannels.net/tx/v1/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: email }] }],
          from: { email: senderEmail, name: "Netamps Portal" },
          subject: `Update on Request ${requestId}`,
          content: [{ type: "text/html", value: htmlContent }]
        })
      });

      if (!mcRes.ok) {
        console.error('MailChannels failed:', await mcRes.text());
        return new Response(JSON.stringify({ success: false, message: `Email delivery failed via MailChannels (DNS/Zone Unauthorized). Please configure Domain Lockdown or SMTP.` }), { headers: { 'Content-Type': 'application/json' }, status: 500 });
      }
    }

    return new Response(JSON.stringify({ success: true, message: 'Push email sent successfully', emailDeliveryStatus: 'Sent' }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('Email Push Error:', err);
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
