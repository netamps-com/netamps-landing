'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { motion } from 'framer-motion';
import { ArrowLeft, Box, Building2, User, Phone, CheckCircle2 } from 'lucide-react';
import NetampsLogo from '../NetampsLogo';

export default function ReturnsPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    document.title = 'Request IT Asset Return - Netamps Technologies';
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Execute reCAPTCHA v3 verification
    if (typeof window !== 'undefined' && (window as any).grecaptcha) {
      (window as any).grecaptcha.ready(async () => {
        try {
          const token = await (window as any).grecaptcha.execute('6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI', { action: 'submit_return' });
          if (!token) {
             console.error('reCAPTCHA failed');
             setIsSubmitting(false);
             return;
          }
          processReturnSubmit(e);
        } catch (err) {
          console.error(err);
          setIsSubmitting(false);
        }
      });
    } else {
      processReturnSubmit(e);
    }
  };

  const processReturnSubmit = (e: React.FormEvent) => {
    // Simulate database insertion (storing in localStorage for demo)
    setTimeout(() => {
      try {
        const formData = new FormData(e.target as HTMLFormElement);
        const returnReq = {
          id: `RMA-${Math.floor(Math.random() * 100000)}`,
          name: formData.get('name'),
          company: formData.get('company'),
          email: formData.get('email'),
          phone: formData.get('phone'),
          equipment: formData.get('equipment'),
          details: formData.get('details'),
          date: new Date().toISOString(),
          status: 'Pending'
        };
        
        const existingReturns = JSON.parse(localStorage.getItem('netamps_returns') || '[]');
        localStorage.setItem('netamps_returns', JSON.stringify([returnReq, ...existingReturns]));
      } catch (err) {
        console.error('Failed to save to database', err);
      }
      
      setIsSubmitting(false);
      setIsSuccess(true);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-[#020817] flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      <Script src="https://www.google.com/recaptcha/api.js?render=6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI" />
      {/* Background Effects */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150"></div>
        <div className="absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2 w-full max-w-[1200px] h-[600px] bg-indigo-500/20 blur-[150px] rounded-full pointer-events-none opacity-50"></div>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-2xl relative z-10">
        <div className="flex justify-center mb-6">
          <Link href="/" className="scale-110 transform origin-center transition-transform hover:scale-100">
            <NetampsLogo />
          </Link>
        </div>
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-white transition-colors mb-4">
            <ArrowLeft className="w-4 h-4" /> Back to home
          </Link>
          <h2 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
            Request an IT Asset Return
          </h2>
          <p className="mt-3 text-base text-slate-400 max-w-xl mx-auto">
            Schedule a secure pickup or generate a shipping label for your decommissioned enterprise hardware.
          </p>
        </div>
      </div>

      <div className="mt-2 sm:mx-auto sm:w-full sm:max-w-2xl relative z-10">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-slate-900/60 backdrop-blur-xl shadow-2xl sm:rounded-3xl border border-slate-800 overflow-hidden"
        >
          {isSuccess ? (
            <div className="p-12 text-center flex flex-col items-center">
              <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6 border border-emerald-500/20">
                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">Request Received</h3>
              <p className="text-slate-400 mb-8 max-w-md mx-auto">
                Your return authorization number (RMA) and shipping instructions have been sent to your email. Our logistics team will contact you shortly.
              </p>
              <Link href="/" className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-3 rounded-xl font-medium transition-colors border border-slate-700">
                Return to Dashboard
              </Link>
            </div>
          ) : (
            <div className="p-8 sm:p-10">
              <form className="space-y-6" onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
                  {/* Name */}
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-slate-300">
                      Full Name
                    </label>
                    <div className="mt-2 relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <User className="h-5 w-5 text-slate-500" />
                      </div>
                      <input
                        type="text"
                        name="name"
                        id="name"
                        required
                        className="block w-full pl-10 pr-3 py-3 border border-slate-700 rounded-xl bg-slate-800/50 text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-all"
                        placeholder="John Doe"
                      />
                    </div>
                  </div>

                  {/* Company */}
                  <div>
                    <label htmlFor="company" className="block text-sm font-medium text-slate-300">
                      Company
                    </label>
                    <div className="mt-2 relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Building2 className="h-5 w-5 text-slate-500" />
                      </div>
                      <input
                        type="text"
                        name="company"
                        id="company"
                        required
                        className="block w-full pl-10 pr-3 py-3 border border-slate-700 rounded-xl bg-slate-800/50 text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-all"
                        placeholder="Acme Corp"
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-slate-300">
                      Work Email
                    </label>
                    <div className="mt-2 relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-slate-500 font-bold text-lg">@</span>
                      </div>
                      <input
                        type="email"
                        name="email"
                        id="email"
                        required
                        className="block w-full pl-10 pr-3 py-3 border border-slate-700 rounded-xl bg-slate-800/50 text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-all"
                        placeholder="john@company.com"
                      />
                    </div>
                  </div>

                  {/* Phone */}
                  <div>
                    <label htmlFor="phone" className="block text-sm font-medium text-slate-300">
                      Phone Number
                    </label>
                    <div className="mt-2 relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Phone className="h-5 w-5 text-slate-500" />
                      </div>
                      <input
                        type="tel"
                        name="phone"
                        id="phone"
                        className="block w-full pl-10 pr-3 py-3 border border-slate-700 rounded-xl bg-slate-800/50 text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-all"
                        placeholder="+1 (555) 000-0000"
                      />
                    </div>
                  </div>
                </div>

                {/* Equipment Type */}
                <div>
                  <label htmlFor="equipment" className="block text-sm font-medium text-slate-300 mb-2">
                    Primary Equipment Type
                  </label>
                  <select
                    id="equipment"
                    name="equipment"
                    className="block w-full pl-3 pr-10 py-3 border border-slate-700 rounded-xl bg-slate-800/50 text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-all appearance-none"
                  >
                    <option value="">Select equipment category...</option>
                    <option value="servers">Enterprise Servers & Storage</option>
                    <option value="network">Networking Gear (Switches, Routers)</option>
                    <option value="workstations">Laptops & Workstations</option>
                    <option value="mixed">Mixed Pallet (Various)</option>
                  </select>
                </div>

                {/* Additional Details */}
                <div>
                  <label htmlFor="details" className="block text-sm font-medium text-slate-300">
                    Asset Details & Logistics Notes
                  </label>
                  <div className="mt-2 relative">
                    <div className="absolute top-3 left-3 pointer-events-none">
                      <Box className="h-5 w-5 text-slate-500" />
                    </div>
                    <textarea
                      id="details"
                      name="details"
                      rows={4}
                      className="block w-full pl-10 pr-3 py-3 border border-slate-700 rounded-xl bg-slate-800/50 text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-all resize-none"
                      placeholder="Please provide rough quantities, estimated pallet count, or special pickup instructions..."
                    />
                  </div>
                </div>

                {/* Submit */}
                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full flex justify-center items-center gap-2 py-4 px-4 border border-transparent rounded-xl shadow-lg text-base font-bold text-white bg-indigo-600 hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-indigo-500 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      'Generate Return Authorization (RMA)'
                    )}
                  </button>
                  <p className="text-[10px] text-center text-slate-500 mt-4 leading-relaxed">
                    This site is protected by reCAPTCHA and the Google{' '}
                    <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">Privacy Policy</a> and{' '}
                    <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">Terms of Service</a> apply.
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
