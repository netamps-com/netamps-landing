'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, UploadCloud, FileJson, CheckCircle, AlertTriangle, Play, Database, FileSpreadsheet, Send } from 'lucide-react';
import NetampsLogo from '../NetampsLogo';

export default function IntakeWorkbench() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState('');
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Target schema according to returns contract
  const targetSchema = [
    { key: 'intent', label: 'Intent (sell/buy)', required: true },
    { key: 'name', label: 'Client Name', required: true },
    { key: 'company', label: 'Company', required: true },
    { key: 'email', label: 'Email', required: true },
    { key: 'phone', label: 'Phone', required: true },
    { key: 'category', label: 'Product Category', required: true }, // will map to products[]
    { key: 'details', label: 'Product Details', required: true },
    { key: 'quantity', label: 'Quantity', required: true }
  ];

  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [previewData, setPreviewData] = useState<any[]>([]);

  useEffect(() => {
    // The session cookie is HttpOnly (invisible to document.cookie by design),
    // so authentication is probed server-side: 401 means logged out.
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
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Quick naive CSV parser for Phase 1
  const parseCSV = (text: string) => {
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    if (lines.length < 2) throw new Error('CSV must have headers and at least one data row.');
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    
    const rows = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      let obj: any = {};
      headers.forEach((h, i) => { obj[h] = values[i]; });
      return obj;
    });
    return { headers, rows };
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (300MB)
    if (file.size > 300 * 1024 * 1024) {
      setErrorMsg('File exceeds 300MB limit.');
      return;
    }

    setRawFile(file);
    setErrorMsg('');
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setRawText(content);
      try {
        if (file.name.endsWith('.json')) {
          const json = JSON.parse(content);
          const data = Array.isArray(json) ? json : [json];
          if (data.length > 0) {
            setColumns(Object.keys(data[0]));
            setParsedData(data);
          }
        } else if (file.name.endsWith('.csv')) {
          const { headers, rows } = parseCSV(content);
          setColumns(headers);
          setParsedData(rows);
        } else {
          setErrorMsg('Unsupported format. Only CSV or JSON.');
          return;
        }
        setStep(2);
      } catch (err: any) {
        setErrorMsg('Failed to parse file: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  const generatePreview = () => {
    // Convert flat rows to nested returns contract
    const grouped = new Map<string, any>(); // Group by email+intent to form full requests

    parsedData.forEach((row, idx) => {
      // Extract mapped fields
      const rowData: Record<string, string> = {};
      targetSchema.forEach(schema => {
        const sourceCol = mapping[schema.key];
        rowData[schema.key] = sourceCol ? row[sourceCol] : '';
      });

      const key = `${rowData.email}-${rowData.intent}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          id: `req-${Date.now().toString(36)}-${idx}`,
          intent: rowData.intent || 'sell',
          name: rowData.name || 'Unknown',
          company: rowData.company || 'Unknown',
          email: rowData.email || 'unknown@example.com',
          phone: rowData.phone || 'N/A',
          products: [],
          attachedFiles: [],
          date: new Date().toISOString(),
          status: 'Pending Review'
        });
      }

      const req = grouped.get(key);
      if (rowData.category || rowData.details || rowData.quantity) {
        req.products.push({
          id: `prod-${Date.now().toString(36)}-${idx}`,
          category: rowData.category || 'other',
          details: rowData.details || 'No details provided',
          quantity: parseInt(rowData.quantity) || 1
        });
      }
    });

    setPreviewData(Array.from(grouped.values()));
    setStep(3);
  };

  const submitBatch = async () => {
    setIsProcessing(true);
    try {
      const sessionId = `batch-${Date.now()}`;
      // POST to our new D1 session endpoint
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${API_URL}/api/intake/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: sessionId,
          status: 'PROCESSED',
          data: previewData
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      // Inject into main returns endpoint for Dashboard rendering
      for (const req of previewData) {
        await fetch(`${API_URL}/api/returns`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req)
        });
      }

      alert('Batch processed successfully!');
      router.push('/dashboard');
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isAuthenticated) return null;

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

      {/* Main Content */}
      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {errorMsg && (
          <div className="mb-6 bg-red-500/10 border border-red-500/50 rounded-lg p-4 flex items-center gap-3 text-red-400 text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p>{errorMsg}</p>
          </div>
        )}

        {/* Stepper Header */}
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

        {/* M1: Upload */}
        {step === 1 && (
          <div className="border-2 border-dashed border-slate-700 rounded-2xl bg-slate-900/50 p-16 flex flex-col items-center justify-center text-center transition-colors hover:border-indigo-500 hover:bg-slate-800/50">
            <Database className="w-16 h-16 text-slate-500 mb-6" />
            <h2 className="text-2xl font-bold text-white mb-2">Import Business Data</h2>
            <p className="text-slate-400 mb-8 max-w-md">Drop your unstructured CSV or JSON files here. The workbench will parse it locally before shaping it into the target schema.</p>
            <label className="relative cursor-pointer bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg transition-all flex items-center gap-2">
              <UploadCloud className="w-5 h-5" /> Browse Files
              <input type="file" className="hidden" accept=".csv,.json" onChange={handleFileUpload} />
            </label>
            <p className="mt-4 text-xs text-slate-500 flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-emerald-500" /> Secure pipeline: Max 300MB
            </p>
          </div>
        )}

        {/* M2: Mapping */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
              <h3 className="text-lg font-bold text-white mb-4">Map Columns to Target Schema</h3>
              <p className="text-sm text-slate-400 mb-6">Found {parsedData.length} records. Please map your source columns to our expected schema fields.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {targetSchema.map(schema => (
                  <div key={schema.key} className="flex items-center gap-4 bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                    <div className="w-1/2">
                      <div className="text-sm font-bold text-slate-300">{schema.label}</div>
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
                <button onClick={() => setStep(1)} className="px-6 py-2 rounded-lg text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors">
                  Back
                </button>
                <button onClick={generatePreview} className="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-colors flex items-center gap-2">
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

        {/* M3: Preview & Commit */}
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

              <div className="bg-[#0f111a] border border-slate-800 rounded-xl p-4 overflow-auto max-h-96">
                <pre className="text-xs text-indigo-300 font-mono">
                  {JSON.stringify(previewData, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
