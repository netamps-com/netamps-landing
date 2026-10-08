import { verifySession } from './auth';

const MAX_PAYLOAD_SIZE = 10 * 1024 * 1024; // 10 MB

function validateMagicBytes(headerArray) {
  if (headerArray.length < 4) return false;
  const hex = Array.from(headerArray).map(b => b.toString(16).padStart(2, '0')).join('');
  // PK Zip (OOXML XLSX)
  if (hex.startsWith('504b0304')) return true;
  return false;
}

export async function onRequestPost({ request, env }) {
  try {
    const user = await verifySession(env, request);
    if (!user) {
      return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), { status: 401 });
    }

    // Rate-limit check
    if (env.DB) {
      try {
        const ip = request.headers.get('cf-connecting-ip') || 'unknown';
        const { results } = await env.DB.prepare(
          "SELECT count(*) as c FROM audit_logs WHERE actor_ip = ? AND action = 'UPLOAD' AND created_at > datetime('now', '-1 minute')"
        ).bind(ip).all();
        if (results.length > 0 && results[0].c > 5) {
          return new Response(JSON.stringify({ success: false, message: '429 Too Many Requests' }), { status: 429 });
        }
      } catch(e) {}
    }

    const formData = await request.formData();
    const file = formData.get('file');
    
    if (!file) return new Response(JSON.stringify({ success: false, message: 'No file payload' }), { status: 400 });
    if (file.size > MAX_PAYLOAD_SIZE) return new Response(JSON.stringify({ success: false, message: 'Exceeds 10MB limit' }), { status: 413 });

    const allowedMimes = ['text/csv', 'application/json', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    const allowedExtensions = ['csv', 'json', 'xlsx'];
    const extension = (file.name.split('.').pop() || '').toLowerCase();
    
    if (!allowedMimes.includes(file.type) || !allowedExtensions.includes(extension)) {
      return new Response(JSON.stringify({ success: false, message: '415 Unsupported Media Type' }), { status: 415 });
    }

    const buffer = await file.arrayBuffer();
    const fileHashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const fileHashHex = Array.from(new Uint8Array(fileHashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    const textDecoder = new TextDecoder('utf-8', { fatal: true });
    let fileText = '';
    
    if (extension !== 'xlsx') {
      try {
        fileText = textDecoder.decode(buffer);
        // Strip BOM
        if (fileText.charCodeAt(0) === 0xFEFF) {
          fileText = fileText.slice(1);
        }
      } catch (err) {
        return new Response(JSON.stringify({ success: false, message: '415 Invalid UTF-8 Encoding' }), { status: 415 });
      }

      if (fileText.includes('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*')) {
        return new Response(JSON.stringify({ success: false, message: '403 Forbidden: EICAR' }), { status: 403 });
      }
    } else {
      // For XLSX, check magic bytes
      const headerSlice = new Uint8Array(buffer.slice(0, 4));
      if (!validateMagicBytes(headerSlice)) {
        return new Response(JSON.stringify({ success: false, message: '415 Payload Architecture Violation' }), { status: 415 });
      }
    }

    let columns = [];
    let rows = [];
    let warnings = [];

    if (extension === 'json') {
      try {
        const json = JSON.parse(fileText);
        const data = Array.isArray(json) ? json : [json];
        if (data.length > 0) columns = Object.keys(data[0]);
        rows = data.slice(0, 10000);
        if (data.length > 10000) warnings.push('Row cap of 10k reached');
      } catch (err) {
        return new Response(JSON.stringify({ success: false, message: 'Invalid JSON' }), { status: 400 });
      }
    } else if (extension === 'csv') {
      const lines = fileText.split('\n').filter(l => l.trim().length > 0);
      if (lines.length > 0) {
        columns = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const maxRows = Math.min(lines.length - 1, 10000);
        for (let i = 1; i <= maxRows; i++) {
          const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
          let obj = {};
          columns.forEach((h, idx) => { obj[h] = values[idx]; });
          rows.push(obj);
        }
        if (lines.length - 1 > 10000) warnings.push('Row cap of 10k reached');
      }
    } else if (extension === 'xlsx') {
      warnings.push('XLSX uploaded securely. Must be parsed by frontend SheetJS.');
    }

    // SIEM Logging
    try {
      await env.DB.prepare(
        'INSERT INTO audit_logs (id, actor_ip, actor_email, action, resource_id, details) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(
        crypto.randomUUID(), 
        request.headers.get('cf-connecting-ip') || 'unknown',
        user.email,
        'UPLOAD',
        fileHashHex,
        JSON.stringify({ filename: file.name, size: file.size, extension, verdict: 'CLEAN' })
      ).run();
    } catch (e) {}

    return new Response(JSON.stringify({
      success: true,
      columns,
      rows,
      sha256: fileHashHex,
      warnings
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500 });
  }
}
