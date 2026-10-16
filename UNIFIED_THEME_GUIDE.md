# Netamps Unified Module Theme — Design System Guide

**Purpose:** Ensure every module (login, dashboard, intake, returns, track, admin, status, privacy, etc.)
shares one modern, consistent CSS theme and component library. New modules follow this pattern unless
mandatorily specified otherwise.

**Location:** `C:\Users\Ashok\Documents\Default Project\netamps-landing\`

---

## 1. Design System Overview

### Core Principles

| Principle | Rule |
|-----------|------|
| **One theme** | All modules use `app/lib/theme.ts` design tokens — no module-local color palettes |
| **Shared components** | All UI comes from `app/components/ui/` — no ad-hoc button/input/card implementations |
| **Consistent layout** | All pages use `PageShell` + `ModuleHeader` for consistent structure |
| **Semantic colors** | Success/warning/error/info have fixed meanings across all modules |
| **Extensible** | Need a new token/component? Add it to the design system — do not invent it inline |

---

## 2. File Structure

```
app/
├── lib/
│   └── theme.ts              # Design tokens, colors, components, module accents
├── components/
│   └── ui/
│       ├── index.ts          # Barrel export — import from here
│       ├── Card.tsx
│       ├── Button.tsx
│       ├── Input.tsx
│       ├── InputLabel.tsx    # Label + InputError
│       ├── Alert.tsx
│       ├── Badge.tsx
│       ├── SectionHeader.tsx
│       ├── PageShell.tsx
│       ├── ModuleHeader.tsx
│       ├── EmptyState.tsx
│       └── LoadingSpinner.tsx
├── layout.tsx                # Root layout — fonts, security, AdSense
└── globals.css               # Tailwind + unified CSS variables
```

---

## 3. Design Tokens (`app/lib/theme.ts`)

### Colors

| Token | Value | Usage |
|-------|-------|-------|
| `COLORS.primary` | `#4f46e5` | Primary actions, links, active states |
| `COLORS.primaryHover` | `#4338ca` | Hover states |
| `COLORS.primaryLight` | `#eef2ff` | Subtle backgrounds |
| `COLORS.background` | `#f8fafc` | Page background |
| `COLORS.surface` | `#ffffff` | Card/panel background |
| `COLORS.textPrimary` | `#0f172a` | Headings, labels |
| `COLORS.textSecondary` | `#475569` | Body copy, captions |
| `COLORS.textMuted` | `#94a3b8` | Placeholders, disabled |
| `COLORS.borderLight` | `#e2e8f0` | Subtle dividers |
| `COLORS.borderMedium` | `#cbd5e1` | Input borders |
| `COLORS.borderFocus` | `#4f46e5` | Focused input border |
| `COLORS.success` | `#10b981` | Success actions/states |
| `COLORS.warning` | `#f59e0b` | Warning actions/states |
| `COLORS.error` | `#ef4444` | Error actions/states |
| `COLORS.info` | `#3b82f6` | Info actions/states |

### Component Presets (`COMPONENTS`)

| Preset | Description |
|--------|-------------|
| `COMPONENTS.card` | Standard card (white, border, shadow-sm) |
| `COMPONENTS.cardElevated` | Card with shadow-lg |
| `COMPONENTS.cardInteractive` | Card with hover effects |
| `COMPONENTS.btnPrimary` | Primary action button |
| `COMPONENTS.btnSecondary` | Secondary action button |
| `COMPONENTS.btnGhost` | Subtle text button |
| `COMPONENTS.btnDanger` | Destructive action button |
| `COMPONENTS.btnOutline` | Outlined button |
| `COMPONENTS.input` | Standard text input |
| `COMPONENTS.label` | Form field label |
| `COMPONENTS.alert*` | Notification banners (success/warning/error/info) |
| `COMPONENTS.badge*` | Status pills (success/warning/error/info/neutral) |
| `COMPONENTS.pageContainer` | Full page wrapper |
| `COMPONENTS.pageContent` | Constrained content area |
| `COMPONENTS.moduleTitle` | Module page heading |
| `COMPONENTS.sectionHeader` | Section heading |

### Module Accents (`MODULE_COLORS`)

Each module gets ONE accent color used consistently:

| Module | Accent | Usage |
|--------|--------|-------|
| `login` | indigo | Login page |
| `dashboard` | indigo | Dashboard |
| `intake` | indigo | Intake workbench |
| `returns` | emerald | Returns management |
| `track` | sky | Delivery tracking |
| `admin` | slate | Admin console |
| `status` | sky | Status page |
| `privacy` | indigo | Privacy page |

Use `moduleAccent('moduleName')` to get the accent config for a module.

---

## 4. UI Components (`app/components/ui/`)

### Card
```tsx
<Card elevated interactive className="my-4">
  <CardHeader>
    <CardTitle>Panel Title</CardTitle>
    <CardDescription>Optional description</CardDescription>
  </CardHeader>
  {/* content */}
</Card>
```

### Button
```tsx
<Button variant="primary" size="md" disabled={isLoading}>
  Submit
</Button>
```
Variants: `primary` \| `secondary` \| `ghost` \| `danger` \| `outline`  
Sizes: `sm` \| `md`

### Input
```tsx
<Label>Email address</Label>
<Input icon={<Mail className="h-5 w-5 text-slate-500" />} type="email" />
<InputError>Invalid email format</InputError>
```

