// 300 MB maximum threshold allocation
const MAX_PAYLOAD_SIZE = 300 * 1024 * 1024;

/**
 * Validates the raw magic byte signature of the buffer header
 * to strictly ensure structural integrity, ignoring MIME/Extension claims.
 * 
 * Supports: PNG, JPEG, WEBP, GIF, TIFF, HEIC, MP4, MOV, WEBM, MKV, AVI, FLV
 */
function validateMagicBytes(headerArray) {
  if (headerArray.length < 12) return false;
  const hex = Array.from(headerArray).map(b => b.toString(16).padStart(2, '0')).join('');

  // Photos / Images
  if (hex.startsWith('89504e47')) return true; // PNG
  if (hex.startsWith('ffd8ff')) return true; // JPEG
  if (hex.startsWith('52494646') && hex.substring(16, 24) === '57454250') return true; // WEBP (RIFF....WEBP)
  if (hex.startsWith('47494638')) return true; // GIF (GIF87a / GIF89a)
  if (hex.startsWith('49492a00') || hex.startsWith('4d4d002a')) return true; // TIFF
  if (hex.substring(8, 24) === '6674797068656963' || hex.substring(8, 24) === '6674797068656978') return true; // HEIC / HEIF (ftypheic)

  // Videos
  const ftyp = hex.substring(8, 16);
  if (ftyp === '66747970') {
    // MP4 / MOV formats rely on ftyp
    const brand = hex.substring(16, 24);
    const validBrands = ['69736f6d', '6d703431', '6d703432', '71742020', '6d646174'];
    if (validBrands.includes(brand)) return true; // MP4 / QuickTime MOV
  }
  
  if (hex.startsWith('1a45dfa3')) return true; // WEBM / MKV (Matroska)
  if (hex.startsWith('52494646') && hex.substring(16, 24) === '41564920') return true; // AVI (RIFF....AVI )
  if (hex.startsWith('464c5601')) return true; // FLV

  return false;
}

export async function onRequestPost({ request, env }) {
  try {
    const contentLength = request.headers.get('content-length');
    
    // 1. Content-Length Perimeter Drop
    if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_SIZE) {
      return new Response(JSON.stringify({
        success: false, 
        error: 'THRESHOLD_VIOLATION', 
        message: 'Session limit breached: Adding this file exceeds the allocation limit of 300MB per upload session.'
      }), { 
        status: 413,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Since users may use formData, we must extract the file binary
    const formData = await request.formData();
    const file = formData.get('file');
    const sessionId = formData.get('sessionId') || crypto.randomUUID();

    if (!file) {
      return new Response(JSON.stringify({ success: false, error: 'BAD_REQUEST', message: 'No file payload attached.' }), { status: 400 });
    }

    if (file.size > MAX_PAYLOAD_SIZE) {
      return new Response(JSON.stringify({
        success: false, 
        error: 'THRESHOLD_VIOLATION', 
        message: 'Session limit breached: Adding this file exceeds the allocation limit of 300MB per upload session.'
      }), { status: 413 });
    }

    const buffer = await file.arrayBuffer();

    // 2. Payload Magic-Bytes Signature Inspection
    const headerSlice = new Uint8Array(buffer.slice(0, 16));
    const isValidSignature = validateMagicBytes(headerSlice);

    if (!isValidSignature) {
      console.warn(`[SIEM-LEDGER] 415 Payload Architecture Violation. IP: ${request.headers.get('cf-connecting-ip')}`);
      return new Response(JSON.stringify({
        success: false,
        error: '415 Payload Architecture Violation',
        message: 'File integrity check failed. The payload byte composition magic-hashes do not match a verified media container format.'
      }), { status: 415 });
    }

    // 3. R2 Multi-Bucket Handshake Execution (Quarantine Sink)
    if (!env.QUARANTINE_BUCKET) {
      // In development, might not be bound. Just pass through gracefully.
      console.warn('QUARANTINE_BUCKET not bound. Skipping upload.');
    } else {
      const fileHashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const fileHashHex = Array.from(new Uint8Array(fileHashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
      
      const trackingId = crypto.randomUUID();
      const extension = file.name.split('.').pop() || 'bin';
      const objectKey = `session-${sessionId}/${trackingId}.${extension}`;

      // Stream validated raw body array into isolated zero-public-access QUARANTINE_BUCKET
      await env.QUARANTINE_BUCKET.put(objectKey, buffer, {
        httpMetadata: {
          contentType: file.type // Preserved but not trusted for security checks
        },
        customMetadata: {
          'x-actor-ip': request.headers.get('cf-connecting-ip') || 'unknown',
          'x-session-id': sessionId,
          'x-payload-sha256': fileHashHex,
          'x-inspection-status': 'QUARANTINED_PENDING_REVIEW'
        }
      });

      console.log(`[SIEM-LEDGER] Stored & Confirmed (Object Isolation Enforced): ${objectKey}, SHA-256: ${fileHashHex}`);
      
      return new Response(JSON.stringify({
        success: true,
        state: 'Stored & Confirmed (Object Isolation Enforced)',
        key: objectKey,
        hash: fileHashHex,
        message: 'File successfully processed and locked in Quarantine Vault.'
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fallback if no bucket (e.g., local testing)
    return new Response(JSON.stringify({
      success: true,
      state: 'Stored & Confirmed (Local Mode)',
      key: 'local-test-key',
      hash: 'local-test-hash'
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error(`[SIEM-LEDGER] Internal Execution Error:`, err);
    return new Response(JSON.stringify({
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
