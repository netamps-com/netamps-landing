import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const data = await req.json();
    
    // =========================================================================
    // TODO FOR USER: To actually send emails, you need an SMTP service like
    // Resend, SendGrid, or Nodemailer. 
    // 
    // Example using Nodemailer:
    // const transporter = nodemailer.createTransport({ ...smtpConfig });
    // await transporter.sendMail({
    //   from: data.email,
    //   to: 'contact@netamps.com',
    //   subject: `New Security Inquiry from ${data.firstName} ${data.lastName}`,
    //   text: data.message
    // });
    // =========================================================================

    console.log("=========================================");
    console.log(`[MOCK EMAIL SERVER] Sending email to: contact@netamps.com`);
    console.log(`[MOCK EMAIL SERVER] From: ${data.firstName} ${data.lastName} (${data.email})`);
    console.log(`[MOCK EMAIL SERVER] Message: ${data.message}`);
    console.log("=========================================");
    
    // Simulate network delay for the UI to show the loading state
    await new Promise(resolve => setTimeout(resolve, 1500));

    return NextResponse.json({ success: true, message: "Email sent successfully" });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Failed to send email" }, { status: 500 });
  }
}
