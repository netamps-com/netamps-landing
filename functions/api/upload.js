import { AwsClient } from 'aws4fetch';

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export async function onRequestPost({ request, env }) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) return new Response(JSON.stringify({ success: false, message: 'No file provided' }), { status: 400 });

    const buffer = await file.arrayBuffer();
    const fileId = uuidv4();
    const extension = file.name.split('.').pop() || 'bin';
    const key = `evidence/${fileId}.${extension}`;

    if (env.EVIDENCE_BUCKET) {
      await env.EVIDENCE_BUCKET.put(key, buffer, {
        httpMetadata: { contentType: file.type }
      });
      return new Response(JSON.stringify({ success: true, url: key }), { headers: { 'Content-Type': 'application/json' } });
    } else if (env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY) {
      const aws = new AwsClient({
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        service: 's3',
        region: 'auto',
      });
      const bucketName = env.R2_BUCKET_NAME || 'netamps-evidence';
      const endpoint = new URL(`https://${bucketName}.${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`);
      
      const upRes = await aws.fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: buffer
      });
      if (!upRes.ok) {
        throw new Error(`Upload failed: ${upRes.statusText}`);
      }
      return new Response(JSON.stringify({ success: true, url: key }), { headers: { 'Content-Type': 'application/json' } });
    } else {
      console.warn('R2 credentials not provided. Simulating upload.');
      return new Response(JSON.stringify({ success: true, url: `mock_upload_${Date.now()}_${file.name}` }), { headers: { 'Content-Type': 'application/json' } });
    }
  } catch (err) {
    console.error('Upload Error:', err);
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
