import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' }
  ],
  colorScheme: 'light',
};

export const metadata: Metadata = {
  metadataBase: new URL('https://netamps.com'),
  alternates: {
    canonical: 'https://netamps.com',
  },
  title: {
    default: "Netamps Technologies | Enterprise Cyber Security & Digital Forensics",
    template: "%s | Netamps Technologies"
  },
  description: "Netamps Technologies specializes in enterprise cyber security, digital forensics (DFIR), zero trust architecture, network infrastructure, cloud architecture management, and risk management. We secure critical infrastructure with advanced threat defense and continuous SOC monitoring.",
  keywords: [
    "Cyber Security", "Digital Forensics", "DFIR", "Incident Response",
    "Zero Trust Architecture", "SOC Monitoring", "Vulnerability Management",
    "Data Protection", "Netamps Technologies", "Enterprise Security",
    "Penetration Testing", "VAPT", "Cloud Architecture", "MSP",
    "Network Infrastructure", "Smart Surveillance", "IoT Security"
  ],
  authors: [{ name: "Netamps Technologies", url: "https://netamps.com" }],
  creator: "Netamps Technologies",
  publisher: "Netamps Technologies",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  icons: {
    icon: [{ url: '/logo.jpg', type: 'image/jpeg' }],
    apple: '/logo.jpg',
    shortcut: '/logo.jpg',
  },
  openGraph: {
    title: "Netamps Technologies | Advanced Enterprise Security",
    description: "Architecting resilient cyber environments with human intelligence and emerging technologies. Secure your enterprise against advanced threats.",
    url: 'https://netamps.com',
    siteName: 'Netamps Technologies',
    images: [
      {
        url: '/logo.jpg',
        width: 1200,
        height: 630,
        alt: 'Netamps Technologies – Enterprise Cyber Security & Digital Forensics',
      }
    ],
    locale: 'en_IN',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Netamps Technologies | Cyber Security & DFIR',
    description: 'Expert digital forensics, incident response, and zero trust security for enterprise infrastructure.',
    images: ['/logo.jpg'],
  },
  category: 'technology',
};

import SecurityWrapper from "./SecurityWrapper";
import CookieConsent from "./CookieConsent";
import TrustSeal from "./TrustSeal";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-IN">
      <head>
        {/* Security Headers via meta tags */}
        <meta httpEquiv="X-Content-Type-Options" content="nosniff" />
        <meta httpEquiv="X-Frame-Options" content="SAMEORIGIN" />
        <meta httpEquiv="Referrer-Policy" content="strict-origin-when-cross-origin" />
        <meta httpEquiv="Permissions-Policy" content="camera=(), microphone=(), geolocation=()" />
        <meta
          httpEquiv="Content-Security-Policy"
          content="default-src 'self'; script-src 'self' 'unsafe-inline' https://pagead2.googlesyndication.com https://www.googletagservices.com https://partner.googleadservices.com; frame-src 'self' https://googleads.g.doubleclick.net https://tpc.googlesyndication.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https:; media-src 'none'; object-src 'none'; base-uri 'self';"
        />
        {/* Performance: DNS prefetch & preconnect for external assets */}
        <link rel="preconnect" href="https://images.unsplash.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://images.unsplash.com" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://www.google.com" />
      </head>
      <body
        className={`${inter.variable} ${outfit.variable} font-sans select-none antialiased`}
      >
        <SecurityWrapper>
          {children}
          <TrustSeal />
          <CookieConsent />
        </SecurityWrapper>
        {/* Google AdSense — loaded after interactive to not block render */}
        <Script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2386994198437604"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
