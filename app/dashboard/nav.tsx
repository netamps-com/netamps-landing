'use client';

/**
 * The dashboard's navigation, declared once and shared by every page under
 * /dashboard.
 *
 * It lives in its own file because the four pages that render the rail would
 * otherwise each grow a copy of the same eleven entries, and the next module
 * would have to be added four times — which is exactly how the header ended up
 * as a row of eleven buttons with nowhere left to put anything.
 *
 * SECTIONS ARE UNCONDITIONAL, ROWS ARE OPTIONAL. Workspace, Commerce and Tools
 * always render; Administration renders only when a page supplies handlers.
 * Rows are appended only if the thing they act on exists on that page: the
 * export rows need the dashboard's dataset, the admin rows open modals that
 * only the dashboard mounts. A row never appears as a dead control, and a
 * section with no rows renders nothing, so an admin-only group costs a
 * non-admin user no pixels.
 *
 * NAVIGATION ONLY. The rail carries routes and route-like jumps — nothing that
 * is a preference or a setting. `Best-match` used to live here as an ON/OFF
 * box; it is an order-list preference, so it now sits on the order list where
 * the list it changes is visible while you change it.
 */

import {
  Database,
  FileJson,
  FileSpreadsheet,
  Handshake,
  History,
  Mail,
  Package,
  Radio,
  ScrollText,
  Search,
  Sparkles,
  Users,
} from 'lucide-react';
import type { NavSection } from './DashboardNav';

export type NavActions = {
  /** Admin rows appear only for an admin AND only where a handler is given. */
  isAdmin?: boolean;
  onOpenLogs?: () => void;
  onOpenUsers?: () => void;
  onExport?: (format: 'json' | 'csv') => void;
};

export function buildNavSections(a: NavActions = {}): NavSection[] {
  // Intake leads the rail. It is the one destination that creates work rather
  // than reporting on it, so it belongs above the read-only views — and in the
  // rail rather than the header, where a fifth control would crowd the page
  // toolbar at exactly the widths where it already wraps.
  const workspace: NavSection['items'] = [
    {
      key: 'intake',
      label: 'Intake Workbench',
      icon: Database,
      accent: 'indigo',
      href: '/intake',
      title: 'Create and commit new requests',
    },
    { key: 'orders', label: 'Orders', icon: Package, accent: 'emerald', href: '/dashboard' },
    { key: 'search', label: 'Search', icon: Search, accent: 'sky', href: '/dashboard/search' },
  ];

  const tools: NavSection['items'] = [
    {
      key: 'netamps-ai',
      label: 'NETAMPS AI',
      icon: Sparkles,
      accent: 'indigo',
      href: '/dashboard/ai',
      title: 'Governed model modules, runs and review inbox (operators only)',
    },
    {
      key: 'webmail',
      label: 'Webmail',
      icon: Mail,
      accent: 'indigo',
      href: 'https://webmail.netamps.in',
      external: true,
      title: 'Open webmail in a new tab',
    },
  ];

  if (a.onExport) {
    tools.push(
      { key: 'export-json', label: 'Export JSON', icon: FileJson, accent: 'slate', onClick: () => a.onExport!('json') },
      { key: 'export-csv', label: 'Export CSV', icon: FileSpreadsheet, accent: 'slate', onClick: () => a.onExport!('csv') },
    );
  }

  const admin: NavSection['items'] = [];

  if (a.isAdmin && a.onOpenLogs) {
    admin.push({
      key: 'logs',
      label: 'Event Logs',
      icon: ScrollText,
      accent: 'indigo',
      onClick: a.onOpenLogs,
      title: 'Website event logs',
    });
  }

  if (a.isAdmin && a.onOpenUsers) {
    admin.push({ key: 'users', label: 'Manage Users', icon: Users, accent: 'emerald', onClick: a.onOpenUsers });
  }

  return [
    {
      id: 'workspace',
      label: 'Workspace',
      items: workspace,
    },
    {
      id: 'commerce',
      label: 'Commerce',
      items: [
        { key: 'negotiations', label: 'Negotiations', icon: Handshake, accent: 'amber', href: '/dashboard/negotiations' },
        { key: 'price-tracker', label: 'Price Tracker', icon: History, accent: 'emerald', href: '/dashboard/price-tracker' },
        { key: 'feed', label: 'Feed Push', icon: Radio, accent: 'sky', href: '/dashboard/feed' },
      ],
    },
    { id: 'tools', label: 'Tools', items: tools },
    { id: 'admin', label: 'Administration', items: admin },
  ];
}
