import type { Metadata } from 'next';

// Server-rendered tab title for /login. `absolute` bypasses the root
// "%s | Netamps Technologies" template so the tab reads exactly
// "Netamps Connect" on first paint — no waiting for client hydration.
export const metadata: Metadata = {
  title: { absolute: 'Netamps Connect' },
  description: 'Netamps Connect — secure employee and partner sign-in.',
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
