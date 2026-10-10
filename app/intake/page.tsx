'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, UploadCloud, FileJson, CheckCircle, AlertTriangle, Play, Database, FileSpreadsheet, Send, Activity, ListChecks, ChevronDown, ChevronUp, Clock, Package, Download, XCircle } from 'lucide-react';
import NetampsLogo from '../NetampsLogo';
import { moneyStringToPaise, formatPaise } from '../lib/money';

// ── Schema-gated ingestion contract (ALL / PARTIAL / INSUFFICIENT) ──
// Headers are normalized (trim, lowercase, BOM stripped) before matching.
// Extra unknown columns are ignored, never rejected.
const MAX_IMPORT_ROWS = 10000;
const MAX_FILE_BYTES = 300 * 1024 * 1024; // 300 MB
const EMAIL_RE_INGEST = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SchemaField {
  key: string;
  label: string;
  required: boolean;
}

const SCHEMA_FIELDS: SchemaField[] = [
  { key: 'intent', label: 'Intent (sell/buy)', required: true },
  { key: 'name', label: 'Client Name', required: true },
  { key: 'company', label: 'Company', required: true },
  { key: 'email', label: 'Email', required: true },
  { key: 'phone', label: 'Phone', required: true },
  { key: 'category', label: 'Product Name', required: true },
  { key: 'details', label: 'Model Number', required: true },
  { key: 'quantity', label: 'Quantity', required: true },
  { key: 'strategicTarget', label: 'Strategic Recovery Target', required: false },
  { key: 'lifecycleAge', label: 'Hardware Lifecycle Batch Age', required: false },
];

const REQUIRED_SCHEMA_KEYS = SCHEMA_FIELDS.filter((f) => f.required).map((f) => f.key);

// ── Header normalization: strip BOM, trim, lowercase ──
const normalizeHeader = (h: string): string => h.replace(/^\uFEFF/, '').trim().toLowerCase();

// ── Column mapper: exact match first (key or label); substring only as flagged fuzzy fallback ──
// Fixes: 'surname' no longer matches 'name', 'microphone' no longer matches 'phone'.
function autoMapColumns(headers: string[]): { mapping: Record<string, string>; fuzzy: Record<string, boolean>; matchedKeys: string[] } {
  const norm = headers.map(normalizeHeader);
  const mapping: Record<string, string> = {};
  const fuzzy: Record<string, boolean> = {};
  const matchedKeys: string[] = [];
  const usedIndices = new Set<number>();

  for (const field of SCHEMA_FIELDS) {
    const keysToTry = [field.key.toLowerCase(), field.label.toLowerCase()];
    let found = -1;

    // Exact match first
    for (const k of keysToTry) {
      found = norm.findIndex((n, i) => !usedIndices.has(i) && n === k);
      if (found !== -1) break;
    }

    if (found !== -1) {
      mapping[field.key] = headers[found];
      matchedKeys.push(field.key);
      usedIndices.add(found);
    } else {
      // Substring fallback — only if header contains the full key (not the reverse)
      const sub = norm.findIndex((n, i) => !usedIndices.has(i) && keysToTry.some((k) => n.includes(k)));
      if (sub !== -1) {
        mapping[field.key] = headers[sub];
        fuzzy[field.key] = true;
        matchedKeys.push(field.key);
        usedIndices.add(sub);
      }
    }
  }
  return { mapping, fuzzy, matchedKeys };
}

// ── Tier classification ──
// email is the only contact key the OTP/tracking chain can act on — without it the record
// is unreachable dead data. Product signal is the only substance gate. Three total prevents
// single-column junk from entering the pipeline.
function classifySchema(matchedKeys: string[]): { tier: 'all' | 'partial' | 'insufficient'; missing: string[] } {
  const missing = REQUIRED_SCHEMA_KEYS.filter((k) => !matchedKeys.includes(k));
  if (missing.length === 0) return { tier: 'all', missing };
  const hasEmail = matchedKeys.includes('email');
  const hasProductSignal = ['category', 'details', 'quantity'].some((k) => matchedKeys.includes(k));
  if (hasEmail && hasProductSignal && matchedKeys.length >= 3) return { tier: 'partial', missing };
  return { tier: 'insufficient', missing };
}

// ── Row-level validation (first 50 rows spot-checked on ingest; all rows on commit) ──
function validateImportRow(row: Record<string, string>): string[] {
  const reasons: string[] = [];
  const email = (row.email || '').trim();
  if (email === '') reasons.push('missing email');
  else if (!EMAIL_RE_INGEST.test(email)) reasons.push(`invalid email "${row.email}"`);
  // Strict integer gate: /^\d+$/ else flagged, never coerced
  const qty = (row.quantity || '').trim();
  if (qty === '') reasons.push('missing quantity');
  else if (!/^\d+$/.test(qty)) reasons.push(`quantity "${row.quantity}" is not a positive integer`);
  else if (parseInt(qty, 10) === 0) reasons.push('quantity is zero');
  const intent = (row.intent || '').trim();
  if (intent !== '' && !/^(sell|buy)$/i.test(intent)) reasons.push(`intent "${row.intent}" must be sell or buy`);
  const hasProduct = (row.category || '').trim() || (row.details || '').trim() || (row.quantity || '').trim();
  if (!hasProduct) reasons.push('no product substance (category/details/quantity all empty)');
  return reasons;
}

function missingLabel(key: string): string {
  return SCHEMA_FIELDS.find((f) => f.key === key)?.label || key;
}

