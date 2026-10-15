'use client';

/**
 * Returns hero — headline, subheadline and motif, switched by intent.
 *
 * ── WHY ONE COMPONENT RATHER THAN AN INLINE CONDITIONAL ──────────────────────
 * The copy, the accent colours and the illustration are three facts about the
 * same thing. Declaring them as one record per intent means adding a fourth
 * intent is one entry rather than three coordinated edits that can drift — and
 * it makes the accent a single source of truth, so a headline can never end up
 * indigo while its illustration is emerald.
 *
 * ── WHY `key={intent}` ON THE CONTENT ───────────────────────────────────────
 * A CSS transition needs a changed value to interpolate. Swapping the headline
 * text between two strings of different lengths does not animate — the browser
 * has nothing to tween, so the text would snap. Remounting the content subtree
 * instead replays the entrance animation from zero on every switch, which is
 * what makes the change feel deliberate rather than like a glitch. The
 * animation is transform+opacity only, so the replay costs no layout.
 *
 * ── THE MOTIFS ──────────────────────────────────────────────────────────────
 * Each intent gets a diagram of what it actually does, drawn in the same
 * 240x120 viewBox so they cross-fade without changing the layout box:
 *   sell   assets leaving a rack into a recirculation loop (asset recovery)
 *   buy    several sources converging on one fulfilment point (sourcing)
 *   track  a milestone rail with a live pulse at the current position
 * All decorative, all `aria-hidden`, all `pointer-events-none`. The headline
 * and subheadline carry the meaning; the drawing is reinforcement, never the
 * only source of it.
 *
 * ── A NOTE ON THE <h2> ──────────────────────────────────────────────────────
 * The page heading is an h2 because the logo link above it is the h1 anchor for
 * this route; keeping that relationship unchanged means the switch does not
 * silently restyle the document outline. `id` is applied to the h2 so
 * `aria-live` can announce the new headline when the intent changes.
 */

import type { ReactNode } from 'react';

export type Intent = 'sell' | 'buy' | 'track';

type Variant = {
  eyebrow: string;
  headline: string;
  sub: string;
  accent: string;
  accentSoft: string;
  accentRing: string;
  motif: ReactNode;
};

const SellMotif = () => (
  /* viewBox is cropped to the drawing's real bounds (y 22..88) rather than a
     nominal 0..120. The dead band above and below was inflating the rendered
     height by ~40% at no visual cost. */
  <svg viewBox="0 22 240 66" className="h-auto w-full" role="presentation">
    {/* asset leaving the rack */}
    <g>
      <rect x="14" y="26" width="62" height="52" rx="12" fill="#ffffff" stroke="#6366f1" strokeWidth="2" />
      <rect x="24" y="38" width="42" height="6" rx="3" fill="#c7d2fe" />
      <rect x="24" y="50" width="30" height="6" rx="3" fill="#e0e7ff" />
      <circle cx="62" cy="66" r="3.5" fill="#4f46e5" />
    </g>
    {/* recirculation loop — the point of ITAD liquidation */}
    <path
      d="M104 52 h26 a20 20 0 1 1 -20 20"
      fill="none"
      stroke="#4f46e5"
      strokeWidth="2.5"
      strokeLinecap="round"
      className="animate-dash-flow"
      opacity="0.75"
    />
    <path d="M110 78 l-8 -6 l10 -4 z" fill="#4f46e5" opacity="0.8" />
    {/* recovered asset */}
    <g>
      <rect x="150" y="34" width="76" height="46" rx="12" fill="#ffffff" stroke="#10b981" strokeWidth="2" />
      <path d="M172 57 l7 7 l14 -15" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="162" y="68" width="52" height="5" rx="2.5" fill="#d1fae5" />
    </g>
  </svg>
);

const BuyMotif = () => (
  /* cropped to the three source cards, y 12..108 — the tallest of the three,
     so this variant still sets the hero's height. */
  <svg viewBox="0 12 240 96" className="h-auto w-full" role="presentation">
    {/* sources converging on fulfilment */}
    <g>
      <rect x="10" y="16" width="54" height="24" rx="9" fill="#ffffff" stroke="#10b981" strokeWidth="2" />
      <rect x="10" y="48" width="54" height="24" rx="9" fill="#ffffff" stroke="#10b981" strokeWidth="2" />
      <rect x="10" y="80" width="54" height="24" rx="9" fill="#ffffff" stroke="#10b981" strokeWidth="2" />
    </g>
    <path d="M70 28 C 108 28, 108 52, 132 56" fill="none" stroke="#34d399" strokeWidth="2.2" strokeLinecap="round" className="animate-dash-flow" />
    <path d="M70 60 H132" fill="none" stroke="#34d399" strokeWidth="2.2" strokeLinecap="round" className="animate-dash-flow animation-delay-2000" />
    <path d="M70 92 C 108 92, 108 68, 132 64" fill="none" stroke="#34d399" strokeWidth="2.2" strokeLinecap="round" className="animate-dash-flow animation-delay-4000" />
    {/* fulfilled order */}
    <g>
      <rect x="140" y="34" width="90" height="52" rx="12" fill="#ffffff" stroke="#059669" strokeWidth="2" />
      <path d="M160 60 h26 m0 0 l-8 -7 m8 7 l-8 7" fill="none" stroke="#059669" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="196" y="56" width="22" height="8" rx="4" fill="#d1fae5" />
      <rect x="154" y="72" width="62" height="5" rx="2.5" fill="#ecfdf5" />
    </g>
  </svg>
);

