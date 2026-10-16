'use client';

import { useState, useEffect, useRef, useMemo, useCallback, type ReactNode, type ChangeEvent } from 'react';
import Link from 'next/link';
import { motion } from "motion/react";
import { Turnstile } from '@marsidev/react-turnstile';
import { ArrowLeft, Box, Building2, User, Phone, CheckCircle2, Plus, Trash2, Search, ShieldCheck, Link2, ChevronUp, ChevronDown, AlertCircle, Heart, Zap, DollarSign, Shield, Cpu, Laptop2, Mouse, Package, Folder } from 'lucide-react';
import NetampsLogo from '../NetampsLogo';
import SecureMediaUploader, { SecureMediaUploaderHandle, AttachmentSnapshot } from './SecureMediaUploader';
import DetailsSuggest, { CatalogSuggestion } from './DetailsSuggest';
import ReturnsHero from './ReturnsHero';
import { sanitizeMoneyInput, moneyStringToPaise, formatPaise, evalUnitPaise } from '../lib/money';
import { statusChip, normalizeStatus, showsEvaluation } from '../lib/status';

// ── Industry-standard ITAD equipment categories ──
// The Category field is a fixed dropdown (both Sell & Buy). A catalog
// suggestion carries a lowercase slug; CATSlugToLabel maps it onto the matching
// dropdown option so picking a match also selects the right category. Unknown
// slugs fall back to "Other / Mixed".
const CATEGORY_OPTIONS = [
  'Servers',
  'Storage',
  'Networking Equipment',
  'Workstations & Desktops',
  'Laptops & Notebooks',
  'Monitors & Displays',
  'Printers & Scanners',
  'Mobile Devices & Tablets',
  'Telecom & Unified Communications',
  'Peripherals & Accessories',
  'Components & Parts',
  'Other / Mixed'
];

const CAT_SLUG_TO_LABEL: Record<string, string> = {
  servers: 'Servers',
  storage: 'Storage',
  network: 'Networking Equipment',
  networking: 'Networking Equipment',
  workstations: 'Workstations & Desktops',
  laptops: 'Laptops & Notebooks',
  displays: 'Monitors & Displays',
  monitors: 'Monitors & Displays',
  printers: 'Printers & Scanners',
  mobile: 'Mobile Devices & Tablets',
  telecom: 'Telecom & Unified Communications',
  peripherals: 'Peripherals & Accessories',
  components: 'Components & Parts',
  mixed: 'Other / Mixed'
};

function categoryLabelForSlug(slug?: string): string {
  const key = String(slug || '').trim().toLowerCase();
  return CAT_SLUG_TO_LABEL[key] || 'Other / Mixed';
}

function hexOfBytes(bytes: Uint8Array) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Json(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return hexOfBytes(new Uint8Array(digest));
}

