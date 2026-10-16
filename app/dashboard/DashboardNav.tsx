'use client';

/**
 * Persistent left-hand navigation for the whole /dashboard area.
 *
 * WHY IT EXISTS. The dashboard header had grown into a single row of eleven
 * controls — logo, four module links, an identity line, five admin actions and
 * a sign-out — which wrapped badly at common widths and had no room left for
 * the modules still to come. A left rail is the shape the industry settled on
 * for exactly this problem: it scales vertically, so adding a module costs a
 * row instead of a breakpoint.
 *
 * HOW TO ADD A MODULE. Append one object to a `NavSection` in `./nav`, the
 * single declaration shared by all four dashboard pages. Nothing here needs to
 * change: sections, items and accents are all data. Sections with no visible
 * items render nothing, so an admin-only group costs a non-admin user no
 * pixels.
 *
 * ALWAYS OPEN. There is no collapse control and no hamburger: navigation is
 * never hidden behind a toggle, and it is never in an overlay the reader has
 * to summon. On desktop the rail is fixed at 264px. Below `lg` — where 264px
 * would eat the screen — the SAME element becomes a horizontally scrolling tab
 * strip, sticky to the top, so the navigation is still permanently in-page.
 * `sticky` on mobile and `fixed` on desktop is what removes the arithmetic:
 * in flow the header needs no compensating padding, and out of flow the rail
 * takes the content's left margin instead.
 *
 * ONE THEME. The site is light everywhere; `variant` was removed with that
 * decision rather than left as a branch nothing takes.
 */

import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import NetampsLogo from '../NetampsLogo';

export type NavItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Internal route. Omit for an action row (`onClick`). */
  href?: string;
  external?: boolean;
  onClick?: () => void;
  /** Accent used for the active item's icon and edge marker. */
  accent?: keyof typeof ACCENTS;
  /** Rendered at the row's right edge — a count or a state word. */
  trailing?: ReactNode;
  /** Force the active state; omit to derive it from the pathname. */
  active?: boolean;
  /** Explains the row on hover. */
  title?: string;
};

export type NavSection = {
  id: string;
  label: string;
  items: NavItem[];
};

export type NavFooter = {
  email: string;
  role: string;
  onTerminate: () => void;
};

/**
 * Accents go a shade darker than their dark-theme equivalents: 400-level hues
 * do not hold contrast against white, 600-level do.
 */
const ACCENTS = {
  indigo: { text: 'text-indigo-600', bar: 'bg-indigo-500' },
  amber: { text: 'text-amber-600', bar: 'bg-amber-500' },
  sky: { text: 'text-sky-600', bar: 'bg-sky-500' },
  emerald: { text: 'text-emerald-600', bar: 'bg-emerald-500' },
  slate: { text: 'text-slate-600', bar: 'bg-slate-400' },
} as const;

const RAIL_WIDTH = 264;

/** One surface: the site has a single theme. */
const T = {
  rail: 'bg-white border-slate-200',
  topbar: 'border-slate-200 bg-white/90 text-slate-500',
  // 500, not 400: these group labels and the role line are set at 10px, where
  // slate-400 on white lands near 2.3:1 and stops being legible rather than
  // merely quiet.
  label: 'text-slate-500',
  itemIdle: 'text-slate-600 hover:text-slate-900 hover:bg-slate-100',
  itemActive: 'bg-slate-100 text-slate-900',
  chrome: 'text-slate-500 hover:text-slate-900 hover:bg-slate-100',
  footer: 'border-slate-200 bg-slate-50',
  identity: 'text-slate-700',
};

/** `/dashboard` is a prefix of every sub-route, so it must match exactly. */
function isActivePath(item: NavItem, pathname: string): boolean {
  if (typeof item.active === 'boolean') return item.active;
  if (!item.href) return false;
  const target = item.href.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  const current = (pathname || '/').replace(/\/+$/, '') || '/';
  return target === '/dashboard' ? current === '/dashboard' : current === target || current.startsWith(`${target}/`);
}

const DEFAULT_TITLE: Record<string, string> = {
  '/dashboard': 'Orders',
  '/dashboard/search': 'Order search',
  '/dashboard/negotiations': 'Negotiations',
  '/dashboard/price-tracker': 'Price Tracker',
  '/dashboard/feed': 'Feed Push',
};

function titleFor(pathname: string): string {
  const current = (pathname || '/').replace(/\/+$/, '') || '/';
  if (DEFAULT_TITLE[current]) return DEFAULT_TITLE[current];
  const hit = Object.keys(DEFAULT_TITLE).find((k) => current.startsWith(`${k}/`));
  return hit ? DEFAULT_TITLE[hit] : 'Dashboard';
}

