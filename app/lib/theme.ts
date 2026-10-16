/**
 * Netamps Unified Design System — Theme Tokens
 *
 * Every module (login, dashboard, intake, returns, track, admin, status, etc.)
 * MUST import from this file and use these tokens. No module-local color
 * palettes, no ad-hoc spacing, no custom gradients. If a module needs a token
 * that does not exist here, add it here — do not invent it inline.
 *
 * Usage:
 *   import { THEME, NAV_ACCENTS, moduleColors } from '../lib/theme';
 *   className={THEME.card}  // standard card
 *   className={THEME.btnPrimary}  // primary button
 */

// ── Color Palette (load-bearing, do not change without design review) ─────────

export const COLORS = {
  // Brand
  primary: '#4f46e5',      // Indigo-600 — primary actions, links, active states
  primaryHover: '#4338ca', // Indigo-700
  primaryLight: '#eef2ff', // Indigo-50 — subtle backgrounds
  primaryBorder: '#c7d2fe', // Indigo-200

  // Surface
  background: '#f8fafc',   // Slate-50 — page background
  surface: '#ffffff',      // White — card/panel background
  surfaceElevated: '#f1f5f9', // Slate-100 — slightly raised surfaces

  // Text
  textPrimary: '#0f172a',  // Slate-900 — headings, labels
  textSecondary: '#475569', // Slate-600 — body copy, captions
  textMuted: '#94a3b8',    // Slate-400 — placeholders, disabled
  textInverse: '#ffffff',  // White — text on primary/dark

  // Borders
  borderLight: '#e2e8f0',  // Slate-200 — subtle dividers
  borderMedium: '#cbd5e1', // Slate-300 — input borders
  borderFocus: '#4f46e5',  // Indigo-600 — focused input border

  // Semantic (status)
  success: '#10b981',      // Emerald-500
  successBg: '#ecfdf5',    // Emerald-50
  successBorder: '#a7f3d0', // Emerald-200
  warning: '#f59e0b',      // Amber-500
  warningBg: '#fffbeb',    // Amber-50
  warningBorder: '#fcd34d', // Amber-200
  error: '#ef4444',        // Red-500
  errorBg: '#fef2f2',      // Red-50
  errorBorder: '#fecaca',  // Red-200
  info: '#3b82f6',         // Blue-500
  infoBg: '#eff6ff',       // Blue-50
  infoBorder: '#bfdbfe',   // Blue-200
} as const;

// ── Typography (font families defined in layout.tsx via next/font) ────────────

export const TYPOGRAPHY = {
  h1: 'text-2xl font-black tracking-tight text-slate-900',
  h2: 'text-xl font-bold tracking-tight text-slate-900',
  h3: 'text-lg font-semibold text-slate-900',
  h4: 'text-base font-medium text-slate-900',
  body: 'text-sm text-slate-600',
  bodyMd: 'text-base text-slate-600',
  caption: 'text-xs text-slate-500',
  label: 'text-sm font-medium text-slate-700',
  small: 'text-[10px] text-slate-500 uppercase tracking-wider',
} as const;

// ── Spacing (standardized) ────────────────────────────────────────────────────

export const SPACING = {
  xs: 'px-3 py-1.5',
  sm: 'px-4 py-2',
  md: 'px-6 py-3',
  lg: 'px-8 py-4',
  cardPadding: 'p-6 sm:p-8',
  cardGap: 'gap-5',
  sectionGap: 'my-8',
  pagePadding: 'px-4 sm:px-6 lg:px-8 py-8',
} as const;

// ── Border radius (standardized) ──────────────────────────────────────────────

export const RADIUS = {
  sm: 'rounded-lg',
  md: 'rounded-xl',
  lg: 'rounded-2xl',
  pill: 'rounded-full',
} as const;

// ── Shadows (standardized) ────────────────────────────────────────────────────

export const SHADOWS = {
  sm: 'shadow-sm',
  md: 'shadow-[0_4px_6px_rgb(0,0,0,0.02)]',
  lg: 'shadow-[0_8px_24px_rgb(0,0,0,0.04)]',
  xl: 'shadow-[0_20px_40px_rgb(0,0,0,0.06)]',
} as const;

// ── Component class presets (use these, not inline classes) ───────────────────

