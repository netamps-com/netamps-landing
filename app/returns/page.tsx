'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Box, Building2, User, Phone, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import NetampsLogo from '../NetampsLogo';
import TurnstileWidget, { verifyTurnstileToken } from '../TurnstileWidget';

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
  const [intent, setIntent] = useState<'sell' | 'buy'>('sell');
  const [products, setProducts] = useState<ProductItem[]>([
    { id: crypto.randomUUID(), category: '', details: '', quantity: 1 }
  ]);
  const [generatedId, setGeneratedId] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [captchaError, setCaptchaError] = useState('');

  useEffect(() => {
    document.title = 'Enterprise ITAD Exchange Portal - Netamps Technologies';
  }, []);

  const addProduct = () => {
    setProducts([...products, { id: crypto.randomUUID(), category: '', details: '', quantity: 1 }]);
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
      // Server-side Turnstile verification — never trust the client token alone
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
      processReturnSubmit(e);
    } catch (err) {
      console.error(err);
      setIsSubmitting(false);
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

  const processReturnSubmit = (e: React.FormEvent) => {
    setTimeout(() => {
      try {
        const formData = new FormData(e.target as HTMLFormElement);
        const newId = generateMaskedSnowflake(intent);
        setGeneratedId(newId);

        const returnReq = {
          id: newId,
          intent,
          name: formData.get('name'),
          company: formData.get('company'),
          email: formData.get('email'),
          phone: formData.get('phone'),
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
    <div className="min-h-screen bg-[#020817] flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150"></div>
        <div className="absolute top-0 right-0 w-full max-w-[800px] h-[600px] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none opacity-50"></div>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-2xl relative z-10">
        <div className="flex justify-center mb-8">
          <Link href="/" className="scale-125 transform origin-center transition-transform hover:scale-110">
            <NetampsLogo />
          </Link>
        </div>
        <h2 className="mt-2 text-center text-3xl font-black tracking-tight text-white">
          Enterprise ITAD Exchange Portal
        </h2>
        <p className="mt-3 text-center text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
          The secure interface for high-velocity hardware liquidation, certified data sanitization, and premium secondary market sourcing
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-3xl relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900/80 backdrop-blur-xl shadow-2xl sm:rounded-3xl border border-slate-800 overflow-hidden"
        >
          {isSuccess ? (
            <div className="p-12 text-center">
              <div className="w-20 h-20 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-10 h-10 text-indigo-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Request Submitted Successfully</h3>
              <p className="text-slate-400 mb-2">Your request has been securely recorded.</p>
              <p className="text-xl font-mono text-indigo-400 font-bold mb-8">Tracking ID: {generatedId}</p>
              
              <Link href="/" className="inline-flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-colors font-medium">
                <ArrowLeft className="w-4 h-4" />
                Return to Home
              </Link>
            </div>
          ) : (
            <div className="p-8 sm:p-10">
              
              {/* Intent Toggle */}
              <div className="flex bg-slate-800 p-1 rounded-xl mb-8">
                <button 
                  onClick={() => setIntent('sell')}
                  className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all ${intent === 'sell' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                >
                  I want to SELL (Return) Equipment
                </button>
                <button 
                  onClick={() => setIntent('buy')}
                  className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all ${intent === 'buy' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                >
                  I want to BUY Equipment
                </button>
              </div>

              <form className="space-y-6" onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-slate-300">Full Name</label>
                    <div className="mt-2 relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <User className="h-5 w-5 text-slate-500" />
                      </div>
                      <input type="text" name="name" id="name" required className="block w-full pl-10 pr-3 py-3 border border-slate-700 rounded-xl bg-slate-800/50 text-white focus:ring-2 focus:ring-indigo-500 sm:text-sm" placeholder="e.g. Rahul Verma" />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="company" className="block text-sm font-medium text-slate-300">Company</label>
                    <div className="mt-2 relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Building2 className="h-5 w-5 text-slate-500" />
                      </div>
                      <input type="text" name="company" id="company" required className="block w-full pl-10 pr-3 py-3 border border-slate-700 rounded-xl bg-slate-800/50 text-white focus:ring-2 focus:ring-indigo-500 sm:text-sm" placeholder="e.g. Acme Technologies Pvt. Ltd." />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-slate-300">Work Email</label>
                    <div className="mt-2 relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-slate-500 font-bold text-lg">@</span>
                      </div>
                      <input type="email" name="email" id="email" required className="block w-full pl-10 pr-3 py-3 border border-slate-700 rounded-xl bg-slate-800/50 text-white focus:ring-2 focus:ring-indigo-500 sm:text-sm" placeholder="procurement@yourcompany.com" />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="phone" className="block text-sm font-medium text-slate-300">Phone Number</label>
                    <div className="mt-2 relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Phone className="h-5 w-5 text-slate-500" />
                      </div>
                      <input type="tel" name="phone" id="phone" required className="block w-full pl-10 pr-3 py-3 border border-slate-700 rounded-xl bg-slate-800/50 text-white focus:ring-2 focus:ring-indigo-500 sm:text-sm" placeholder="+91 98765 43210" />
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-700 pt-6 mt-6">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-lg font-bold text-white">Product Inventory</h4>
                    <button type="button" onClick={addProduct} className="flex items-center gap-1 text-sm bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg border border-slate-700">
                      <Plus className="w-4 h-4" /> Add Product
                    </button>
                  </div>

                  <div className="space-y-4">
                    {products.map((product, index) => (
                      <div key={product.id} className="p-4 bg-slate-800/30 border border-slate-700/50 rounded-xl flex flex-col gap-4 relative">
                        {products.length > 1 && (
                          <button type="button" onClick={() => removeProduct(product.id)} className="absolute top-4 right-4 text-slate-500 hover:text-red-400">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Product #{index + 1}</h5>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-slate-400 mb-1">Equipment Category</label>
                            <select 
                              required
                              value={product.category}
                              onChange={(e) => updateProduct(product.id, 'category', e.target.value)}
                              className="block w-full pl-3 pr-8 py-2 border border-slate-700 rounded-lg bg-slate-800 text-white focus:ring-2 focus:ring-indigo-500 sm:text-sm appearance-none"
                            >
                              <option value="">Select...</option>
                              <option value="servers">Enterprise Servers & Storage</option>
                              <option value="network">Networking Gear (Switches, Routers)</option>
                              <option value="workstations">Laptops & Workstations</option>
                              <option value="mixed">Mixed Pallet (Various)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Quantity</label>
                            <input 
                              type="number" 
                              min="1" 
                              required
                              value={product.quantity}
                              onChange={(e) => updateProduct(product.id, 'quantity', parseInt(e.target.value) || 1)}
                              className="block w-full px-3 py-2 border border-slate-700 rounded-lg bg-slate-800 text-white focus:ring-2 focus:ring-indigo-500 sm:text-sm" 
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">Details & Specs</label>
                          <textarea 
                            rows={2} 
                            required
                            value={product.details}
                            onChange={(e) => updateProduct(product.id, 'details', e.target.value)}
                            className="block w-full px-3 py-2 border border-slate-700 rounded-lg bg-slate-800 text-white focus:ring-2 focus:ring-indigo-500 sm:text-sm resize-none" 
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
