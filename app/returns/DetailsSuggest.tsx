'use client';

/**
 * DetailsSuggest — catalog search embedded in the "Details & Specs" field.
 *
 * Replaces the old category typeahead + the Buy-only standalone suggest box
 * with ONE control that serves both Sell and Buy:
 *  - Typing (min 2 chars) queries /api/products/suggest (Tier-1 FTS5, Tier-2
 *    LLM only on no-match). Suggestions drop down under the field.
 *  - Clicking a row captures the canonical model + spec into Details & Specs
 *    and stamps catalogId on the line (the page maps the category too).
 *  - Free-typing is always allowed and submits as Custom (unverified); the
 *    server re-validates any catalogId at submit.
 *
 * It stays a <textarea> so multi-line custom specs are preserved. Keyboard:
 * ArrowUp/Down highlight a row, Enter captures the highlighted row (otherwise
 * Enter inserts a newline), Escape dismisses.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Loader2, Sparkles, FileQuestion, Check } from 'lucide-react';
import { createSuggestSession } from './suggestClient.mjs';

export interface CatalogSuggestion {
  id: string;
  category: string;
  brand?: string;
  model?: string;
  spec?: string;
  specTemplate?: string;
  score?: number;
}

interface DetailsSuggestProps {
  value: string;
  onChange: (value: string) => void;
  /** Called when the visitor explicitly captures a catalog suggestion. */
  onSelect: (item: CatalogSuggestion) => void;
  /** Current catalog id (shows the check on the captured row). */
  selectedId?: string | null;
  /**
   * The Equipment Category slug selected above this field.
   *
   * Sent as `cat` so the server can use it as a soft ranking prior. It does not
   * change what is displayed: the server currently uses it only in its
   * fusion shadow experiment. Pass undefined and the server behaves exactly as
   * before — the parameter is additive and the request is valid without it.
   */
  category?: string;
  placeholder?: string;
  disabled?: boolean;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export default function DetailsSuggest({
  value,
  onChange,
  onSelect,
  selectedId,
  category,
  placeholder,
  disabled
}: DetailsSuggestProps) {
  const listboxId = useId();
  const sessionRef = useRef<ReturnType<typeof createSuggestSession> | null>(null);

  const [items, setItems] = useState<CatalogSuggestion[]>([]);
  const [source, setSource] = useState<'catalog' | 'llm' | 'none' | ''>('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const [searched, setSearched] = useState(false); // a real query reached the server

  // One session per mount — debounce + abort live here, not in JSX handlers.
  // The category is folded into the session's query string at request time
  // rather than rebuilt per keystroke, so switching category does not tear down
  // the debounce or abort an in-flight request.
  useEffect(() => {
    sessionRef.current = createSuggestSession({
      apiUrl: API_URL,
      debounceMs: 250,
      minLength: 2,
      extraParams: category ? { cat: category } : undefined
    });
    return () => { sessionRef.current?.cancel(); sessionRef.current = null; };
  }, [category]);

  const runSearch = useCallback((q: string) => {
    const session = sessionRef.current;
    if (!session) return;
    if (q.trim().length < 2) {
      setItems([]); setSource(''); setSearched(false); setLoading(false); setActive(-1);
      return;
    }
    setLoading(true);
    setSearched(true);
    session.request(q, {
      onResponse: (body: any) => {
        setLoading(false);
        const sugg: CatalogSuggestion[] = Array.isArray(body?.suggestions) ? body.suggestions : [];
        setItems(sugg);
        setSource(body?.source === 'catalog' ? 'catalog' : body?.source === 'llm' ? 'llm' : 'none');
        setActive(sugg.length > 0 ? 0 : -1);
      },
      onError: () => {
        // Network hiccup: close quietly — Custom entry still works.
        setLoading(false); setItems([]); setSource('none'); setActive(-1);
      },
      onTooShort: () => {
        setLoading(false); setItems([]); setSource(''); setSearched(false); setActive(-1);
      }
    });
  }, []);

  const handleChange = (v: string) => {
    onChange(v);
    setOpen(true);
    runSearch(v);
  };

  const choose = useCallback((item: CatalogSuggestion) => {
    onSelect(item);
    setOpen(false);
    setActive(-1);
  }, [onSelect]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') { setOpen(false); setActive(-1); return; }
    if (!open || items.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (items.length === 0 ? -1 : (i + 1) % items.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (items.length === 0 ? -1 : (i - 1 + items.length) % items.length));
    } else if (e.key === 'Enter' && active >= 0 && active < items.length) {
      e.preventDefault(); // capture selection; a plain Enter still makes a newline
      choose(items[active]);
    }
  };

  const showPanel = open && searched && (loading || items.length > 0 || source === 'none');

  return (
    <div className="relative">
      <textarea
        rows={2}
        required
        maxLength={500}
        value={value}
        disabled={disabled}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (searched) setOpen(true); }}
        onBlur={() => { // let option mousedown land first
          window.setTimeout(() => setOpen(false), 140);
        }}
        placeholder={placeholder}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={showPanel}
        className="block w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 sm:text-sm resize-none shadow-sm"
      />

      {showPanel && (
        <div className="absolute z-30 left-0 right-0 mt-1 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
          <ul id={listboxId} role="listbox" aria-label="Catalog suggestions" className="max-h-56 overflow-y-auto divide-y divide-slate-100">
            {items.map((item, i) => (
              <li
                key={item.id}
                role="option"
                aria-selected={i === active || selectedId === item.id}
                onMouseDown={(e) => { e.preventDefault(); choose(item); }} // mousedown → never blurs first
                onMouseEnter={() => setActive(i)}
                className={`flex items-center justify-between gap-3 px-3 py-2 cursor-pointer text-sm ${
                  i === active ? 'bg-indigo-50 text-indigo-900' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="min-w-0">
                  <span className="font-semibold truncate block">{item.brand ? `${item.brand} ` : ''}{item.model}</span>
                  <span className="text-[11px] text-slate-500 truncate block">{item.spec || item.specTemplate}</span>
                </span>
                {selectedId === item.id && <Check className="h-4 w-4 text-indigo-600 shrink-0" aria-hidden="true" />}
              </li>
            ))}
          </ul>

          {/* Footer states — source is honest: catalog vs LLM vs unmatched. */}
          <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-600 flex items-center gap-1.5">
            {loading ? (
              <><Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Searching catalog…</>
            ) : source === 'catalog' ? (
              <><Sparkles className="h-3 w-3 text-emerald-600" aria-hidden="true" /> Catalog match — click a row to capture, or keep typing your own specs.</>
            ) : source === 'llm' ? (
              <><Sparkles className="h-3 w-3 text-indigo-600" aria-hidden="true" /> Best catalog candidates for your typing — verify before capturing.</>
            ) : (
              <><FileQuestion className="h-3 w-3 text-amber-600" aria-hidden="true" /> No catalog match — your text submits as Custom (unverified).</>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
