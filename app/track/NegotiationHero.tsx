'use client';

/**
 * Track hero — "Negotiation simplified with Netamps".
 *
 * ── INTERACTION ──────────────────────────────────────────────────────────────
 * The three verb chips (Offer / Counter / Accept) are the controls for the
 * illustration, not decoration beside it. Hovering a chip lifts the matching
 * node in the thread, dims the other two, and advances the lit portion of the
 * connecting wire — so the picture explains the sequence as you read it, and a
 * visitor who never touches it still gets a fully-formed static diagram. This is
 * deliberately hover-driven and not click-driven: the chips describe the model,
 * they do not navigate anywhere, and making them look clickable would promise
 * an action that does not exist.
 *
 * State is one `number | null` and it drives opacity/transform only. Nothing
 * here triggers a network call, a route change, or a focus trap.
 *
 * ── WHY THE HOVER IS ALSO REACHABLE BY KEYBOARD ──────────────────────────────
 * The chips are real buttons, so tabbing to one raises the same highlight as
 * hovering it and leaving blurs it again. A purely `:hover` effect would be
 * unreachable without a mouse, which would make the illustration's only
 * interactive dimension decorative for a subset of users.
 *
 * ── LAYERING ─────────────────────────────────────────────────────────────────
 * Five background layers under the content: a fine dot grid for grain, two
 * slow-drifting aurora blobs for depth, a diagonal indigo→amber tint, and a
 * one-pixel top sheen that reads as a lit edge. Every one is `pointer-events-none`
 * and `aria-hidden`, so the texture cannot intercept a click on the copy, be
 * selected as text, or be announced.
 *
 * `overflow-clip` rather than `overflow-hidden`: identical clipping including
 * `border-radius`, but it does NOT establish a scroll container — the same
 * reason it replaced `hidden` on the Returns form card. `contain-[layout_paint]`
 * keeps the blur and dash repaints off the rest of the page.
 *
 * ── MOTION ───────────────────────────────────────────────────────────────────
 * Three independent animations, all transform/stroke-only, all neutralised by
 * the global `prefers-reduced-motion` block: the aurora drift, the marching
 * dash on the wire, and a dot that travels the wire to suggest a round being
 * recorded. Nothing animates width, height, top or left.
 */

import { useState, useCallback } from 'react';
import { Handshake, Lock } from 'lucide-react';

const STEPS = [
  { key: 'offer', label: 'Offer', edge: '#4f46e5', wash: '#eef2ff' },
  { key: 'counter', label: 'Counter', edge: '#f59e0b', wash: '#fffbeb' },
  { key: 'accept', label: 'Accept', edge: '#10b981', wash: '#ecfdf5' }
] as const;

