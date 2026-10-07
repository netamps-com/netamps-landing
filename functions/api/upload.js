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

    const bucketApiUrl = 'https://012bf0c5d2fe5a7acc3d81e36cf5ea49.r2.cloudflarestorage.com';
    const endpoint = new URL(`${bucketApiUrl}/${key}`);
    
    // Attempt direct PUT without auth if bucket is public, or with auth if R2_ACCESS_KEY_ID is available
    if (env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY) {
      const aws = new AwsClient({
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        service: 's3',
        region: 'auto',
      });
      const upRes = await aws.fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: buffer
      });
      if (!upRes.ok) throw new Error(`Upload failed: ${upRes.statusText}`);
    } else if (env.EVIDENCE_BUCKET) {
      await env.EVIDENCE_BUCKET.put(key, buffer, { httpMetadata: { contentType: file.type } });
    } else {
      // Attempt unauthenticated PUT
      const upRes = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: buffer
      });
      if (!upRes.ok) throw new Error(`R2 Upload failed. Bucket not bound or missing auth. Status: ${upRes.status}`);
    }
    
    return new Response(JSON.stringify({ success: true, url: key }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('Upload Error:', err);
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
