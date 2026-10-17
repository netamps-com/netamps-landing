'use client';

import { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, X, ChevronDown, Loader2, Bot } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || '';

type Module = 'login' | 'track' | 'returns' | 'domain' | 'ingest' | 'module_recovery';

interface NetampsAIProps {
  module: Module;
  context?: Record<string, unknown>;
  title?: string;
  compact?: boolean;
}

export default function NetampsAI({ module, context = {}, title, compact = false }: NetampsAIProps) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const ask = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!prompt.trim() || loading) return;

    const userMsg = prompt.trim();
    setMessages((prev) => [...prev, { role: 'user', text: userMsg }]);
    setPrompt('');
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API}/api/ai/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ module, context, prompt: userMsg })
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.message || 'AI unavailable');
        return;
      }

      const responseText = typeof data.response === 'string'
        ? data.response
        : JSON.stringify(data.response, null, 2);

      setMessages((prev) => [...prev, { role: 'ai', text: responseText }]);
    } catch (err: any) {
      setError(err?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    setMessages([]);
    setError(null);
  };

  if (compact) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-semibold hover:bg-indigo-100 transition-colors"
      >
        <Sparkles className="w-4 h-4" />
        {title || 'NETAMPS AI'}
      </button>
    );
  }

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none"
        aria-label="Open NETAMPS AI Assistant"
      >
        <Sparkles className="w-5 h-5" />
        <span className="hidden sm:inline font-semibold text-sm">{title || 'NETAMPS AI'}</span>
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-20 right-4 z-50 w-96 max-w-[calc(100vw-2rem)] bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[70vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-indigo-50">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-indigo-600" />
              <span className="font-bold text-indigo-900 text-sm">{title || 'NETAMPS AI'}</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={clear} className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold">
                Clear
              </button>
              <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px]">
            {messages.length === 0 && (
              <div className="text-center text-slate-400 text-sm py-8">
                <Sparkles className="w-8 h-8 mx-auto mb-2 text-indigo-300" />
                <p>Ask me anything about {module.replace('_', ' ')}</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-800 border border-slate-200'
                  }`}
                >
                  <pre className="whitespace-pre-wrap font-sans">{msg.text}</pre>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="px-3 py-2 rounded-2xl bg-slate-100 border border-slate-200">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                </div>
              </div>
            )}
            {error && (
              <div className="text-red-600 text-xs bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                {error}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={ask} className="border-t border-slate-200 p-3 flex gap-2">
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={`Ask about ${module.replace('_', ' ')}...`}
              className="flex-1 px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="px-3 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}