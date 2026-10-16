import { verifySession } from './intake/auth';
import { corsJson, corsPreflight } from '../_lib/cors.js';

/**
 * POST /api/feed-media  (+ DELETE, OPTIONS)
 *
 * Staff uploads for feed item attachments (photos/video/files). Files live in
 * R2 under the `feed/` prefix; the DB reference (`feed_items.media_url`) is
 * managed by the existing feed API — this endpoint only stores bytes and
 * returns the servable URL.
 * Workers-compatible: zero npm imports, plain Web APIs only.
 */

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

// MIME allowlist: extension is derived from the verified MIME via this map,
// never from the client filename.
const MIME_MAP = {
  'image/png': { ext: 'png', kind: 'image' },
  'image/jpeg': { ext: 'jpg', kind: 'image' },
  'image/webp': { ext: 'webp', kind: 'image' },
  'image/gif': { ext: 'gif', kind: 'image' },
  'video/mp4': { ext: 'mp4', kind: 'video' },
  'video/webm': { ext: 'webm', kind: 'video' },
  'video/quicktime': { ext: 'mov', kind: 'video' },
  'application/pdf': { ext: 'pdf', kind: 'file' },
  'text/csv': { ext: 'csv', kind: 'file' },
  'application/json': { ext: 'json', kind: 'file' },
  'text/plain': { ext: 'txt', kind: 'file' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx', kind: 'file' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', kind: 'file' }
};

function err(request, env, error, message, status) {
  return corsJson(request, env, { success: false, error, message }, status);
}

function hexOf(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Best-effort audit; logging must never fail the request.
async function auditMedia(env, kind, bytes, status) {
  try {
    if (!env.DB || typeof env.DB.prepare !== 'function') return;
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS feed_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, channel TEXT, status INTEGER, latency_ms INTEGER, bytes INTEGER, payload TEXT)'
    ).run();
    await env.DB.prepare(
      'INSERT INTO feed_events (id, ts, kind, channel, status, latency_ms, bytes, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), new Date().toISOString(), kind, '', status, null, bytes, '').run();
  } catch {
    // Audit failure must not break the upload/delete.
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const user = await verifySession(env, request);
    if (!user) {
      return err(request, env, 'UNAUTHORIZED', 'Sign in to upload feed media.', 401);
    }

    const bucket = env.PRODUCTION_BUCKET;
    if (!bucket || typeof bucket.put !== 'function') {
      return err(request, env, 'STORAGE_UNBOUND', 'Media storage is not attached. Please try again shortly.', 503);
    }

    let form;
    try {
      form = await request.formData();
    } catch {
      return err(request, env, 'BAD_UPLOAD', 'Expected multipart/form-data with a file field.', 400);
    }
    const file = form.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') {
      return err(request, env, 'BAD_UPLOAD', 'Expected multipart/form-data with a file field.', 400);
    }

    const mime = String(file.type || '').toLowerCase();
    const spec = MIME_MAP[mime];
    if (!spec) {
      return err(request, env, 'BAD_TYPE', 'File type is not allowed for feed media.', 400);
    }

    const buffer = await file.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) {
      return err(request, env, 'TOO_LARGE', 'File exceeds the 15 MB feed media limit.', 413);
    }

    const digest = await crypto.subtle.digest('SHA-256', buffer);
    const sha256 = hexOf(new Uint8Array(digest));
    // Staff-authenticated upload: store directly in PRODUCTION_BUCKET with no
    // quarantine round-trip (unlike the public secure-upload pipeline).
    const key = `feed/${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}.${spec.ext}`;
    await bucket.put(key, buffer, {
      httpMetadata: { contentType: mime },
      customMetadata: {
        'x-owner-email': user.email || 'anonymous',
        'x-payload-sha256': sha256,
        'x-feed-media': '1'
      }
    });

    await auditMedia(env, 'media-upload', buffer.byteLength, 201);
    return corsJson(request, env, {
      success: true,
      key,
      assetUrl: `/api/cdn/${key}`,
      kind: spec.kind,
      mime,
      bytes: buffer.byteLength
    }, 201);
  } catch {
    return err(request, env, 'INTERNAL_ERROR', 'Feed media upload failed. Please try again shortly.', 500);
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  try {
    const user = await verifySession(env, request);
    if (!user) {
      return err(request, env, 'UNAUTHORIZED', 'Sign in to delete feed media.', 401);
    }

    // Removes orphans when an operator clears an attachment.
    const key = new URL(request.url).searchParams.get('key') || '';
    if (!key.startsWith('feed/') || key.includes('..')) {
      return err(request, env, 'BAD_KEY', 'Only keys under the feed/ prefix can be deleted.', 400);
    }

    const bucket = env.PRODUCTION_BUCKET;
    if (!bucket || typeof bucket.head !== 'function' || typeof bucket.delete !== 'function') {
      return err(request, env, 'STORAGE_UNBOUND', 'Media storage is not attached. Please try again shortly.', 503);
    }

    const existing = await bucket.head(key);
    if (existing) await bucket.delete(key);

    await auditMedia(env, 'media-delete', null, 200);
    return corsJson(request, env, { success: true, deleted: existing !== null });
  } catch {
    return err(request, env, 'INTERNAL_ERROR', 'Feed media delete failed. Please try again shortly.', 500);
  }
}

export async function onRequestOptions(context) {
  return corsPreflight(context.request, context.env);
}
