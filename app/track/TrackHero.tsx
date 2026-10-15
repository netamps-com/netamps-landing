'use client';

/**
 * TrackHero — hero banner for the /track identify step.
 *
 * Title: 'Negotiations Simplified at Netamps'.
 *
 * ── WHY A DARK PANEL ────────────────────────────────────────────────────────
 * Every other card on this route is white-on-slate. A single dark panel at the
 * top gives the entry step a visual anchor and separates "what this page is
 * for" from the form below it, without adding a second page chrome.
 *
 * ── WHY THE GRAPHIC IS A NEGOTIATION FLOW, NOT A STATUS RAIL ────────────────
 * The milestone rail already lives on the returns hero and on the order
 * timeline further down this flow. Repeating it here would restate the
 * subheadline. What this tab uniquely does after verification is negotiate
 * against a frozen price — offer → counter → deal, with a price-version lock
 * — so the drawing shows exactly that.
 *
 * All decoration is `aria-hidden` + `pointer-events-none`. The h2 + sub carry
 * the meaning; the SVG is reinforcement, never the only source of it.
 * Animation is transform/opacity/stroke-dashoffset only (compositor work, no
 * layout), reusing the global `hero-swap-in` / `animate-dash-flow` utilities.
 */

import { Turnstile } from '@marsidev/react-turnstile';
import { Handshake, Lock, BadgeCheck, Mail, Send } from 'lucide-react';

const STEPS = [
  { icon: Handshake, label: 'Offer', note: 'Buyer opens' },
  { icon: Lock, label: 'Frozen price', note: 'Version locked' },
  { icon: BadgeCheck, label: 'Deal', note: 'Staff approves' }
] as const;

function NegotiationFlow() {
  return (
    <svg viewBox="0 0 320 120" className="h-auto w-full" role="presentation">
      <defs>
        <linearGradient id="trackHeroEdge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="55%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#34d399" />
        </linearGradient>
        <linearGradient id="trackHeroCard" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.05" />
        </linearGradient>
        <filter id="trackHeroGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* connector flows — animated dash, drawn under the cards */}
      <path
        d="M104 60 H136"
        fill="none"
        stroke="url(#trackHeroEdge)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeDasharray="7 6"
        className="animate-dash-flow"
        opacity="0.9"
      />
      <path
        d="M184 60 H216"
        fill="none"
        stroke="url(#trackHeroEdge)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeDasharray="7 6"
        className="animate-dash-flow animation-delay-2000"
        opacity="0.9"
      />

      {/* card 1 — offer */}
      <g filter="url(#trackHeroGlow)">
        <rect x="24" y="34" width="80" height="52" rx="13" fill="url(#trackHeroCard)" stroke="#f59e0b" strokeWidth="1.8" />
        <circle cx="42" cy="52" r="7" fill="#f59e0b" opacity="0.9" />
        <path d="M39 52 l2.2 2.2 l4 -4.6" fill="none" stroke="#0f172a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="54" y="47" width="36" height="5" rx="2.5" fill="#fde68a" opacity="0.9" />
        <rect x="54" y="57" width="26" height="5" rx="2.5" fill="#ffffff" opacity="0.45" />
        <rect x="32" y="70" width="64" height="5" rx="2.5" fill="#ffffff" opacity="0.28" />
      </g>

      {/* card 2 — frozen price lock */}
      <g filter="url(#trackHeroGlow)">
        <rect x="136" y="34" width="80" height="52" rx="13" fill="url(#trackHeroCard)" stroke="#818cf8" strokeWidth="1.8" />
        <rect x="166" y="60" width="20" height="15" rx="3.5" fill="#818cf8" opacity="0.95" />
        <path d="M170 60 v-4 a6 6 0 0 1 12 0 v4" fill="none" stroke="#c7d2fe" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="176" cy="67" r="1.8" fill="#0f172a" />
        <rect x="144" y="44" width="40" height="5" rx="2.5" fill="#c7d2fe" opacity="0.9" />
        <rect x="192" y="44" width="16" height="5" rx="2.5" fill="#ffffff" opacity="0.4" />
      </g>

      {/* card 3 — deal */}
      <g filter="url(#trackHeroGlow)">
        <rect x="216" y="34" width="80" height="52" rx="13" fill="url(#trackHeroCard)" stroke="#34d399" strokeWidth="1.8" />
        <path d="M238 60 l8 8 l16 -18" fill="none" stroke="#34d399" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="262" y="48" width="22" height="5" rx="2.5" fill="#a7f3d0" opacity="0.9" />
        <rect x="262" y="58" width="15" height="5" rx="2.5" fill="#ffffff" opacity="0.4" />
        <rect x="230" y="72" width="52" height="5" rx="2.5" fill="#ffffff" opacity="0.28" />
      </g>

      {/* milestone rail — the current round breathes */}
      <g>
        <rect x="24" y="98" width="272" height="6" rx="3" fill="#ffffff" opacity="0.14" />
        <rect x="24" y="98" width="190" height="6" rx="3" fill="url(#trackHeroEdge)" opacity="0.85" />
        <circle cx="214" cy="101" r="5" fill="#f59e0b" filter="url(#trackHeroGlow)">
          <animate attributeName="r" values="4;6;4" dur="2.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0.65;1" dur="2.4s" repeatCount="indefinite" />
        </circle>
        <circle cx="60" cy="101" r="3" fill="#34d399" opacity="0.9" />
        <circle cx="140" cy="101" r="3" fill="#818cf8" opacity="0.9" />
      </g>
    </svg>
  );
}

