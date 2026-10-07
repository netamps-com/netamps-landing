'use client';

import { GoogleReCaptchaProvider } from 'react-google-recaptcha-v3';

export default function RecaptchaProvider({ children }: { children: React.ReactNode }) {
  // Use a dummy site key for development/testing if env var is missing
  // 6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI is Google's official reCAPTCHA v2 testing key. For v3 testing, any string is usually accepted in simulation, but we'll use a placeholder if empty.
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI';
  
  return (
    <GoogleReCaptchaProvider reCaptchaKey={siteKey}>
      {children}
    </GoogleReCaptchaProvider>
  );
}
