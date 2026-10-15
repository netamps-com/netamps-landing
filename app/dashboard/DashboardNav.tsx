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
 * change: sections, items, counts and switches are all data. Sections with no
 * visible items render nothing, so an admin-only group costs a non-admin user
 * no pixels.
 *
 * Two presentations of one component. The rail is fixed-position and the
 * content is offset with padding, so there is a single DOM tree rather than a
 * desktop rail plus a separate mobile drawer that can drift out of sync. Below
 * `lg` the same element slides in over a scrim.
 *
 * THE COLLAPSED WIDTH IS DESKTOP-ONLY. It is applied as `lg:w-[var(--rail-w)]`
 * rather than an inline `width`, because the stored preference would otherwise
 * also shrink the drawer to 76px on a phone, where there is no expand button
 * to undo it.
 *
 * `variant` is retained as a no-op-compatible prop so existing call sites keep
 * compiling. Every page in /dashboard now uses the same light surface; the dark
 * theme that used to sit behind `variant="dark"` has been deleted rather than
 * left dormant.
 */

import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, PanelLeftClose, PanelLeftOpen, LogOut } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import NetampsLogo from '../NetampsLogo';

const STORAGE_KEY = 'netamps_nav_collapsed';

export type NavItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Internal route. Omit for an action row (`onClick`). */
  href?: string;
  external?: boolean;
  onClick?: () => void;
  /** Accent used for the active item's icon and edge bar. */
  accent?: keyof typeof ACCENTS;
  /** Rendered at the row's right edge — a count, a state word, a switch. */
  trailing?: ReactNode;
  /** Force the active state; omit to derive it from the pathname. */
  active?: boolean;
  /** Explains the row in collapsed mode and on hover. */
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

const ACCENTS = {
  indigo: { text: 'text-indigo-400', bar: 'bg-indigo-500', light: 'text-indigo-600' },
  amber: { text: 'text-amber-400', bar: 'bg-amber-500', light: 'text-amber-600' },
  sky: { text: 'text-sky-400', bar: 'bg-sky-500', light: 'text-sky-600' },
  emerald: { text: 'text-emerald-400', bar: 'bg-emerald-500', light: 'text-emerald-600' },
  slate: { text: 'text-slate-300', bar: 'bg-slate-400', light: 'text-slate-600' },
};

const RAIL = { open: 264, closed: 76 } as const;

/**
 * The shell's surface contract. Kept as an explicit type rather than inferred
 * from `THEME` so a call site that reaches for a token this shell does not
 * define fails to compile instead of silently rendering unstyled.
 */
type Theme = {
  canvas: string;
  rail: string;
  scrim: string;
  topbar: string;
  label: string;
  divider: string;
  itemIdle: string;
  itemActive: string;
  chrome: string;
  footer: string;
  identity: string;
  accentText: (k: keyof typeof ACCENTS) => string;
  accentBar: (k: keyof typeof ACCENTS) => string;
};

/**
 * ONE surface, not two.
 *
 * This used to carry a dark and a light theme, with `/dashboard` on dark and the
 * three sub-pages on light — so four pages in one area presented two different
 * products. The near-black (`#020817`/`#040a17`) was the outlier and has been
 * removed rather than left dormant: keeping an unreachable theme is how a
 * surface quietly comes back and re-splits the area.
 *
 * The token names are kept (canvas, rail, topbar…) even though there is one
 * value each, because they still say what each part of the shell IS, and
 * adding a second surface later should be a matter of values rather than a
 * rewrite of every call site.
 */
