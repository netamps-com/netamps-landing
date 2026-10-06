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
  const [expectedOtp, setExpectedOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [formDataCache, setFormDataCache] = useState<FormData | null>(null);

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
      setFormDataCache(formData);
      
      // Generate mock OTP
      const mockOtp = Math.floor(100000 + Math.random() * 900000).toString();
      setExpectedOtp(mockOtp);
      console.log(`[MOCK EMAIL SENT] Your OTP is: ${mockOtp}`);
      
      setShowOtp(true);
      setIsSubmitting(false);
    } catch (err) {
      console.error(err);
      setIsSubmitting(false);
    }
  };

  const handleOtpVerify = () => {
    if (otpCode !== expectedOtp) {
      setOtpError('Invalid OTP Code. Please try again.');
      return;
    }
    
    setOtpError('');
    setIsSubmitting(true);
    processReturnSubmit();
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
  const generateMaskedSnowflake = (intentType: 'buy' | 'sell'): string => {
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

  const processReturnSubmit = () => {
    setTimeout(() => {
      try {
        if (!formDataCache) return;
        const newId = generateMaskedSnowflake(intent);
        setGeneratedId(newId);

        const returnReq = {
          id: newId,
          intent,
          name: formDataCache.get('name'),
          company: formDataCache.get('company'),
          email: formDataCache.get('email'),
          phone: formDataCache.get('phone'),
          products: products,
          date: new Date().toISOString(),
          status: 'Pending',
          turnstileToken: turnstileToken || undefined
        };
        
        const existingReturns = JSON.parse(localStorage.getItem('netamps_returns') || '[]');
        localStorage.setItem('netamps_returns', JSON.stringify([returnReq, ...existingReturns]));
      } catch (err) {
        console.error('Failed to save to database', err);
      }
      
      setIsSubmitting(false);
      setIsSuccess(true);
      setTurnstileToken('');
      setTurnstileReset((n) => n + 1);
    }, 1500);
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
                  onClick={() => { setIntent('sell'); setShowOtp(false); setTrackingResult(null); }}
                  className={`flex-1 py-3 px-2 text-sm font-bold rounded-lg transition-all ${intent === 'sell' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  SELL Equipment
                </button>
                <button 
                  type="button"
                  onClick={() => { setIntent('buy'); setShowOtp(false); setTrackingResult(null); }}
                  className={`flex-1 py-3 px-2 text-sm font-bold rounded-lg transition-all ${intent === 'buy' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  BUY Equipment
                </button>
                <button 
                  type="button"
                  onClick={() => { setIntent('track'); setShowOtp(false); setTrackingResult(null); }}
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
                      <div className="space-y-2">
                        <p className="text-sm text-slate-600"><strong className="text-slate-800">Name:</strong> {trackingResult.name}</p>
                        <p className="text-sm text-slate-600"><strong className="text-slate-800">Company:</strong> {trackingResult.company}</p>
                        <p className="text-sm text-slate-600"><strong className="text-slate-800">Date:</strong> {new Date(trackingResult.date).toLocaleDateString()}</p>
                        <p className="text-sm text-slate-600"><strong className="text-slate-800">Products:</strong> {trackingResult.products?.length || 0} items</p>
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
                    disabled={isSubmitting}
                    className="w-full max-w-xs mx-auto flex justify-center items-center py-4 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-md transition-colors disabled:opacity-70"
                  >
                    {isSubmitting ? (
                      <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : "Verify & Generate Request"}
                  </button>
                  <button type="button" onClick={() => setShowOtp(false)} className="text-sm text-indigo-600 hover:underline">
                    Cancel and return to form
                  </button>
                </div>
              ) : (
                <form className="space-y-6" onSubmit={handleSubmit}>
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
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={`w-full flex justify-center items-center gap-2 py-4 px-4 border border-transparent rounded-xl shadow-lg text-base font-bold text-white transition-all disabled:opacity-70 disabled:cursor-not-allowed ${intent === 'sell' ? 'bg-indigo-600 hover:bg-indigo-500 focus:ring-indigo-500' : 'bg-emerald-600 hover:bg-emerald-500 focus:ring-emerald-500'}`}
                  >
                    {isSubmitting ? (
                      <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      `Generate ${intent === 'sell' ? 'SELL' : 'BUY'} Request`
                    )}
                  </button>
                  <p className="text-[10px] text-center text-slate-500 mt-4 leading-relaxed">
                    Protected by Cloudflare Turnstile. See the{' '}
                    <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">Cloudflare Privacy Policy</a> and{' '}
                    <a href="https://www.cloudflare.com/website-terms/" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">Terms of Service</a> for details.
                  </p>
                </div>
              </form>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
