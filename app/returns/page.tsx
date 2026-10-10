'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { motion } from "motion/react";
import { ArrowLeft, Box, Building2, User, Phone, CheckCircle2, Plus, Trash2, Search, ShieldCheck, Lock, FileCheck, Archive, Link2 } from 'lucide-react';
import NetampsLogo from '../NetampsLogo';
import SecureMediaUploader, { SecureMediaUploaderHandle, AttachmentSnapshot } from './SecureMediaUploader';

function hexOfBytes(bytes: Uint8Array) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Json(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return hexOfBytes(new Uint8Array(digest));
}

interface ProductItem {
  id: string;
  strategicTarget: 'resale' | 'compliance';
  lifecycleAge: string;
  category: string;
  details: string;
  quantity: number;
  attachedFiles: string[];
}

export default function ReturnsPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [intent, setIntent] = useState<'sell' | 'buy' | 'track'>('sell');
  
  // OTP State
  const [showOtp, setShowOtp] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [formDataCache, setFormDataCache] = useState<FormData | null>(null);
  
  // Tracking State
  const [trackingId, setTrackingId] = useState('');
  const [trackingResult, setTrackingResult] = useState<any>(null);
  const [trackingError, setTrackingError] = useState('');

  const [products, setProducts] = useState<ProductItem[]>([
    { id: crypto.randomUUID(), strategicTarget: 'resale', lifecycleAge: '', category: '', details: '', quantity: 1, attachedFiles: [] }
  ]);
  const [generatedId, setGeneratedId] = useState('');
  const [captchaError, setCaptchaError] = useState('');
  
  // Secure File Upload State — the queue itself lives in the single global
  // SecureMediaUploader instance below; the page mirrors it for chips,
  // gating, and the submit manifest. No parallel counters anywhere.
  const [uploadedSecureFiles, setUploadedSecureFiles] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const uploaderRef = useRef<SecureMediaUploaderHandle>(null);
  const [queueSnapshot, setQueueSnapshot] = useState<AttachmentSnapshot[]>([]);
  const [uploadReset, setUploadReset] = useState(0);
  const [dragOverCard, setDragOverCard] = useState<string | null>(null);
  const [requestScope, setRequestScope] = useState('');
  const handleQueueChange = useCallback((snap: AttachmentSnapshot[]) => {
    setQueueSnapshot(snap);
  }, []);

  // productId -> verified+staged attachments, derived (never synced)
  const filesByProduct = useMemo(() => {
    const m = new Map<string, AttachmentSnapshot[]>();
    for (const f of queueSnapshot) {
      if (!f.productId) continue;
      const arr = m.get(f.productId) || [];
      arr.push(f);
      m.set(f.productId, arr);
    }
    return m;
  }, [queueSnapshot]);

  useEffect(() => {
    document.title = 'Enterprise ITAD Exchange Portal - Netamps Technologies';
  }, []);

  useEffect(() => {
    // Independent Returns Session ID in URL (CSPRNG)
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has('sid')) {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        const sid = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
        url.searchParams.set('sid', sid);
        window.history.replaceState({}, '', url.toString());
      }
      setRequestScope(new URL(window.location.href).searchParams.get('sid') || '');
    } catch {
      // URL manipulation unavailable
    }
  }, []);

  const addProduct = () => {
    setProducts([...products, { id: crypto.randomUUID(), strategicTarget: 'resale', lifecycleAge: '', category: '', details: '', quantity: 1, attachedFiles: [] }]);
  };

  const removeProduct = (id: string) => {
    if (products.length <= 1) return;
    const index = products.findIndex((p) => p.id === id);
    const mapped = queueSnapshot.filter((f) => f.productId === id);
    if (mapped.length > 0) {
      const ok = window.confirm(
        `PRODUCT #${index + 1} holds ${mapped.length} attached file${mapped.length > 1 ? 's' : ''} — remove the product and discard its files?`
      );
      if (!ok) return;
      uploaderRef.current?.purgeByProduct(id);
    }
    setProducts(products.filter(p => p.id !== id));
  };

  const updateProduct = (id: string, field: keyof ProductItem, value: any) => {
    setProducts(products.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCaptchaError('');

    setIsSubmitting(true);

    try {
      // Instead of submitting directly, show OTP
      const formData = new FormData(e.target as HTMLFormElement);
      
      const name = formData.get('name') as string;
      const company = formData.get('company') as string;
      const email = formData.get('email') as string;
      const phone = formData.get('phone') as string;

      if (!name.trim() || (intent === 'sell' && !company.trim()) || !email.trim() || !phone.trim()) {
        setCaptchaError('Please ensure all required fields contain valid text, not just spaces.');
        setIsSubmitting(false);
        return;
      }

      if (products.some(p => !p.category || !p.details.trim())) {
        setCaptchaError('Please ensure all product details are filled correctly.');
        setIsSubmitting(false);
        return;
      }

      // Custody gating (SELL only): every staged file must be verified and
      // explicitly linked to a product before an OTP is even issued.
      if (intent === 'sell') {
        const uploading = queueSnapshot.filter((f) => f.status === 'uploading').length;
        if (uploading > 0) {
          setCaptchaError(`Files are still uploading (${uploading} remaining). Please wait for them to finish.`);
          setIsSubmitting(false);
          return;
        }
        const errored = queueSnapshot.filter((f) => f.status === 'error').length;
        if (errored > 0) {
          setCaptchaError(`${errored} file${errored > 1 ? 's' : ''} failed verification. Remove or retry them to continue.`);
          setIsSubmitting(false);
          return;
        }
        const unmapped = queueSnapshot.filter((f) => f.productId === null).length;
        if (unmapped > 0) {
          setCaptchaError(`${unmapped} file${unmapped > 1 ? 's need' : ' needs'} a linked product. Assign each file to its product in the attach panel.`);
          setIsSubmitting(false);
          return;
        }
      }

      // Generate OTP
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${API_URL}/api/otp/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!data.success) {
        const ref = data.stage ? ` (ref: ${data.stage})` : '';
        setCaptchaError(`${data.message || 'Failed to send OTP.'}${ref}`);
        setIsSubmitting(false);
        try {
          const { logEvent } = await import('../lib/logger');
          logEvent('OTP_FAILED', 'Returns Page', `Failed to generate OTP: ${data.message || 'Unknown error'}${ref}`, email);
        } catch(e) {}
        return;
      }
      
      if (data.message && data.message.includes('OTP is')) {
        alert(data.message);
      }

      setFormDataCache(formData);
      setShowOtp(true);
      setIsSubmitting(false);
      
    } catch (err) {
      console.error(err);
      setCaptchaError('An error occurred during submission.');
      setIsSubmitting(false);
    }
  };

  const handleOtpVerify = async () => {
    if (!otpCode || otpCode.length !== 6) {
      setOtpError('Please enter a 6-digit code.');
      return;
    }
    
    setOtpError('');
    setIsSubmitting(true);
    
    try {
      if (!formDataCache) return;
      const email = formDataCache.get('email') as string;
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${API_URL}/api/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otpCode })
      });
      
      const data = await res.json();
      
      if (!data.success) {
        const ref = data.stage ? ` (ref: ${data.stage})` : '';
        setOtpError(`${data.message || 'Invalid OTP Code.'}${ref}`);
        setIsSubmitting(false);
        try {
          const { logEvent } = await import('../lib/logger');
          logEvent('OTP_INVALID', 'Returns Page', 'User provided an invalid OTP code', email);
        } catch(e) {}
        return;
      }
      
      processReturnSubmit();
    } catch(err) {
      setOtpError('Network error verifying OTP.');
      setIsSubmitting(false);
      try {
        if (formDataCache) {
          const email = formDataCache.get('email') as string;
          const { logEvent } = await import('../lib/logger');
          logEvent('OTP_ERROR', 'Returns Page', 'Network error verifying OTP', email);
        }
      } catch(e) {}
    }
  };

  const handleTrackSubmit = async () => {
    setTrackingError('');
    setTrackingResult(null);
    if (!trackingId.trim()) {
      setTrackingError('Please enter a Tracking ID');
      return;
    }
    
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${API_URL}/api/returns`);
      const data = await res.json();
      const returns = data.success && data.returns.length > 0 ? data.returns : JSON.parse(localStorage.getItem('netamps_returns') || '[]');
      const found = returns.find((r: any) => r.id === trackingId.trim());
      if (found) {
        setTrackingResult(found);
      } else {
        setTrackingError('Request not found. Please check your Tracking ID.');
      }
    } catch (e) {
      const existingReturns = JSON.parse(localStorage.getItem('netamps_returns') || '[]');
      const found = existingReturns.find((r: any) => r.id === trackingId.trim());
      if (found) setTrackingResult(found);
      else setTrackingError('Request not found.');
    }
  };

  // Generate Masked Snowflake ID
  const generateMaskedSnowflake = (intentType: 'buy' | 'sell' | 'track'): string => {
    const prefix = intentType === 'sell' ? 'S' : 'B';
    
    // Get timestamp in milliseconds (41 bits equivalent)
    const timestamp = Date.now();
    
    // Generate random component for uniqueness (19 bits equivalent)
    const random = Math.floor(Math.random() * 524288);
    
    // Generate sequence number (12 bits)
    const sequence = Math.floor(Math.random() * 4096);
    
    // Combine into a single number (simulating Snowflake structure)
    const snowflake = (timestamp * 1000000) + (random * 10000) + sequence;
    
    // Convert to base36 for shorter, masked representation
    const masked = snowflake.toString(36).toUpperCase();
    
    // Add checksum digit for validation
    const checksum = masked.split('').reduce((acc, char, idx) => {
      return acc + char.charCodeAt(0) * (idx + 1);
    }, 0) % 10;
    
    return `${prefix}-${masked}${checksum}`;
  };

  const processReturnSubmit = async (formData?: FormData) => {
    try {
      const actualFormData = formData || formDataCache;
      if (!actualFormData) return;
      setIsUploading(true);
      const newId = generateMaskedSnowflake(intent);

      // Per-product evidence manifest: verified attachments grouped under
      // their owning product, with a SHA-256 over the canonical structure.
      // The flat attachedFiles list is retained for tracking-display compat.
      const manifestProducts = products.map((p) => {
        const mine = queueSnapshot
          .filter((f) => f.productId === p.id && f.status === 'verified' && f.objectKey)
          .map((f) => ({
            attachmentId: f.attachmentId,
            fileName: f.fileName,
            sizeBytes: f.sizeBytes,
            mimeType: f.mimeType,
            sha256: f.sha256,
            objectKey: f.objectKey as string,
            assetUrl: f.assetUrl || null
          }))
          .sort((a, b) => a.attachmentId.localeCompare(b.attachmentId));
        return {
          productId: p.id,
          category: p.category,
          details: p.details,
          quantity: p.quantity,
          attachments: mine
        };
      });
      const manifestHash = await sha256Json({ requestId: newId, products: manifestProducts });
      const manifest = { requestId: newId, hash: manifestHash, generatedAt: new Date().toISOString() };
      const productsWithAttachments = products.map((p, i) => ({
        ...p,
        attachedFiles: manifestProducts[i].attachments.map((a) => a.objectKey)
      }));

      const uploadedFileUrls = [...uploadedSecureFiles];
      setGeneratedId(newId);

      const returnReq = {
        id: newId,
        intent,
        name: actualFormData.get('name'),
        company: actualFormData.get('company'),
        email: actualFormData.get('email'),
        phone: actualFormData.get('phone'),
        products: productsWithAttachments,
        attachedFiles: uploadedFileUrls,
        manifest,
        date: new Date().toISOString(),
        status: 'Pending'
      };

      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      await fetch(`${API_URL}/api/returns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(returnReq)
      });
      
      // Keep local copy for immediate fallback viewing
      const existingReturns = JSON.parse(localStorage.getItem('netamps_returns') || '[]');
      localStorage.setItem('netamps_returns', JSON.stringify([returnReq, ...existingReturns]));
      
      const { logEvent } = await import('../lib/logger');
      logEvent('RETURN_SUBMITTED', 'Returns Page', `Return request ${newId} submitted`, actualFormData.get('email') as string);

      
      setIsUploading(false);
      setIsSubmitting(false);
      setIsSuccess(true);
    } catch (err) {
      console.error('Failed to save to database', err);
      setIsUploading(false);
      setIsSubmitting(false);
      setCaptchaError('An error occurred while saving the request.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/20 text-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      
      {/* Ambient Glassmorphism Background */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-grid-pattern opacity-50">
        <div className="absolute top-0 right-0 w-[50vw] h-[50vw] bg-indigo-200/50 blur-[100px] rounded-full mix-blend-multiply opacity-50"></div>
        <div className="absolute bottom-0 left-0 w-[50vw] h-[50vw] bg-emerald-200/40 blur-[100px] rounded-full mix-blend-multiply opacity-50"></div>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-2xl relative z-10">
        <div className="flex justify-center mb-8">
          <Link href="/" className="scale-125 transform origin-center transition-transform hover:scale-110">
            <NetampsLogo />
          </Link>
        </div>
        <h2 className="mt-2 text-center text-3xl font-black tracking-tight text-slate-900">
          Enterprise ITAD Exchange Portal
        </h2>
        <p className="mt-3 text-center text-lg text-slate-500 max-w-2xl mx-auto leading-relaxed">
          The secure interface for high-velocity hardware liquidation, certified data sanitization, and premium secondary market sourcing
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-3xl relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/90 backdrop-blur-xl py-8 px-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:rounded-3xl border border-slate-200/60 overflow-hidden"
        >
          {isSuccess ? (
            <div className="p-12 text-center">
              <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-10 h-10 text-indigo-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-2">Request Submitted Successfully</h3>
              <p className="text-slate-500 mb-2">Your request has been securely recorded.</p>
              <p className="text-xl font-mono text-indigo-600 font-bold mb-8">Tracking ID: {generatedId}</p>
              
              <Link href="/" className="inline-flex items-center gap-2 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl transition-colors font-medium border border-slate-200 shadow-sm">
                <ArrowLeft className="w-4 h-4" />
                Return to Home
              </Link>
            </div>
          ) : (
            <div className="p-8 sm:p-10">
              
              {/* Intent Toggle */}
              <div className="flex flex-wrap sm:flex-nowrap bg-slate-100 p-1 rounded-xl mb-8 border border-slate-200 gap-1">
                <button 
                  type="button"
                  onClick={() => { setIntent('sell'); setShowOtp(false); setTrackingResult(null); setUploadReset((n) => n + 1); setProducts([{ id: crypto.randomUUID(), strategicTarget: 'resale', lifecycleAge: '', category: '', details: '', quantity: 1, attachedFiles: [] }]); }}
                  className={`flex-1 py-3 px-2 text-sm font-bold rounded-lg transition-all ${intent === 'sell' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  SELL Equipment
                </button>
                <button 
                  type="button"
                  onClick={() => { setIntent('buy'); setShowOtp(false); setTrackingResult(null); setUploadedSecureFiles([]); setUploadReset((n) => n + 1); setProducts([{ id: crypto.randomUUID(), strategicTarget: 'resale', lifecycleAge: '', category: '', details: '', quantity: 1, attachedFiles: [] }]); }}
                  className={`flex-1 py-3 px-2 text-sm font-bold rounded-lg transition-all ${intent === 'buy' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  BUY Equipment
                </button>
                <button 
                  type="button"
                  onClick={() => { setIntent('track'); setShowOtp(false); setTrackingResult(null); setUploadedSecureFiles([]); setUploadReset((n) => n + 1); }}
                  className={`flex-1 py-3 px-2 text-sm font-bold rounded-lg transition-all ${intent === 'track' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  TRACK Request
                </button>
              </div>

              {intent === 'track' ? (
                <div className="space-y-6">
                  <div>
                    <label htmlFor="trackingId" className="block text-sm font-medium text-slate-700">Tracking ID</label>
                    <div className="mt-2 relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-slate-400" />
                      </div>
                      <input type="text" value={trackingId} onChange={(e) => setTrackingId(e.target.value)} className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 focus:ring-2 focus:ring-amber-500 sm:text-sm" />
                    </div>
                  </div>
                  <button type="button" onClick={handleTrackSubmit} className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-colors">
                    Track Request
                  </button>
                  {trackingError && <p className="text-red-500 text-center text-sm">{trackingError}</p>}
                  
                  {trackingResult && (
                    <div className="mt-6 p-6 border border-slate-200 rounded-xl bg-slate-50 shadow-sm animate-in fade-in zoom-in duration-300">
                      <div className="flex justify-between items-center mb-4">
                        <span className="font-mono font-bold text-slate-900 text-lg">{trackingResult.id}</span>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${trackingResult.status === 'Approved' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : trackingResult.status === 'Declined' ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-amber-100 text-amber-700 border border-amber-200'}`}>
                          {trackingResult.status}
                        </span>
                      </div>
                      <div className="space-y-4">
                        <div className="space-y-2 pb-4 border-b border-slate-200">
                          <p className="text-sm text-slate-600"><strong className="text-slate-800">Name:</strong> {trackingResult.name}</p>
                          <p className="text-sm text-slate-600"><strong className="text-slate-800">Company:</strong> {trackingResult.company}</p>
                          <p className="text-sm text-slate-600"><strong className="text-slate-800">Date:</strong> {new Date(trackingResult.date).toLocaleDateString()}</p>
                          {trackingResult.attachedFiles && trackingResult.attachedFiles.length > 0 && (
                            <p className="text-sm text-slate-600"><strong className="text-slate-800">Attach asset details of any type below:</strong> {trackingResult.attachedFiles.length} securely uploaded file(s)</p>
                          )}
                        </div>

                        {(trackingResult.status === 'Approved' || trackingResult.status === 'Declined') && trackingResult.products && (
                          <div>
                            <h4 className="text-sm font-bold text-slate-800 mb-3">Equipment Evaluation Details</h4>
                            <div className="space-y-3">
                              {trackingResult.products.map((product: any, idx: number) => (
                                <div key={product.id || idx} className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                                  <div>
                                    <div className="text-sm font-bold text-slate-700 capitalize mb-1">
                                      {product.category.replace('_', ' ')}
                                    </div>
                                    <div className="text-xs text-slate-500 max-w-lg">
                                      {product.details}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-4 shrink-0">
                                    <div className="text-xs text-slate-500">
                                      Qty: <span className="font-bold text-slate-700">{product.quantity}</span>
                                    </div>
                                    {product.price !== undefined ? (
                                      <div className="text-sm font-mono font-bold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100">
                                        ₹{product.price.toLocaleString('en-IN')}
                                      </div>
                                    ) : (
                                      <div className="text-xs font-bold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-100">
                                        Pending Evaluation
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : showOtp ? (
                <div className="space-y-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 className="w-8 h-8 text-indigo-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">Email Verification Required</h3>
                  <p className="text-sm text-slate-500">
                    For security purposes, we've sent a one-time passcode to your email. Please check the console output (simulated) and enter the OTP below.
                  </p>
                  <div>
                    <input 
                      type="text" 
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      className="block w-full max-w-xs mx-auto text-center tracking-widest text-2xl px-4 py-3 border border-slate-300 rounded-xl bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500" 
                      placeholder="••••••"
                      maxLength={6}
                    />
                    {otpError && <p className="text-red-500 text-sm mt-2">{otpError}</p>}
                  </div>
                  <button 
                    type="button"
                    onClick={handleOtpVerify}
                    disabled={isSubmitting || isUploading}
                    className="w-full max-w-xs mx-auto flex justify-center items-center py-4 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-md transition-colors disabled:opacity-70"
                  >
                    {isSubmitting || isUploading ? (
                      <div className="flex items-center gap-2">
                        <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        {isUploading ? 'Uploading securely to R2...' : 'Verifying...'}
                      </div>
                    ) : `Verify & Generate ${intent === 'sell' ? 'SELL' : 'BUY'} Request`}
                  </button>
                  <button type="button" onClick={() => setShowOtp(false)} className="text-sm text-indigo-600 hover:underline">
                    Cancel and return to form
                  </button>
                </div>
              ) : (
                <form key={intent} className="space-y-6" onSubmit={handleSubmit} onReset={() => { setProducts([{ id: crypto.randomUUID(), strategicTarget: 'resale', lifecycleAge: '', category: '', details: '', quantity: 1, attachedFiles: [] }]); setUploadedSecureFiles([]); setUploadReset((n) => n + 1); }}>
                <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-slate-700">Full Name *</label>
                    <div className="mt-2 relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <User className="h-5 w-5 text-slate-400" />
                      </div>
                      <input type="text" name="name" id="name" required pattern="^[a-zA-Z\s.,'-]+$" maxLength={100} className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 focus:ring-2 focus:ring-indigo-500 sm:text-sm" />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="company" className="block text-sm font-medium text-slate-700">Company {intent === 'sell' ? '*' : ''}</label>
                    <div className="mt-2 relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Building2 className="h-5 w-5 text-slate-400" />
                      </div>
                      <input type="text" name="company" id="company" required={intent === 'sell'} pattern="^[a-zA-Z0-9\s.,&'-]+$" maxLength={150} className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 focus:ring-2 focus:ring-indigo-500 sm:text-sm" />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-slate-700">Email *</label>
                    <div className="mt-2 relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-slate-400 font-bold text-lg">@</span>
                      </div>
                      <input type="email" name="email" id="email" required maxLength={100} className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 focus:ring-2 focus:ring-indigo-500 sm:text-sm" />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="phone" className="block text-sm font-medium text-slate-700">Mobile Number *</label>
                    <div className="mt-2 relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Phone className="h-5 w-5 text-slate-400" />
                      </div>
                      <input 
                        type="tel" 
                        name="phone" 
                        id="phone" 
                        required 
                        pattern="^\+?[0-9]+$" 
                        maxLength={20} 
                        onChange={(e) => { e.target.value = e.target.value.replace(/(?!^\+)[^\d]/g, ''); }}
                        className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 focus:ring-2 focus:ring-indigo-500 sm:text-sm" 
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-6 mt-6">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-lg font-bold text-slate-900">Product Inventory</h4>
                    <button type="button" onClick={addProduct} className="flex items-center gap-1 text-sm bg-white hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm transition-colors">
                      <Plus className="w-4 h-4" /> Add Product
                    </button>
                  </div>

                  <div className="space-y-4">
                    {products.map((product, index) => (
                      <div
                        key={product.id}
                        onDragOver={intent === 'sell' ? (e) => { e.preventDefault(); e.stopPropagation(); setDragOverCard(product.id); } : undefined}
                        onDragLeave={() => setDragOverCard((cur) => (cur === product.id ? null : cur))}
                        onDrop={intent === 'sell' ? (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDragOverCard(null);
                          if (e.dataTransfer.files?.length) uploaderRef.current?.stageFiles(Array.from(e.dataTransfer.files), product.id);
                        } : undefined}
                        className={`p-4 bg-slate-50/50 border rounded-xl flex flex-col gap-4 relative shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)] transition-all ${dragOverCard === product.id ? 'border-indigo-500 ring-2 ring-indigo-500/40 bg-indigo-50/40' : 'border-slate-200/80'}`}
                      >
                        {products.length > 1 && (
                          <button type="button" onClick={() => removeProduct(product.id)} className="absolute top-4 right-4 text-slate-400 hover:text-red-500 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Product #{index + 1}</h5>
                        
                        {intent === 'sell' && (
                          <div className="space-y-4 mb-2">
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-2">Strategic Recovery Target *</label>
                              <div className="flex bg-slate-100 p-1 rounded-xl">
                                <button
                                  type="button"
                                  onClick={() => updateProduct(product.id, 'strategicTarget', 'resale')}
                                  className={`flex-1 text-sm font-medium py-2 rounded-lg transition-all ${product.strategicTarget === 'resale' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:text-slate-900'}`}
                                >
                                  Resale Value Optimization
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateProduct(product.id, 'strategicTarget', 'compliance')}
                                  className={`flex-1 text-sm font-medium py-2 rounded-lg transition-all ${product.strategicTarget === 'compliance' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:text-slate-900'}`}
                                >
                                  Compliance Recycling
                                </button>
                              </div>
                            </div>
                            
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1">Hardware Lifecycle Batch Age *</label>
                              <div className="relative">
                                <select
                                  required={intent === 'sell'}
                                  value={product.lifecycleAge}
                                  onChange={(e) => updateProduct(product.id, 'lifecycleAge', e.target.value)}
                                  className="block w-full px-3 py-2.5 border border-slate-200 rounded-lg bg-slate-50 text-slate-900 focus:ring-2 focus:ring-indigo-500 sm:text-sm appearance-none shadow-sm"
                                >
                                  <option value="">Select Age Profile...</option>
                                  <option value="Current Generation (1-3 Years)">Current Generation (1-3 Years)</option>
                                  <option value="Mid-Lifecycle (3-5 Years)">Mid-Lifecycle (3-5 Years)</option>
                                  <option value="Legacy Enterprise End-of-Life (~10%)">Legacy Enterprise End-of-Life (~10%)</option>
                                  <option value="End of Support / Obsolete (>7 Years)">End of Support / Obsolete (&gt;7 Years)</option>
                                  <option value="Damaged Assets">Damaged Assets</option>
                                  <option value="Mixed / Unknown Age">Mixed / Unknown Age</option>
                                </select>
                                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                                  <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                  </svg>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-slate-700 mb-1">Equipment Category *</label>
                            <select 
                              required
                              value={product.category}
                              onChange={(e) => updateProduct(product.id, 'category', e.target.value)}
                              className="block w-full pl-3 pr-8 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 sm:text-sm appearance-none shadow-sm"
                            >
                              <option value="">Select...</option>
                              <option value="servers">Enterprise Servers & Storage</option>
                              <option value="network">Networking Gear (Switches, Routers)</option>
                              <option value="workstations">Laptops & Workstations</option>
                              <option value="peripherals">Components & Peripherals</option>
                              <option value="telecom">Telecom Equipment</option>
                              <option value="mixed">Mixed Pallet (Various)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Quantity *</label>
                            <input 
                              type="number" 
                              min="1" 
                              required
                              value={product.quantity}
                              onChange={(e) => updateProduct(product.id, 'quantity', parseInt(e.target.value) || 1)}
                              className="block w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 sm:text-sm shadow-sm" 
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Details & Specs *</label>
                          <textarea 
                            rows={2} 
                            required
                            maxLength={500}
                            value={product.details}
                            onChange={(e) => updateProduct(product.id, 'details', e.target.value)}
                            className="block w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 sm:text-sm resize-none shadow-sm" 
                            placeholder="e.g. 25x Dell PowerEdge R740, 2x Xeon Gold, 128GB RAM, working condition"
                          />
                        </div>
                        
                        {intent === 'sell' && (
                          <div className="mt-1 pt-3 border-t border-slate-200/60">
                            {(filesByProduct.get(product.id) || []).length === 0 ? (
                              <p className="text-[11px] text-slate-400">No files linked yet — drop files here or assign them in the attach panel below.</p>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {(filesByProduct.get(product.id) || []).map((f) => (
                                  <span
                                    key={f.attachmentId}
                                    title={`${f.fileName} · ${(f.sizeBytes / 1048576).toFixed(2)} MB · ${f.status}${f.assetUrl ? ` · ${f.assetUrl}` : ''}`}
                                    className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-md border ${
                                      f.status === 'verified'
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : f.status === 'uploading'
                                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                        : f.status === 'error'
                                        ? 'bg-red-50 text-red-700 border-red-200'
                                        : 'bg-slate-100 text-slate-600 border-slate-200'
                                    }`}
                                  >
                                    <span className={`w-1.5 h-1.5 rounded-full ${
                                      f.status === 'verified' ? 'bg-emerald-500'
                                      : f.status === 'uploading' ? 'bg-indigo-500 animate-pulse'
                                      : f.status === 'error' ? 'bg-red-500' : 'bg-slate-400'
                                    }`} />
                                    <span className="max-w-[140px] truncate">{f.fileName}</span>
                                    {f.assetUrl ? (
                                      <button
                                        type="button"
                                        title={`Copy asset URL: ${f.assetUrl}`}
                                        onClick={() => { try { navigator.clipboard.writeText(new URL(f.assetUrl as string, window.location.origin).toString()); } catch {} }}
                                        className="flex items-center gap-0.5 hover:underline"
                                      >
                                        <Link2 className="w-3 h-3" />
                                      </button>
                                    ) : null}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Global attach panel — single instance for the whole request (SELL only).
                    Files staged here carry no ownership until explicitly linked to a
                    product; the SESSION USAGE meter below totals every staged file. */}
                {intent === 'sell' && (
                  <div className="border-t border-slate-200 pt-6 mt-6">
                    <SecureMediaUploader
                      ref={uploaderRef}
                      sessionId={requestScope}
                      requestScope={requestScope || 'anon'}
                      products={products.map((p, i) => ({ id: p.id, label: `PRODUCT #${i + 1}` }))}
                      onUploadSuccess={(keys) => {
                        setUploadedSecureFiles(prev => [...prev, ...keys]);
                      }}
                      onQueueChange={handleQueueChange}
                      resetSignal={uploadReset}
                    />
                  </div>
                )}

                {/* Submit */}
                <div className="pt-6">

                  {captchaError && (
                    <p className="text-xs text-center text-red-400 mt-2 mb-4">{captchaError}</p>
                  )}
                  <div className="flex gap-4">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className={`flex-1 flex justify-center items-center gap-2 py-4 px-4 border border-transparent rounded-xl shadow-lg text-base font-bold text-white transition-all disabled:opacity-70 disabled:cursor-not-allowed ${intent === 'sell' ? 'bg-indigo-600 hover:bg-indigo-500 focus:ring-indigo-500' : 'bg-emerald-600 hover:bg-emerald-500 focus:ring-emerald-500'}`}
                    >
                      {isSubmitting ? (
                        <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        `Generate ${intent === 'sell' ? 'SELL' : 'BUY'} Request`
                      )}
                    </button>
                    <button
                      type="reset"
                      className="px-6 py-4 border border-slate-200 rounded-xl text-slate-600 font-bold hover:bg-slate-50 transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </form>
              )}
            </div>
          )}
        </motion.div>

        {/* Compliance & handling trust strip */}
        <div className="mt-8 flex flex-wrap justify-center items-center gap-4 sm:gap-6 text-sm font-semibold text-slate-500 relative z-10 pb-8">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-600" />
            <span>SOC 2 Type II</span>
          </div>
          <span className="hidden sm:inline text-slate-300">|</span>
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-indigo-600" />
            <span>TLS 1.3/AES-256</span>
          </div>
          <span className="hidden sm:inline text-slate-300">|</span>
          <div className="flex items-center gap-2">
            <Archive className="w-5 h-5 text-indigo-600" />
            <span>Zero-Access R2</span>
          </div>
        </div>
      </div>
    </div>
  );
}