const THEME: Theme = {
  canvas: 'bg-slate-50 text-slate-900',
  rail: 'bg-white border-slate-200',
  scrim: 'bg-slate-900/40',
  topbar: 'border-slate-200 bg-white/90 text-slate-500',
  label: 'text-slate-400',
  divider: 'bg-slate-200',
  itemIdle: 'text-slate-600 hover:text-slate-900 hover:bg-slate-100',
  itemActive: 'bg-slate-100 text-slate-900',
  chrome: 'text-slate-400 hover:text-slate-900 hover:bg-slate-100',
  footer: 'border-slate-200 bg-slate-50',
  identity: 'text-slate-700',
  accentText: (k: keyof typeof ACCENTS) => ACCENTS[k].light,
  accentBar: (k: keyof typeof ACCENTS) => ACCENTS[k].bar,
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
  /** Accepted and ignored — one surface now covers every dashboard page. */
  variant?: 'dark' | 'light';
  topRight?: ReactNode;
  children: ReactNode;
}) {
  const t = THEME;
  const pathname = usePathname() || '/dashboard';

  // Read after mount: the rail's width feeds layout padding, and a mismatch
  // between server and client HTML would reflow the whole page on hydration.
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    try { setCollapsed(localStorage.getItem(STORAGE_KEY) === '1'); } catch { /* private mode */ }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch { /* private mode */ }
      return next;
    });
  };

  // Navigating on mobile must dismiss the drawer, or the destination is
  // hidden behind the very thing used to reach it.
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false); };
    window.addEventListener('keydown', onKey);
    // Lock the page behind the scrim: scrolling content out from under an
    // overlay reads as a broken overlay, not as a drawer.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  const railWidth = collapsed ? RAIL.closed : RAIL.open;

  return (
    <div
      className={`min-h-screen ${t.canvas} font-sans`}
      style={{ '--rail-w': `${railWidth}px` } as CSSProperties}
    >
      {drawerOpen && (
        <div
          className={`fixed inset-0 z-40 ${t.scrim} backdrop-blur-sm lg:hidden`}
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Rail ── */}
      <aside
        aria-label="Primary"
        className={`fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col border-r lg:w-[var(--rail-w)] ${t.rail}
                    transition-[width,transform] duration-200 ease-out
                    lg:translate-x-0 ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Brand */}
        <div className={`flex h-14 shrink-0 items-center gap-2.5 px-4 ${collapsed ? 'justify-center' : ''}`}>
          <NetampsLogo className="h-8 w-8 shrink-0" />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-black tracking-tight">Netamps</div>
              <div className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                Enterprise DB
              </div>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={toggleCollapsed}
              className={`hidden shrink-0 rounded-lg p-1.5 ${t.chrome} lg:block`}
              title="Collapse navigation"
              aria-label="Collapse navigation"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>

        {collapsed && (
          <button
            onClick={toggleCollapsed}
            className={`mx-auto mb-2 hidden rounded-lg p-1.5 ${t.chrome} lg:block`}
            title="Expand navigation"
            aria-label="Expand navigation"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}

        {/* Sections */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2">
          {sections.map((section) => {
            const visible = section.items.filter(Boolean);
            if (visible.length === 0) return null;
            return (
              <div key={section.id} className="mb-1.5 last:mb-0">
                {!collapsed && (
                  <div className={`px-3 pb-1.5 pt-3 text-[10px] font-bold uppercase tracking-[0.14em] ${t.label}`}>
                    {section.label}
                  </div>
                )}
                {collapsed && <div className={`mx-3 my-3 h-px ${t.divider}`} />}
                <ul className="space-y-0.5">
                  {visible.map((item) => <RailItem key={item.key} item={item} collapsed={collapsed} pathname={pathname} theme={t} />)}
                </ul>
              </div>
            );
          })}
        </nav>

        {/* Identity + session */}
        <div className={`shrink-0 border-t px-3 py-3 ${t.footer}`}>
          <div className="flex items-center gap-2.5">
            {/* At 76px an avatar and a sign-out cannot both fit, and the
                control that ends the session is the one worth keeping. */}
            {!collapsed && (
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-black bg-indigo-50 text-indigo-700`}>
                {(footer.email || '?').slice(0, 1).toUpperCase()}
              </span>
            )}
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className={`truncate text-xs font-semibold ${t.identity}`} title={footer.email}>
                  {footer.email}
                </div>
                <div className={`truncate text-[10px] font-bold uppercase tracking-wider ${t.label}`}>
                  {footer.role}
                </div>
              </div>
            )}
            <button
              onClick={footer.onTerminate}
              className={`shrink-0 rounded-lg p-2 ${t.chrome} ${collapsed ? 'mx-auto' : 'ml-auto'}`}
              title="Terminate session"
              aria-label="Terminate session"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Content ── */}
      {/* The rail is fixed, so the content is offset by its width. The value
          travels as a CSS variable — inherited from the root — because a width
          that changes on a click cannot be a Tailwind class: JIT only sees
          literal class names, so `pl-[264px]` and `pl-[76px]` are both static
          and the variable is what actually switches between them. */}
      <div className="transition-[padding] duration-200 ease-out lg:pl-[var(--rail-w)]">
        {/* Slim top bar: mobile entry point, page identity, and a slot for
            page-level actions. Deliberately thin — it is not a second nav.
            The label is a span rather than a heading: every page below carries
            its own h1, and two of them makes the outline ambiguous. */}
        <div className={`sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-4 backdrop-blur-xl sm:px-6 ${t.topbar}`}>
          <button
            onClick={() => setDrawerOpen(true)}
            className={`rounded-lg p-2 lg:hidden ${t.chrome}`}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          <span className="min-w-0 flex-1 truncate text-sm font-bold text-current opacity-90">
            {titleFor(pathname)}
          </span>

          {topRight}
        </div>

        {children}
      </div>
    </div>
  );
}

function RailItem({
  item,
  collapsed,
  pathname,
  theme,
}: {
  item: NavItem;
  collapsed: boolean;
  pathname: string;
  theme: Theme;
}) {
  const active = isActivePath(item, pathname);
  const Icon = item.icon;
  const accent = item.accent ? theme.accentText(item.accent) : '';
  const bar = item.accent ? theme.accentBar(item.accent) : 'bg-slate-400';

  const className = [
    'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    collapsed ? 'justify-center px-0' : '',
    active ? theme.itemActive : theme.itemIdle,
    active && accent ? accent : '',
  ].join(' ');

  const inner = (
    <>
      {/* Active edge bar — the one cue that survives a collapsed rail. */}
      <span
        aria-hidden="true"
        className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full transition-opacity ${
          active ? `${bar} opacity-100` : 'opacity-0'
        }`}
      />
      <Icon className={`h-[18px] w-[18px] shrink-0 ${active && accent ? accent : ''}`} />
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
          {item.trailing && <span className="shrink-0 text-xs">{item.trailing}</span>}
        </>
      )}
    </>
  );

  const title = collapsed ? `${item.label}${item.title ? ` — ${item.title}` : ''}` : item.title;

  if (item.onClick) {
    return (
      <li>
        <button type="button" onClick={item.onClick} className={className} title={title} aria-current={active ? 'page' : undefined}>
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
    <li>
      <Tag {...hrefProps} className={className} title={title} aria-current={active ? 'page' : undefined}>
        {inner}
      </Tag>
    </li>
  );
}
