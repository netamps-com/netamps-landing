'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, UploadCloud, FileJson, CheckCircle, AlertTriangle, Play, Database, FileSpreadsheet, Send, Activity, ListChecks, ChevronDown, ChevronUp, Clock, Package } from 'lucide-react';
import NetampsLogo from '../NetampsLogo';
import { moneyStringToPaise, formatPaise } from '../lib/money';

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

  // Auto Ingestion State
  const [autoJobs, setAutoJobs] = useState<any[]>([]);

  // Matching Engine State
  const [stockMatches, setStockMatches] = useState<any[]>([]);
  const [unmatchedOrders, setUnmatchedOrders] = useState<any[]>([]);
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);

  // Target schema according to returns contract
  const targetSchema = [
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
    { key: 'lineConsideration', label: 'Line Consideration (₹)', required: false },
    { key: 'lotConsideration', label: 'Lot Consideration (₹)', required: false }
  ];

  // Ask total for an intake-side order (same null semantics as dashboard).
  const askTotalOfOrder = (order: any): number | null => {
    if (order.pricingBasis === 'lot') return order.lotConsiderationPaise ?? null;
    const lines = (order.products || []).map((p: any) => p.lineConsiderationPaise ?? null);
    if (lines.every((v: any) => v === null || v === undefined)) return null;
    return lines.reduce((a: number, v: any) => a + (v ?? 0), 0);
  };

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
        req.products.push({
          id: `prod-auto-${Date.now().toString(36)}-${idx}`,
          category: rowData.category || 'other',
          details: rowData.details || 'No details provided',
          quantity: parseInt(rowData.quantity) || 1,
          strategicTarget: rowData.strategicTarget || '',
          lifecycleAge: rowData.lifecycleAge || '',
          lineConsiderationPaise: rowData.lineConsideration ? moneyStringToPaise(String(rowData.lineConsideration)) : null
        });
      }
      // Lot consideration is request-wide: first valid value in the group wins,
      // and lines stay null so the ask total cannot double-count (mutual exclusivity).
      if (rowData.lotConsideration && String(rowData.lotConsideration).trim() !== '' && (req.lotConsiderationPaise === null || req.lotConsiderationPaise === undefined)) {
        const lot = moneyStringToPaise(String(rowData.lotConsideration));
        if (lot !== null) {
          req.pricingBasis = 'lot';
          req.lotConsiderationPaise = lot;
        }
      }
    });
    // Finalize: lot-mode requests must not carry line asks (mutual exclusivity).
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

    // Process isolated background thread
    setTimeout(async () => {
       const localMapping: Record<string, string> = {};
       targetSchema.forEach(s => {
         const match = cols.find(c => c.toLowerCase().includes(s.key.toLowerCase()) || c.toLowerCase().includes(s.label.toLowerCase()));
         if (match) localMapping[s.key] = match;
       });

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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.endsWith('.json') || file.name.endsWith('.csv') || file.name.endsWith('.xlsx')) {
      alert("MANDATORY SCHEMA REQUIRED:\n\nTo process this request according to industry standards & Intake workbench requirement, your file MUST contain the following columns:\n- Intent (sell/buy)\n- Client Name\n- Company\n- Email\n- Phone\n- Product Name\n- Model Number\n- Quantity\n- Strategic Recovery Target (optional)\n- Hardware Lifecycle Batch Age (optional)");
    }

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
        let cols: string[] = [];
        let rows: any[] = [];
        
        if (file.name.endsWith('.json')) {
          const json = JSON.parse(content);
          const data = Array.isArray(json) ? json : [json];
          if (data.length > 0) {
            cols = Object.keys(data[0]);
            rows = data;
          }
        } else if (file.name.endsWith('.csv')) {
          const parsed = parseCSV(content);
          cols = parsed.headers;
          rows = parsed.rows;
        } else {
          setErrorMsg('Unsupported format. Only CSV or JSON.');
          return;
        }

        // Feature 1: Automated Tracking ID Ingestion Pipeline Interceptor
        const hasTrackingId = cols.some(c => c.toLowerCase().includes('tracking') && c.toLowerCase().includes('id'));
        if (hasTrackingId) {
          handleAutoIngestion(content, cols, rows, file.name, file.size);
          return;
        }

        // Manual Legacy Flow
        setColumns(cols);
        setParsedData(rows);
        setStep(2);
        setActiveTab('manual');
      } catch (err: any) {
        setErrorMsg('Failed to parse file: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  const generatePreview = () => {
    const autoPreview = generateAutoPreview(parsedData, mapping);
    setPreviewData(autoPreview);
    setStep(3);
  };

  const submitBatch = async () => {
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

      alert('Batch processed successfully!');
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
        {errorMsg && activeTab === 'manual' && (
          <div className="mb-6 bg-red-500/10 border border-red-500/50 rounded-lg p-4 flex items-center gap-3 text-red-400 text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p>{errorMsg}</p>
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
                <p className="text-slate-400 mb-8 max-w-md">Drop unstructured CSV or JSON files here. Files with a "Tracking ID" will automatically route to the background Auto-Ingest Monitor.</p>
                <label className="relative cursor-pointer bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg transition-all flex items-center gap-2">
                  <UploadCloud className="w-5 h-5" /> Browse Files
                  <input type="file" className="hidden" accept=".csv,.json" onChange={handleFileUpload} />
                </label>
                <p className="mt-4 text-xs text-slate-500 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-emerald-500" /> Secure pipeline: Max 300MB
                </p>
              </div>
            )}

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
          </div>
        )}

        {/* Tab 2: Auto-Ingest Monitor */}
        {activeTab === 'auto' && (
          <div className="animate-in fade-in duration-300 space-y-6">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
              <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-2">
                <Activity className="w-5 h-5 text-indigo-400" /> Automated Tracking ID Ingestion Pipeline
              </h3>
              <p className="text-sm text-slate-400 mb-6">Background tasks initiated by structured payloads with a valid Tracking ID.</p>

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
