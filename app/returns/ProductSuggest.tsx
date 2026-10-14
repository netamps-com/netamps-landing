'use client';

/**
 * ProductSuggest — BUY typeahead combobox.
 *
 * Tier 1/2 assisted entry per the design contract: the model suggests, the
 * catalog decides. Selecting a suggestion fills category + canonical spec
 * template on the owning product line; typing without a selection is always
 * allowed and resolves to an explicit Custom (unverified) line — never a
 * silent accept, never a fabricated model (server re-validates candidates).
 *
 * ARIA: WAI-ARIA 1.2 combobox pattern — input owns the listbox via
 * aria-controls/aria-activedescendant; focus never leaves the input.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Search, Loader2, Sparkles, FileQuestion, Check } from 'lucide-react';
import { createSuggestSession } from './suggestClient.mjs';

export interface SuggestItem {
  id: string;
  category: string;
  brand: string;
  model: string;
  spec: string;
  score: number;
}

interface ProductSuggestProps {
  /** Called when the visitor explicitly picks a suggestion. */
  onSelect: (item: SuggestItem) => void;
  /** Current suggestion id (for aria-selected / re-render), optional. */
  selectedId?: string | null;
  disabled?: boolean;
  /** Only rendered for the BUY intent. */
  visible: boolean;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export default function ProductSuggest({ onSelect, selectedId, disabled, visible }: ProductSuggestProps) {
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef<ReturnType<typeof createSuggestSession> | null>(null);

  const [query, setQuery] = useState('');
  const [items, setItems] = useState<SuggestItem[]>([]);
  const [source, setSource] = useState<'catalog' | 'llm' | 'none' | ''>('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const [searched, setSearched] = useState(false); // a real query reached the server

  // One session per mount — debounce + abort live here, not in JSX handlers.
  useEffect(() => {
    sessionRef.current = createSuggestSession({ apiUrl: API_URL, debounceMs: 250, minLength: 2 });
    return () => { sessionRef.current?.cancel(); sessionRef.current = null; };
  }, []);

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
        const suggestions: SuggestItem[] = Array.isArray(body?.suggestions) ? body.suggestions : [];
        setItems(suggestions);
        setSource(body?.source === 'catalog' ? 'catalog' : body?.source === 'llm' ? 'llm' : 'none');
        setActive(suggestions.length > 0 ? 0 : -1);
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

  const handleChange = (value: string) => {
    setQuery(value);
    setOpen(true);
    runSearch(value);
  };

  const choose = useCallback((item: SuggestItem) => {
    onSelect(item);
    setOpen(false);
    setActive(-1);
    // Keep the chosen model visible for context; a fresh edit re-searches.
    setQuery(`${item.brand ? item.brand + ' ' : ''}${item.model}`.trim());
  }, [onSelect]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && items.length > 0) {
      e.preventDefault(); setOpen(true); return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (items.length === 0 ? -1 : (i + 1) % items.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (items.length === 0 ? -1 : (i - 1 + items.length) % items.length));
    } else if (e.key === 'Enter') {
      if (active >= 0 && active < items.length) {
        e.preventDefault(); // consume selection, don't submit the form
        choose(items[active]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  };

  if (!visible) return null;

  const showPanel = open && searched && (loading || items.length > 0 || source === 'none');

  return (
    <div className="relative">
      <label htmlFor={`${listboxId}-input`} className="block text-xs font-medium text-slate-700 mb-1">
        Find equipment model <span className="text-slate-400 font-normal">(optional — powers suggestions)</span>
      </label>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
          {loading
            ? <Loader2 className="h-4 w-4 text-indigo-500 animate-spin" aria-hidden="true" />
            : <Search className="h-4 w-4 text-slate-400" aria-hidden="true" />}
        </div>
        <input
          id={`${listboxId}-input`}
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 && items[active] ? `${listboxId}-opt-${active}` : undefined}
          autoComplete="off"
          maxLength={120}
          disabled={disabled}
          value={query}
          placeholder='e.g. "dell r7", "dl380 gen10", "catalyst 9300"'
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (searched) setOpen(true); }}
          onBlur={() => { // let option mousedown land first
            window.setTimeout(() => setOpen(false), 120);
          }}
          className="block w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm shadow-sm"
        />
      </div>

      {showPanel && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
          <ul id={listboxId} role="listbox" aria-label="Equipment suggestions" className="max-h-64 overflow-y-auto divide-y divide-slate-100">
            {items.map((item, i) => (
              <li
                key={item.id}
                id={`${listboxId}-opt-${i}`}
                role="option"
                aria-selected={i === active || selectedId === item.id}
                onMouseDown={(e) => { e.preventDefault(); choose(item); }} // mousedown → never blurs first
                onMouseEnter={() => setActive(i)}
                className={`flex items-center justify-between gap-3 px-3 py-2.5 cursor-pointer text-sm ${
                  i === active ? 'bg-indigo-50 text-indigo-900' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="min-w-0">
                  <span className="font-semibold truncate block">{item.brand ? `${item.brand} ` : ''}{item.model}</span>
                  <span className="text-[11px] text-slate-500 capitalize">{item.category}</span>
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
              <><Sparkles className="h-3 w-3 text-emerald-600" aria-hidden="true" /> Catalog match — pick a line to fill category & specs.</>
            ) : source === 'llm' ? (
              <><Sparkles className="h-3 w-3 text-indigo-600" aria-hidden="true" /> Best catalog candidates for your typing — verify before picking.</>
            ) : (
              <><FileQuestion className="h-3 w-3 text-amber-600" aria-hidden="true" /> No catalog match — your own text will be submitted as Custom (unverified).</>
            )}
          </div>
        </div>
      )}

      {selectedId && (
        <p className="text-[11px] text-emerald-700 mt-1 flex items-center gap-1" role="status">
          <Check className="h-3 w-3" aria-hidden="true" /> Catalog-verified line — staff see it pre-matched.
        </p>
      )}
    </div>
  );
}
