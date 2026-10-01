import ClientReturnButton from './ClientReturnButton';

export const metadata = {
  title: 'Privacy Policy | Netamps Technologies',
  description: 'Privacy Policy and Cookie Information for Netamps Technologies.',
};

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-slate-50 pt-32 pb-24">
      <div className="container mx-auto px-6 max-w-4xl">
        <h1 className="text-4xl md:text-5xl font-black text-slate-900 mb-8 tracking-tight">Privacy Policy</h1>
        
        <div className="prose prose-slate max-w-none">
          <p className="text-lg text-slate-600 mb-8 font-medium">
            Effective Date: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>

          <section className="mb-12 bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <span className="w-6 h-1.5 bg-primary rounded-full inline-block"></span>
              Cookie Policy
            </h2>
            <p className="text-slate-600 leading-relaxed mb-4">
              At Netamps Technologies, we prioritize your privacy and security. Our website is designed to function efficiently without tracking your personal behavior for marketing purposes.
            </p>
            <h3 className="text-lg font-bold text-slate-800 mb-3 mt-6">Strictly Necessary Cookies</h3>
            <p className="text-slate-600 leading-relaxed mb-4">
              We employ a minimal set of "Strictly Necessary Cookies." These technologies are mandatory for the basic operation, security, and performance of our digital infrastructure. Because these cookies are essential to provide the service you are requesting, they do not require user consent under applicable privacy laws (such as the GDPR and ePrivacy Directive).
            </p>
            <p className="text-slate-600 leading-relaxed mb-2 font-semibold">These strictly necessary technologies include:</p>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 mb-4 marker:text-primary">
              <li><strong>Load-Balancing Cookies:</strong> Ensures network traffic is distributed evenly to keep the website reliable and fast.</li>
              <li><strong>State & Routing Cookies:</strong> Maintains your session state across page navigation.</li>
              <li><strong>CDN Configuration Cookies:</strong> Optimizes content delivery based on network node proximity.</li>
              <li><strong>CSRF (Cross-Site Request Forgery) Tokens:</strong> Protects our forms and endpoints from malicious cross-site exploits.</li>
              <li><strong>Authentication/Session Identifiers:</strong> Securely verifies authorized user sessions.</li>
              <li><strong>Bot-Prevention Cookies:</strong> Differentiates between human visitors and automated scrapers to prevent abuse.</li>
            </ul>
            <p className="text-slate-600 leading-relaxed mt-4 bg-slate-50 p-4 rounded-lg border border-slate-100 italic">
              Note: We do not use third-party advertising cookies, cross-site tracking pixels, or non-essential analytics cookies on this landing page.
            </p>
          </section>

          <section className="mb-12 bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <span className="w-6 h-1.5 bg-primary rounded-full inline-block"></span>
              Data Collection & Usage
            </h2>
            <p className="text-slate-600 leading-relaxed mb-4">
              When you contact us via email, we collect your email address and any information you choose to provide in your message. This data is strictly used to respond to your inquiry and provide our professional services. We do not sell, rent, or lease customer data to third parties.
            </p>
            <p className="text-slate-600 leading-relaxed">
              For any questions regarding our privacy practices or data governance, please contact us at <strong>contact@netamps.com</strong>.
            </p>
          </section>
          
          <div className="mt-12 text-center">
            <ClientReturnButton />
          </div>
        </div>
      </div>
    </div>
  );
}