// Line Consideration helper text. The placeholder stays under ~20 visible
// chars (the field column truncates sentences mid-word); the microcopy below
// the field carries the meaning. Whole-line semantics explicit; SELL total vs
// BUY budget in one trailing word. Industry term: upfront discount — the
// visitor's line-total offer against evaluated value. Never a default — submits empty.
function considerationHint(qtyRaw: unknown, baseRaw: string, intent: 'sell' | 'buy'): { placeholder: string; scope: string } {
  const n = Number(qtyRaw);
  const qty = Number.isInteger(n) && n > 0 ? n : 1;
  const scope = qty === 1 ? 'this line' : `all ${qty} units`;
  const askWord = intent === 'sell' ? 'total' : 'budget';
  const base = moneyStringToPaise(baseRaw || '');
  const examplePaise = base !== null && Number.isSafeInteger(qty * base) ? qty * base : 12500000;
  const example = (examplePaise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  return { placeholder: `e.g. ${example} ${askWord}`, scope };
}

interface ProductItem {
  id: string;
  strategicTarget: 'resale' | 'compliance';
  lifecycleAge: string;
  category: string;
  details: string;
  quantity: number;
  attachedFiles: string[];
  // BUY precision shell: set only when the visitor picked a server-validated
  // catalog suggestion. Absent/empty = Custom (unverified) line — submittable
  // but flagged to staff. The server re-validates this id against the catalog.
  catalogId?: string;
  // Visitor-stated consideration, raw editable string. Parsed to paise
  // (integer) or null only at validation/submit — never stored as float.
  lineConsideration: string;
  lineConsiderationPaise?: number | null;
  // Base unit price for lot-mode breakdowns (raw editable string).
  basePrice: string;
  // Last catalog composition written into `details` by the typeahead. Lets a
  // second selection replace it while preserving hand-typed specs.
  selectedModel?: string;
  // Has this line EVER had a catalog suggestion captured? Distinct from
  // `catalogId`, which a manual edit clears. `captured` is sticky because
  // applySuggestion needs to tell "this text is a search query" (replace it)
  // from "this text is specs the visitor added after a capture" (keep it).
  captured?: boolean;
}

// ── Money contract lives in app/lib/money.ts (paise integers end-to-end,
// null = unstated, never 0). Line consideration already includes all units;
// evaluated price is per-unit. ──

/* ── Floating-label field ───────────────────────────────────────────────────
   The label IS the placeholder: it sits inside the empty box, then shrinks to
   a caption above the text the moment the field gains focus or a value (pure
   CSS via peer + :placeholder-shown, so no JS state per keystroke). The icon
   tints toward the intent colour on focus so the active field reads as one
   unit instead of three detached parts. Uncontrolled on purpose — submit reads
   FormData, and a controlled twin would re-render the whole card per key. */
type FloatAccent = 'indigo' | 'amber';
const FLOAT_ACCENTS: Record<FloatAccent, { ring: string; label: string; icon: string }> = {
  indigo: {
    ring: 'focus:border-indigo-500 focus:ring-indigo-500/25',
    label: 'peer-focus:text-indigo-600',
    icon: 'peer-focus:text-indigo-500',
  },
  amber: {
    ring: 'focus:border-amber-500 focus:ring-amber-500/25',
    label: 'peer-focus:text-amber-600',
    icon: 'peer-focus:text-amber-500',
  },
};

function FloatField({
  id,
  label,
  icon,
  accent = 'indigo',
  required,
  type = 'text',
  name,
  maxLength,
  pattern,
  inputMode,
  autoComplete,
  value,
  onChange,
}: {
  id: string;
  label: string;
  icon: ReactNode;
  accent?: FloatAccent;
  required?: boolean;
  type?: string;
  name?: string;
  maxLength?: number;
  pattern?: string;
  inputMode?: 'text' | 'tel' | 'email' | 'numeric';
  autoComplete?: string;
  value?: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  const a = FLOAT_ACCENTS[accent];
  return (
    <div className="relative">
      <input
        id={id}
        name={name ?? id}
        type={type}
        required={required}
        maxLength={maxLength}
        pattern={pattern}
        inputMode={inputMode}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        placeholder=" "
        aria-label={label + (required ? ' (required)' : '')}
        className={`peer block w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-11 pr-4 pt-7 pb-2 text-sm text-slate-900 outline-none transition focus:ring-4 ${a.ring}`}
      />
      <span aria-hidden className={`pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 transition-colors ${a.icon}`}>
        {icon}
      </span>
      <label
        htmlFor={id}
        className={`pointer-events-none absolute left-11 top-1/2 -translate-y-1/2 truncate text-sm text-slate-400 transition-all duration-150 peer-focus:top-2.5 peer-focus:translate-y-0 peer-focus:text-[11px] peer-focus:font-semibold ${a.label} peer-[:not(:placeholder-shown)]:top-2.5 peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-[11px] peer-[:not(:placeholder-shown)]:font-semibold peer-[:not(:placeholder-shown)]:text-slate-500`}
      >
        {label}{required ? ' *' : ''}
      </label>
    </div>
  );
}

/* ── Intent tab ─────────────────────────────────────────────────────────────
   One card per choice, not one lit pill among grey text. Every option carries
   its own icon and a one-line caption, so the unselected ones still read as
   tappable; the active one carries its intent colour. Full class strings per
   accent — Tailwind JIT only emits literals, never interpolated names. */
type TabAccent = 'indigo' | 'emerald' | 'amber';
const TAB_ACCENTS: Record<TabAccent, {
  active: string; idle: string; hoverBorder: string; focus: string;
  iconActive: string; iconIdle: string; subActive: string; subIdle: string;
}> = {
  indigo: {
    active: 'border-indigo-600 bg-indigo-600 text-white shadow-md shadow-indigo-600/25',
    idle: 'border-slate-200 bg-white text-slate-600',
    hoverBorder: 'hover:border-indigo-300 hover:shadow-sm',
    focus: 'focus-visible:ring-indigo-500',
    iconActive: 'bg-white/20 text-white',
    iconIdle: 'bg-slate-100 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600',
    subActive: 'text-white/75',
    subIdle: 'text-slate-400',
  },
  emerald: {
    active: 'border-emerald-600 bg-emerald-600 text-white shadow-md shadow-emerald-600/25',
    idle: 'border-slate-200 bg-white text-slate-600',
    hoverBorder: 'hover:border-emerald-300 hover:shadow-sm',
    focus: 'focus-visible:ring-emerald-500',
    iconActive: 'bg-white/20 text-white',
    iconIdle: 'bg-slate-100 text-slate-400 group-hover:bg-emerald-50 group-hover:text-emerald-600',
    subActive: 'text-white/75',
    subIdle: 'text-slate-400',
  },
  amber: {
    active: 'border-amber-600 bg-amber-600 text-white shadow-md shadow-amber-600/25',
    idle: 'border-slate-200 bg-white text-slate-600',
    hoverBorder: 'hover:border-amber-300 hover:shadow-sm',
    focus: 'focus-visible:ring-amber-500',
    iconActive: 'bg-white/20 text-white',
    iconIdle: 'bg-slate-100 text-slate-400 group-hover:bg-amber-50 group-hover:text-amber-600',
    subActive: 'text-white/75',
    subIdle: 'text-slate-400',
  },
};

function IntentTab({
  active,
  onClick,
  accent,
  icon,
  title,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  accent: TabAccent;
  icon: ReactNode;
  title: string;
  sub: string;
}) {
  const a = TAB_ACCENTS[accent];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={`${title} — ${sub}`}
      onClick={onClick}
      className={`group flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${a.focus} ${active ? a.active : `${a.idle} ${a.hoverBorder}`}`}
    >
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg transition-colors ${active ? a.iconActive : a.iconIdle}`}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-bold leading-tight">{title}</span>
        <span className={`block truncate text-[11px] font-medium leading-tight ${active ? a.subActive : a.subIdle}`}>{sub}</span>
      </span>
    </button>
  );
}

export default function ReturnsPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [intent, setIntent] = useState<'sell' | 'buy' | 'track'>('sell');
  
  // OTP State
  const [showOtp, setShowOtp] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [formDataCache, setFormDataCache] = useState<FormData | null>(null);
  
  // Tracking State
  const [trackingId, setTrackingId] = useState('');
  const [trackingResult, setTrackingResult] = useState<any>(null);
  const [trackingError, setTrackingError] = useState('');

  const [products, setProducts] = useState<ProductItem[]>([
    { id: crypto.randomUUID(), strategicTarget: 'resale', lifecycleAge: '', category: '', details: '', quantity: 1, attachedFiles: [], lineConsideration: '', basePrice: '' }
  ]);
  const [generatedId, setGeneratedId] = useState('');
  const [captchaError, setCaptchaError] = useState('');
  // Upload bot gate (dormant without the site key, same contract as login).
  // Verified server-side per submit before any OTP is issued (tokens single-use).
  const retSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';
  const [retToken, setRetToken] = useState('');
  const [retKey, setRetKey] = useState(0);
  const resetRetToken = () => {
    setRetToken('');
    setRetKey((k) => k + 1);
  };
  // Inline product-removal confirmation (keyed by product id; index derived
  // at render so intent-toggle resets can never show a stale number).
  const [pendingDelete, setPendingDelete] = useState<{ id: string; count: number } | null>(null);

  // Consideration basis (visitor's choice, preserved across toggles — never cleared):
  // 'per_product' = line total per product card; 'lot' = single whole-request total.
  const [pricingBasis, setPricingBasis] = useState<'per_product' | 'lot'>('per_product');
  const [lotConsideration, setLotConsideration] = useState('');
  
  // Secure File Upload State — the queue itself lives in the single global
  // SecureMediaUploader instance below; the page mirrors it for chips,
  // gating, and the submit manifest. No parallel counters anywhere.
  const [uploadedSecureFiles, setUploadedSecureFiles] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const uploaderRef = useRef<SecureMediaUploaderHandle>(null);
  const [queueSnapshot, setQueueSnapshot] = useState<AttachmentSnapshot[]>([]);
  const [uploadReset, setUploadReset] = useState(0);
  const [dragOverCard, setDragOverCard] = useState<string | null>(null);
  const [requestScope, setRequestScope] = useState('');
  const [buyListExpanded, setBuyListExpanded] = useState(true);
  // Bumped on every manual Clear so the form subtree remounts: uncontrolled
  // leftovers, DetailsSuggest dropdown state and any child-local buffers are
  // dropped along with the React state purge below. Intent + sid survive —
  // they are mode/session identity, not form data.
  const [formEpoch, setFormEpoch] = useState(0);
  const handleQueueChange = useCallback((snap: AttachmentSnapshot[]) => {
    setQueueSnapshot(snap);
  }, []);

  // productId -> verified+staged attachments, derived (never synced)
  const filesByProduct = useMemo(() => {
    const m = new Map<string, AttachmentSnapshot[]>();
    for (const f of queueSnapshot) {
      if (!f.productId) continue;
      const arr = m.get(f.productId) || [];
      arr.push(f);
      m.set(f.productId, arr);
    }
    return m;
  }, [queueSnapshot]);

  useEffect(() => {
    document.title = 'Enterprise IT Liquidation, Simplified - Netamps Technologies';
  }, []);

  useEffect(() => {
    // Independent Returns Session ID in URL (CSPRNG)
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has('sid')) {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        const sid = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
        url.searchParams.set('sid', sid);
        window.history.replaceState({}, '', url.toString());
      }
      setRequestScope(new URL(window.location.href).searchParams.get('sid') || '');
    } catch {
      // URL manipulation unavailable
    }
  }, []);

  const addProduct = () => {
    setProducts([...products, { id: crypto.randomUUID(), strategicTarget: 'resale', lifecycleAge: '', category: '', details: '', quantity: 1, attachedFiles: [], lineConsideration: '', basePrice: '' }]);
  };

  /**
   * Whether any product has been described enough to justify another line.
   *
   * Drives BOTH Add Product controls. Without this, the very first thing a
   * visitor can do is add three blank product cards, which then have to be
   * removed again. A category or free-text details is the minimum that makes a
   * line meaningful — and it is also exactly what the submit-time validation
   * requires, so the gate cannot disagree with the form's own rules.
   */
  const hasProductInput = products.some(
    (p) => (p.category && String(p.category).trim() !== '') ||
           (p.details && String(p.details).trim() !== '')
  );

  const removeProduct = (id: string) => {
    if (products.length <= 1) return;
    const mapped = queueSnapshot.filter((f) => f.productId === id);
    if (mapped.length > 0) {
      setPendingDelete({ id, count: mapped.length });
      return;
    }
    setProducts(products.filter(p => p.id !== id));
  };

  const confirmRemoveProduct = () => {
    if (!pendingDelete) return;
    uploaderRef.current?.purgeByProduct(pendingDelete.id);
    setProducts(products.filter(p => p.id !== pendingDelete.id));
    setPendingDelete(null);
  };

  const freshProduct = (): ProductItem => ({
    id: crypto.randomUUID(), strategicTarget: 'resale', lifecycleAge: '', category: '',
    details: '', quantity: 1, attachedFiles: [], lineConsideration: '', basePrice: ''
  });

  /**
   * Volatile buffer purge — the manual Clear button's single write point.
   *
   * Native form reset (which still runs: this is called from onReset WITHOUT
   * preventDefault) only clears UNCONTROLLED inputs (the contact FloatFields).
   * Everything else lives in React state or the uploader child and would
   * survive a plain reset — so this drops all of it:
   *   - uploads: aborts in-flight XHRs, revokes preview object URLs, deletes
   *     staged R2 bytes, empties the queue + page mirrors + legacy key list
   *   - products: back to one blank line; delete confirm + drag state cleared
   *   - pricing: basis + lot total cleared
   *   - OTP / tracking / submit status: all cleared (a stale cached FormData
   *     must never verify-and-submit after a purge)
   *   - captcha error + Turnstile token: cleared and reminted
   * Intent and requestScope survive: tab identity and session scope, not data.
   * formEpoch remounts the form subtree so child-local buffers (typeahead
   * dropdowns, uncontrolled leftovers) cannot outlive the purge either.
   */
  const purgeFormVolatile = () => {
    try { uploaderRef.current?.clear(); } catch { /* unmounted (buy/track) — nothing staged there */ }
    setUploadReset((n) => n + 1); // backstop: child's resetSignal effect re-fires clearAll
    setUploadedSecureFiles([]);
    setQueueSnapshot([]);
    setIsUploading(false);
    setProducts([freshProduct()]);
    setPendingDelete(null);
    setDragOverCard(null);
    setPricingBasis('per_product');
    setLotConsideration('');
    setShowOtp(false);
    setOtpCode('');
    setOtpError('');
    setFormDataCache(null);
    setTrackingId('');
    setTrackingResult(null);
    setTrackingError('');
    setIsSuccess(false);
    setGeneratedId('');
    setIsSubmitting(false);
    setCaptchaError('');
    resetRetToken();
    setBuyListExpanded(true);
    setFormEpoch((n) => n + 1);
  };

  const updateProduct = (id: string, field: keyof ProductItem, value: any) => {
    setProducts(products.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  // Catalog capture (shared by Sell & Buy): fills the Category dropdown (via
  // slug→label) + composes Details & Specs. Pricing is NEVER derived from a
  // catalog row — a suggestion is a spec, not a valuation — so every ₹ field
  // stays blank until the visitor types it (BUY exposes no ₹ fields at all).
  // The composed spec stays editable; `catalogId` marks the line Verified (the
  // server re-validates the id at submit); any manual edit clears it.
  //
  // Seed-catalog specs already lead with the model ("Dell PowerEdge R740, …")
  // while D1 rows can carry a bare template ("2U rack, 2x Xeon …") — compose so
  // the model is never dropped. selectedModel mirrors the composed text so a
  // later pick knows whether the current text is still ours or the visitor's.
  //
  // REPLACE vs APPEND — the rule that was missing:
  //   What the visitor typed to SEARCH is not content. Typing "dell r740 xeon
  //   128gb" and then picking a suggestion must yield the canonical spec, NOT
  //   "dell r740 xeon 128gb\nDell PowerEdge R740, …". The previous code appended
  //   whenever `current` was non-empty, which leaked every typo into the field.
  //   `captured` (never cleared) distinguishes the two cases:
  //     - nothing captured yet  -> the text is a query      -> REPLACE
  //     - captured, untouched    -> still our canonical text -> REPLACE
  //     - captured, then edited  -> the visitor's own specs  -> APPEND
  //   `captured` is deliberately NOT `catalogId`: a manual edit clears
  //   `catalogId` (the line drops to Custom) but must not make the next pick
  //   discard the specs the visitor just typed.
  const applySuggestion = (id: string, item: CatalogSuggestion) => {
    setProducts(products.map(p => {
      if (p.id !== id) return p;
      const modelLabel = `${item.brand ? `${item.brand} ` : ''}${item.model || ''}`.trim();
      const spec = (item.spec || item.specTemplate || '').trim();
      const specHasModel = !!item.model && spec.toLowerCase().includes(item.model.toLowerCase());
      const composed = spec
        ? (specHasModel ? spec : modelLabel ? `${modelLabel} — ${spec}` : spec)
        : (modelLabel || spec);

      const current = (p.details || '').trim();
      const editedAfterCapture = !!p.captured && current !== (p.selectedModel || '').trim();
      const details = editedAfterCapture ? `${current}\n${composed}` : composed;
      return {
        ...p,
        category: categoryLabelForSlug(item.category),
        details,
        selectedModel: composed,
        catalogId: item.id,
        captured: true
      };
    }));
  };

  // Manual edits after a capture downgrade the line back to Custom — the chip
  // must never claim verified once the canonical text has been altered.
  const manualEdit = (id: string, field: 'category' | 'details', value: string) => {
    setProducts(products.map(p => p.id === id ? { ...p, [field]: value, catalogId: undefined } : p));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCaptchaError('');

    setIsSubmitting(true);

    try {
      // Instead of submitting directly, show OTP
      const formData = new FormData(e.target as HTMLFormElement);
      
      const name = formData.get('name') as string;
      const company = formData.get('company') as string;
      const email = formData.get('email') as string;
      const phone = formData.get('phone') as string;

      if (!name.trim() || (intent === 'sell' && !company.trim()) || !email.trim() || !phone.trim()) {
        setCaptchaError('Please ensure all required fields contain valid text, not just spaces.');
        setIsSubmitting(false);
        return;
      }

      if (products.some(p => !p.category || !p.details.trim())) {
        setCaptchaError('Please ensure all product details are filled correctly.');
        setIsSubmitting(false);
        return;
      }

      // BUY precision shell: every line must carry a usable quantity too
      // (custom lines are fine — they are the Custom (unverified) path).
      if (products.some(p => !Number.isInteger(p.quantity) || p.quantity < 1)) {
        setCaptchaError('Every product line needs a quantity of at least 1.');
        setIsSubmitting(false);
        return;
      }

      // Consideration validation: paise-integer contract (empty = unstated, never 0).
      // The sanitizer makes invalid input nearly impossible; this is defense in depth.
      // Base prices live on per-product lines only; lot mode takes no base input.
      // BUY collects no stated pricing (no ₹ inputs render), so nothing to
      // validate — we evaluate. Values carried over from a SELL toggle are
      // nulled at manifest time and can never reach the API as a BUY ask.
      if (intent === 'sell' && pricingBasis === 'per_product') {
        for (let i = 0; i < products.length; i++) {
          const raw = (products[i].lineConsideration || '').trim();
          if (raw !== '' && moneyStringToPaise(raw) === null) {
            setCaptchaError(`PRODUCT #${i + 1}: consideration is not a valid amount (0 – ₹99,99,99,999, max 2 decimals).`);
            setIsSubmitting(false);
            return;
          }
          const baseRaw = (products[i].basePrice || '').trim();
          if (baseRaw !== '' && moneyStringToPaise(baseRaw) === null) {
            setCaptchaError(`PRODUCT #${i + 1}: base price is not a valid amount (0 – ₹99,99,99,999, max 2 decimals).`);
            setIsSubmitting(false);
            return;
          }
        }
      } else if (intent === 'sell' && lotConsideration.trim() !== '' && moneyStringToPaise(lotConsideration) === null) {
        setCaptchaError('Lot consideration is not a valid amount (0 – ₹99,99,99,999, max 2 decimals).');
        setIsSubmitting(false);
        return;
      }

      // Custody gating (SELL only): every staged file must be verified and
      // explicitly linked to a product before an OTP is even issued.
      if (intent === 'sell') {
        const uploading = queueSnapshot.filter((f) => f.status === 'uploading').length;
        if (uploading > 0) {
          setCaptchaError(`Files are still uploading (${uploading} remaining). Please wait for them to finish.`);
          setIsSubmitting(false);
          return;
        }
        const errored = queueSnapshot.filter((f) => f.status === 'error').length;
        if (errored > 0) {
          setCaptchaError(`${errored} file${errored > 1 ? 's' : ''} failed verification. Remove or retry them to continue.`);
          setIsSubmitting(false);
          return;
        }
        const unmapped = queueSnapshot.filter((f) => f.productId === null).length;
        if (unmapped > 0) {
          setCaptchaError(`${unmapped} file${unmapped > 1 ? 's need' : ' needs'} a linked product. Assign each file to its product in the attach panel.`);
          setIsSubmitting(false);
          return;
        }
      }

      // Bot challenge first: verified server-side before any OTP is issued
      // (OTP email is the abuse vector on this anonymous form).
      if (retSiteKey) {
        if (!retToken) {
          setCaptchaError('Complete the human verification challenge before continuing.');
          setIsSubmitting(false);
          return;
        }
        try {
          const API_URL_TS = process.env.NEXT_PUBLIC_API_URL || '';
          const vRes = await fetch(`${API_URL_TS}/api/verify-turnstile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: retToken, action: 'returns-submit' })
          });
          const vData = await vRes.json().catch(() => null);
          if (!vData || !vData.success) {
            try {
              const { logEvent } = await import('../lib/logger');
              logEvent('TURNSTILE_BLOCKED', 'Returns Page', 'Upload verification failed or expired', email);
            } catch(e) {}
            resetRetToken();
            setCaptchaError('Verification failed or expired. Complete the challenge and retry.');
            setIsSubmitting(false);
            return;
          }
        } catch {
          setCaptchaError('Verification service unavailable. Try again shortly.');
          setIsSubmitting(false);
          return;
        }
        resetRetToken();
      }

      // Generate OTP
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${API_URL}/api/otp/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!data.success) {
        const ref = data.stage ? ` (ref: ${data.stage})` : '';
        setCaptchaError(`${data.message || 'Failed to send OTP.'}${ref}`);
        setIsSubmitting(false);
        try {
          const { logEvent } = await import('../lib/logger');
          logEvent('OTP_FAILED', 'Returns Page', `Failed to generate OTP: ${data.message || 'Unknown error'}${ref}`, email);
        } catch(e) {}
        return;
      }

      setFormDataCache(formData);
      setShowOtp(true);
      setIsSubmitting(false);
      
    } catch (err) {
      console.error(err);
      setCaptchaError('An error occurred during submission.');
      setIsSubmitting(false);
    }
  };

  const handleOtpVerify = async () => {
    if (!otpCode || otpCode.length !== 6) {
      setOtpError('Please enter a 6-digit code.');
      return;
    }
    
    setOtpError('');
    setIsSubmitting(true);
    
    try {
      if (!formDataCache) return;
      const email = formDataCache.get('email') as string;
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${API_URL}/api/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otpCode })
      });
      
      const data = await res.json();
      
      if (!data.success) {
        const ref = data.stage ? ` (ref: ${data.stage})` : '';
        setOtpError(`${data.message || 'Invalid OTP Code.'}${ref}`);
        setIsSubmitting(false);
        try {
          const { logEvent } = await import('../lib/logger');
          logEvent('OTP_INVALID', 'Returns Page', 'User provided an invalid OTP code', email);
        } catch(e) {}
        return;
      }
      
      processReturnSubmit();
    } catch(err) {
      setOtpError('Network error verifying OTP.');
      setIsSubmitting(false);
      try {
        if (formDataCache) {
          const email = formDataCache.get('email') as string;
          const { logEvent } = await import('../lib/logger');
          logEvent('OTP_ERROR', 'Returns Page', 'Network error verifying OTP', email);
        }
      } catch(e) {}
    }
  };

  const handleTrackSubmit = async () => {
    setTrackingError('');
    setTrackingResult(null);
    const clean = trackingId.trim().toUpperCase();
    if (!clean) {
      setTrackingError('Please enter a Tracking ID');
      return;
    }
    // Typo filter (server re-validates fail-closed): S-/B- prefix, safe charset.
    if (!/^[SB]-[A-Z0-9-]{3,64}$/.test(clean)) {
      setTrackingError('That does not look like a Netamps tracking ID (format S-… or B-…).');
      return;
    }

    // Scoped server lookup: exactly one record (or 404). The full table is
    // never downloaded — earlier revisions exposed every client's data here.
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${API_URL}/api/returns?id=${encodeURIComponent(clean)}`);
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        throw new Error('Server returned an invalid response.');
      }
      if (res.ok && data && data.success && data.return) {
        setTrackingResult(data.return);
      } else {
        setTrackingError(data && data.message ? data.message : 'Request not found. Please check your Tracking ID.');
      }
    } catch (e: any) {
      setTrackingError(e?.message || 'Lookup failed. Check your connection and retry.');
    }
  };

  // Tracking IDs: CSPRNG hex with an S-/B- intent prefix. Unordered and
  // unguessable by design (lookup is exact-match, server-side) — no fake
  // bit-layout arithmetic, no decorative checksums.
  const generateTrackingId = (intentType: 'sell' | 'buy' | 'track'): string => {
    const prefix = intentType === 'sell' ? 'S' : 'B';
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    const rand = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    return `${prefix}-${rand}`;
  };

  const processReturnSubmit = async (formData?: FormData) => {
    try {
      const actualFormData = formData || formDataCache;
      if (!actualFormData) return;
      setIsUploading(true);
      const newId = generateTrackingId(intent);

      // Per-product evidence manifest: verified attachments grouped under
      // their owning product, with a SHA-256 over the canonical structure.
      // The flat attachedFiles list is retained for tracking-display compat.
      // Consideration (v2 fields) + base prices (v3): line totals in
      // per-product mode, single lot total in lot mode — mutually exclusive,
      // null = unstated (never 0). Manifest v3 covers pricing + base prices;
      // v2 records (no basePricePaise) verify under the v2 shape.
      //
      // BUY states no pricing at all. The ₹ inputs don't render in BUY mode,
      // but intent toggling preserves whatever SELL left in state, so null
      // here at the single write point instead of trusting the UI. This keeps
      // `ask_paise` NULL for every BUY line (indexLinesFor reads it back as
      // null) so a BUY request can never carry a budget we didn't ask for.
      const isBuy = intent === 'buy';
      const basis = isBuy ? 'per_product' : pricingBasis;
      const lotPaise = (!isBuy && basis === 'lot') ? moneyStringToPaise(lotConsideration) : null;
      const manifestProducts = products.map((p) => {
        const mine = queueSnapshot
          .filter((f) => f.productId === p.id && f.status === 'verified' && f.objectKey)
          .map((f) => ({
            attachmentId: f.attachmentId,
            fileName: f.fileName,
            sizeBytes: f.sizeBytes,
            mimeType: f.mimeType,
            sha256: f.sha256,
            objectKey: f.objectKey as string,
            assetUrl: f.assetUrl || null
          }))
          .sort((a, b) => a.attachmentId.localeCompare(b.attachmentId));
        return {
          productId: p.id,
          category: p.category,
          details: p.details,
          quantity: p.quantity,
          lineConsiderationPaise: (!isBuy && basis === 'per_product') ? moneyStringToPaise(p.lineConsideration || '') : null,
          basePricePaise: isBuy ? null : moneyStringToPaise(p.basePrice || ''),
          attachments: mine
        };
      });
      const manifestHash = await sha256Json({ requestId: newId, pricingBasis: basis, lotConsiderationPaise: lotPaise, products: manifestProducts });
      const manifest = { requestId: newId, hash: manifestHash, generatedAt: new Date().toISOString(), version: 3 };
      // Raw price strings are blanked for BUY as well as the parsed integers —
      // otherwise the persisted products JSON keeps whatever SELL left in
      // component state, and a future buyer-side reader would see a budget we
      // never asked for.
      const productsWithAttachments = products.map((p, i) => ({
        ...p,
        lineConsideration: isBuy ? '' : p.lineConsideration,
        basePrice: isBuy ? '' : p.basePrice,
        lineConsiderationPaise: manifestProducts[i].lineConsiderationPaise,
        basePricePaise: manifestProducts[i].basePricePaise,
        attachedFiles: manifestProducts[i].attachments.map((a) => a.objectKey)
      }));

      // Flat list is DERIVED from the manifest (single source of truth), never
      // from the incremental upload-success list. Upload-time keys go stale on
      // secure-move (old key deleted) and on remove/purge (bytes deleted) —
      // both left the old flat list pointing at 404s while the product gallery
      // stayed correct. Deriving here keeps both galleries in agreement.
      const uploadedFileUrls = manifestProducts.flatMap((m) => m.attachments.map((a) => a.objectKey));
      setGeneratedId(newId);

      const returnReq = {
        id: newId,
        intent,
        name: actualFormData.get('name'),
        company: actualFormData.get('company'),
        email: actualFormData.get('email'),
        phone: actualFormData.get('phone'),
        products: productsWithAttachments,
        attachedFiles: uploadedFileUrls,
        pricingBasis: basis,
        lotConsiderationPaise: lotPaise,
        manifest,
        date: new Date().toISOString(),
        status: 'Pending'
      };

      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${API_URL}/api/returns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(returnReq)
      });
      // Success is declared by the server, never assumed: a refused submit
      // (e.g. schema gate 422) must not show success, cache, or audit.
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        throw new Error('Server returned an invalid response. Nothing was recorded — retry.');
      }
      if (!res.ok || !data || !data.success) {
        throw new Error((data && data.message) || 'Server refused the request. Nothing was recorded — fix and retry.');
      }
      
      // Keep local copy for immediate fallback viewing
      const existingReturns = JSON.parse(localStorage.getItem('netamps_returns') || '[]');
      localStorage.setItem('netamps_returns', JSON.stringify([returnReq, ...existingReturns]));
      
      const { logEvent } = await import('../lib/logger');
      logEvent('RETURN_SUBMITTED', 'Returns Page', `Return request ${newId} submitted`, actualFormData.get('email') as string);

      
      setIsUploading(false);
      setIsSubmitting(false);
      setIsSuccess(true);
    } catch (err) {
      console.error('Failed to save to database', err);
      setIsUploading(false);
      setIsSubmitting(false);
      setCaptchaError('An error occurred while saving the request.');
    }
  };

  // BUY List Strip component (computed to avoid JSX parsing issues)
  const buyListStrip = (
    <div>
      {intent === 'sell' && (
        <p className="text-[11px] text-slate-500 mt-3">Stated considerations are asks, not concluded prices. Evaluated values vary by product, condition, and prevailing secondary-market demand.</p>
      )}
      {intent === 'buy' && products.length > 0 && (
        <div className="mb-6 p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Box className="w-4 h-4 text-indigo-500" />
              Your BUY List
              <span className="text-xs font-medium text-slate-500 font-normal" role="status">
                · {products.length} line{products.length === 1 ? '' : 's'}
                {' · '}{products.reduce((s, p) => s + (Number.isInteger(p.quantity) && p.quantity > 0 ? p.quantity : 0), 0)} unit{products.reduce((s, p) => s + (Number.isInteger(p.quantity) && p.quantity > 0 ? p.quantity : 0), 0) === 1 ? '' : 's'}
                {' · '}{products.filter((p) => p.catalogId).length} verified
                {' · '}{products.filter((p) => !p.catalogId).length} custom
              </span>
            </h4>
            <button
              type="button"
              onClick={() => setBuyListExpanded(!buyListExpanded)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              aria-label={buyListExpanded ? 'Collapse BUY list' : 'Expand BUY list'}
            >
              {buyListExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          </div>
          {buyListExpanded && (
            <div className="space-y-2">
              {products.map((product, index) => {
                const qty = product.quantity || 1;
                // Verified = a catalog pick whose id the server re-validates at
                // submit; everything else is Custom (unverified), submittable
                // but flagged for staff confirmation. Same predicate the server
                // uses (`verification` field), so the strip can never disagree
                // with what gets submitted.
                const isVerified = !!product.catalogId;
                return (
                  <div key={product.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="w-6 text-center text-slate-500 font-mono text-xs">{index + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900 truncate">{product.category || '—'}</span>
                        <span className="text-sm text-slate-500 truncate">{product.details || '—'}</span>
                        {isVerified && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 rounded border border-emerald-200">Verified</span>
                        )}
                        {!isVerified && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-700 rounded border border-amber-200">Custom (unverified)</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        Qty: {qty}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {buyListExpanded && products.some((p) => !p.catalogId) && (
            <p className="text-[11px] text-slate-500 mt-2">
              Custom lines are submitted as typed and flagged for staff confirmation — we never invent a model on your behalf.
            </p>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50/20 text-slate-900 flex flex-col justify-center py-5 sm:px-6 lg:px-8 relative overflow-x-clip">
      {/* Ambient Glassmorphism Background */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-grid-pattern opacity-50">
        <div className="absolute top-0 right-0 w-[50vw] h-[50vw] bg-indigo-200/50 blur-[100px] rounded-full mix-blend-multiply opacity-50"></div>
        <div className="absolute bottom-0 left-0 w-[50vw] h-[50vw] bg-emerald-200/40 blur-[100px] rounded-full mix-blend-multiply opacity-50"></div>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-2xl relative z-10">
        {/* ONE column, ONE gap. Logo, motif, badge, headline and subheadline are
            siblings in a single flex column with a uniform 16px gap, so the
            vertical rhythm lives in one place instead of being the sum of five
            independent margins that drifted apart over time. */}
        <div className="flex flex-col items-center justify-center gap-4">
          <Link
            href="/"
            aria-label="Netamps home"
            className="transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-xl"
          >
            <NetampsLogo />
          </Link>
          <ReturnsHero intent={intent} />
        </div>
      </div>

      <div className="mt-5 sm:mx-auto sm:w-full sm:max-w-3xl relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/90 backdrop-blur-xl py-6 px-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:rounded-3xl border border-slate-200/60 overflow-clip"
        >
          {isSuccess ? (
            <div className="p-12 text-center">
              <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-10 h-10 text-indigo-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-2">Request Submitted Successfully</h3>
              <p className="text-slate-500 mb-2">Your request has been securely recorded.</p>
              {intent === 'buy' && (
                <p className="text-sm text-slate-500 mb-2 max-w-md mx-auto">We'll match your requirement against live stock and revert with availability and options at the soonest possible.</p>
              )}
              <p className="text-xl font-mono text-indigo-600 font-bold mb-8">Tracking ID: {generatedId}</p>
              
              <Link href="/" className="inline-flex items-center gap-2 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl transition-colors font-medium border border-slate-200 shadow-sm">
                <ArrowLeft className="w-4 h-4" />
                Return to Home
              </Link>
            </div>
          ) : (
            <div className="p-5 sm:p-7">
              
              {/* Intent selector — three equal cards, not one lit pill among
                  grey text. Every option carries its own icon and a one-line
                  caption, so the unselected ones still read as tappable; the
                  active one carries its intent colour. */}
              <div role="radiogroup" aria-label="Request type" className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <IntentTab
                  accent="indigo"
                  active={intent === 'sell'}
                  onClick={() => { setIntent('sell'); setShowOtp(false); setTrackingResult(null); setUploadReset((n) => n + 1); setProducts([{ id: crypto.randomUUID(), strategicTarget: 'resale', lifecycleAge: '', category: '', details: '', quantity: 1, attachedFiles: [], lineConsideration: '', basePrice: '' }]); }}
                  icon={<Box className="h-5 w-5" />}
                  title="One-Click Liquidation"
                  sub="Sell your assets"
                />
                <IntentTab
                  accent="emerald"
                  active={intent === 'buy'}
                  onClick={() => { setIntent('buy'); setShowOtp(false); setTrackingResult(null); setUploadedSecureFiles([]); setUploadReset((n) => n + 1); setProducts([{ id: crypto.randomUUID(), strategicTarget: 'resale', lifecycleAge: '', category: '', details: '', quantity: 1, attachedFiles: [], lineConsideration: '', basePrice: '' }]); }}
                  icon={<ShieldCheck className="h-5 w-5" />}
                  title="Buy with Confidence"
                  sub="Source hardware"
                />
                <IntentTab
                  accent="amber"
                  active={intent === 'track'}
                  onClick={() => { setIntent('track'); setShowOtp(false); setTrackingResult(null); setUploadedSecureFiles([]); setUploadReset((n) => n + 1); }}
                  icon={<Search className="h-5 w-5" />}
                  title="Track Request"
                  sub="Check live status"
                />
              </div>

              {intent === 'track' ? (
                <div className="space-y-6">
                  <FloatField
                    id="trackingId"
                    label="Tracking ID"
                    accent="amber"
                    icon={<Search className="h-[18px] w-[18px]" />}
                    value={trackingId}
                    onChange={(e) => setTrackingId(e.target.value)}
                    autoComplete="off"
                  />
                  <button type="button" onClick={handleTrackSubmit} className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-900">
                    Track Request
                  </button>
                  <p className="text-xs text-slate-500 text-center">
                    Price shown here is read-only. To negotiate,{' '}
                    <Link href="/track" className="font-semibold text-indigo-600 hover:text-indigo-800 underline">
                      verify with your email
                    </Link>{' '}
                    in the secure tracking module.
                  </p>
                  {trackingError && <p className="text-red-500 text-center text-sm">{trackingError}</p>}
                  
                  {trackingResult && (
                    <div className="mt-6 p-6 border border-slate-200 rounded-xl bg-slate-50 shadow-sm animate-in fade-in zoom-in duration-300">
                      <div className="flex justify-between items-center mb-4">
                        <span className="font-mono font-bold text-slate-900 text-lg">{trackingResult.id}</span>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold border ${statusChip(trackingResult.status)}`}>
                          {normalizeStatus(trackingResult.status)}
                        </span>
                      </div>
                      <div className="space-y-4">
                        <div className="space-y-2 pb-4 border-b border-slate-200">
                          <p className="text-sm text-slate-600"><strong className="text-slate-800">Name:</strong> {trackingResult.name}</p>
                          <p className="text-sm text-slate-600"><strong className="text-slate-800">Company:</strong> {trackingResult.company}</p>
                          <p className="text-sm text-slate-600"><strong className="text-slate-800">Date:</strong> {new Date(trackingResult.date).toLocaleDateString()}</p>
                          {trackingResult.attachedFiles && trackingResult.attachedFiles.length > 0 && (
                            <p className="text-sm text-slate-600"><strong className="text-slate-800">Evidence files:</strong> {trackingResult.attachedFiles.length} uploaded</p>
                          )}
                        </div>

                        {showsEvaluation(trackingResult.status) && trackingResult.products && (
                          <div>
                            <h4 className="text-sm font-bold text-slate-800 mb-3">Equipment Evaluation Details</h4>
                            {trackingResult.pricingBasis === 'lot' && (
                              <div className="mb-3 p-3 rounded-lg bg-slate-100 border border-slate-200 text-sm text-slate-700">
                                Lot consideration (whole request): <span className="font-mono font-bold text-slate-900">{formatPaise(trackingResult.lotConsiderationPaise ?? null)}</span>
                              </div>
                            )}
                            <div className="space-y-3">
                              {trackingResult.products.map((product: any, idx: number) => {
                                const ask = trackingResult.pricingBasis === 'lot'
                                  ? null
                                  : (product.lineConsiderationPaise ?? null);
                                const evaluated = evalUnitPaise(product);
                                return (
                                <div key={product.id || idx} className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                                  <div>
                                    <div className="text-sm font-bold text-slate-700 capitalize mb-1">
                                      {product.category.replace('_', ' ')}
                                    </div>
                                    <div className="text-xs text-slate-500 max-w-lg">
                                      {product.details}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-4 shrink-0">
                                    <div className="text-xs text-slate-500">
                                      Qty: <span className="font-bold text-slate-700">{product.quantity}</span>
                                    </div>
                                    <div className="text-xs text-slate-500 text-right">
                                      <div className="uppercase tracking-wide text-[10px]">Consideration</div>
                                      <div className="font-mono font-bold text-slate-800">{formatPaise(ask)}</div>
                                    </div>
                                    {evaluated !== null ? (
                                      <div className="text-sm font-mono font-bold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100">
                                        {formatPaise(evaluated)}
                                      </div>
                                    ) : (
                                      <div className="text-xs font-bold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-100">
                                        Pending Evaluation
                                      </div>
                                    )}
                                  </div>
                                </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="pt-2">
                          <Link href="/track" className="inline-flex items-center justify-center gap-2 w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors">
                            <ShieldCheck className="w-4 h-4" /> Verify email to negotiate price
                          </Link>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : showOtp ? (
                <div className="space-y-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 className="w-8 h-8 text-indigo-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">Email Verification Required</h3>
                  <p className="text-sm text-slate-500">
                    For security, we emailed a 6-digit passcode to your address — it expires in 5 minutes. Enter it below.
                  </p>
                  <div>
                    <input 
                      type="text" 
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      className="block w-full max-w-xs mx-auto text-center tracking-widest text-2xl px-4 py-3 border border-slate-300 rounded-xl bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500" 
                      placeholder="••••••"
                      maxLength={6}
                    />
                    {otpError && <p className="text-red-500 text-sm mt-2">{otpError}</p>}
                  </div>
                  <button 
                    type="button"
                    onClick={handleOtpVerify}
                    disabled={isSubmitting || isUploading}
                    className="w-full max-w-xs mx-auto flex justify-center items-center py-4 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-md transition-colors disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500"
                  >
                    {isSubmitting || isUploading ? (
                      <div className="flex items-center gap-2">
                        <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        {isUploading ? 'Uploading securely to R2...' : 'Verifying...'}
                      </div>
                    ) : (intent === 'sell' ? 'Verify & Request' : 'Verify & Buy with Confidence')}
                  </button>
                  <button type="button" onClick={() => { setShowOtp(false); resetRetToken(); }} className="text-sm text-indigo-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded">
                    Cancel and return to form
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                <form key={`${intent}-${formEpoch}`} className="space-y-6" onSubmit={handleSubmit} onReset={() => { purgeFormVolatile(); }}>
                {/* Contact band: two rows × two columns on desktop so Email
                    and Phone sit below Full Name + Company. */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2">
                  <FloatField
                    id="name"
                    label="Full Name"
                    required
                    icon={<User className="h-[18px] w-[18px]" />}
                    pattern="^[a-zA-Z\s.,'-]+$"
                    maxLength={100}
                    autoComplete="name"
                  />

                  <FloatField
                    id="company"
                    label="Company"
                    required={intent === 'sell'}
                    icon={<Building2 className="h-[18px] w-[18px]" />}
                    pattern="^[a-zA-Z0-9\s.,&'-]+$"
                    maxLength={150}
                    autoComplete="organization"
                  />

                  <FloatField
                    id="email"
                    label="Email"
                    required
                    type="email"
                    icon={<span className="text-[15px] font-bold leading-none">@</span>}
                    maxLength={100}
                    inputMode="email"
                    autoComplete="email"
                  />

                  <FloatField
                    id="phone"
                    label="Mobile Number"
                    required
                    type="tel"
                    icon={<Phone className="h-[18px] w-[18px]" />}
                    pattern="^\+?[0-9]+$"
                    maxLength={20}
                    inputMode="tel"
                    autoComplete="tel"
                    onChange={(e) => { e.target.value = e.target.value.replace(/(?!^\+)[^\d]/g, ''); }}
                  />
                </div>

                <div className="border-t border-slate-200 pt-4 mt-5">

                  {/* Pricing basis — SELL only. BUY carries no stated pricing at all:
                      the visitor supplies equipment + quantity only, and we evaluate.
                      Inactive side's values are preserved, never cleared. */}
                  {intent === 'sell' && (
                  <div className="mb-4 p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wider shrink-0">Consideration Basis</span>
                      <div className="flex-1 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Consideration basis">
                        <label
                          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition-all text-sm font-medium ${
                            pricingBasis === 'per_product'
                              ? 'border-indigo-500 bg-indigo-50 text-indigo-900 shadow-sm'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="pricingBasis"
                            value="per_product"
                            checked={pricingBasis === 'per_product'}
                            onChange={() => setPricingBasis('per_product')}
                            className="w-4 h-4 text-indigo-600 accent-indigo-600"
                          />
                          Per Product
                        </label>
                        <label
                          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition-all text-sm font-medium ${
                            pricingBasis === 'lot'
                              ? 'border-indigo-500 bg-indigo-50 text-indigo-900 shadow-sm'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="pricingBasis"
                            value="lot"
                            checked={pricingBasis === 'lot'}
                            onChange={() => setPricingBasis('lot')}
                            className="w-4 h-4 text-indigo-600 accent-indigo-600"
                          />
                          Whole Request (Lot)
                        </label>
                      </div>
                    </div>
                    {pricingBasis === 'lot' ? (
                      <div className="mt-3">
                        <label className="block text-xs font-medium text-slate-700 mb-1">Lot Consideration (₹) — single total for all {products.length} product{products.length > 1 ? 's' : ''}</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={lotConsideration}
                          onChange={(e) => setLotConsideration(sanitizeMoneyInput(e.target.value))}
                          onBlur={(e) => {
                            const raw = e.target.value;
                            if (raw.trim() === '') { setLotConsideration(''); return; }
                            const p = moneyStringToPaise(raw);
                            if (p !== null) setLotConsideration((p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                          }}
                          placeholder="e.g. 4,50,000"
                          className="block w-full sm:max-w-xs px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 sm:text-sm shadow-sm"
                        />
                        <p className="text-[11px] text-slate-500 mt-1">Per-product fields are hidden in lot mode; any values already entered there are preserved.</p>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500 mt-3">Enter a line total per product below (all units included). Switch to lot for a single request-wide total — per-product values are preserved.</p>
                    )}
                    </div>
                  )}

                    {buyListStrip}

                    <div className="space-y-4">
                    {/* STICKY SECTION HEADER — the scroll-aware Add Product.
                        The header itself travels with the list instead of a
                        button floating on top of it, which is what makes this
                        safe: a floating control necessarily covers whatever it
                        passes over, and the top-right of a product card is
                        exactly where its Remove button lives. As a header bar
                        covering content is expected, and the action it carries
                        is always on screen while you are in the products.

                        It appears when you reach the product line and leaves
                        when the list does — both are the same property of
                        `sticky`, not two behaviours to script. No scroll
                        listener, no layout read, no re-render.

                        Enabled only once a product has been described (a
                        category or details text), so a visitor cannot stack up
                        blank rows; the control says why rather than hiding.

                        Requires the page and card `overflow-clip` (see the
                        class on the form card): under `overflow-hidden` this
                        element would pin to a box that never scrolls. */}
                    <div className="sticky top-2 z-30 -mx-1 mb-1 flex items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-white/90 px-3 py-2 backdrop-blur-md shadow-sm">
                      <h4 className="flex items-baseline gap-2 text-sm font-bold text-slate-900">
                        Product Inventory
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          {products.length} {products.length === 1 ? 'line' : 'lines'}
                        </span>
                      </h4>
                      <button
                        type="button"
                        onClick={addProduct}
                        disabled={!hasProductInput || isSubmitting || isUploading}
                        title={hasProductInput
                          ? 'Add another product'
                          : 'Describe a product first'}
                        className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-300 disabled:shadow-none"
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Add Product
                        <span className="sr-only">
                          {hasProductInput
                            ? ' — adds another product line to this request'
                            : ' — unavailable until a product category or details are entered'}
                        </span>
                      </button>
                    </div>

                    {pendingDelete && (
                      <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm flex flex-wrap items-center gap-3">
                        <p className="text-red-700 flex-1 min-w-[200px]">
                          Remove PRODUCT #{products.findIndex((p) => p.id === pendingDelete.id) + 1} and discard its {pendingDelete.count} attached file{pendingDelete.count > 1 ? 's' : ''}?
                        </p>
                        <button type="button" onClick={confirmRemoveProduct} className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors">
                          Remove
                        </button>
                        <button type="button" onClick={() => setPendingDelete(null)} className="px-4 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 transition-colors">
                          Keep
                        </button>
                      </div>
                    )}
                    {products.map((product, index) => (
                      <div
                        key={product.id}
                        onDragOver={intent === 'sell' ? (e) => { e.preventDefault(); e.stopPropagation(); setDragOverCard(product.id); } : undefined}
                        onDragLeave={() => setDragOverCard((cur) => (cur === product.id ? null : cur))}
                        onDrop={intent === 'sell' ? (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDragOverCard(null);
                          if (e.dataTransfer.files?.length) uploaderRef.current?.stageFiles(Array.from(e.dataTransfer.files), product.id);
                        } : undefined}
                        className={`p-4 bg-slate-50/50 border rounded-xl flex flex-col gap-4 relative shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)] transition-all contain-[layout_paint] ${dragOverCard === product.id ? 'border-indigo-500 ring-2 ring-indigo-500/40 bg-indigo-50/40' : 'border-slate-200/80'}`}
                      >
                        {products.length > 1 && (
                          <button type="button" onClick={() => removeProduct(product.id)} aria-label={`Remove product ${index + 1}`} className="absolute top-2 right-2 p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Product #{index + 1}</h5>
                        
                        {/* Disposition fields are SELL-only. A buyer is not
                            choosing between resale optimisation and compliance
                            recycling for someone else's hardware, and batch age
                            describes an asset being handed over, not sourced.
                            Both were briefly shown on BUY; they are not buyer
                            inputs. */}
                        {intent === 'sell' && (
                        <div className="space-y-4 mb-2">
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-2">Strategic Recovery Target *</label>
                            <div role="radiogroup" aria-label="Strategic recovery target" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <label
                                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition-all text-sm font-medium ${
                                  product.strategicTarget === 'resale'
                                    ? 'border-blue-500 bg-blue-50 text-blue-900 shadow-sm'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`strategic-${product.id}`}
                                  value="resale"
                                  checked={product.strategicTarget === 'resale'}
                                  onChange={() => updateProduct(product.id, 'strategicTarget', 'resale')}
                                  className="w-4 h-4 text-blue-600 accent-blue-600"
                                />
                                Resale Value Optimization
                              </label>
                              <label
                                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition-all text-sm font-medium ${
                                  product.strategicTarget === 'compliance'
                                    ? 'border-blue-500 bg-blue-50 text-blue-900 shadow-sm'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`strategic-${product.id}`}
                                  value="compliance"
                                  checked={product.strategicTarget === 'compliance'}
                                  onChange={() => updateProduct(product.id, 'strategicTarget', 'compliance')}
                                  className="w-4 h-4 text-blue-600 accent-blue-600"
                                />
                                Compliance Recycling
                              </label>
                            </div>
                          </div>
                            
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1">Hardware Lifecycle Batch Age *</label>
                              <div className="relative">
                                <select
                                  required
                                  value={product.lifecycleAge}
                                  onChange={(e) => updateProduct(product.id, 'lifecycleAge', e.target.value)}
                                  className="block w-full px-3 py-2.5 border border-slate-200 rounded-lg bg-slate-50 text-slate-900 focus:ring-2 focus:ring-indigo-500 sm:text-sm appearance-none shadow-sm"
                                >
                                  <option value="">Select Age Profile...</option>
                                  <option value="Current Generation (1-3 Years)">Current Generation (1-3 Years)</option>
                                  <option value="Mid-Lifecycle (3-5 Years)">Mid-Lifecycle (3-5 Years)</option>
                                  <option value="Legacy Enterprise End-of-Life (~10%)">Legacy Enterprise End-of-Life (~10%)</option>
                                  <option value="End of Support / Obsolete (>7 Years)">End of Support / Obsolete (&gt;7 Years)</option>
                                  <option value="Damaged Assets">Damaged Assets</option>
                                  <option value="Mixed / Unknown Age">Mixed / Unknown Age</option>
                                </select>
                                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                                  <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                  </svg>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                          <div className="sm:col-span-2">
                            <label htmlFor={`cat-${product.id}`} className="block text-xs font-medium text-slate-700 mb-1">Equipment Category *</label>
                            <div className="relative">
                              <select
                                id={`cat-${product.id}`}
                                required
                                value={product.category}
                                onChange={(e) => manualEdit(product.id, 'category', e.target.value)}
                                className="block w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 sm:text-sm shadow-sm appearance-none"
                              >
                                <option value="">Select a category…</option>
                                {CATEGORY_OPTIONS.map((c) => (
                                  <option key={c} value={c}>{c}</option>
                                ))}
                              </select>
                              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                                <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                </svg>
                              </div>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Quantity *</label>
                            <input 
                              type="number" 
                              min="1" 
                              required
                              value={product.quantity}
                              onChange={(e) => updateProduct(product.id, 'quantity', parseInt(e.target.value) || 1)}
                              className="block w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 sm:text-sm shadow-sm" 
                            />
                          </div>
                          {intent === 'sell' && pricingBasis === 'per_product' ? (
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1">Base Price (₹/Per Unit)</label>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={product.basePrice}
                                onChange={(e) => updateProduct(product.id, 'basePrice', sanitizeMoneyInput(e.target.value))}
                                onBlur={(e) => {
                                  const raw = e.target.value;
                                  if (raw.trim() === '') { updateProduct(product.id, 'basePrice', ''); return; }
                                  const p = moneyStringToPaise(raw);
                                  if (p !== null) updateProduct(product.id, 'basePrice', (p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                                }}
                                placeholder="e.g. 18,000"
                                className="block w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 sm:text-sm shadow-sm"
                              />
                              <label className="block text-xs font-medium text-slate-700 mb-1 mt-2">Line Consideration (₹) — Upfront Discount</label>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={product.lineConsideration}
                                onChange={(e) => updateProduct(product.id, 'lineConsideration', sanitizeMoneyInput(e.target.value))}
                                onBlur={(e) => {
                                  const raw = e.target.value;
                                  if (raw.trim() === '') { updateProduct(product.id, 'lineConsideration', ''); return; }
                                  const p = moneyStringToPaise(raw);
                                  if (p !== null) updateProduct(product.id, 'lineConsideration', (p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                                }}
                                placeholder={considerationHint(product.quantity, product.basePrice, intent).placeholder}
                                className="block w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 sm:text-sm shadow-sm"
                              />
                              <p className="text-[11px] text-slate-500 mt-1.5">
                                Optional — your upfront total for {considerationHint(product.quantity, product.basePrice, intent).scope}, not per-unit. Leave blank for us to evaluate.
                              </p>
                              {(() => {
                                const base = moneyStringToPaise(product.basePrice || '');
                                if (base === null) return null;
                                const qty = Number(product.quantity) || 1;
                                const total = qty * base;
                                if (!Number.isSafeInteger(total)) return null;
                                return (
                                  <p className="text-[11px] font-mono text-slate-600 mt-1.5">
                                    Line Final: {qty} × {formatPaise(base)} = {formatPaise(total)}
                                  </p>
                                );
                              })()}
                            </div>
                          ) : null}
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Details &amp; Specs *</label>
                          <DetailsSuggest
                            value={product.details}
                            onChange={(value) => manualEdit(product.id, 'details', value)}
                            onSelect={(item) => applySuggestion(product.id, item)}
                            selectedId={product.catalogId || null}
                            category={product.category}
                            disabled={isSubmitting}
                            placeholder={intent === 'sell'
                              ? 'Search catalog or type — e.g. "dell r740", "dl380 gen10"'
                              : 'Search catalog or describe what you need — e.g. "cisco 9300"'}
                          />
                          <p className="text-[11px] text-slate-500 mt-1">
                            {intent === 'sell'
                              ? 'Start typing to search the catalog — pick a match to auto-fill, or enter custom specs, condition and quantity breakdown.'
                              : 'Start typing to search the catalog — pick a match, or describe what you need. We evaluate availability and pricing.'}
                          </p>
                        </div>

                        {/* Per-line verification chip — verified only while the
                            catalog capture is intact; any manual edit reverts to
                            Custom (submittable, staff-flagged). Shown for both
                            Sell & Buy now that the catalog search lives in
                            Details & Specs for both intents. */}
                        <div className="-mt-2">
                          {product.catalogId ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200" title={`catalog:${product.catalogId}`}>
                              <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> Catalog verified
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md border bg-amber-50 text-amber-700 border-amber-200">
                              <AlertCircle className="w-3 h-3" aria-hidden="true" /> Custom (unverified) — staff will confirm
                            </span>
                          )}
                        </div>
                        
                        {intent === 'sell' && (
                          <div className="mt-1 pt-3 border-t border-slate-200/60">
                            {(filesByProduct.get(product.id) || []).length === 0 ? (
                              <p className="text-[11px] text-slate-400">No evidence linked yet — drop files here or assign them in the upload panel below.</p>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {(filesByProduct.get(product.id) || []).map((f) => (
                                  <span
                                    key={f.attachmentId}
                                    title={`${f.fileName} · ${(f.sizeBytes / 1048576).toFixed(2)} MB · ${f.status}${f.assetUrl ? ` · ${f.assetUrl}` : ''}`}
                                    className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-md border ${
                                      f.status === 'verified'
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : f.status === 'uploading'
                                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                        : f.status === 'error'
                                        ? 'bg-red-50 text-red-700 border-red-200'
                                        : 'bg-slate-100 text-slate-600 border-slate-200'
                                    }`}
                                  >
                                    <span className={`w-1.5 h-1.5 rounded-full ${
                                      f.status === 'verified' ? 'bg-emerald-500'
                                      : f.status === 'uploading' ? 'bg-indigo-500 animate-pulse'
                                      : f.status === 'error' ? 'bg-red-500' : 'bg-slate-400'
                                    }`} />
                                    <span className="max-w-[140px] truncate">{f.fileName}</span>
                                    {f.assetUrl ? (
                                      <button
                                        type="button"
                                        title={`Copy link: ${f.assetUrl}`}
                                        onClick={() => { try { navigator.clipboard.writeText(new URL(f.assetUrl as string, window.location.origin).toString()); } catch {} }}
                                        className="flex items-center gap-0.5 hover:underline p-1.5 -m-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                      >
                                        <Link2 className="w-3 h-3" />
                                      </button>
                                    ) : null}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Global attach panel — single instance for the whole request (SELL only).
                    Files staged here carry no ownership until explicitly linked to a
                    product; the SESSION USAGE meter below totals every staged file. */}
                {intent === 'sell' && (
                  <div className="border-t border-slate-200 pt-6 mt-6">
                    <SecureMediaUploader
                      ref={uploaderRef}
                      sessionId={requestScope}
                      requestScope={requestScope || 'anon'}
                      products={products.map((p, i) => ({ id: p.id, label: `PRODUCT #${i + 1}` }))}
                      onUploadSuccess={(keys) => {
                        setUploadedSecureFiles(prev => [...prev, ...keys]);
                      }}
                      onQueueChange={handleQueueChange}
                      resetSignal={uploadReset}
                      serverVerifyDataFiles
                    />
                    {/* Server-verdict warning (warn-only): rejected tabular evidence
                        never blocks submit — staff review covers it. */}
                    {(() => {
                      const bad = queueSnapshot.filter((f) => f.status === 'verified' && f.verdict?.status === 'rejected');
                      if (bad.length === 0) return null;
                      return (
                        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800" role="note">
                          <span className="font-bold">{bad.length} attached data file{bad.length > 1 ? 's' : ''} failed the server structure check</span>
                          {bad.slice(0, 3).map((f) => (
                            <span key={f.attachmentId} className="block mt-1 font-mono truncate" title={f.verdict?.status === 'rejected' ? f.verdict.reason : ''}>
                              {f.fileName}: {f.verdict?.status === 'rejected' ? f.verdict.reason : ''}
                            </span>
                          ))}
                          <span className="block mt-1">You can still submit — staff will review.</span>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Submit */}
                <div className="pt-6">

                  {captchaError && (
                    <p className="text-xs text-center text-red-400 mt-2 mb-4">{captchaError}</p>
                  )}
                  {retSiteKey && (
                    <div className="flex justify-center mb-4">
                      <Turnstile
                        key={retKey}
                        siteKey={retSiteKey}
                        options={{ theme: 'light', action: 'returns-submit' }}
                        onSuccess={(token) => setRetToken(token)}
                        onExpire={() => setRetToken('')}
                        onError={() => setRetToken('')}
                      />
                    </div>
                  )}
                  <div className="flex gap-4">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className={`flex-1 flex justify-center items-center gap-2 py-4 px-4 border border-transparent rounded-xl shadow-lg text-base font-bold text-white transition-all disabled:opacity-70 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${intent === 'sell' ? 'bg-indigo-600 hover:bg-indigo-500 focus-visible:ring-indigo-500' : 'bg-emerald-600 hover:bg-emerald-500 focus-visible:ring-emerald-500'}`}
                    >
                      {isSubmitting ? (
                        <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        intent === 'sell' ? 'Click to Sell' : 'Click to Buy'
                      )}
                    </button>
                    <button
                      type="reset"
                      title="Clear everything — all fields and staged uploads are purged, a fresh form is issued"
                      className="px-6 py-4 border border-slate-200 rounded-xl text-slate-600 font-bold hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </form>
              </div>
          )}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
