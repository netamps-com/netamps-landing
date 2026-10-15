import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { requireAuth } from '../middleware/requireAuth';
import { trackingIdOf } from '../middleware/requestId';
import { decodeUtf8Strict, scanEicar, scanExecutableMagic } from '../lib/uploadScan';

const router = Router();
const MAX_BYTES = 300 * 1024 * 1024; // 300 MB (spec §3)
const MAX_ROWS = 10000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
});

const ALLOWED_EXT = new Set(['csv', 'json', 'xlsx']);
const ALLOWED_MIME = new Set([
  'text/csv', 'application/csv', 'text/plain',
  'application/json',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

/**
 * POST /api/v1/import — secure ingestion (spec §3).
 * Order: size → extension/MIME → magic (XLSX PK) → UTF-8 strict → EICAR/exe scan.
 * Responds with parsed columns/rows preview (capped) + SHA-256. Nothing persisted.
 */
router.post('/', requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ status: 400, error: 'Multipart field "file" is required.', tracking_id: trackingIdOf(req) });
      return;
    }
    const ext = (file.originalname.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXT.has(ext) || (file.mimetype && !ALLOWED_MIME.has(file.mimetype.toLowerCase()))) {
      res.status(415).json({ status: 415, error: 'Only .csv, .json, .xlsx files are accepted.', tracking_id: trackingIdOf(req) });
      return;
    }
    const bytes = new Uint8Array(file.buffer.buffer, file.buffer.byteOffset, file.buffer.byteLength);

    if (ext === 'xlsx') {
      const sig = scanExecutableMagic(bytes.slice(0, 8));
      if (!sig.clean) {
        res.status(403).json({ status: 403, error: 'Upload blocked: malicious signature detected.', tracking_id: trackingIdOf(req) });
        return;
      }
      const pk = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
      if (!pk) {
        res.status(415).json({ status: 415, error: 'File signature is not a valid OOXML workbook.', tracking_id: trackingIdOf(req) });
        return;
      }
      const wb = XLSX.read(Buffer.from(bytes), { type: 'buffer', dense: true });
      const sheet = wb.SheetNames[0];
      if (!sheet) {
        res.status(400).json({ status: 400, error: 'Workbook has no sheets.', tracking_id: trackingIdOf(req) });
        return;
      }
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheet], { defval: null });
      const capped = rows.slice(0, MAX_ROWS);
      res.json({
        status: 200,
        data: {
          columns: capped.length > 0 ? Object.keys(capped[0]) : [],
          rows: capped,
          truncated: rows.length > MAX_ROWS,
          sha256: await sha256Hex(bytes),
        },
      });
      return;
    }

    let text: string;
    try {
      text = decodeUtf8Strict(bytes);
    } catch {
      res.status(415).json({ status: 415, error: 'File is not valid UTF-8 text.', tracking_id: trackingIdOf(req) });
      return;
    }
    const exe = scanExecutableMagic(bytes.slice(0, 64));
    const eicar = scanEicar(bytes);
    if (!exe.clean || !eicar.clean) {
      res.status(403).json({ status: 403, error: 'Upload blocked: malicious signature detected.', tracking_id: trackingIdOf(req) });
      return;
    }

    if (ext === 'json') {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        res.status(400).json({ status: 400, error: 'Invalid JSON payload.', tracking_id: trackingIdOf(req) });
        return;
      }
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      const capped = arr.slice(0, MAX_ROWS) as Record<string, unknown>[];
      res.json({
        status: 200,
        data: {
          columns: capped.length > 0 ? Object.keys(capped[0]) : [],
          rows: capped,
          truncated: arr.length > MAX_ROWS,
          sha256: await sha256Hex(bytes),
        },
      });
      return;
    }

    // CSV — header + rows (handles quoted commas via minimal state machine)
    const rows = parseCsv(text, MAX_ROWS);
    res.json({
      status: 200,
      data: { columns: rows.columns, rows: rows.data, truncated: rows.truncated, sha256: await sha256Hex(bytes) },
    });
  } catch (err) {
    next(err);
  }
});

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(bytes).digest('hex');
}

/** CSV parser honoring double-quoted fields (RFC 4180 subset). */
export function parseCsv(text: string, maxRows: number): { columns: string[]; data: Record<string, string>[]; truncated: boolean } {
  const rows: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  const push = (): void => {
    record.push(field);
    field = '';
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      push();
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      push();
      if (record.length > 1 || record[0] !== '') rows.push(record);
      record = [];
      if (rows.length > maxRows) return { columns: [], data: [], truncated: true };
    } else {
      field += c;
    }
  }
  push();
  if (record.length > 1 || record[0] !== '') rows.push(record);
  if (rows.length === 0) return { columns: [], data: [], truncated: false };
  const columns = rows[0].map((h) => h.trim());
  const data = rows.slice(1, maxRows + 1).map((r) => {
    const obj: Record<string, string> = {};
    columns.forEach((h, idx) => {
      obj[h] = (r[idx] ?? '').trim();
    });
    return obj;
  });
  return { columns, data, truncated: rows.length - 1 > maxRows };
}

export default router;
