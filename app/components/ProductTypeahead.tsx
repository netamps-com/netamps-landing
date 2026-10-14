'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, X, Check, Loader2, AlertCircle } from 'lucide-react';

interface ProductSuggestion {
  id: string;
  category: string;
  model: string;
  specTemplate: string;
  matchType: 'prefix' | 'fuzzy';
}

interface ProductTypeaheadProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: { id: string; category: string; model: string; specTemplate: string }) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  productId?: string; // For request deduplication
}

export default function ProductTypeahead({
  value,
  onChange,
  onSelect,
  placeholder = 'Type to search catalog… (min 2 chars)',
  disabled = false,
  className = '',
  productId
}: ProductTypeaheadProps) {
  const [suggestions, setSuggestions] = useState<{ id: string; category: string; model: string; specTemplate: string; matchType: 'prefix' | 'fuzzy' }[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const requestIdRef = useRef(0);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      setError(null);
      return;
    }

    // Cancel previous in-flight request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const params = new URLSearchParams({
        q: value,
        limit: '10'
      });
      const res = await fetch(`${API_URL}/api/products/suggest?${params}`, {
        signal: controller.signal,
        cache: 'no-store'
      });

      if (controller.signal.aborted) return;
      if (requestId !== requestIdRef.current) return; // Stale request

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.message || 'Suggestion service error');
      }
      setSuggestions(data.suggestions || []);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err?.message || 'Failed to load suggestions');
      setSuggestions([]);
    } finally {
      if (!controller.signal.aborted && requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [value]);

  // Debounced fetch
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.length < 2) {
      setSuggestions([]);
      setError(null);
      return;
    }
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, fetchSuggestions]);

  // Open/close on focus/blur
  useEffect(() => {
    if (value.length >= 2) setIsOpen(true);
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(e.target as Node) &&
          listRef.current && !listRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(i => Math.min(i + 1, suggestions.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
          handleSelect(suggestions[highlightedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        inputRef.current?.blur();
        break;
      case 'Tab':
        if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
          e.preventDefault();
          handleSelect(suggestions[highlightedIndex]);
        }
        setIsOpen(false);
        break;
    }
  };

  const handleSelect = (suggestion: { id: string; category: string; model: string; specTemplate: string }) => {
    onSelect({
      id: suggestion.id,
      category: suggestion.category,
      model: suggestion.model,
      specTemplate: suggestion.specTemplate
    });
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    setHighlightedIndex(-1);
  };

  const handleBlur = () => {
    // Delay to allow click on suggestion
    setTimeout(() => setIsOpen(false), 200);
  };

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={() => value.length >= 2 && setIsOpen(true)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className={`w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed`}
          aria-autocomplete="list"
          aria-controls="suggestions-list"
          aria-expanded={isOpen && suggestions.length > 0}
          aria-activedescendant={highlightedIndex >= 0 ? `suggestion-${highlightedIndex}` : undefined}
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
          </div>
        )}
        {error && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <AlertCircle className="w-5 h-5 text-red-400" />
          </div>
        )}
      </div>

      {isOpen && !disabled && (
        <ul
          ref={listRef}
          id="suggestions-list"
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-60 overflow-auto bg-slate-950 border border-slate-700 rounded-lg shadow-lg divide-y divide-slate-800"
        >
          {suggestions.length === 0 && !loading && !error && (
            <li className="px-3 py-2 text-sm text-slate-500 text-center">
              No matches in catalog. Enter custom details below — unmatched lines are checked against external references async after submit, never blocking you.
            </li>
          )}
          {suggestions.map((s, i) => (
            <li
              key={s.id}
              id={`suggestion-${i}`}
              role="option"
              aria-selected={i === highlightedIndex}
              onClick={() => handleSelect(s)}
              onMouseEnter={() => setHighlightedIndex(i)}
              className={`px-3 py-2 cursor-pointer transition-colors ${
                i === highlightedIndex ? 'bg-indigo-500/20 text-white' : 'hover:bg-slate-800/50 text-slate-200'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{s.model}</p>
                  <p className="text-xs text-slate-400 truncate">{s.specTemplate}</p>
                </div>
              </div>
            </li>
          ))}
          {loading && (
            <li className="px-3 py-2 text-center text-sm text-slate-500">
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                <span>Loading suggestions…</span>
              </div>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}