// ── XLSX template generator ──
// Sheet 1 "Requests": header row with 10 canonical columns + one valid SELL
// example in row 2. Row 2 is the flagged EXAMPLE (README line 2 + UI copy
// say so); it is kept valid so re-uploading the template passes validation
// (round-trip proof). Sheet 2 "README": instructions.
// No styling claims — SheetJS Community supports values, widths, and frozen panes only.
async function downloadIntakeTemplate(): Promise<void> {
  const XLSX = await import('xlsx');
  const headers = SCHEMA_FIELDS.map((f) => f.label);
  const example = [
    'sell',
    'Priya Sharma',
    'Acme Technologies Pvt. Ltd.',
    'procurement@example.com',
    '+91 98765 43210',
    'Laptops',
    'Latitude 7420',
    '25',
    'resale',
    'Current Generation (1-3 Years)',
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 6, 20) }));
  // Freeze header row (SheetJS freeze-pane form)
  ws['!freeze'] = { xSplit: '0', ySplit: '1', topLeft: 'A2', activePane: 'bottomRight', state: 'frozen' };
  XLSX.utils.book_append_sheet(wb, ws, 'Requests');

  const readme = XLSX.utils.aoa_to_sheet([
    ['Netamps Intake Template — Instructions'],
    ['1. Row 2 is an EXAMPLE row — delete it before importing, or overwrite it with your first record.'],
    ['2. Keep the header row exact (letter case does not matter). Required: Intent, Client Name, Company, Email, Phone, Product Name, Model Number, Quantity.'],
    ['3. Intent must be "sell" or "buy". Quantity must be a positive whole number.'],
    ['4. Limits: 300 MB file, 10,000 rows. Larger datasets: split across files.'],
    ['5. Re-upload the finished file here to validate and preview before committing.'],
  ]);
  readme['!cols'] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, readme, 'README');

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `netamps-intake-template-${stamp}.xlsx`);
}

// ── Duplicate header detector ──
function findDuplicateHeaders(headers: string[]): string[] {
  const norm = headers.map(normalizeHeader);
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const h of norm) {
    if (seen.has(h) && !dupes.includes(h)) dupes.push(h);
    seen.add(h);
  }
  return dupes;
}

// ── Delimiter sniffer for CSV ──
function sniffDelimiter(firstLine: string): string {
  const commas = (firstLine.match(/,/g) || []).length;
  const semicolons = (firstLine.match(/;/g) || []).length;
  return semicolons > commas ? ';' : ',';
}

// ── Ragged-row stats from a header:1 2-D array ──
// Short rows are padded by the object parser; long-row extras are ignored.
// Returns counts so callers can reject when >5% of data rows are ragged.
function raggedStats(aoa: any[][]): { ragged: number; total: number } {
  if (aoa.length <= 1) return { ragged: 0, total: 0 };
  const headerLen = (aoa[0] || []).length;
  let ragged = 0;
  for (let i = 1; i < aoa.length; i++) {
    const row = aoa[i] || [];
    // Ignore fully-empty trailing rows (common in hand-edited workbooks)
    if (row.every((c) => String(c ?? '').trim() === '')) continue;
    if (row.length !== headerLen) ragged++;
  }
  return { ragged, total: aoa.length - 1 };
}

// ── Operator identity: user_role cookie (dashboard convention), never hardcoded ──
function getOperator(): string {
  if (typeof document === 'undefined') return 'Anonymous';
  const m = document.cookie.split(';').map((c) => c.trim().split('='));
  for (const [name, value] of m) {
    if (name === 'user_role' && value) return decodeURIComponent(value);
  }
  return 'Anonymous';
}

// ── Persist auto-ingest jobs to localStorage (survives refresh) ──
const STORAGE_KEY_JOBS = 'netamps_intake_jobs';

function loadPersistedJobs(): any[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_JOBS) || '[]');
  } catch { return []; }
}

function persistJobs(jobs: any[]): void {
  if (typeof window === 'undefined') return;
  try {
    // Keep last 200 jobs max
    const capped = jobs.slice(0, 200);
    localStorage.setItem(STORAGE_KEY_JOBS, JSON.stringify(capped));
  } catch { /* quota exceeded — degrade silently */ }
}

// ── Schema validation result type for UI ──
interface SchemaValidationResult {
  tier: 'all' | 'partial' | 'insufficient';
  missing: string[];
  rowErrors: Array<{ rowIndex: number; reasons: string[] }>;
  totalRows: number;
  validRows: number;
  fuzzyMappings: Record<string, boolean>;
  duplicateHeaders: string[];
  delimiter?: string;
  sheetName?: string;
}