export default function TrackHero({
  email,
  onEmailChange,
  onEmailKeyDown,
  onSendOtp,
  busy,
  trackSiteKey,
  trackToken,
  onTurnstileSuccess,
  onTurnstileExpire,
  onTurnstileError
}: {
  email: string;
  onEmailChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onEmailKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSendOtp: () => void;
  busy: boolean;
  trackSiteKey?: string;
  trackToken?: string;
  onTurnstileSuccess?: (token: string) => void;
  onTurnstileExpire?: () => void;
  onTurnstileError?: () => void;
}) {
  return (
    <section
      aria-label="Negotiations Simplified at Netamps"
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 px-5 py-6 sm:px-7 sm:py-7 ring-1 ring-white/10 shadow-xl contain-[layout_paint]"
    >
      {/* ambient decoration */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-20 -right-16 h-56 w-56 rounded-full bg-amber-500/25 blur-3xl" />
        <div className="absolute -bottom-24 -left-12 h-60 w-60 rounded-full bg-indigo-500/30 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.13]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '26px 26px',
            maskImage: 'radial-gradient(ellipse 90% 90% at 50% 40%, black 30%, transparent 75%)'
          }}
        />
      </div>

      <div className="relative hero-swap-in">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-amber-400/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300">
          <Handshake className="h-3 w-3" aria-hidden="true" />
          Live negotiation
        </span>
        <h2 className="mt-2.5 text-[clamp(1.35rem,4vw,1.9rem)] font-black leading-tight tracking-tight text-white text-balance">
          Negotiations Simplified at Netamps
        </h2>
        <p className="mt-1.5 max-w-xl text-[clamp(0.82rem,1.6vw,0.92rem)] leading-relaxed text-slate-300">
          Negotiate hardware quotes and monitor real-time milestone updates within a single dashboard.
        </p>

        {/* Email input inside the hero panel */}
        <div className="mt-5 w-full max-w-md">
          <label htmlFor="track-email" className="sr-only">Email address on your requests</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" aria-hidden="true" />
            <input
              id="track-email"
              type="email"
              value={email}
              onChange={onEmailChange}
              onKeyDown={onEmailKeyDown}
              placeholder="you@company.com"
              autoComplete="email"
              className="block w-full pl-10 pr-3 py-3 border border-white/20 bg-white/5 rounded-xl text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/50 sm:text-sm"
            />
          </div>
          <p className="mt-2 text-xs text-center text-slate-400">
            No order number needed. We send a code to this mailbox; it proves the requests are yours.
          </p>

          {/* Turnstile + Submit button inside the hero panel */}
          {trackSiteKey && (
            <div className="mt-4 flex justify-center">
              <Turnstile
                key={trackToken}
                siteKey={trackSiteKey}
                options={{ theme: 'light', action: 'track-otp', appearance: 'always' }}
                onSuccess={onTurnstileSuccess}
                onExpire={onTurnstileExpire}
                onError={onTurnstileError}
              />
            </div>
          )}
          <button
            onClick={onSendOtp}
            disabled={busy}
            className="mt-4 w-full py-3.5 bg-amber-400 text-slate-950 rounded-xl font-bold hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? 'Selling…' : 'Click to Sell'}
          </button>
        </div>

      <div aria-hidden="true" className="pointer-events-none relative mt-4">
        <NegotiationFlow />
      </div>

      <ul className="relative mt-4 grid grid-cols-3 gap-2">
        {STEPS.map((s) => (
          <li
            key={s.label}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-2.5 py-2 backdrop-blur-sm"
          >
            <s.icon className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block truncate text-[11px] font-bold text-white sm:text-xs">{s.label}</span>
              <span className="block truncate text-[10px] text-slate-400">{s.note}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
    </section>
  );
}