const TrackMotif = () => (
  /* cropped to the rail plus its milestone ticks, y 32..100. */
  <svg viewBox="0 32 240 68" className="h-auto w-full" role="presentation">
    {/* milestone rail */}
    <path d="M26 72 H214" stroke="#e2e8f0" strokeWidth="4" strokeLinecap="round" />
    <path d="M26 72 H138" stroke="#f59e0b" strokeWidth="4" strokeLinecap="round" className="track-progress" />
    {[
      { x: 26, done: true }, { x: 86, done: true }, { x: 138, done: false }, { x: 214, done: false }
    ].map((m, i) => (
      <g key={m.x}>
        <circle
          cx={m.x} cy="72" r={m.done ? 9 : 7}
          fill={m.done ? '#f59e0b' : '#ffffff'}
          stroke={m.done ? '#f59e0b' : '#cbd5e1'}
          strokeWidth="2.5"
        />
        {!m.done && i === 2 && <circle cx={m.x} cy="72" r="9" fill="#f59e0b" className="pulse-ring" />}
        <rect x={m.x - 15} y="90" width="30" height="5" rx="2.5" fill={m.done ? '#fde68a' : '#f1f5f9'} />
      </g>
    ))}
    {/* parcel in transit */}
    <g>
      <rect x="120" y="38" width="42" height="26" rx="7" fill="#ffffff" stroke="#f59e0b" strokeWidth="2" />
      <path d="M132 38 v26 M150 38 v26 M120 51 h42" stroke="#fbbf24" strokeWidth="1.8" />
    </g>
  </svg>
);

export const HERO_VARIANTS: Record<Intent, Variant> = {
  sell: {
    eyebrow: 'Asset recovery',
    headline: 'Enterprise IT Liquidation, Simplified',
    sub: 'The all-in-one portal to sell your IT assets with total transparency.',
    accent: 'text-indigo-600',
    accentSoft: 'bg-indigo-50',
    accentRing: 'border-indigo-200/80',
    motif: <SellMotif />
  },
  buy: {
    eyebrow: 'Verified sourcing',
    headline: 'Enterprise IT Procurement, Simplified',
    sub: 'Your single portal to source pre-inspected, high-performance hardware and accelerate your deployment timelines.',
    accent: 'text-emerald-600',
    accentSoft: 'bg-emerald-50',
    accentRing: 'border-emerald-200/80',
    motif: <BuyMotif />
  },
  track: {
    eyebrow: 'Live visibility',
    headline: 'Real-Time IT Request Tracking, Simplified',
    sub: 'Track your procurement and liquidation milestones with live status updates and end-to-end logistics visibility.',
    accent: 'text-amber-600',
    accentSoft: 'bg-amber-50',
    accentRing: 'border-amber-200/80',
    motif: <TrackMotif />
  }
};

export default function ReturnsHero({ intent }: { intent: Intent }) {
  const v = HERO_VARIANTS[intent] ?? HERO_VARIANTS.sell;

  return (
    <div className="relative w-full">
      {/* Ambient wash tinted to the active intent. Re-keyed so the colour
          change is instant and never cross-fades from the previous accent. */}
      <div
        key={`wash-${intent}`}
        aria-hidden="true"
        className={`pointer-events-none absolute -inset-x-6 -top-6 -bottom-4 rounded-[2.5rem] ${v.accentSoft} opacity-40 blur-3xl hero-swap-in`}
      />

      {/* Same single-gap column as the logo block that wraps it, so the two
          share one rhythm instead of the hero having its own internal scale. */}
      <div key={intent} className="relative flex flex-col items-center justify-center gap-2.5 hero-swap-in">
        {/* ── Motif ──
            Sized by width, but the tall inner padding of the 240x120 viewBox
            is what gives the graphic its vertical footprint — capping the
            width is what actually shrinks it. */}
        <div aria-hidden="true" className="pointer-events-none w-full max-w-[12.5rem] sm:max-w-[14rem] -mb-0.5">
          {v.motif}
        </div>

        {/* ── Eyebrow ── */}
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] shadow-sm ${v.accentRing} ${v.accentSoft} ${v.accent}`}
        >
          {v.eyebrow}
        </span>

        {/* ── Headline ──
            aria-live so the new headline is announced when the tab changes;
            it is the only part of the banner that changes the page's subject.
            The top clamp is nudged down from 1.4rem: the row above now sits at
            a fixed 10px gap, so the previous leading margin was adding to it. */}
        <h2
          id="returnsHeroTitle"
          aria-live="polite"
          className="text-center text-[clamp(1.25rem,3.4vw,1.875rem)] font-black leading-[1.15] tracking-tight text-slate-900"
        >
          {v.headline}
        </h2>

        {/* ── Subheadline ──
            Keyed separately from the block so it replays its entrance on its
            own short delay. `text-balance` keeps the two lines of the longest
            variant from breaking awkwardly without a fixed height. */}
        <p
          key={`sub-${intent}`}
          className="max-w-xl text-center text-balance text-[clamp(0.85rem,1.5vw,0.975rem)] leading-snug text-slate-500 hero-sub-in"
        >
          {v.sub}
        </p>
      </div>
    </div>
  );
}