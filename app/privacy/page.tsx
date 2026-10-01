'use client';

import Link from 'next/link';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-slate-50 pt-32 pb-24">
      <div className="container mx-auto px-6 max-w-4xl">
        <h1 className="text-4xl md:text-5xl font-black text-slate-900 mb-8 tracking-tight">Privacy Policy</h1>
        
        <div className="prose prose-slate max-w-none">
          <p className="text-lg text-slate-600 mb-8 font-medium">
            Effective Date: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">1. Information We Collect</h2>
            <p className="text-slate-600 leading-relaxed mb-4">
              We collect information that you provide directly to us, such as when you create or modify your account, request on-demand services, contact customer support, or otherwise communicate with us.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">2. Use of Strictly Necessary Cookies</h2>
            <p className="text-slate-600 leading-relaxed mb-4">
              Netamps Technologies relies exclusively on Strictly Necessary Cookies to ensure the fundamental security, performance, and operational integrity of our platform. These cookies do not track personal behavior for marketing purposes and are exempt from consent requirements under global privacy frameworks (e.g., GDPR, CCPA).
            </p>
            <ul className="list-disc pl-6 text-slate-600 space-y-2">
              <li><strong>Load-Balancing Cookies:</strong> Distributes network traffic across servers to ensure optimal performance and uptime.</li>
              <li><strong>State &amp; Routing Cookies:</strong> Maintains user session state and ensures consistent routing during active sessions.</li>
              <li><strong>CDN Configuration Cookies:</strong> Optimizes the delivery of content based on your geographic location and network speed.</li>
              <li><strong>CSRF (Cross-Site Request Forgery) Tokens:</strong> Cryptographic tokens generated to prevent malicious unauthorized commands.</li>
              <li><strong>Authentication/Session Identifiers:</strong> Securely identifies your active session to prevent hijacking and unauthorized access.</li>
              <li><strong>Bot-Prevention Cookies:</strong> Analyzes request patterns to distinguish legitimate traffic from automated malicious bots.</li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">3. Data Security</h2>
            <p className="text-slate-600 leading-relaxed mb-4">
              We take reasonable measures to help protect information about you from loss, theft, misuse and unauthorized access, disclosure, alteration and destruction. Our infrastructure utilizes FIPS 140-3 validated cryptography and continuous threat exposure management.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">4. Data Collection &amp; Usage</h2>
            <p className="text-slate-600 leading-relaxed mb-4">
              When you contact us via email, we collect your email address and any information you choose to provide in your message. This data is strictly used to respond to your inquiry and provide our professional services. We do not sell, rent, or lease customer data to third parties.
            </p>
            <p className="text-slate-600 leading-relaxed">
              For any questions regarding our privacy practices or data governance, please contact us at <strong>contact@netamps.com</strong>.
            </p>
          </section>

          <div className="mt-12 text-center">
            <Link href="/" className="inline-flex items-center gap-2 text-primary font-bold hover:text-indigo-700 transition-colors bg-indigo-50 px-6 py-3 rounded-full">
              Return to Homepage
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
