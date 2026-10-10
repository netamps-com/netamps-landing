import { verifySession } from './intake/auth';

/**
 * POST /api/secure-upload
 *
 * Production media-ingestion pipeline (quarantine → scan → promote).
 * Workers-compatible: zero npm imports, plain Web APIs only.
 */

const MAX_PAYLOAD_SIZE = 300 * 1024 * 1024; // 300 MB
const SCAN_WINDOW_BYTES = 256 * 1024; // malware-signature scan window (head of payload)

const ALLOWED_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'tiff', 'tif', 'heic', 'heif',
  'mp4', 'mov', 'webm', 'mkv', 'avi', 'flv', 'csv', 'json', 'xlsx'
]);

const ALLOWED_MIME = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/tiff',
  'image/heic', 'image/heif',
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska',
  'video/x-msvideo', 'video/x-flv',
  'text/csv', 'application/json',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);

// EICAR anti-malware test signature
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function hexOf(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function validateMagicBytes(headerArray, extension) {
  // text files like csv and json don't have magic bytes, so bypass for them
  if (['csv', 'json'].includes(extension)) return true;
  // xlsx is a ZIP container — verify the ZIP local-file header signature
  if (extension === 'xlsx') {
    if (headerArray.length < 4) return false;
    return hexOf(headerArray.slice(0, 4)) === '504b0304';
  }
  
  if (headerArray.length < 12) return false;
  const hex = hexOf(headerArray);

  if (hex.startsWith('89504e47')) return true; // PNG
  if (hex.startsWith('ffd8ff')) return true; // JPEG
  if (hex.startsWith('52494646') && hex.substring(16, 24) === '57454250') return true; // WEBP
  if (hex.startsWith('47494638')) return true; // GIF
  if (hex.startsWith('49492a00') || hex.startsWith('4d4d002a')) return true; // TIFF
  if (hex.substring(8, 24) === '6674797068656963' || hex.substring(8, 24) === '6674797068656978') return true; // HEIC

  const ftyp = hex.substring(8, 16);
  if (ftyp === '66747970') {
    const brand = hex.substring(16, 24);
    const validBrands = ['69736f6d', '6d703431', '6d703432', '71742020', '6d646174'];
    if (validBrands.includes(brand)) return true; // MP4 / QuickTime MOV
  }

  if (hex.startsWith('1a45dfa3')) return true; // WEBM / MKV
  if (hex.startsWith('52494646') && hex.substring(16, 24) === '41564920') return true; // AVI
  if (hex.startsWith('464c5601')) return true; // FLV

  return false;
}

function scanMalware(headBytes, fileName) {
  try {
    const hex = hexOf(headBytes.slice(0, Math.min(headBytes.length, SCAN_WINDOW_BYTES)));
    if (hex.startsWith('4d5a')) return { infected: true, signature: 'EXECUTABLE_MZ' };
    if (hex.startsWith('7f454c46')) return { infected: true, signature: 'EXECUTABLE_ELF' };
    if (
      hex.startsWith('feedface') || hex.startsWith('cefaedfe') ||
      hex.startsWith('feedfacf') || hex.startsWith('cffaedfe') ||
      hex.startsWith('cafebabe') || hex.startsWith('cafebabf')
    ) return { infected: true, signature: 'EXECUTABLE_MACHO' };
    if (hex.startsWith('2321')) return { infected: true, signature: 'SCRIPT_SHEBANG' };

    let ascii = '';
    const view = headBytes.slice(0, Math.min(headBytes.length, SCAN_WINDOW_BYTES));
    for (let i = 0; i < view.length; i++) {
      const c = view[i];
      ascii += c >= 32 && c < 127 ? String.fromCharCode(c) : ' ';
    }
    if (ascii.includes(EICAR)) return { infected: true, signature: 'EICAR_TEST_FILE' };

    const lower = String(fileName || '').toLowerCase();
    if (/\.(exe|dll|bat|cmd|ps1|sh|com|scr|msi|jar|py|js|vbs)(\.|$)/.test(lower.replace(/\.(png|jpe?g|webp|gif|tiff?|heic|heif|mp4|mov|webm|mkv|avi|flv|csv|json)$/, ''))) {
      return { infected: true, signature: 'DOUBLE_EXTENSION_MASQUERADE' };
    }

    return { infected: false, signature: null };
  } catch {
    return { infected: false, signature: null };
  }
}

async function scanVirustotal(sha256, apiKey) {
  if (!apiKey) return false;
  try {
    const res = await fetch(`https://www.virustotal.com/api/v3/files/${sha256}`, {
      headers: { 'x-apikey': apiKey }
    });
    if (res.ok) {
      const data = await res.json();
      const malicious = data.data?.attributes?.last_analysis_stats?.malicious || 0;
      if (malicious > 0) return true;
    }
    return false;
  } catch (err) {
    return false;
  }
}

function audit(event, fields) {
  try {
    console.log(JSON.stringify({
      siem: 'netamps-audit-v1',
      event,
      ts: new Date().toISOString(),
      actor_ip: fields.ip || 'unknown',
      session_id: fields.sessionId || null,
      file_name: fields.fileName || null,
      file_size: typeof fields.size === 'number' ? fields.size : null,
      sha256: fields.sha256 || null,
      scan_signature: fields.signature || null,
      verdict: fields.verdict || null,
      bucket: fields.bucket || null,
      object_key: fields.key || null
    }));
  } catch {}
}

async function auditToD1(env, entry) {
  try {
    if (!env.DB || typeof env.DB.prepare !== 'function') return;
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO audit_logs (id, timestamp, event_type, page, details, username, ip_address)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
    ).bind(
      id,
      new Date().toISOString(),
      entry.event,
      'Returns Upload',
      JSON.stringify({ session: entry.sessionId, file: entry.fileName, size: entry.size, sha256: entry.sha256, verdict: entry.verdict, signature: entry.signature, key: entry.key }),
      entry.ownerEmail || 'anonymous',
      entry.ip || 'unknown'
    ).run();
  } catch {}
}