export const COMPONENTS = {
  // Cards
  card: `bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm`,
  cardElevated: `bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-lg`,
  cardInteractive: `bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all duration-200`,

  // Buttons
  btnPrimary: `w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all disabled:opacity-70 disabled:cursor-not-allowed`,
  btnPrimarySm: `flex justify-center items-center gap-2 py-2 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all disabled:opacity-70 disabled:cursor-not-allowed`,
  btnSecondary: `flex justify-center items-center gap-2 py-2 px-4 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all disabled:opacity-70 disabled:cursor-not-allowed`,
  btnGhost: `flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors`,
  btnDanger: `w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-red-600 hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-all disabled:opacity-70 disabled:cursor-not-allowed`,
  btnOutline: `flex justify-center items-center gap-2 py-2 px-4 border border-slate-300 rounded-xl text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors`,

  // Form inputs
  input: `appearance-none block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-all`,
  inputIcon: `appearance-none block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-all`,
  inputWithIcon: `appearance-none block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-all`,
  select: `appearance-none block w-full pl-3 pr-10 py-3 border border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-all`,
  textarea: `appearance-none block w-full p-3 border border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-all`,
  label: `block text-sm font-medium text-slate-700 mb-1`,
  helper: `mt-1 text-xs text-slate-500`,
  error: `mt-1 text-xs text-red-600 font-medium flex items-center gap-1`,

  // Badges / chips
  badge: `inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium`,
  badgeSuccess: `bg-emerald-50 text-emerald-700 border border-emerald-100`,
  badgeWarning: `bg-amber-50 text-amber-700 border border-amber-100`,
  badgeError: `bg-red-50 text-red-700 border border-red-100`,
  badgeInfo: `bg-blue-50 text-blue-700 border border-blue-100`,
  badgeNeutral: `bg-slate-100 text-slate-600 border border-slate-200`,

  // Alerts / notification banners
  alert: `border rounded-xl p-3 flex items-start gap-3 text-sm`,
  alertSuccess: `bg-emerald-50 border border-emerald-100 text-emerald-800`,
  alertWarning: `bg-amber-50 border border-amber-100 text-amber-800`,
  alertError: `bg-red-50 border border-red-100 text-red-800`,
  alertInfo: `bg-blue-50 border border-blue-100 text-blue-800`,

  // Page shell
  pageContainer: `min-h-screen bg-slate-50/20 text-slate-900 flex flex-col`,
  pageContent: `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full`,
  pageHeader: `mb-8 flex items-center gap-4`,
  moduleTitle: `text-2xl font-black tracking-tight text-slate-900`,
  moduleSubtitle: `text-sm text-slate-500 mt-0.5`,
  sectionHeader: `mb-6 flex items-center gap-2`,
  sectionTitle: `text-lg font-bold text-slate-900`,
  sectionSubtitle: `text-xs text-slate-500`,
} as const;

// ── Theme object (single export for convenience) ──────────────────────────────

export const THEME = {
  COLORS,
  TYPOGRAPHY,
  SPACING,
  RADIUS,
  SHADOWS,
  COMPONENTS,
} as const;

// ── Navigation accents (consistent across all modules) ────────────────────────

export const NAV_ACCENTS = {
  indigo: { text: 'text-indigo-600', bar: 'bg-indigo-500', bg: 'bg-indigo-50' },
  amber: { text: 'text-amber-600', bar: 'bg-amber-500', bg: 'bg-amber-50' },
  sky: { text: 'text-sky-600', bar: 'bg-sky-500', bg: 'bg-sky-50' },
  emerald: { text: 'text-emerald-600', bar: 'bg-emerald-500', bg: 'bg-emerald-50' },
  slate: { text: 'text-slate-600', bar: 'bg-slate-400', bg: 'bg-slate-100' },
} as const;

// ── Module color themes (each module gets ONE accent color, used consistently) ─────

export const MODULE_COLORS = {
  login: 'indigo',
  dashboard: 'indigo',
  intake: 'indigo',
  returns: 'emerald',
  track: 'sky',
  admin: 'slate',
  status: 'sky',
  privacy: 'indigo',
} as const;

export type ModuleName = keyof typeof MODULE_COLORS;

export function moduleAccent(module: ModuleName) {
  const key = MODULE_COLORS[module];
  return NAV_ACCENTS[key];
}