### Alert
```tsx
<Alert variant="error" icon={<AlertCircle className="w-4 h-4" />}>
  Something went wrong. Please try again.
</Alert>
```
Variants: `success` \| `warning` \| `error` \| `info`

### Badge
```tsx
<Badge variant="success">Verified</Badge>
<Badge variant="warning">Pending</Badge>
```
Variants: `success` \| `warning` \| `error` \| `info` \| `neutral`

### PageShell
```tsx
<PageShell>
  <ModuleHeader title="Intake Workbench" subtitle="Import business data" />
  {/* content */}
</PageShell>
```

### ModuleHeader
```tsx
<ModuleHeader
  title="Intake Workbench"
  subtitle="Import CSV, JSON, or XLSX files"
  actions={<Button variant="ghost">Help</Button>}
/>
```

### SectionHeader
```tsx
<SectionHeader title="Schema Mapping" subtitle="Map source columns to target fields" />
```

### EmptyState
```tsx
<EmptyState
  icon={<Package className="w-12 h-12" />}
  title="No data yet"
  description="Upload a file to get started"
  action={<Button variant="primary">Upload File</Button>}
/>
```

### LoadingSpinner
```tsx
<LoadingSpinner className="h-6 w-6" />
```

---

## 5. Module Creation Template

Create a new module at `app/{moduleName}/page.tsx` following this template:

```tsx
'use client';

import { useState } from 'react';
import { PageShell, ModuleHeader, Card, CardHeader, CardTitle, Button, Input, Label, Alert, Badge } from '@/components/ui';
import { moduleAccent, THEME } from '@/lib/theme';
import { Mail, Lock } from 'lucide-react';

const MODULE = 'login'; // or 'dashboard', 'intake', etc.
const ACCENT = moduleAccent(MODULE);

export default function {ModuleName}Page() {
  return (
    <PageShell>
      <ModuleHeader
        title="{Module Display Name}"
        subtitle="One-line description of what this module does"
        actions={<Button variant="ghost">Help</Button>}
      />

      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Enter your credentials to access the portal.</CardDescription>
        </CardHeader>

        <form className="space-y-4">
          <Label>Email address</Label>
          <Input icon={<Mail className="h-5 w-5 text-slate-500" />} type="email" />
          
          <Label>Password</Label>
          <Input icon={<Lock className="h-5 w-5 text-slate-500" />} type="password" />
          
          <Button type="submit" variant="primary">
            Sign in
          </Button>
        </form>
      </Card>
    </PageShell>
  );
}
```

**Rules:**
1. Wrap everything in `<PageShell>` — never use ad-hoc layout classes
2. Use `<ModuleHeader>` for the page title — never inline `<h1>` tags
3. Use `<Card>` for content panels — never inline `bg-white border rounded` classes
4. Use `<Button>`, `<Input>`, `<Label>`, `<Alert>`, `<Badge>` — never inline button/input styles
5. Use `moduleAccent('moduleName')` for module-specific accent colors
6. Import from `@/components/ui` — never import individual component files directly

---

## 6. Updating Existing Modules

When refactoring an existing module:

1. **Replace inline classes** with `COMPONENTS.*` presets from `theme.ts`
2. **Replace ad-hoc buttons** with `<Button>` component
3. **Replace ad-hoc inputs** with `<Input>` + `<Label>` + `<InputError>`
4. **Replace ad-hoc alerts** with `<Alert>` component
5. **Replace ad-hoc badges** with `<Badge>` component
6. **Wrap in `<PageShell>` + `<ModuleHeader>`**
7. **Use `moduleAccent()`** for any module-specific accent color

**Example — before:**
```tsx
<div className="bg-white/90 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl p-6 border border-slate-200/60">
  <button className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded-xl">
    Submit
  </button>
</div>
```

**Example — after:**
```tsx
<Card className="my-4">
  <Button variant="primary">Submit</Button>
</Card>
```

---

## 7. CSS Variables (`globals.css`)

All design tokens are also available as CSS variables for use in custom styles:

```css
.custom-element {
  color: var(--net-text-primary);
  background: var(--net-bg);
  border-color: var(--net-border-focus);
}
```

---

## 8. Do's and Don'ts

| ✅ Do | ❌ Don't |
|-------|----------|
| Import from `@/components/ui` | Import individual component files directly |
| Use `COMPONENTS.btnPrimary` | Write inline `bg-indigo-600 hover:bg-indigo-500` classes |
| Use `moduleAccent('moduleName')` | Hardcode module-specific colors |
| Wrap pages in `<PageShell>` | Use ad-hoc `min-h-screen bg-*` classes |
| Add new tokens to `theme.ts` | Create module-local color constants |
| Use semantic colors consistently | Use red for success or green for errors |

---

## 9. Future Module Checklist

Before creating a new module:

- [ ] Create `app/{moduleName}/page.tsx` using `PageShell` + `ModuleHeader`
- [ ] Use only components from `@/components/ui`
- [ ] Use only colors from `theme.ts` (or `moduleAccent()`)
- [ ] Add module name to `MODULE_COLORS` if it needs a distinct accent
- [ ] Verify the module looks consistent with login/dashboard/intake
- [ ] Run `npm run typecheck` and `npm run build` to verify no breakage

---

**Last updated:** Sat Oct 17 2026  
**Owner:** Netamps Engineering  
**Applies to:** All modules under `app/` in `netamps-landing/`