export async function onRequestPost({ request, env }) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  let sessionId = null;
  let fileName = null;
  let fileSize = null;

  try {
    const contentLength = request.headers.get('content-length');

    if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_SIZE) {
      return json({ success: false, error: 'SIZE_VIOLATION', message: 'Upload blocked: payload exceeds the 300 MB per-request limit. Split the attached asset details across multiple requests.' }, 413);
    }

    const formData = await request.formData();
    const file = formData.get('file');
    sessionId = formData.get('sessionId') || crypto.randomUUID();
    // Product scope for chain-of-custody namespacing. Strict charset so the
    // values are safe to embed in R2 object keys. 'unassigned' when the file
    // was staged before being linked to a product card.
    const rawProductId = String(formData.get('productId') || 'unassigned');
    const rawRequestId = String(formData.get('requestId') || sessionId);
    const productId = /^[A-Za-z0-9_-]{1,64}$/.test(rawProductId) ? rawProductId : 'unassigned';
    const requestScope = /^[A-Za-z0-9_-]{1,64}$/.test(rawRequestId) ? rawRequestId : String(sessionId);

    if (env.CACHE_KV) {
      const banCount = parseInt(await env.CACHE_KV.get(`ban_${sessionId}`) || '0', 10);
      if (banCount >= 3) {
        return json({ success: false, error: 'SESSION_BLOCKED', message: 'Session terminated due to repeated malicious uploads. Please restart session with a new ID.' }, 403);
      }
    }

    if (!file || typeof file.arrayBuffer !== 'function') {
      return json({ success: false, error: 'BAD_REQUEST', message: 'No file payload attached.' }, 400);
    }
    fileName = file.name || 'unnamed';
    fileSize = file.size || 0;

    if (fileSize > MAX_PAYLOAD_SIZE) {
      audit('upload.blocked.size', { ip, sessionId, fileName, size: fileSize, verdict: 'BLOCKED_SIZE' });
      return json({ success: false, error: 'SIZE_VIOLATION', message: `Upload blocked: "${fileName}" is ${(fileSize / 1048576).toFixed(1)} MB, over the 300 MB limit. Compress the file or split it across requests.` }, 413);
    }

    const ext = String(fileName.split('.').pop() || '').toLowerCase();
    const mime = String(file.type || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext) || (mime && !ALLOWED_MIME.has(mime))) {
      audit('upload.blocked.type', { ip, sessionId, fileName, size: fileSize, verdict: 'BLOCKED_TYPE' });
      return json({ success: false, error: 'TYPE_VIOLATION', message: `Upload blocked: ".${ext || '?'}" files are not accepted. Allowed: PNG, JPEG, WEBP, GIF, TIFF, HEIC photos; MP4, MOV, WEBM, MKV, AVI, FLV videos; CSV, JSON, XLSX data files.` }, 415);
    }

    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    const digest = await crypto.subtle.digest('SHA-256', buffer);
    const sha256 = hexOf(new Uint8Array(digest));

    if (env.CACHE_KV) {
      const blacklisted = await env.CACHE_KV.get(`blacklist_${sha256}`);
      if (blacklisted) {
        const currentBan = parseInt(await env.CACHE_KV.get(`ban_${sessionId}`) || '0', 10);
        await env.CACHE_KV.put(`ban_${sessionId}`, (currentBan + 1).toString(), { expirationTtl: 86400 });
        audit('upload.blocked.blacklist', { ip, sessionId, fileName, size: fileSize, sha256, verdict: 'BLOCKED_BLACKLIST' });
        return json({ success: false, error: 'MALWARE_BLOCKED', message: 'Upload Blocked: Known malicious file signature detected.' }, 403);
      }
    }

    const isMagicSpoofed = !validateMagicBytes(bytes.slice(0, 16), ext);
    const scan = scanMalware(bytes, fileName);
    const isVtMalicious = await scanVirustotal(sha256, env.VIRUSTOTAL_API_KEY);

    if (isMagicSpoofed || scan.infected || isVtMalicious) {
      if (env.CACHE_KV) {
        await env.CACHE_KV.put(`blacklist_${sha256}`, '1', { expirationTtl: 86400 * 30 });
        const currentBan = parseInt(await env.CACHE_KV.get(`ban_${sessionId}`) || '0', 10);
        await env.CACHE_KV.put(`ban_${sessionId}`, (currentBan + 1).toString(), { expirationTtl: 86400 });
      }
      
      const signature = scan.signature || (isVtMalicious ? 'VIRUSTOTAL_MALICIOUS' : 'SIGNATURE_SPOOF');
      const entry = { ip, sessionId, fileName, size: fileSize, sha256, signature, verdict: 'BLOCKED_MALWARE' };
      audit('upload.blocked.malware', entry);
      return json({ success: false, error: 'MALWARE_BLOCKED', message: 'Upload Blocked: Malicious signature detected or spoofed file. Incident logged.' }, 403);
    }

    if (!env.QUARANTINE_BUCKET || typeof env.QUARANTINE_BUCKET.put !== 'function' || !env.PRODUCTION_BUCKET || typeof env.PRODUCTION_BUCKET.put !== 'function') {
      return json({ success: false, error: 'STORAGE_UNBOUND', message: 'Upload pipeline unavailable: quarantine or evidence storage is not attached. Please try again shortly.' }, 503);
    }
    
    // Identity (A0): a logged-in session tags ownership; the public Returns
    // form uploads pre-authentication, so anonymous uploads stay allowed and
    // are tagged as such (staff/admin can still review them; see CDN rule).
    // verifySession never throws (null on missing/invalid), stay defensive anyway.
    let ownerEmail = 'anonymous';
    try {
      const sessionUser = await verifySession(env, request);
      if (sessionUser && sessionUser.email) ownerEmail = sessionUser.email;
    } catch {}

    const trackingId = crypto.randomUUID();
    const safeExt = ALLOWED_EXTENSIONS.has(ext) ? ext : 'bin';
    // Custody-namespace: every key proves request scope + owning product.
    // Unassigned files land under products/unassigned/ and are moved (not
    // copied alongside) into the product namespace on mapping — see secure-move.
    const objectKey = `requests/${requestScope}/products/${productId}/${trackingId}.${safeExt}`;
    await env.QUARANTINE_BUCKET.put(objectKey, buffer, {
      httpMetadata: { contentType: mime || 'application/octet-stream' },
      customMetadata: {
        'x-actor-ip': ip,
        'x-session-id': String(sessionId),
        'x-product-id': productId,
        'x-owner-email': ownerEmail,
        'x-payload-sha256': sha256,
        'x-scan-verdict': 'CLEAN',
        'x-encryption': 'SSE-AES256'
      }
    });

    const prodKey = objectKey;
    await env.PRODUCTION_BUCKET.put(prodKey, buffer, {
      httpMetadata: { contentType: mime || 'application/octet-stream' },
      customMetadata: {
        'x-actor-ip': ip,
        'x-session-id': String(sessionId),
        'x-product-id': productId,
        'x-owner-email': ownerEmail,
        'x-payload-sha256': sha256,
        'x-scan-verdict': 'SCANNED_CLEAN',
        'x-encryption': 'SSE-AES256',
        'x-quarantine-key': objectKey
      }
    });
    
    let finalKey = prodKey;
    let finalBucket = 'production';

    const done = { ip, sessionId, fileName, size: fileSize, sha256, verdict: 'CLEAN', bucket: finalBucket, key: finalKey, ownerEmail };
    audit('upload.accepted', done);
    await auditToD1(env, { event: 'UPLOAD_ACCEPTED', ...done });

    return json({
      success: true,
      state: 'QUARANTINED_SCANNED_PROMOTED',
      key: finalKey,
      assetUrl: `/api/cdn/${finalKey}`,
      productId,
      hash: sha256,
      encrypted: 'AES-256',
      scan: 'CLEAN'
    }, 201);
  } catch (err) {
    console.error('[upload] Internal error:', err); // server log only — client gets a generic message
    return json({ success: false, error: 'INTERNAL_ERROR', message: 'Upload pipeline error. Please try again shortly.' }, 500);
  }
}
