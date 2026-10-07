import { AwsClient } from 'aws4fetch';

export async function onRequestGet({ request, env, params }) {
  try {
    const pathArray = params.path;
    if (!pathArray || pathArray.length === 0) return new Response('Not found', { status: 404 });
    const key = pathArray.join('/');

    if (env.EVIDENCE_BUCKET) {
      const object = await env.EVIDENCE_BUCKET.get(key);
      if (object === null) return new Response('Not found', { status: 404 });
      
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      return new Response(object.body, { headers });
    } else if (env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY) {
      const aws = new AwsClient({
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        service: 's3',
        region: 'auto',
      });
      const bucketName = env.R2_BUCKET_NAME || 'netamps-evidence';
      const endpoint = new URL(`https://${bucketName}.${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`);
      
      const res = await aws.fetch(endpoint, { method: 'GET' });
      if (!res.ok) return new Response('Not found', { status: 404 });
      
      const headers = new Headers(res.headers);
      return new Response(res.body, { headers });
    } else {
      const bucketApiUrl = 'https://012bf0c5d2fe5a7acc3d81e36cf5ea49.r2.cloudflarestorage.com';
      const endpoint = new URL(`${bucketApiUrl}/${key}`);
      const res = await fetch(endpoint, { method: 'GET' });
      if (!res.ok) {
        if (key.includes('mock_upload')) {
           return new Response('Mock image content. Real image was not uploaded because R2 was disconnected.', { status: 200, headers: { 'Content-Type': 'text/plain' } });
        }
        return new Response('Not found or Bucket is not public.', { status: 404 });
      }
      return new Response(res.body, { headers: res.headers });
    }
  } catch (err) {
    return new Response(err.message, { status: 500 });
  }
}