export default function IntakeWorkbench() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'manual' | 'auto' | 'matching'>('manual');

  // Manual Ingestion State
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState('');
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [previewData, setPreviewData] = useState<any[]>([]);

  // Schema validation state (inline error panel)
  const [validationResult, setValidationResult] = useState<SchemaValidationResult | null>(null);
  // Commit scope: when row-level issues exist, exclude flagged rows by default.
  // Unchecking requires explicit confirmation at commit time.
  const [excludeInvalidRows, setExcludeInvalidRows] = useState(true);

  // Auto Ingestion State — initialized from localStorage
  const [autoJobs, setAutoJobs] = useState<any[]>([]);

  // Matching Engine State
  const [stockMatches, setStockMatches] = useState<any[]>([]);
  const [unmatchedOrders, setUnmatchedOrders] = useState<any[]>([]);
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);

  // Target schema — kept for generateAutoPreview compatibility
  const targetSchema = SCHEMA_FIELDS;

  // Ask total for an intake-side order (same null semantics as dashboard).
  const askTotalOfOrder = (order: any): number | null => {
    if (order.pricingBasis === 'lot') return order.lotConsiderationPaise ?? null;
    const lines = (order.products || []).map((p: any) => p.lineConsiderationPaise ?? null);
    if (lines.every((v: any) => v === null || v === undefined)) return null;
    return lines.reduce((a: number, v: any) => a + (v ?? 0), 0);
  };

  // Load persisted jobs on mount
  useEffect(() => {
    setAutoJobs(loadPersistedJobs());
  }, []);

  // Persist jobs whenever they change
  useEffect(() => {
    if (autoJobs.length > 0) persistJobs(autoJobs);
  }, [autoJobs]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
        const res = await fetch(`${API_URL}/api/intake/sessions`, { credentials: 'same-origin' });
        if (cancelled) return;
        if (res.status === 401 || res.status === 403) {
          router.push('/login');
          return;
        }
        setIsAuthenticated(true);
      } catch {
        if (!cancelled) router.push('/login');
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  useEffect(() => {
    if (activeTab === 'matching') {
      fetchMatches();
    }
  }, [activeTab]);

  const fetchMatches = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${API_URL}/api/returns`);
      const data = await res.json();
      if (data.success) {
        const returns = data.returns;
        const buyReqs = returns.filter((r: any) => r.intent?.toLowerCase() === 'buy');
        const sellReqs = returns.filter((r: any) => r.intent?.toLowerCase() === 'sell');

        const matches: any[] = [];
        const unmatchedBuy = [...buyReqs];
        const unmatchedSell = [...sellReqs];

        buyReqs.forEach((buy: any) => {
           const bProd = buy.products?.[0];
           if (!bProd) return;
           const bName = bProd.category?.trim().toUpperCase();
           const bModel = bProd.details?.trim().toUpperCase();

           if (!bName || !bModel) return;

           const sellIndex = unmatchedSell.findIndex(sell => {
             const sProd = sell.products?.[0];
             if (!sProd) return false;
             return sProd.category?.trim().toUpperCase() === bName && sProd.details?.trim().toUpperCase() === bModel;
           });

           if (sellIndex !== -1) {
             const matchedSell = unmatchedSell.splice(sellIndex, 1)[0];
             matches.push({
               id: `match-${buy.id}-${matchedSell.id}`,
               buyer: buy,
               seller: matchedSell,
               productName: bProd.category,
               modelNumber: bProd.details,
               buyerQty: bProd.quantity || 1,
               sellerQty: matchedSell.products?.[0]?.quantity || 1,
               timestamp: new Date().toISOString()
             });
             const bIdx = unmatchedBuy.findIndex(b => b.id === buy.id);
             if (bIdx !== -1) unmatchedBuy.splice(bIdx, 1);
           }
        });

        setStockMatches(matches);
        setUnmatchedOrders([...unmatchedBuy, ...unmatchedSell]);
      }
    } catch(err) {
      console.error("Error fetching matches", err);
    }
  };

  const generateAutoPreview = (rows: any[], localMapping: Record<string, string>) => {
    const grouped = new Map<string, any>();
    rows.forEach((row, idx) => {
      const rowData: Record<string, string> = {};
      targetSchema.forEach(schema => {
        const sourceCol = localMapping[schema.key];
        rowData[schema.key] = sourceCol ? row[sourceCol] : '';
      });

      const key = `${rowData.email}-${rowData.intent}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          id: `req-auto-${Date.now().toString(36)}-${idx}`,
          intent: rowData.intent || 'sell',
          name: rowData.name || 'Unknown',
          company: rowData.company || 'Unknown',
          email: rowData.email || 'unknown@example.com',
          phone: rowData.phone || 'N/A',
          products: [],
          attachedFiles: [],
          pricingBasis: 'per_product',
          lotConsiderationPaise: null,
          date: new Date().toISOString(),
          status: 'Pending Review'
        });
      }

      const req = grouped.get(key);
      if (rowData.category || rowData.details || rowData.quantity) {
        // Strict integer gate: /^\d+$/ and >0 pass; anything else is recorded
        // as invalid and never coerced to 1 (commit-valid-only excludes it).
        const qtyStr = (rowData.quantity || '').trim();
        const qtyValid = /^\d+$/.test(qtyStr) && parseInt(qtyStr, 10) > 0;
        const qty = qtyValid ? parseInt(qtyStr, 10) : 0;
        req.products.push({
          id: `prod-auto-${Date.now().toString(36)}-${idx}`,
          category: rowData.category || 'other',
          details: rowData.details || 'No details provided',
          quantity: qty,
          quantityRaw: rowData.quantity || '',
          quantityInvalid: !qtyValid,
          strategicTarget: rowData.strategicTarget || '',
          lifecycleAge: rowData.lifecycleAge || '',
          lineConsiderationPaise: rowData.lineConsideration ? moneyStringToPaise(String(rowData.lineConsideration)) : null,
          basePricePaise: rowData.basePrice ? moneyStringToPaise(String(rowData.basePrice)) : null
        });
      }
      if (rowData.lotConsideration && String(rowData.lotConsideration).trim() !== '' && (req.lotConsiderationPaise === null || req.lotConsiderationPaise === undefined)) {
        const lot = moneyStringToPaise(String(rowData.lotConsideration));
        if (lot !== null) {
          req.pricingBasis = 'lot';
          req.lotConsiderationPaise = lot;
        }
      }
    });
    for (const req of grouped.values()) {
      if (req.pricingBasis === 'lot') {
        req.products.forEach((p: any) => { p.lineConsiderationPaise = null; });
      }
    }
    return Array.from(grouped.values());
  };

  const handleAutoIngestion = (content: string, cols: string[], rows: any[], fileName: string, size: number) => {
    const jobId = `auto-${Date.now().toString(36)}`;
    const newJob = { id: jobId, fileName, size, status: 'Mapping', timestamp: new Date().toISOString() };
    setAutoJobs(prev => [newJob, ...prev]);
    setActiveTab('auto');

    setTimeout(async () => {
       const { mapping: localMapping } = autoMapColumns(cols);

       const autoPreview = generateAutoPreview(rows, localMapping);
       
       setAutoJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'Committing' } : j));
       
       try {
         const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
         const res = await fetch(`${API_URL}/api/intake/sessions`, {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({
             id: jobId,
             status: 'PROCESSED',
             data: { mapping: localMapping, rows: autoPreview }
           })
         });
         const data = await res.json();
         if (!data.success) throw new Error(data.message);
         
         for (const req of autoPreview) {
            await fetch(`${API_URL}/api/returns`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(req)
            });
         }
         setAutoJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'Done' } : j));
       } catch (err: any) {
         setAutoJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: `Failed: ${err.message}` } : j));
       }
    }, 500);
  };

  // ── Core file upload handler: SheetJS-backed, schema-gated ──
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset previous state
    setErrorMsg('');
    setValidationResult(null);

    // File-type scope: only .json/.csv/.xlsx enter this pipeline
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!['json', 'csv', 'xlsx'].includes(ext)) {
      setErrorMsg(`Unsupported format ".${ext}". Only CSV, JSON, or XLSX files are accepted.`);
      return;
    }

    // Size cap (exists)
    if (file.size > MAX_FILE_BYTES) {
      setErrorMsg('File exceeds 300 MB limit.');
      return;
    }

    setRawFile(file);

    try {
      let cols: string[] = [];
      let rows: any[] = [];
      let detectedDelimiter: string | undefined;
      let detectedSheet: string | undefined;

      // Shared INSUFFICIENT rejection: inline panel + monitor (persisted) +
      // audit log + template auto-download. Rejected files commit nothing.
      // Deliberately not a request-table row: a failed file has no
      // intent/name/email, so the audit channel (not request semantics) is
      // the correct surface.
      const rejectInsufficient = async (
        reason: string,
        rejectCols: string[],
        extra: Partial<SchemaValidationResult> = {}
      ) => {
        const { fuzzy: rf, matchedKeys: rmk } = autoMapColumns(rejectCols);
        const { missing: rmiss } = classifySchema(rmk);
        const result: SchemaValidationResult = {
          tier: 'insufficient',
          missing: rmiss,
          rowErrors: [],
          totalRows: extra.totalRows ?? 0,
          validRows: 0,
          fuzzyMappings: rf,
          duplicateHeaders: extra.duplicateHeaders ?? [],
          delimiter: extra.delimiter,
          sheetName: extra.sheetName,
        };
        setValidationResult(result);
        setExcludeInvalidRows(true);
        setAutoJobs((prev) => [
          { id: `fail-${Date.now().toString(36)}`, fileName: file.name, size: file.size, status: `Failed: ${reason}`, timestamp: new Date().toISOString() },
          ...prev,
        ]);
        try {
          const { logEvent } = await import('../lib/logger');
          logEvent('INTAKE_FILE_REJECTED', 'Intake Workbench', `${file.name}: ${reason}; ${rmk.length} of ${REQUIRED_SCHEMA_KEYS.length} columns`, getOperator());
        } catch { /* logger load failure non-fatal */ }
        try { await downloadIntakeTemplate(); } catch { /* blocked by popup blocker — button is the guarantee */ }
      };

      if (ext === 'xlsx') {
        // ── XLSX path: SheetJS reads binary workbooks ──
        const XLSX = await import('xlsx');
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        // First non-empty sheet wins; empty sheets skipped (name shown in UI)
        let sheetData: any[] = [];
        let sheetAoa: any[][] = [];
        for (const name of wb.SheetNames) {
          const ws = wb.Sheets[name];
          if (!ws) continue;
          const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '', raw: false });
          const hasData = aoa.length > 1 && aoa.slice(1).some((r) => (r || []).some((c) => String(c ?? '').trim() !== ''));
          if (hasData) {
            sheetAoa = aoa;
            sheetData = XLSX.utils.sheet_to_json<any>(ws, { defval: '', raw: false });
            detectedSheet = name;
            break;
          }
        }
        if (sheetData.length === 0) {
          await rejectInsufficient('zero data rows (all sheets empty)', [], { totalRows: 0, sheetName: detectedSheet });
          return;
        }
        cols = Object.keys(sheetData[0]);
        rows = sheetData;
        const { ragged, total } = raggedStats(sheetAoa);
        if (total > 0 && ragged / total > 0.05) {
          await rejectInsufficient(`ragged rows: ${ragged} of ${total} data rows have a field count different from the header`, cols, { totalRows: rows.length, sheetName: detectedSheet });
          return;
        }

      } else if (ext === 'csv') {
        // ── CSV path: SheetJS handles quoting, delimiter sniffing ──
        const text = await file.text();
        setRawText(text);
        const firstLine = text.split('\n')[0] || '';
        detectedDelimiter = sniffDelimiter(firstLine);
        // Pre-parse row cap: count lines before SheetJS materializes DOM rows
        const approxLines = (text.match(/\n/g) || []).length + 1;
        if (approxLines - 1 > MAX_IMPORT_ROWS) {
          setErrorMsg(`File contains more than ${MAX_IMPORT_ROWS.toLocaleString()} data rows, exceeding the row cap. Split into smaller files.`);
          return;
        }

        const XLSX = await import('xlsx');
        const wb = XLSX.read(text, { type: 'string', FS: detectedDelimiter });
        const ws = wb.Sheets[wb.SheetNames[0]];
        if (!ws) {
          await rejectInsufficient('unparseable CSV (no data found)', [], { totalRows: 0, delimiter: detectedDelimiter });
          return;
        }
        const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '', raw: false });
        if (aoa.length <= 1) {
          await rejectInsufficient('zero data rows (header only)', aoa.length === 1 ? (aoa[0] as string[]) : [], { totalRows: 0, delimiter: detectedDelimiter });
          return;
        }
        const d = XLSX.utils.sheet_to_json<any>(ws, { defval: '', raw: false });
        if (d.length === 0) {
          await rejectInsufficient('zero data rows (header only)', (aoa[0] as string[]) || [], { totalRows: 0, delimiter: detectedDelimiter });
          return;
        }
        cols = Object.keys(d[0]);
        rows = d;
        const { ragged, total } = raggedStats(aoa);
        if (total > 0 && ragged / total > 0.05) {
          await rejectInsufficient(`ragged rows: ${ragged} of ${total} data rows have a field count different from the header`, cols, { totalRows: rows.length, delimiter: detectedDelimiter });
          return;
        }

      } else {
        // ── JSON path: array-of-objects, {data|rows|items} wrapper, or single object ──
        const text = await file.text();
        setRawText(text);
        const json = JSON.parse(text);
        const raw = Array.isArray(json)
          ? json
          : Array.isArray((json as any)?.data) ? (json as any).data
          : Array.isArray((json as any)?.rows) ? (json as any).rows
          : Array.isArray((json as any)?.items) ? (json as any).items
          : [json];
        if (raw.length === 0) {
          await rejectInsufficient('zero data rows (empty array)', [], { totalRows: 0 });
          return;
        }
        if (typeof raw[0] !== 'object' || raw[0] === null) {
          await rejectInsufficient('unparseable JSON (expected an array of objects)', [], { totalRows: 0 });
          return;
        }
        // Union of keys across all rows (heterogeneous objects must not lose columns)
        const seen = new Set<string>();
        for (const r of raw) {
          if (typeof r !== 'object' || r === null) continue;
          for (const k of Object.keys(r)) {
            if (!seen.has(k)) seen.add(k);
          }
        }
        cols = [...seen];
        rows = raw;
      }

      // ── Post-parse guards ──

      // 10,000-row cap (XLSX/JSON cannot pre-count cheaply; CSV already pre-checked)
      if (rows.length > MAX_IMPORT_ROWS) {
        setErrorMsg(`File contains ${rows.length.toLocaleString()} rows, exceeding the ${MAX_IMPORT_ROWS.toLocaleString()}-row cap. Split into smaller files.`);
        return;
      }

      // Duplicate header detection → INSUFFICIENT (monitor + audit + template)
      const dupes = findDuplicateHeaders(cols);
      if (dupes.length > 0) {
        await rejectInsufficient(`duplicate column headers: "${dupes.join('", "')}"`, cols, { totalRows: rows.length, duplicateHeaders: dupes, delimiter: detectedDelimiter, sheetName: detectedSheet });
        return;
      }

      // ── Schema gate ──
      const { mapping: autoMapping, fuzzy, matchedKeys } = autoMapColumns(cols);
      const { tier, missing } = classifySchema(matchedKeys);

      // Row-level spot check (first 50 rows)
      const spotCheckRows = rows.slice(0, 50);
      const rowErrors: Array<{ rowIndex: number; reasons: string[] }> = [];
      spotCheckRows.forEach((row, idx) => {
        const mapped: Record<string, string> = {};
        for (const field of SCHEMA_FIELDS) {
          const srcCol = autoMapping[field.key];
          mapped[field.key] = srcCol ? String(row[srcCol] ?? '') : '';
        }
        const reasons = validateImportRow(mapped);
        if (reasons.length > 0) rowErrors.push({ rowIndex: idx + 2, reasons }); // +2 for 1-indexed + header
      });

      const result: SchemaValidationResult = {
        tier,
        missing,
        rowErrors,
        totalRows: rows.length,
        validRows: rows.length - rowErrors.length,
        fuzzyMappings: fuzzy,
        duplicateHeaders: dupes,
        delimiter: detectedDelimiter,
        sheetName: detectedSheet,
      };

      // ── Tracking ID auto-route (existing behavior, untouched) ──
      const hasTrackingId = cols.some(c => normalizeHeader(c).includes('tracking') && normalizeHeader(c).includes('id'));
      if (hasTrackingId && tier !== 'insufficient') {
        handleAutoIngestion('', cols, rows, file.name, file.size);
        return;
      }

      // ── INSUFFICIENT tier: reject, show inline error, log, offer template ──
      // Atomicity: nothing is committed — no columns/rows stored, no preview.
      if (tier === 'insufficient') {
        const reason = `missing ${missing.map(missingLabel).join(', ')}; found ${matchedKeys.length} of ${REQUIRED_SCHEMA_KEYS.length} required columns`;
        setValidationResult(result);
        setExcludeInvalidRows(true);

        // Capture to auto-ingest monitor (persisted across refresh)
        const failedJob = {
          id: `fail-${Date.now().toString(36)}`,
          fileName: file.name,
          size: file.size,
          status: `Failed: ${reason}`,
          timestamp: new Date().toISOString()
        };
        setAutoJobs(prev => [failedJob, ...prev]);

        // Audit log (visible in admin Log Viewer, searchable, exportable).
        // Deliberately not a request-table row (see rejectInsufficient above).
        try {
          const { logEvent } = await import('../lib/logger');
          logEvent(
            'INTAKE_FILE_REJECTED',
            'Intake Workbench',
            `${file.name}: ${reason}; ${matchedKeys.length} of ${REQUIRED_SCHEMA_KEYS.length} columns`,
            getOperator()
          );
        } catch { /* logger load failure non-fatal */ }

        // Auto-download template (convenience; popup-blocker safe via persistent button below)
        try { await downloadIntakeTemplate(); } catch { /* blocked by popup blocker — button is the guarantee */ }

        return;
      }

      // ── PARTIAL tier: mapping UI with unmapped columns pre-marked "Ignore" ──
      // ── ALL tier: full auto-flow ──
      setValidationResult(result);
      setColumns(cols);
      setParsedData(rows);
      setMapping(autoMapping);

      if (tier === 'all') {
        // Auto-flow: skip to preview directly
        const autoPreview = generateAutoPreview(rows, autoMapping);
        setPreviewData(autoPreview);
        setStep(3);
      } else {
        // Partial: show mapping UI with unmapped pre-flagged
        setStep(2);
      }
      setActiveTab('manual');

    } catch (err: any) {
      setErrorMsg(`Failed to parse file: ${err.message || 'Unknown error'}. Ensure the file is not corrupted.`);
    }
  }, []);

  // Row-validity check against the current mapping (commit-valid-only scope)
  const isMappedRowValid = (row: any, localMapping: Record<string, string>): boolean => {
    const mapped: Record<string, string> = {};
    for (const field of SCHEMA_FIELDS) {
      const srcCol = localMapping[field.key];
      mapped[field.key] = srcCol ? String(row[srcCol] ?? '') : '';
    }
    return validateImportRow(mapped).length === 0;
  };

  const generatePreview = (excludeInvalid = excludeInvalidRows) => {
    const source = excludeInvalid ? parsedData.filter((r) => isMappedRowValid(r, mapping)) : parsedData;
    const autoPreview = generateAutoPreview(source, mapping);
    setPreviewData(autoPreview);
    setStep(3);
  };

  const submitBatch = async () => {
    // Explicit confirmation is required to commit flagged rows.
    if (validationResult && validationResult.rowErrors.length > 0 && !excludeInvalidRows) {
      const ok = typeof window !== 'undefined'
        ? window.confirm(`This file has ${validationResult.rowErrors.length} flagged row-level issues (first-50 spot check). Commit ALL rows including flagged ones?`)
        : true;
      if (!ok) return;
    }
    setIsProcessing(true);
    try {
      const sessionId = `batch-${Date.now()}`;
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${API_URL}/api/intake/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: sessionId,
          status: 'PROCESSED',
          data: {
            mapping: mapping,
            rows: previewData
          }
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      for (const req of previewData) {
        await fetch(`${API_URL}/api/returns`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req)
        });
      }

      // Success — navigate to dashboard (no blocking alert)
      router.push('/dashboard');
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#020817] flex items-center justify-center text-indigo-500">
        <div className="w-8 h-8 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020817] text-white font-sans flex flex-col">
      {/* Navbar */}
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-4">
              <NetampsLogo />
              <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                Intake Workbench
              </span>
            </div>
            <Link href="/dashboard" className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back to Dashboard
            </Link>
          </div>
        </div>
      </nav>

      <div className="border-b border-slate-800 bg-slate-900/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            <button 
              onClick={() => setActiveTab('manual')}
              className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${activeTab === 'manual' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-300'}`}
            >
              <FileSpreadsheet className="w-4 h-4" /> Intake (Manual)
            </button>
            <button 
              onClick={() => setActiveTab('auto')}
              className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${activeTab === 'auto' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-300'}`}
            >
              <Activity className="w-4 h-4" /> Auto-Ingest Monitor
            </button>
            <button 
              onClick={() => setActiveTab('matching')}
              className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${activeTab === 'matching' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-300'}`}
            >
              <ListChecks className="w-4 h-4" /> Stock Match Overview
            </button>
          </div>
        </div>
      </div>

      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {/* General error banner */}
        {errorMsg && activeTab === 'manual' && (
          <div className="mb-6 bg-red-500/10 border border-red-500/50 rounded-lg p-4 flex items-center gap-3 text-red-400 text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p>{errorMsg}</p>
          </div>
        )}

        {/* ── INSUFFICIENT schema rejection panel (inline, not alert()) ── */}
        {validationResult && validationResult.tier === 'insufficient' && activeTab === 'manual' && (
          <div className="mb-6 bg-red-500/10 border border-red-500/40 rounded-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <XCircle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-bold text-red-300">Could not be processed</h3>
                <p className="text-sm text-red-400/80 mt-1">
                  {validationResult.totalRows === 0
                    ? <>No data rows found{validationResult.missing.length > 0 && (<> — missing {validationResult.missing.map(missingLabel).join(', ')}</>)}. Upload a file with a header row plus at least one data row.</>
                    : <>Missing {validationResult.missing.map(missingLabel).join(', ')} — found {REQUIRED_SCHEMA_KEYS.length - validationResult.missing.length} of {REQUIRED_SCHEMA_KEYS.length} required columns.</>}
                </p>
                {validationResult.duplicateHeaders.length > 0 && (
                  <p className="text-sm text-red-400/80 mt-1">
                    Duplicate headers: &quot;{validationResult.duplicateHeaders.join('", "')}&quot; — each column must be unique.
                  </p>
                )}
                {(validationResult.sheetName || validationResult.delimiter) && (
                  <p className="text-xs text-slate-500 mt-1">
                    {validationResult.sheetName && <>Sheet &quot;{validationResult.sheetName}&quot;. </>}
                    {validationResult.delimiter === ';' && <>Semicolon-delimited CSV detected.</>}
                  </p>
                )}
                <p className="text-xs text-slate-500 mt-1">Nothing was committed. The failure is captured in the Auto-Ingest Monitor and audit log.</p>
              </div>
            </div>

            <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
              <h4 className="text-xs font-bold text-red-300/70 uppercase tracking-wider mb-3">Required Columns</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {SCHEMA_FIELDS.filter(f => f.required).map(f => {
                  const isMissing = validationResult.missing.includes(f.key);
                  return (
                    <div key={f.key} className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${isMissing ? 'border-red-500/30 bg-red-500/10 text-red-400' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'}`}>
                      {isMissing ? <XCircle className="w-3.5 h-3.5 shrink-0" /> : <CheckCircle className="w-3.5 h-3.5 shrink-0" />}
                      <span className="font-medium">{f.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Persistent download button — popup-blocker safe (direct click = safe gesture) */}
            <div className="flex items-center gap-4 pt-2">
              <button
                onClick={() => downloadIntakeTemplate()}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-xl shadow-lg transition-all"
              >
                <Download className="w-4 h-4" /> Download XLSX Template
              </button>
              <span className="text-xs text-slate-500">Fill this template and re-upload to pass validation.</span>
            </div>
          </div>
        )}

        {/* ── PARTIAL schema info banner ── */}
        {validationResult && validationResult.tier === 'partial' && step === 2 && activeTab === 'manual' && (
          <div className="mb-6 bg-amber-500/10 border border-amber-500/40 rounded-2xl p-5 space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-amber-300">Partial schema match — review mapping below</h3>
                <p className="text-xs text-amber-400/70 mt-1">
                  Missing columns will default: {validationResult.missing.map(missingLabel).join(', ')}. 
                  {Object.keys(validationResult.fuzzyMappings).length > 0 && (
                    <> Fuzzy-matched (review): {Object.keys(validationResult.fuzzyMappings).map(missingLabel).join(', ')}.</>
                  )}
                </p>
              </div>
            </div>
            {validationResult.rowErrors.length > 0 && (
              <details className="text-xs text-amber-400/60">
                <summary className="cursor-pointer font-bold text-amber-300/80">{validationResult.rowErrors.length} row-level issues in first 50 rows</summary>
                <ul className="mt-2 space-y-1 pl-4 list-disc">
                  {validationResult.rowErrors.slice(0, 10).map((re, i) => (
                    <li key={i}>Row {re.rowIndex}: {re.reasons.join('; ')}</li>
                  ))}
                  {validationResult.rowErrors.length > 10 && <li>…and {validationResult.rowErrors.length - 10} more</li>}
                </ul>
              </details>
            )}
          </div>
        )}

        {/* ── ALL tier info banner (row-level issues only, if any) ── */}
        {validationResult && validationResult.tier === 'all' && step === 3 && activeTab === 'manual' && validationResult.rowErrors.length > 0 && (
          <div className="mb-6 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
            <details className="text-xs text-amber-400/70">
              <summary className="cursor-pointer font-bold text-amber-300 text-sm">{validationResult.rowErrors.length} row-level issues detected (spot check)</summary>
              <ul className="mt-2 space-y-1 pl-4 list-disc">
                {validationResult.rowErrors.slice(0, 15).map((re, i) => (
                  <li key={i}>Row {re.rowIndex}: {re.reasons.join('; ')}</li>
                ))}
                {validationResult.rowErrors.length > 15 && <li>…and {validationResult.rowErrors.length - 15} more</li>}
              </ul>
            </details>
          </div>
        )}

        {/* Tab 1: Manual Intake */}
        {activeTab === 'manual' && (
          <div className="animate-in fade-in duration-300">
            <div className="flex items-center gap-4 mb-8">
              <div className={`flex items-center gap-2 ${step >= 1 ? 'text-indigo-400' : 'text-slate-600'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step >= 1 ? 'bg-indigo-500/20 border border-indigo-500' : 'bg-slate-800 border border-slate-700'}`}>1</div>
                <span className="font-medium">Raw Import</span>
              </div>
              <div className={`h-px w-12 ${step >= 2 ? 'bg-indigo-500/50' : 'bg-slate-800'}`}></div>
              <div className={`flex items-center gap-2 ${step >= 2 ? 'text-indigo-400' : 'text-slate-600'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step >= 2 ? 'bg-indigo-500/20 border border-indigo-500' : 'bg-slate-800 border border-slate-700'}`}>2</div>
                <span className="font-medium">Schema Map</span>
              </div>
              <div className={`h-px w-12 ${step >= 3 ? 'bg-indigo-500/50' : 'bg-slate-800'}`}></div>
              <div className={`flex items-center gap-2 ${step >= 3 ? 'text-indigo-400' : 'text-slate-600'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step >= 3 ? 'bg-indigo-500/20 border border-indigo-500' : 'bg-slate-800 border border-slate-700'}`}>3</div>
                <span className="font-medium">Preview & Commit</span>
              </div>
            </div>

            {step === 1 && (
              <div className="border-2 border-dashed border-slate-700 rounded-2xl bg-slate-900/50 p-16 flex flex-col items-center justify-center text-center transition-colors hover:border-indigo-500 hover:bg-slate-800/50">
                <Database className="w-16 h-16 text-slate-500 mb-6" />
                <h2 className="text-2xl font-bold text-white mb-2">Import Business Data</h2>
                <p className="text-slate-400 mb-8 max-w-md">Drop CSV, JSON, or XLSX files here. Files with a &quot;Tracking ID&quot; column auto-route to the background Auto-Ingest Monitor.</p>
                <label className="relative cursor-pointer bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg transition-all flex items-center gap-2">
                  <UploadCloud className="w-5 h-5" /> Browse Files
                  <input type="file" className="hidden" accept=".csv,.json,.xlsx" onChange={handleFileUpload} />
                </label>
                <p className="mt-4 text-xs text-slate-500 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-emerald-500" /> Secure pipeline: Max 300 MB · 10,000 rows · CSV/JSON/XLSX
                </p>
                <button
                  onClick={() => downloadIntakeTemplate()}
                  className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> Download blank XLSX template
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
                  <h3 className="text-lg font-bold text-white mb-4">Map Columns to Target Schema</h3>
                  <p className="text-sm text-slate-400 mb-6">
                    Found {parsedData.length} records
                    {validationResult?.sheetName && <> from sheet &quot;{validationResult.sheetName}&quot;</>}
                    {validationResult?.delimiter === ';' && <> (semicolon-delimited)</>}
                    . Map your source columns to the expected schema fields.
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {targetSchema.map(schema => (
                      <div key={schema.key} className="flex items-center gap-4 bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                        <div className="w-1/2">
                          <div className="text-sm font-bold text-slate-300 flex items-center gap-2">
                            {schema.label}
                            {validationResult?.fuzzyMappings[schema.key] && (
                              <span className="text-[10px] font-mono bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">~fuzzy</span>
                            )}
                          </div>
                          {schema.required && <div className="text-[10px] text-emerald-400 uppercase tracking-wider">Required</div>}
                        </div>
                        <div className="w-1/2">
                          <select
                            className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                            value={mapping[schema.key] || ''}
                            onChange={(e) => setMapping({ ...mapping, [schema.key]: e.target.value })}
                          >
                            <option value="">-- Ignore --</option>
                            {columns.map(col => (
                              <option key={col} value={col}>{col}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="mt-8 flex justify-end gap-3">
                    <button onClick={() => { setStep(1); setValidationResult(null); }} className="px-6 py-2 rounded-lg text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors">
                      Back
                    </button>
                    <button onClick={() => generatePreview()} className="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-colors flex items-center gap-2">
                      <Play className="w-4 h-4" /> Run Shaping rules
                    </button>
                  </div>
                </div>
                
                <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
                  <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <FileSpreadsheet className="w-5 h-5" /> Raw Data Preview
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-400">
                      <thead className="text-xs uppercase bg-slate-800 text-slate-300">
                        <tr>
                          {columns.slice(0, 10).map((col, i) => <th key={i} className="px-4 py-3">{col}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {parsedData.slice(0, 3).map((row, idx) => (
                          <tr key={idx} className="border-b border-slate-800">
                            {columns.slice(0, 10).map((col, i) => <td key={i} className="px-4 py-3">{row[col]}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <FileJson className="w-5 h-5 text-indigo-400" /> Export Payload Preview
                      </h3>
                      <p className="text-sm text-slate-400">Generated {previewData.length} structured records ready for the backend.</p>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => setStep(2)} className="px-4 py-2 rounded-lg text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors text-sm">
                        Edit Mapping
                      </button>
                      <button 
                        onClick={submitBatch} 
                        disabled={isProcessing}
                        className="px-6 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-colors flex items-center gap-2 shadow-lg shadow-emerald-900/20 disabled:opacity-50"
                      >
                        {isProcessing ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Send className="w-4 h-4" />}
                        Commit to Database
                      </button>
                    </div>
                  </div>

                  {/* Commit scope: flagged rows are excluded by default; including them needs explicit confirmation */}
                  {validationResult && validationResult.rowErrors.length > 0 && (
                    <div className="mb-4 flex flex-wrap items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
                      <label className="flex items-center gap-2 text-xs text-amber-200 font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          checked={excludeInvalidRows}
                          onChange={(e) => setExcludeInvalidRows(e.target.checked)}
                          className="w-4 h-4 accent-amber-500"
                        />
                        Commit valid rows only (exclude {validationResult.rowErrors.length} flagged in first-50 spot check)
                      </label>
                      <button
                        onClick={() => generatePreview()}
                        className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                      >
                        Rebuild preview
                      </button>
                      {!excludeInvalidRows && (
                        <span className="text-[11px] text-red-300">Including flagged rows will ask for confirmation at commit.</span>
                      )}
                    </div>
                  )}

                  <div className="bg-[#0f111a] border border-slate-800 rounded-xl p-4 overflow-auto max-h-96">
                    <pre className="text-xs text-indigo-300 font-mono">
                      {JSON.stringify(previewData, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Auto-Ingest Monitor */}
        {activeTab === 'auto' && (
          <div className="animate-in fade-in duration-300 space-y-6">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
              <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-2">
                <Activity className="w-5 h-5 text-indigo-400" /> Automated Tracking ID Ingestion Pipeline
              </h3>
              <p className="text-sm text-slate-400 mb-6">Background tasks initiated by structured payloads with a valid Tracking ID. Failed file validations are also captured here.</p>

              {autoJobs.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-slate-800 rounded-xl">
                  <p className="text-slate-500">No automated ingestion jobs running.</p>
                </div>
              ) : (
                <div className="overflow-hidden border border-slate-800 rounded-xl">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-800/50 text-slate-300">
                      <tr>
                        <th className="px-4 py-3 font-medium">Job ID</th>
                        <th className="px-4 py-3 font-medium">File</th>
                        <th className="px-4 py-3 font-medium">Size</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium text-right">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 bg-slate-900">
                      {autoJobs.map(job => (
                        <tr key={job.id} className="hover:bg-slate-800/50">
                          <td className="px-4 py-3 font-mono text-xs text-indigo-300">{job.id}</td>
                          <td className="px-4 py-3 text-slate-300">{job.fileName}</td>
                          <td className="px-4 py-3 text-slate-400">{(job.size / 1024).toFixed(1)} KB</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${
                              job.status === 'Done' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                              job.status.includes('Failed') ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                              'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            }`}>
                              {job.status !== 'Done' && !job.status.includes('Failed') && (
                                <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                              )}
                              {job.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-slate-500 font-mono text-xs">
                            {new Date(job.timestamp).toLocaleTimeString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Stock Match Overview */}
        {activeTab === 'matching' && (
          <div className="animate-in fade-in duration-300 space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <ListChecks className="w-5 h-5 text-emerald-400" /> Buy/Sell Intelligent Stock Matching Engine
                  </h3>
                  <p className="text-sm text-slate-400 mt-1">Cross-referencing exact [Product Name] and [Model Number] matches across supply and demand.</p>
                </div>
                <button onClick={fetchMatches} className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors text-sm font-semibold flex items-center gap-2">
                   Refresh
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-800">
                
                {/* Matched Pairs Pane */}
                <div className="p-6">
                  <h4 className="text-sm font-bold text-emerald-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" /> Ready for Fulfillment ({stockMatches.length})
                  </h4>
                  
                  {stockMatches.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-sm border-2 border-dashed border-slate-800 rounded-xl">
                      No exact matches found.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {stockMatches.map((match) => (
                        <div key={match.id} className="border border-emerald-500/20 bg-emerald-500/5 rounded-xl overflow-hidden">
                          <button 
                            onClick={() => setExpandedMatchId(expandedMatchId === match.id ? null : match.id)}
                            className="w-full p-4 flex items-center justify-between text-left hover:bg-emerald-500/10 transition-colors"
                          >
                            <div>
                              <div className="font-bold text-emerald-300 mb-1">{match.productName}</div>
                              <div className="text-xs text-slate-400 font-mono">{match.modelNumber}</div>
                            </div>
                            <div className="text-slate-400">
                              {expandedMatchId === match.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                            </div>
                          </button>
                          
                          {expandedMatchId === match.id && (
                            <div className="p-4 border-t border-emerald-500/20 bg-[#020817]/50 text-sm">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <div className="text-xs font-bold text-slate-500 uppercase mb-1">Buyer Details</div>
                                  <div className="text-slate-200">{match.buyer.name}</div>
                                  <div className="text-slate-400 text-xs">{match.buyer.email}</div>
                                  <div className="text-indigo-300 text-xs mt-1">Req Qty: {match.buyerQty}</div>
                                  <div className="text-slate-400 text-xs mt-1">Ask: <span className="font-mono text-slate-200">{formatPaise(askTotalOfOrder(match.buyer))}</span></div>
                                </div>
                                <div>
                                  <div className="text-xs font-bold text-slate-500 uppercase mb-1">Seller Details</div>
                                  <div className="text-slate-200">{match.seller.name}</div>
                                  <div className="text-slate-400 text-xs">{match.seller.email}</div>
                                  <div className="text-indigo-300 text-xs mt-1">Avail Qty: {match.sellerQty}</div>
                                  <div className="text-slate-400 text-xs mt-1">Ask: <span className="font-mono text-slate-200">{formatPaise(askTotalOfOrder(match.seller))}</span></div>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-4 mt-3">
                                {[{ side: 'Buyer lines', order: match.buyer }, { side: 'Seller lines', order: match.seller }].map(({ side, order }) => (
                                  <div key={side}>
                                    <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">{side}</div>
                                    {(order.products || []).length === 0 ? (
                                      <div className="text-xs text-slate-500">—</div>
                                    ) : (
                                      <div className="space-y-1">
                                        {(order.products || []).map((p: any, i: number) => (
                                          <div key={p.id || i} className="flex justify-between gap-2 text-xs">
                                            <span className="text-slate-400 truncate">{p.category} · Qty {p.quantity}</span>
                                            <span className="font-mono text-slate-200 shrink-0">{formatPaise(order.pricingBasis === 'lot' ? null : (p.lineConsiderationPaise ?? null))}</span>
                                          </div>
                                        ))}
                                        {order.pricingBasis === 'lot' && (
                                          <div className="flex justify-between gap-2 text-xs pt-1 border-t border-slate-800">
                                            <span className="text-slate-400">Lot ask</span>
                                            <span className="font-mono text-slate-200 shrink-0">{formatPaise(order.lotConsiderationPaise ?? null)}</span>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                              <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
                                <span className="flex items-center gap-1 font-mono"><Clock className="w-3 h-3" /> {new Date(match.timestamp).toLocaleString()}</span>
                                <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded">Match Confirmed</span>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Unmatched / Orphaned Pane */}
                <div className="p-6">
                  <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Package className="w-4 h-4" /> Unmatched Orders ({unmatchedOrders.length})
                  </h4>
                  
                  {unmatchedOrders.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-sm border-2 border-dashed border-slate-800 rounded-xl">
                      No unmatched orders.
                    </div>
                  ) : (
                    <div className="space-y-2 overflow-auto max-h-[500px] pr-2 custom-scrollbar">
                      {unmatchedOrders.map(order => (
                        <div key={order.id} className="p-3 border border-slate-800 bg-slate-900/50 rounded-lg flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium text-slate-300">
                              {order.products?.[0]?.category || 'Unknown Product'}
                            </div>
                            <div className="text-xs text-slate-500 font-mono mt-0.5">
                              {order.products?.[0]?.details || 'Unknown Model'}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              Ask: <span className="font-mono text-slate-300">{formatPaise(askTotalOfOrder(order))}</span>
                            </div>
                          </div>
                          <span className={`px-2 py-1 rounded text-xs font-bold ${order.intent?.toLowerCase() === 'buy' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                            {order.intent?.toUpperCase()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