export default function NegotiationHero() {
  const [active, setActive] = useState<number | null>(null);

  const show = useCallback((i: number) => setActive(i), []);
  const hide = useCallback(() => setActive(null), []);

  const dim = (i: number) => (active === null || active === i ? 1 : 0.28);

  return (
    <section
      aria-labelledby="trackNegotiationTitle"
      className="relative overflow-clip rounded-3xl border border-indigo-100/80 bg-white shadow-[0_18px_50px_-24px_rgba(79,70,229,0.45)] contain-[layout_paint]"
    >
      {/* ── Texture layers (all inert) ── */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-dot-fine opacity-70" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 -top-28 h-64 w-64 rounded-full bg-indigo-400/25 blur-3xl animate-blob"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -right-20 h-72 w-72 rounded-full bg-amber-300/30 blur-3xl animate-blob animation-delay-4000"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-50/80 via-white/50 to-amber-50/80"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/50 to-transparent"
      />
      {/* corner glow, only while a step is live */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 top-1/3 h-64 w-64 rounded-full bg-emerald-300/0 blur-3xl transition-colors duration-500"
        data-lit={active === 2 ? '1' : '0'}
      />

      <div className="relative flex flex-col items-center gap-8 px-6 py-8 sm:px-9 sm:py-10 lg:flex-row lg:items-center lg:gap-12">
        {/* ── Negotiation thread ── */}
        <div
          aria-hidden="true"
          className="pointer-events-none w-full max-w-[19rem] shrink-0 lg:max-w-none lg:w-[22rem]"
        >
          <svg viewBox="0 0 300 140" className="h-auto w-full" role="presentation">
            <defs>
              <linearGradient id="thWire" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#a5b4fc" />
                <stop offset="50%" stopColor="#fcd34d" />
                <stop offset="100%" stopColor="#6ee7b7" />
              </linearGradient>
              <linearGradient id="thE1" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#818cf8" />
                <stop offset="100%" stopColor="#4f46e5" />
              </linearGradient>
              <linearGradient id="thE2" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#fbbf24" />
                <stop offset="100%" stopColor="#f59e0b" />
              </linearGradient>
              <linearGradient id="thE3" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#34d399" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
            </defs>

            {/* connecting wire */}
            <path
              d="M84 66 H244"
              stroke="url(#thWire)"
              strokeWidth="2.5"
              strokeLinecap="round"
              className="animate-dash-flow"
              opacity="0.9"
            />
            {/* a round travelling the wire */}
            <circle cx="84" cy="66" r="3.5" fill="#6366f1" className="thread-travel" opacity="0" />

            {/* ── step 1 ── */}
            <g style={{ opacity: dim(0), transition: 'opacity .28s ease' }}>
              <rect
                x="8" y="28" width="76" height="66" rx="16"
                fill="#ffffff" stroke="url(#thE1)" strokeWidth="2"
                style={{ filter: 'drop-shadow(0 6px 14px rgba(79,70,229,0.18))' }}
              />
              <circle cx="28" cy="28" r="10" fill="#4f46e5" />
              <text x="28" y="32" textAnchor="middle" fontSize="11" fontWeight="800" fill="#ffffff">1</text>
              <circle cx="30" cy="52" r="9" fill="#eef2ff" stroke="#4f46e5" strokeWidth="1.4" />
              <path d="M26.5 52 l2.5 2.5 l4.5 -5" fill="none" stroke="#4f46e5" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="45" y="48" width="30" height="4.5" rx="2.2" fill="#c7d2fe" />
              <rect x="45" y="56" width="19" height="4.5" rx="2.2" fill="#e0e7ff" />
              <rect x="18" y="72" width="56" height="6" rx="3" fill="#eef2ff" />
              <rect x="18" y="82" width="36" height="5" rx="2.5" fill="#f1f5f9" />
            </g>

            {/* ── step 2 ── */}
            <g style={{ opacity: dim(1), transition: 'opacity .28s ease' }}>
              <rect
                x="130" y="28" width="76" height="66" rx="16"
                fill="#ffffff" stroke="url(#thE2)" strokeWidth="2"
                style={{ filter: 'drop-shadow(0 6px 14px rgba(245,158,11,0.18))' }}
              />
              <circle cx="150" cy="28" r="10" fill="#f59e0b" />
              <text x="150" y="32" textAnchor="middle" fontSize="11" fontWeight="800" fill="#ffffff">2</text>
              <circle cx="152" cy="52" r="9" fill="#fffbeb" stroke="#f59e0b" strokeWidth="1.4" />
              <path d="M155 47 l-5 5 l5 5" fill="none" stroke="#f59e0b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M147 52 h11" fill="none" stroke="#f59e0b" strokeWidth="1.9" strokeLinecap="round" />
              <rect x="167" y="48" width="30" height="4.5" rx="2.2" fill="#fde68a" />
              <rect x="167" y="56" width="19" height="4.5" rx="2.2" fill="#fef3c7" />
              <rect x="140" y="72" width="56" height="6" rx="3" fill="#fffbeb" />
              <rect x="140" y="82" width="36" height="5" rx="2.5" fill="#f8fafc" />
            </g>

            {/* ── step 3 ── */}
            <g style={{ opacity: dim(2), transition: 'opacity .28s ease' }}>
              <rect
                x="228" y="28" width="64" height="66" rx="16"
                fill="#ffffff" stroke="url(#thE3)" strokeWidth="2"
                style={{ filter: 'drop-shadow(0 6px 14px rgba(16,185,129,0.20))' }}
              />
              <circle cx="248" cy="28" r="10" fill="#10b981" />
              <text x="248" y="32" textAnchor="middle" fontSize="11" fontWeight="800" fill="#ffffff">3</text>
              <circle cx="250" cy="52" r="9" fill="#ecfdf5" stroke="#10b981" strokeWidth="1.4" />
              <path d="M246.5 52 l2.5 2.5 l4.5 -5" fill="none" stroke="#10b981" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="264" y="49" width="20" height="4.5" rx="2.2" fill="#a7f3d0" />
              <rect x="264" y="57" width="13" height="4.5" rx="2.2" fill="#d1fae5" />
              <rect x="238" y="72" width="44" height="6" rx="3" fill="#ecfdf5" />
              <rect x="238" y="82" width="30" height="5" rx="2.5" fill="#f8fafc" />
            </g>

            {/* arrowheads: direction of travel stays legible */}
            <path d="M128 62 l8 4 l-8 4 z" fill="#f59e0b" opacity="0.85" style={{ opacity: active === 1 ? 1 : 0.5, transition: 'opacity .28s' }} />
            <path d="M244 62 l8 4 l-8 4 z" fill="#10b981" opacity="0.85" style={{ opacity: active === 2 ? 1 : 0.5, transition: 'opacity .28s' }} />

            {/* recorded-trail caption under the wire */}
            <g opacity={active === null ? 0.55 : 0.85} style={{ transition: 'opacity .28s' }}>
              <rect x="112" y="110" width="76" height="19" rx="9.5" fill="#ffffff" stroke="#e0e7ff" strokeWidth="1.2" />
              <circle cx="124" cy="119.5" r="3" fill="#6366f1" />
              <rect x="132" y="117" width="46" height="5" rx="2.5" fill="#cbd5e1" />
            </g>
          </svg>
        </div>

        {/* ── Copy ── */}
        <div className="min-w-0 flex-1 text-center lg:text-left">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200/80 bg-white/80 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-indigo-700 shadow-sm backdrop-blur">
            <Handshake className="h-3.5 w-3.5" aria-hidden="true" />
            Live negotiation
          </span>

          <h1
            id="trackNegotiationTitle"
            className="mt-3 text-[clamp(1.375rem,3.4vw,2rem)] font-black leading-[1.15] tracking-tight text-slate-900"
          >
            Negotiation simplified with Netamps
          </h1>

          <p className="mx-auto mt-3 max-w-prose text-[clamp(0.875rem,1.5vw,1rem)] leading-relaxed text-slate-600 lg:mx-0">
            Make an offer, counter, or accept — every round is recorded, so you always
            know exactly where you stand.
          </p>

          {/* Step chips drive the illustration. */}
          <ul className="mt-5 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
            {STEPS.map((s, i) => (
              <li key={s.key}>
                <button
                  type="button"
                  onMouseEnter={() => show(i)}
                  onMouseLeave={hide}
                  onFocus={() => show(i)}
                  onBlur={hide}
                  aria-pressed={active === i}
                  className="rounded-full border px-3.5 py-1.5 text-[11px] font-bold shadow-sm backdrop-blur transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2"
                  style={{
                    borderColor: active === i ? s.edge : undefined,
                    backgroundColor: active === i ? s.wash : undefined,
                    color: active === i ? s.edge : undefined,
                    transform: active === i ? 'translateY(-1px)' : undefined
                  }}
                >
                  {s.label}
                </button>
              </li>
            ))}
          </ul>

          <p className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
            <Lock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            Only you and the Netamps team can see your rounds.
          </p>
        </div>
      </div>
    </section>
  );
}