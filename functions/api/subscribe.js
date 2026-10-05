export async function onRequestPost(context) {
  try {
    const { request } = context;
    const body = await request.json();
    console.log('Received subscription for:', body.email);
    return new Response(JSON.stringify({ message: 'Subscribed successfully', status: 200 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
