'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Box, Building2, User, Phone, CheckCircle2, Plus, Trash2, Search } from 'lucide-react';
import NetampsLogo from '../NetampsLogo';
import TurnstileWidget, { verifyTurnstileToken } from '../TurnstileWidget';
import { v4 as uuidv4 } from 'uuid';

const TURNSTILE_ENABLED = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

interface ProductItem {
  id: string;
  category: string;
  details: string;
  quantity: number;
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
  
  // Demo Email Toast State
  const [showDemoEmail, setShowDemoEmail] = useState(false);
  const [demoEmailAddress, setDemoEmailAddress] = useState('');

  // Tracking State
  const [trackingId, setTrackingId] = useState('');
  const [trackingResult, setTrackingResult] = useState<any>(null);
  const [trackingError, setTrackingError] = useState('');

  const [products, setProducts] = useState<ProductItem[]>([
    { id: uuidv4(), category: '', details: '', quantity: 1 }
  ]);
  const [generatedId, setGeneratedId] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [captchaError, setCaptchaError] = useState('');
  
  // Secure File Upload State
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);

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
    } catch {
      // URL manipulation unavailable
    }
  }, []);

  const addProduct = () => {
    setProducts([...products, { id: uuidv4(), category: '', details: '', quantity: 1 }]);
  };

  const removeProduct = (id: string) => {
    if (products.length > 1) {
      setProducts(products.filter(p => p.id !== id));
    }
  };

  const updateProduct = (id: string, field: keyof ProductItem, value: any) => {
    setProducts(products.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCaptchaError('');

    // Cloudflare Turnstile verification (bypassed only when no site key is configured, e.g. local dev)
    if (TURNSTILE_ENABLED && !turnstileToken) {
      setCaptchaError('Please complete the security check below.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Server-side Turnstile verification
      if (TURNSTILE_ENABLED) {
        const verified = await verifyTurnstileToken(turnstileToken, 'submit_return');
        if (!verified) {
          setCaptchaError('Security verification failed. Please try again.');
          setTurnstileToken('');
          setTurnstileReset((n) => n + 1);
          setIsSubmitting(false);
          return;
        }
      }
      
      // Instead of submitting directly, show OTP
      const formData = new FormData(e.target as HTMLFormElement);
      
      const name = formData.get('name') as string;
      const company = formData.get('company') as string;
      const email = formData.get('email') as string;
      const phone = formData.get('phone') as string;

      if (!name.trim() || !company.trim() || !email.trim() || !phone.trim()) {
        setCaptchaError('Please ensure all required fields contain valid text, not just spaces.');
        setIsSubmitting(false);
        return;
      }

      if (products.some(p => !p.category || !p.details.trim())) {
        setCaptchaError('Please ensure all product details are filled correctly.');
        setIsSubmitting(false);
        return;
      }

      setFormDataCache(formData);
      
      // Call the live OTP microservice via Cloudflare Tunnel
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://netamps.cloudflareaccess.com';
      const res = await fetch(`${API_URL}/api/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      
      const data = await res.json();
      
      if (!data.success) {
        setCaptchaError(data.message || 'Failed to send OTP.');
        setIsSubmitting(false);
        return;
      }
      
      setDemoEmailAddress(email || 'user@example.com');
      setShowDemoEmail(true);
      setTimeout(() => setShowDemoEmail(false), 8000);
      
      setShowOtp(true);
      setIsSubmitting(false);
    } catch (err) {
      console.error(err);
      setCaptchaError('Network error connecting to OTP service.');
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
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://netamps.cloudflareaccess.com';
      const res = await fetch(`${API_URL}/api/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otpCode })
      });
      
      const data = await res.json();
      
      if (!data.success) {
        setOtpError(data.message || 'Invalid OTP Code.');
        setIsSubmitting(false);
        return;
      }
      
      processReturnSubmit();
    } catch(err) {
      setOtpError('Network error verifying OTP.');
      setIsSubmitting(false);
    }
  };

  const handleTrackSubmit = () => {
    setTrackingError('');
    setTrackingResult(null);
    if (!trackingId.trim()) {
      setTrackingError('Please enter a Tracking ID');
      return;
    }
    const existingReturns = JSON.parse(localStorage.getItem('netamps_returns') || '[]');
    const found = existingReturns.find((r: any) => r.id === trackingId.trim());
    if (found) {
      setTrackingResult(found);
    } else {
      setTrackingError('Request not found. Please check your Tracking ID.');
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

  const processReturnSubmit = async () => {
    try {
      if (!formDataCache) return;
      setIsUploading(true);
      const newId = generateMaskedSnowflake(intent);
      
      const uploadedFileUrls: string[] = [];
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://netamps.cloudflareaccess.com';

      // 1. Upload each file securely via R2 Pre-Signed URL
      for (const file of selectedFiles) {
        try {
          const presignRes = await fetch(`${API_URL}/api/upload-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: file.name, mimeType: file.type, fileSize: file.size })
          });
          const presignData = await presignRes.json();
          if (presignData.success) {
            // Upload directly to Cloudflare R2
            await fetch(presignData.url, {
              method: 'PUT',
              headers: { 'Content-Type': file.type },
              body: file
            });
            uploadedFileUrls.push(presignData.objectKey);
          }
        } catch (e) {
          console.error('File upload failed for', file.name, e);
        }
      }

      setGeneratedId(newId);

      const returnReq = {
        id: newId,
        intent,
        name: formDataCache.get('name'),
        company: formDataCache.get('company'),
        email: formDataCache.get('email'),
        phone: formDataCache.get('phone'),
        products: products,
        attachedFiles: uploadedFileUrls,
        date: new Date().toISOString(),
        status: 'Pending',
        turnstileToken: turnstileToken || undefined
      };

      const existingReturns = JSON.parse(localStorage.getItem('netamps_returns') || '[]');
      localStorage.setItem('netamps_returns', JSON.stringify([returnReq, ...existingReturns]));
      
      setIsUploading(false);
      setIsSubmitting(false);
      setIsSuccess(true);
      setTurnstileToken('');
      setTurnstileReset((n) => n + 1);
    } catch (err) {
      console.error('Failed to save to database', err);
      setIsUploading(false);
      setIsSubmitting(false);
      setCaptchaError('An error occurred while saving the request.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/20 text-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      
      {/* Demo Email Toast (Simulating Inbox) */}
      {showDemoEmail && (
        <motion.div
          initial={{ opacity: 0, y: -50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -50, scale: 0.95 }}
          className="fixed top-6 right-6 z-50 w-full max-w-sm bg-white rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-slate-200 overflow-hidden"
        >
          <div className="bg-slate-50 border-b border-slate-100 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">New Email Received</span>
            </div>
            <button onClick={() => setShowDemoEmail(false)} className="text-slate-400 hover:text-slate-600">×</button>
          </div>
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-slate-900">Netamps Security Team</span>
              <span className="text-xs text-slate-500">Just now</span>
            </div>
            <div className="text-xs text-slate-600 mb-3">
              To: <span className="font-medium text-indigo-600">{demoEmailAddress}</span>
            </div>
            <p className="text-sm text-slate-800 leading-relaxed mb-4">
              Your secure Return Portal verification code has been dispatched. Please check your actual email inbox.
            </p>
            <div className="bg-slate-100 rounded-lg py-3 px-4 text-center">
              <span className="text-sm font-semibold text-slate-500">Waiting for user input...</span>
            </div>
          </div>
          <div className="bg-indigo-50 px-4 py-2 text-[10px] text-indigo-600 text-center font-medium">
            (Connected to SOC 2 microservice backend)
          </div>
        </motion.div>
      )}

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
                  onClick={() => { setIntent('sell'); setShowOtp(false); setTrackingResult(null); setProducts([{ id: crypto.randomUUID(), category: '', details: '', quantity: 1 }]); }}
                  className={`flex-1 py-3 px-2 text-sm font-bold rounded-lg transition-all ${intent === 'sell' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  SELL Equipment
                </button>
                <button 
                  type="button"
                  onClick={() => { setIntent('buy'); setShowOtp(false); setTrackingResult(null); setSelectedFiles([]); setProducts([{ id: crypto.randomUUID(), category: '', details: '', quantity: 1 }]); }}
                  className={`flex-1 py-3 px-2 text-sm font-bold rounded-lg transition-all ${intent === 'buy' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  BUY Equipment
                </button>
                <button 
                  type="button"
                  onClick={() => { setIntent('track'); setShowOtp(false); setTrackingResult(null); setSelectedFiles([]); }}
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
                      <input type="text" value={trackingId} onChange={(e) => setTrackingId(e.target.value)} className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 focus:ring-2 focus:ring-amber-500 sm:text-sm" placeholder="e.g. S-1ABCD2E3" />
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
                            <p className="text-sm text-slate-600"><strong className="text-slate-800">Evidence:</strong> {trackingResult.attachedFiles.length} securely uploaded file(s)</p>
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
                <form key={intent} className="space-y-6" onSubmit={handleSubmit} onReset={() => { setProducts([{ id: crypto.randomUUID(), category: '', details: '', quantity: 1 }]); setSelectedFiles([]); }}>
                <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-slate-700">Full Name</label>
                    <div className="mt-2 relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <User className="h-5 w-5 text-slate-400" />
                      </div>
                      <input type="text" name="name" id="name" required pattern="^[a-zA-Z\s.,'-]+$" maxLength={100} className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 focus:ring-2 focus:ring-indigo-500 sm:text-sm" placeholder="e.g. Rahul Verma" />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="company" className="block text-sm font-medium text-slate-700">Company</label>
                    <div className="mt-2 relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Building2 className="h-5 w-5 text-slate-400" />
                      </div>
                      <input type="text" name="company" id="company" required pattern="^[a-zA-Z0-9\s.,&'-]+$" maxLength={150} className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 focus:ring-2 focus:ring-indigo-500 sm:text-sm" placeholder="e.g. Acme Technologies Pvt. Ltd." />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-slate-700">Work Email</label>
                    <div className="mt-2 relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-slate-400 font-bold text-lg">@</span>
                      </div>
                      <input type="email" name="email" id="email" required maxLength={100} className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 focus:ring-2 focus:ring-indigo-500 sm:text-sm" placeholder="procurement@yourcompany.com" />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="phone" className="block text-sm font-medium text-slate-700">Phone Number</label>
                    <div className="mt-2 relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Phone className="h-5 w-5 text-slate-400" />
                      </div>
                      <input type="tel" name="phone" id="phone" required pattern="^\+?[0-9\s\-()]+$" maxLength={20} className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 focus:ring-2 focus:ring-indigo-500 sm:text-sm" placeholder="+91 98765 43210" />
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
                      <div key={product.id} className="p-4 bg-slate-50/50 border border-slate-200/80 rounded-xl flex flex-col gap-4 relative shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)]">
                        {products.length > 1 && (
                          <button type="button" onClick={() => removeProduct(product.id)} className="absolute top-4 right-4 text-slate-400 hover:text-red-500 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Product #{index + 1}</h5>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-slate-700 mb-1">Equipment Category</label>
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
                            <label className="block text-xs font-medium text-slate-700 mb-1">Quantity</label>
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
                          <label className="block text-xs font-medium text-slate-700 mb-1">Details & Specs</label>
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
                      </div>
                    ))}
                  </div>
                </div>

                {/* Secure File Upload (SOC 2) — SELL only */}
                {intent === 'sell' && (
                <div className="border-t border-slate-200 pt-6 mt-6">
                  <div className="mb-4">
                    <h4 className="text-lg font-bold text-slate-900">Upload Photos/ Videos, Max 100MB Files only (MP4, WEBM)</h4>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-300 border-dashed rounded-xl cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <svg className="w-8 h-8 mb-3 text-slate-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
                        </svg>
                        <p className="mb-2 text-sm text-slate-500"><span className="font-bold">Click to upload</span> or drag and drop</p>
                      </div>
                      <input type="file" className="hidden" multiple accept="image/jpeg, image/png, image/webp, video/mp4, video/webm" onChange={(e) => {
                        if (e.target.files) {
                          const files = Array.from(e.target.files);
                          const validFiles = files.filter(f => f.size <= 100 * 1024 * 1024);
                          setSelectedFiles(prev => [...prev, ...validFiles]);
                        }
                      }} />
                    </label>
                    
                    {selectedFiles.length > 0 && (
                      <div className="mt-4 space-y-2">
                        {selectedFiles.map((f, i) => (
                          <div key={i} className="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200 shadow-sm text-sm">
                            <span className="truncate max-w-[200px] sm:max-w-[300px] text-slate-700 font-medium">{f.name}</span>
                            <div className="flex items-center gap-4">
                              <span className="text-slate-500 text-xs">{(f.size / 1024 / 1024).toFixed(2)} MB</span>
                              <button type="button" onClick={() => setSelectedFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-red-700 font-bold">✕</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                )}

                {/* Submit */}
                <div className="pt-6">
                  <TurnstileWidget
                    onVerify={(token) => { setTurnstileToken(token); setCaptchaError(''); }}
                    onExpire={() => setTurnstileToken('')}
                    onError={() => setTurnstileToken('')}
                    resetSignal={turnstileReset}
                  />
                  {captchaError && (
                    <p className="text-xs text-center text-red-400 mt-2">{captchaError}</p>
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
                  <p className="text-[10px] text-center text-slate-500 mt-4 leading-relaxed">
                    Protected by Cloudflare Turnstile. See the{' '}
                    <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">Cloudflare Privacy Policy</a> and{' '}
                    <a href="https://www.cloudflare.com/website-terms/" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">Terms of Service</a> for details.
                  </p>
                </div>
              </form>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
