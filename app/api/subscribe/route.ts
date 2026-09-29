import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Logic to add email to a newsletter list (e.g., Mailchimp, Sendgrid, DB)
    console.log('Received subscription for:', body.email);

    return NextResponse.json({ message: 'Subscribed successfully', status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