export function DashboardShell({
  sections,
  footer,
  topRight,
  children,
}: {
  sections: NavSection[];
  footer: NavFooter;
  topRight?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname() || '/dashboard';

  return (
    <div
      className="min-h-screen bg-slate-50 font-sans text-slate-900"
      style={{ '--rail-w': `${RAIL_WIDTH}px` } as CSSProperties}
    >
      {/* ── Rail ── */}
      {/* The width is one value consumed twice: by the rail and by the
          content's left margin. It travels as a custom property because
          Tailwind's JIT only emits classes it can read literally — an
          interpolated `lg:w-[${RAIL_WIDTH}px]` compiles to a class name with
          no CSS behind it, and the rail would silently have no width at all. */}
      <aside
        aria-label="Primary"
        className={`sticky top-0 z-50 flex w-full flex-col border-b ${T.rail}
                    lg:fixed lg:inset-y-0 lg:left-0 lg:w-[var(--rail-w)] lg:border-b-0 lg:border-r`}
      >
        {/* Brand row: brand on desktop, identity + sign-out on mobile, where
            the desktop footer is hidden to keep the sticky header two rows. */}
        <div className="flex h-14 shrink-0 items-center gap-2.5 px-4">
          <NetampsLogo className="h-8 w-8 shrink-0" />

          <div className="min-w-0 flex-1">
            <div className="hidden lg:block">
              <div className="truncate text-sm font-black tracking-tight">Netamps</div>
              <div className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                Enterprise DB
              </div>
            </div>
            <div className="truncate text-sm font-semibold text-slate-700 lg:hidden" title={footer.email}>
              {footer.email || 'Signed in'}
            </div>
          </div>

          <button
            onClick={footer.onTerminate}
            className={`shrink-0 rounded-lg p-2 lg:hidden ${T.chrome}`}
            title="Terminate session"
            aria-label="Terminate session"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        {/* Sections: a scrolling tab strip below lg, a stacked list from lg.
            Group labels are desktop-only — a horizontal strip has no room to
            spend on them, and tabs do not need to be grouped to be understood. */}
        <nav
          aria-label="Dashboard sections"
          className="flex h-11 shrink-0 flex-row items-stretch gap-1 overflow-x-auto px-3
                     lg:h-auto lg:min-h-0 lg:flex-1 lg:flex-col lg:gap-0 lg:overflow-x-hidden
                     lg:overflow-y-auto lg:px-3 lg:py-2"
        >
          {sections.map((section) => {
            const visible = section.items.filter(Boolean);
            if (visible.length === 0) return null;
            return (
              <div
                key={section.id}
                className="flex shrink-0 flex-row items-stretch gap-1 lg:mb-1.5 lg:block lg:gap-0 lg:last:mb-0"
              >
                <div
                  className={`hidden px-3 pb-1.5 pt-3 text-[10px] font-bold uppercase tracking-[0.14em] ${T.label} lg:block`}
                >
                  {section.label}
                </div>
                <ul className="flex h-full flex-row items-stretch gap-1 lg:block lg:gap-0 lg:space-y-0.5">
                  {visible.map((item) => (
                    <RailItem key={item.key} item={item} pathname={pathname} />
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>

        {/* Identity + session: desktop only. Mobile carries both in the brand
            row above, so this is a chrome duplicate rather than a second source
            of truth — it holds no data of its own. */}
        <div className={`hidden shrink-0 border-t px-3 py-3 lg:block ${T.footer}`}>
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-indigo-50 text-xs font-black text-indigo-700">
              {(footer.email || '?').slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className={`truncate text-xs font-semibold ${T.identity}`} title={footer.email}>
                {footer.email}
              </div>
              <div className={`truncate text-[10px] font-bold uppercase tracking-wider ${T.label}`}>
                {footer.role}
              </div>
            </div>
            <button
              onClick={footer.onTerminate}
              className={`shrink-0 rounded-lg p-2 ${T.chrome} ml-auto`}
              title="Terminate session"
              aria-label="Terminate session"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Content ── */}
      <div className="lg:pl-[var(--rail-w)]">
        {/* Desktop-only context bar: the mobile header already carries the
            brand and identity, and every page prints its own h1, so a third
            title line there would be padding, not information. */}
        <div className={`sticky top-0 z-30 hidden h-14 items-center gap-3 border-b px-4 backdrop-blur-xl sm:px-6 lg:flex ${T.topbar}`}>
          {/* The bar is muted so actions read as chrome; the page name is not,
              because it is the only thing up here that carries information. */}
          <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">
            {titleFor(pathname)}
          </span>
          {topRight}
        </div>

        {children}
      </div>
    </div>
  );
}

function RailItem({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActivePath(item, pathname);
  const Icon = item.icon;
  const accent = item.accent ? ACCENTS[item.accent].text : '';
  const bar = item.accent ? ACCENTS[item.accent].bar : 'bg-slate-400';

  const className = [
    'group relative flex shrink-0 items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2',
    'text-sm font-medium transition-colors',
    active ? T.itemActive : T.itemIdle,
    active ? accent : '',
    // Fill the rail's width on desktop; stay content-sized in the strip.
    'lg:w-full lg:whitespace-normal',
  ].join(' ');

  const inner = (
    <>
      {/* Two markers for two orientations: an edge bar reads as "current" in a
          vertical list, an underline reads as "current" in a tab strip. */}
      <span
        aria-hidden="true"
        className={`absolute left-0 top-1/2 hidden h-5 w-[3px] -translate-y-1/2 rounded-r-full transition-opacity lg:block ${
          active ? `${bar} opacity-100` : 'opacity-0'
        }`}
      />
      <span
        aria-hidden="true"
        className={`absolute bottom-0 left-2 right-2 h-[3px] rounded-t-full transition-opacity lg:hidden ${
          active ? `${bar} opacity-100` : 'opacity-0'
        }`}
      />
      <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? accent : ''}`} />
      <span className="min-w-0 flex-1 text-left">{item.label}</span>
      {item.trailing && <span className="shrink-0 text-xs">{item.trailing}</span>}
    </>
  );

  if (item.onClick) {
    return (
      <li className="flex">
        <button
          type="button"
          onClick={item.onClick}
          className={className}
          title={item.title}
          aria-current={active ? 'page' : undefined}
        >
          {inner}
        </button>
      </li>
    );
  }

  const Tag: any = item.external ? 'a' : Link;
  const hrefProps = item.external
    ? { href: item.href, target: '_blank', rel: 'noopener noreferrer' }
    : { href: item.href || '/dashboard' };

  return (
    <li className="flex">
      <Tag
        {...hrefProps}
        className={className}
        title={item.title}
        aria-current={active ? 'page' : undefined}
      >
        {inner}
      </Tag>
    </li>
  );
}
