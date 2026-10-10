'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { FileText, X, RotateCcw, Play, AlertTriangle } from 'lucide-react';

export type AssetKind = 'image' | 'video' | 'data' | 'unknown';

/** Classify by lowercase extension (query strings stripped) or data: prefix. */
export function classifyAsset(key: string): AssetKind {
  if (key.startsWith('data:')) {
    if (key.startsWith('data:video')) return 'video';
    if (key.startsWith('data:image')) return 'image';
    return 'data';
  }
  const ext = (key.split('.').pop() || '').toLowerCase().split('?')[0];
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'tiff', 'tif', 'heic', 'heif'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'webm', 'mkv', 'avi', 'flv'].includes(ext)) return 'video';
  if (['csv', 'json', 'xlsx'].includes(ext)) return 'data';
  return 'unknown'; // never rendered as <img>: quarantined row instead
}

export function fileUrlFor(key: string, cdnBase: string): string {
  if (key.startsWith('data:')) return key;
  return `${cdnBase}/${key}`;
}

export function fileNameOf(key: string): string {
  if (key.startsWith('data:')) return 'embedded file';
  const clean = key.split('?')[0];
  return clean.split('/').pop() || clean;
}

interface EvidenceGalleryProps {
  files: string[];
  cdnBase: string;
  title: string;
  compact?: boolean;
}

function TileImage({ src, alt, onFail }: { src: string; alt: string; onFail: () => void }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      {!loaded && <div className="absolute inset-0 animate-pulse bg-slate-700/40" aria-hidden />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={onFail}
        className={`w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity ${loaded ? '' : 'invisible'}`}
      />
    </>
  );
}

