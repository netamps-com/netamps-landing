import type { Metadata, Viewport } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' }
  ],
  colorScheme: 'light dark',
};

export const metadata: Metadata = {
  metadataBase: new URL('https://netamps.com'),
  title: {
    default: "Netamps Technologies | Enterprise Cyber Security & Digital Forensics",
    template: "%s | Netamps Technologies"
  },
  description: "Netamps Technologies specializes in enterprise cyber security, digital forensics (DFIR), zero trust architecture, and risk management. We secure critical infrastructure with advanced threat defense and continuous SOC monitoring.",
  keywords: ["Cyber Security", "Digital Forensics", "DFIR", "Incident Response", "Zero Trust Architecture", "SOC Monitoring", "Vulnerability Management", "Data Protection", "Netamps Technologies", "Enterprise Security"],
  authors: [{ name: "Netamps Technologies" }],
  creator: "Netamps Technologies",
  publisher: "Netamps Technologies",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  icons: {
    icon: '/logo.jpg',
    apple: '/logo.jpg',
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
        alt: 'Netamps Technologies Logo',
      }
    ],
    locale: 'en_US',
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
    <html lang="en">
      <head>
        <meta httpEquiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https:;" />
      </head>
      <body 
        className={`${inter.variable} ${outfit.variable} font-sans select-none`}
      >
        <SecurityWrapper>
          {children}
          <TrustSeal />
          <CookieConsent />
        </SecurityWrapper>
      </body>
    </html>
  );
}