export default function EvidenceGallery({ files, cdnBase, title, compact }: EvidenceGalleryProps) {
  const [failedIds, setFailedIds] = useState<string[]>([]);
  const [failStatus, setFailStatus] = useState<Record<string, number | null>>({});
  const [retryKey, setRetryKey] = useState(0);
  const [activeVideo, setActiveVideo] = useState<string | null>(null);

  // Empty state: zero pixels. No chrome, no placeholder — the request header
  // already communicates completeness; empty panels are pure viewport tax.
  const list = files || [];
  if (list.length === 0) return null;

  const items = list.map((key, i) => ({
    id: `${i}:${key.slice(-40)}`,
    key,
    kind: classifyAsset(key),
    url: fileUrlFor(key, cdnBase),
    name: fileNameOf(key)
  }));

  const photos = items.filter((it) => it.kind === 'image');
  const videos = items.filter((it) => it.kind === 'video');
  const datas = items.filter((it) => it.kind === 'data' || it.kind === 'unknown');

  const markFailed = (id: string) =>
    setFailedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));

  // Probe the object URL so failures report their HTTP status instead of a
  // generic message. 401 = session gate, 404 = key/binding mismatch,
  // 5xx = server error, null = unreachable. Same-origin: cookies included.
  const probeAndMark = useCallback((id: string, url: string) => {
    markFailed(id);
    fetch(url, { method: 'HEAD', credentials: 'same-origin', cache: 'no-store' })
      .then((res) => {
        setFailStatus((prev) => (prev[id] !== undefined ? prev : { ...prev, [id]: res.status }));
      })
      .catch(() => {
        setFailStatus((prev) => (prev[id] !== undefined ? prev : { ...prev, [id]: null }));
      });
  }, []);

  const unmarkFailed = (id: string) => {
    setFailedIds((prev) => prev.filter((f) => f !== id));
    setFailStatus((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };
  const retryAll = () => {
    setFailedIds([]);
    setFailStatus({});
    setRetryKey((k) => k + 1);
  };

  // Data-file links never fetch their bytes, so a dead key looks alive until
  // clicked. HEAD-probe them on mount/retry and fold failures into the same
  // failedIds/failStatus machinery as images and video.
  const probing = useRef<Set<string>>(new Set());
  const probeLink = useCallback((id: string, url: string) => {
    if (probing.current.has(id)) return;
    probing.current.add(id);
    const done = () => { probing.current.delete(id); };
    fetch(url, { method: 'HEAD', credentials: 'same-origin', cache: 'no-store' })
      .then((res) => { done(); if (!res.ok) probeAndMark(id, url); })
      .catch(() => { done(); probeAndMark(id, url); });
  }, [probeAndMark]);

  useEffect(() => {
    for (const it of items) {
      if ((it.kind === 'data' || it.kind === 'unknown') && !it.key.startsWith('data:')) {
        if (!failedIds.includes(it.id) && failStatus[it.id] === undefined) probeLink(it.id, it.url);
      }
    }
  });

  const allFailed = items.length > 0 && items.every((it) => failedIds.includes(it.id));
  const firstFailed = items.find((it) => failedIds.includes(it.id));
  const firstStatus = firstFailed ? failStatus[firstFailed.id] : undefined;
  // Failures whose probe hasn't resolved yet: report "diagnosing" instead of
  // the generic fallback, so a pending probe is never mistaken for a verdict.
  const pendingCount = items.filter((it) => failedIds.includes(it.id) && failStatus[it.id] === undefined).length;
  const failReason =
    firstStatus === 401
      ? 'access denied (HTTP 401) — sign out and sign in again'
      : firstStatus === 404
      ? 'file not found in storage (HTTP 404) — key or R2 binding mismatch'
      : typeof firstStatus === 'number' && firstStatus >= 500 && firstStatus !== 503
      ? `server error (HTTP ${firstStatus})`
      : firstStatus === 503
      ? 'evidence storage not attached (HTTP 503) — contact support'
      : firstStatus === null
      ? 'asset endpoint unreachable — check connectivity'
      : 'check access and retry';

  useEffect(() => {
    if (!activeVideo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveVideo(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeVideo]);

  const counts = `${photos.length} photo${photos.length === 1 ? '' : 's'} · ${videos.length} video${videos.length === 1 ? '' : 's'} · ${datas.length} file${datas.length === 1 ? '' : 's'}`;

  return (
    <div className={compact ? 'mt-4 pt-4 border-t border-slate-700/50' : 'mt-6'}>
      <h4 className={`${compact ? 'text-[10px]' : 'text-xs'} font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2`}>
        {title} ({list.length}) <span className="normal-case font-medium text-slate-600">· {counts}</span>
      </h4>

      {allFailed ? (
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm" role="alert">
          <span className="flex items-center gap-2 text-red-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {pendingCount > 0
              ? `Diagnosing ${list.length} attachment${list.length > 1 ? 's' : ''}…`
              : `Couldn't load ${list.length} attachment${list.length > 1 ? 's' : ''} — ${failReason}.`}
          </span>
          <button
            type="button"
            onClick={retryAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-colors shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      ) : (
        <>
          {photos.length > 0 && (
            <div className={`grid gap-3 ${compact ? 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-6' : 'grid-cols-2 sm:grid-cols-4'}`}>
              {photos.map((it) =>
                failedIds.includes(it.id) ? (
                  <div key={`${it.id}:${retryKey}`} className="aspect-square rounded-lg border border-red-500/30 bg-red-500/5 flex flex-col items-center justify-center gap-2 p-2 text-center" title={it.key}>
                    <AlertTriangle className="w-5 h-5 text-red-400" />
                    <p className="text-[11px] text-red-300 leading-tight truncate w-full px-1">{it.name}</p>
                    <p className="text-[10px] font-mono text-red-400/70">
                      {failStatus[it.id] === undefined ? 'diagnosing…' : failStatus[it.id] === null ? 'endpoint unreachable' : `HTTP ${failStatus[it.id]}`}
                    </p>
                    <button
                      type="button"
                      onClick={() => { unmarkFailed(it.id); setRetryKey((k) => k + 1); }}
                      className="flex items-center gap-1 text-[11px] font-bold text-slate-300 hover:text-white"
                    >
                      <RotateCcw className="w-3 h-3" /> Retry
                    </button>
                  </div>
                ) : (
                  <div key={`${it.id}:${retryKey}`} className="relative group aspect-square rounded-lg overflow-hidden border border-slate-700 bg-slate-800/50 hover:border-indigo-500 transition-colors">
                    <TileImage src={it.url} alt={it.name} onFail={() => probeAndMark(it.id, it.url)} />
                  </div>
                )
              )}
            </div>
          )}

          {videos.length > 0 && (
            <div className={`grid gap-3 ${photos.length > 0 ? 'mt-3' : ''} grid-cols-1 sm:grid-cols-2`}>
              {videos.map((it) =>
                failedIds.includes(it.id) ? (
                  <div key={`${it.id}:${retryKey}`} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm">
                    <span className="flex items-center gap-2 text-red-300 truncate">
                      <AlertTriangle className="w-4 h-4 shrink-0" /> <span className="truncate">{it.name}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => { unmarkFailed(it.id); setRetryKey((k) => k + 1); }}
                      className="flex items-center gap-1 text-xs font-bold text-slate-300 hover:text-white shrink-0"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Retry
                    </button>
                  </div>
                ) : (
                  <button
                    key={`${it.id}:${retryKey}`}
                    type="button"
                    onClick={() => setActiveVideo(it.url)}
                    className="group flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700 hover:border-indigo-500 transition-colors text-left"
                  >
                    <span className="w-11 h-11 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center shrink-0 group-hover:border-indigo-500 transition-colors">
                      <Play className="w-5 h-5 text-indigo-400" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-200 truncate">{it.name}</span>
                      <span className="block text-[11px] text-slate-500">Video — click to play</span>
                    </span>
                  </button>
                )
              )}
            </div>
          )}

          {datas.length > 0 && (
            <div className={`space-y-2 ${(photos.length > 0 || videos.length > 0) ? 'mt-3' : ''}`}>
              {datas.map((it) => {
                return failedIds.includes(it.id) ? (
                  <div key={`${it.id}:${retryKey}`} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm">
                    <span className="flex items-center gap-2 text-red-300 truncate">
                      <AlertTriangle className="w-4 h-4 shrink-0" /> <span className="truncate">{it.name}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => { unmarkFailed(it.id); setRetryKey((k) => k + 1); }}
                      className="flex items-center gap-1 text-xs font-bold text-slate-300 hover:text-white shrink-0"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Retry
                    </button>
                  </div>
                ) : (
                  <a
                    key={`${it.id}:${retryKey}`}
                    href={it.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700 hover:border-indigo-500 transition-colors"
                  >
                    <span className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-slate-400" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-200 truncate">{it.name}</span>
                      <span className="block text-[11px] text-slate-500 uppercase">
                        {it.kind === 'unknown' ? 'Unrecognized type — opens as file' : 'Data file — opens in new tab'}
                      </span>
                    </span>
                  </a>
                );
              })}
            </div>
          )}
        </>
      )}

      {activeVideo && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
          onClick={() => setActiveVideo(null)}
          role="dialog"
          aria-label="Video player"
        >
          <div className="relative w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setActiveVideo(null)}
              aria-label="Close video player"
              className="absolute -top-10 right-0 p-2 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <video
              src={activeVideo}
              controls
              autoPlay
              playsInline
              className="w-full max-h-[75vh] rounded-xl border border-slate-700 bg-black"
              onError={() => {
                const hit = items.find((it) => it.url === activeVideo);
                if (hit) probeAndMark(hit.id, hit.url);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
