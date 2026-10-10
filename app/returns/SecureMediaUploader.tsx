import { useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { UploadCloud, CheckCircle, AlertTriangle, Trash2, Film, Image as ImageIcon, FileText, RotateCcw, OctagonX, Link2, Copy, Check } from 'lucide-react';

const MAX_SESSION_BYTES = 300 * 1024 * 1024; // 300MB per request (global)

const ALLOWED_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'tiff', 'tif', 'heic', 'heif',
  'mp4', 'mov', 'webm', 'mkv', 'avi', 'flv', 'csv', 'json', 'xlsx'
]);

type FileState = 'QUEUED' | 'UPLOADING' | 'SUCCESS' | 'ERROR';

export interface AttachmentSnapshot {
  attachmentId: string;
  productId: string | null;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  sha256: string | null;
  status: 'staged' | 'uploading' | 'verified' | 'error';
  objectKey?: string;
  assetUrl?: string;
  error?: string;
}

interface QueuedFile {
  id: string; // attachmentId — stable for the file's lifetime
  file: File;
  previewUrl?: string;
  state: FileState;
  progress: number; // 0-100, real bytes when UPLOADING
  errorMessage?: string;
  r2Key?: string;
  assetUrl?: string;
  hash?: string; // client SHA-256 (pre-upload) or server hash
  productId: string | null; // owning product card; null = unassigned
  moving: boolean;
}

export interface SecureMediaUploaderHandle {
  stageFiles: (files: File[], productId?: string | null) => void;
  purgeByProduct: (productId: string) => void;
  clear: () => void;
}

interface SecureMediaUploaderProps {
  onUploadSuccess: (keys: string[]) => void; // legacy compat: verified keys, in order
  sessionId: string;
  requestScope: string; // stable per-visit scope embedded in storage keys
  products: { id: string; label: string }[]; // live product cards
  onQueueChange: (snapshot: AttachmentSnapshot[]) => void;
  resetSignal: number; // increment to abort + purge everything
}

function hexOf(bytes: Uint8Array) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Of(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return hexOf(new Uint8Array(digest));
}

const SecureMediaUploader = forwardRef<SecureMediaUploaderHandle, SecureMediaUploaderProps>(function SecureMediaUploader(
  { onUploadSuccess, sessionId, requestScope, products, onQueueChange, resetSignal },
  ref
) {
  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRefs = useRef<Map<string, XMLHttpRequest>>(new Map());
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  const scopeRef = useRef(requestScope);
  scopeRef.current = requestScope;
  const queueRef = useRef<QueuedFile[]>([]);
  const productsRef = useRef(products);
  productsRef.current = products;

  // Revoke object URLs on unmount to avoid leaking memory
  useEffect(() => {
    const snapshot = queuedFiles;
    return () => {
      snapshot.forEach((f) => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Single source of truth outward: every queue transition emits a snapshot.
  // Parent must pass a stable onQueueChange (useCallback) to avoid loops.
  useEffect(() => {
    queueRef.current = queuedFiles;
    onQueueChange(
      queuedFiles.map((f) => ({
        attachmentId: f.id,
        productId: f.productId,
        fileName: f.file.name,
        sizeBytes: f.file.size,
        mimeType: f.file.type,
        sha256: f.hash || null,
        status: f.state === 'QUEUED' ? 'staged' : f.state === 'UPLOADING' ? 'uploading' : f.state === 'SUCCESS' ? 'verified' : 'error',
        objectKey: f.r2Key,
        assetUrl: f.assetUrl,
        error: f.errorMessage
      }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queuedFiles]);

  const deleteRemote = useCallback((key?: string) => {
    if (!key) return;
    const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
    fetch(`${API_URL}/api/secure-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    }).catch(() => {});
  }, []);

  const uploadFile = useCallback((qFile: QueuedFile, productIdAtSend: string | null) => {
    const xhr = new XMLHttpRequest();
    xhrRefs.current.set(qFile.id, xhr);

    setQueuedFiles((prev) => prev.map((f) => (f.id === qFile.id ? { ...f, state: 'UPLOADING', progress: 0, errorMessage: undefined } : f)));

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const pct = Math.min(99, Math.round((e.loaded / e.total) * 100));
      setQueuedFiles((prev) => prev.map((f) => (f.id === qFile.id ? { ...f, progress: pct } : f)));
    };

    xhr.onload = () => {
      xhrRefs.current.delete(qFile.id);
      let data: { success?: boolean; key?: string; assetUrl?: string; hash?: string; message?: string; error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = {};
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.success && data.key) {
        setQueuedFiles((prev) =>
          prev.map((f) => (f.id === qFile.id ? { ...f, state: 'SUCCESS', progress: 100, r2Key: data.key, assetUrl: data.assetUrl, hash: f.hash || data.hash } : f))
        );
        onUploadSuccess([data.key as string]);
      } else {
        setQueuedFiles((prev) =>
          prev.map((f) =>
            f.id === qFile.id
              ? { ...f, state: 'ERROR', progress: 0, errorMessage: data.message || data.error || `Upload rejected (HTTP ${xhr.status}). Check the file format and try again.` }
              : f
          )
        );
      }
    };

    xhr.onerror = () => {
      xhrRefs.current.delete(qFile.id);
      setQueuedFiles((prev) =>
        prev.map((f) => (f.id === qFile.id ? { ...f, state: 'ERROR', progress: 0, errorMessage: 'Network error during upload. Check your connection and retry.' } : f))
      );
    };

    xhr.onabort = () => {
      xhrRefs.current.delete(qFile.id);
    };

    const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
    const formData = new FormData();
    formData.append('file', qFile.file);
    formData.append('sessionId', sessionIdRef.current);
    formData.append('requestId', scopeRef.current || sessionIdRef.current);
    formData.append('productId', productIdAtSend || 'unassigned');
    xhr.open('POST', `${API_URL}/api/secure-upload`);
    xhr.send(formData);
  }, [onUploadSuccess]);

  const stageFiles = useCallback(async (incoming: File[], productId: string | null = null) => {
    if (incoming.length === 0) return;
    // Validate the target product is still live; else stage as unassigned.
    const liveIds = new Set(productsRef.current.map((p) => p.id));
    const target = productId && liveIds.has(productId) ? productId : null;

    const current = queueRef.current;
    const currentBytes = current.reduce((acc, f) => acc + f.file.size, 0);
    const knownHashes = new Set(current.map((f) => f.hash).filter(Boolean) as string[]);
    let running = currentBytes;
    const seenInBatch = new Set<string>();
    const next: QueuedFile[] = [];

    for (const file of incoming) {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      const base = {
        id: crypto.randomUUID(),
        file,
        previewUrl: undefined as string | undefined,
        state: 'QUEUED' as FileState,
        progress: 0,
        productId: target,
        moving: false
      };
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        next.push({
          ...base,
          state: 'ERROR',
          errorMessage: `Type not allowed: ".${ext || '?'}" files are rejected. Use PNG, JPEG, WEBP, GIF, TIFF, HEIC photos; MP4, MOV, WEBM, MKV, AVI, FLV videos; CSV, JSON, XLSX data files.`
        });
        continue;
      }
      if (running + file.size > MAX_SESSION_BYTES) {
        next.push({
          ...base,
          state: 'ERROR',
          errorMessage: 'Session cap exceeded: this file would push past the 300 MB session limit. Remove a file or submit a second request.'
        });
        continue;
      }
      running += file.size;
      next.push(base);
    }

    if (next.length === 0) return;
    setQueuedFiles((prev) => [...prev, ...next]);

    // Hash (dedup identity) then upload, per accepted file.
    for (const row of next) {
      if (row.state !== 'QUEUED') continue;
      try {
        const hash = await sha256Of(row.file);
        let isDup = seenInBatch.has(hash);
        if (!isDup) {
          seenInBatch.add(hash);
          // Re-check against live queue (covers races between concurrent batches)
          isDup = queueRef.current.some((f) => f.id !== row.id && f.hash === hash);
        }
        if (isDup) {
          setQueuedFiles((prev) => prev.map((f) => (f.id === row.id ? { ...f, state: 'ERROR', errorMessage: 'Already attached: an identical file (same content hash) is already staged.' } : f)));
          continue;
        }
        setQueuedFiles((prev) => prev.map((f) => (f.id === row.id ? { ...f, hash } : f)));
        uploadFile({ ...row, hash }, row.productId);
      } catch {
        setQueuedFiles((prev) => prev.map((f) => (f.id === row.id ? { ...f, state: 'ERROR', errorMessage: 'Could not read file for integrity hashing.' } : f)));
      }
    }
  }, [uploadFile]);

  const moveFile = useCallback(async (id: string, newProductId: string | null) => {
    const row = queueRef.current.find((f) => f.id === id);
    if (!row || row.state !== 'SUCCESS' || !row.r2Key || row.moving) return;
    const prevProductId = row.productId;
    if (newProductId === prevProductId) return;
    if (!newProductId) {
      // Mapping back to unassigned keeps the bytes; custody returns to the panel.
      setQueuedFiles((prev) => prev.map((f) => (f.id === id ? { ...f, productId: null } : f)));
      return;
    }
    setQueuedFiles((prev) => prev.map((f) => (f.id === id ? { ...f, moving: true, errorMessage: undefined } : f)));
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${API_URL}/api/secure-move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oldKey: row.r2Key,
          productId: newProductId,
          requestId: scopeRef.current || sessionIdRef.current,
          attachmentId: row.id
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.newKey) throw new Error(data.message || 'Move failed');
      setQueuedFiles((prev) => prev.map((f) => (f.id === id ? { ...f, productId: newProductId, r2Key: data.newKey, assetUrl: data.assetUrl, moving: false } : f)));
    } catch (err) {
      setQueuedFiles((prev) => prev.map((f) => (f.id === id ? { ...f, productId: prevProductId, moving: false, errorMessage: `Re-link failed — file kept on its previous product. ${(err as Error)?.message || 'Retry.'}` } : f)));
    }
  }, []);

  const removeFile = useCallback((id: string) => {
    const target = queueRef.current.find((f) => f.id === id);
    xhrRefs.current.get(id)?.abort();
    if (target?.previewUrl) {
      try { URL.revokeObjectURL(target.previewUrl); } catch {}
    }
    if (target?.state === 'SUCCESS' && target.r2Key) deleteRemote(target.r2Key);
    setQueuedFiles((prev) => prev.filter((f) => f.id !== id));
  }, [deleteRemote]);

  const purgeByProduct = useCallback((productId: string) => {
    const doomed = queueRef.current.filter((f) => f.productId === productId);
    doomed.forEach((f) => {
      xhrRefs.current.get(f.id)?.abort();
      if (f.previewUrl) {
        try { URL.revokeObjectURL(f.previewUrl); } catch {}
      }
      if (f.state === 'SUCCESS' && f.r2Key) deleteRemote(f.r2Key);
    });
    const ids = new Set(doomed.map((f) => f.id));
    setQueuedFiles((prev) => prev.filter((f) => !ids.has(f.id)));
  }, [deleteRemote]);

  const clearAll = useCallback(() => {
    queueRef.current.forEach((f) => {
      xhrRefs.current.get(f.id)?.abort();
      if (f.previewUrl) {
        try { URL.revokeObjectURL(f.previewUrl); } catch {}
      }
      if (f.state === 'SUCCESS' && f.r2Key) deleteRemote(f.r2Key);
    });
    xhrRefs.current.clear();
    setQueuedFiles([]);
  }, [deleteRemote]);

  useImperativeHandle(ref, () => ({
    stageFiles: (files: File[], productId: string | null = null) => { void stageFiles(files, productId); },
    purgeByProduct,
    clear: clearAll
  }), [stageFiles, purgeByProduct, clearAll]);

  // External reset (intent switch, TRACK view, form reset): abort + purge all.
  const resetSignalRef = useRef(resetSignal);
  useEffect(() => {
    if (resetSignal !== resetSignalRef.current) {
      resetSignalRef.current = resetSignal;
      if (resetSignal > 0) clearAll();
    }
  }, [resetSignal, clearAll]);

  const copyAssetUrl = async (id: string, url?: string) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
    } catch {}
  };

  const isImage = (f: File) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|tiff?|heic|heif)$/i.test(f.name);
  const isVideo = (f: File) => f.type.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi|flv)$/i.test(f.name);
  const isData = (f: File) => /\.(csv|json|xlsx)$/i.test(f.name);

  const handleFiles = useCallback(
    (incoming: File[]) => { void stageFiles(incoming, null); },
    [stageFiles]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) handleFiles(Array.from(e.dataTransfer.files));
  };

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) handleFiles(Array.from(e.target.files));
    e.target.value = ''; // allow re-selecting the same file
  };

  const cancelUpload = (id: string) => {
    xhrRefs.current.get(id)?.abort();
    setQueuedFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  };

  const retryUpload = (qFile: QueuedFile) => {
    // Retry re-hashes (cheap, already read once) and re-sends under the same attachmentId.
    void (async () => {
      setQueuedFiles((prev) => prev.map((f) => (f.id === qFile.id ? { ...f, state: 'QUEUED', progress: 0, errorMessage: undefined } : f)));
      try {
        const hash = await sha256Of(qFile.file);
        setQueuedFiles((prev) => prev.map((f) => (f.id === qFile.id ? { ...f, hash } : f)));
        uploadFile({ ...qFile, hash }, qFile.productId);
      } catch {
        setQueuedFiles((prev) => prev.map((f) => (f.id === qFile.id ? { ...f, state: 'ERROR', errorMessage: 'Could not read file for integrity hashing.' } : f)));
      }
    })();
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const totalBytes = queuedFiles.reduce((acc, f) => acc + f.file.size, 0);
  const uploadedBytes = queuedFiles.reduce((acc, f) => acc + (f.state === 'SUCCESS' ? f.file.size : Math.round((f.file.size * f.progress) / 100)), 0);
  const sessionPercent = totalBytes === 0 ? 0 : Math.min(100, Math.round((uploadedBytes / MAX_SESSION_BYTES) * 100));
  const uploadingCount = queuedFiles.filter((f) => f.state === 'UPLOADING').length;

  return (
    <div className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl font-sans text-slate-200">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-white">Attach asset details of any type below</h3>
          <p className="text-xs text-slate-400 mt-1">Accepted Payloads: Data (CSV, JSON, XLSX) • Video (MP4, MOV, WEBM, MKV) • Image (PNG, JPEG, WEBP, GIF, TIFF, HEIC) | Max Size: 300 MB per request</p>
        </div>
        {queuedFiles.length > 0 && (
          <span className="shrink-0 text-xs font-mono text-slate-400 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1">
            {queuedFiles.filter((f) => f.state === 'SUCCESS').length}/{queuedFiles.length} stored
          </span>
        )}
      </div>

      {/* Session meter (real bytes, global across all mapped products) */}
      <div className="mb-5">
        <div className="flex justify-between text-[11px] font-bold uppercase tracking-wider mb-1.5">
          <span className="text-slate-400">{uploadingCount > 0 ? `Uploading ${uploadingCount} file${uploadingCount > 1 ? 's' : ''}…` : 'Session usage'}</span>
          <span className="text-emerald-400 font-mono">{formatBytes(uploadedBytes)} / {formatBytes(MAX_SESSION_BYTES)}</span>
        </div>
        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 transition-all duration-300 ease-out" style={{ width: `${sessionPercent}%` }} />
        </div>
      </div>

      {/* Dropzone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload Attach asset details of any type below"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
        onDrop={onDrop}
        className={`relative flex flex-col items-center justify-center w-full py-8 border-2 border-dashed rounded-xl cursor-pointer transition-all mb-5 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
          isDragging ? 'border-indigo-400 bg-indigo-500/10 scale-[1.01]' : 'border-slate-600 hover:border-indigo-400 hover:bg-slate-800/60'
        }`}
      >
        <UploadCloud className={`w-9 h-9 mb-2 transition-colors ${isDragging ? 'text-indigo-300' : 'text-slate-400'}`} />
        <p className="mb-1 text-sm text-slate-300">
          <span className="font-bold text-white">{isDragging ? 'Drop to start uploading' : 'Click to upload'}</span> or drag and drop
        </p>
        <p className="text-xs text-slate-500">Files start uploading immediately · magic-byte verified server-side</p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          accept="image/*,video/*,.csv,.json,.xlsx"
          onChange={onFileInput}
        />
      </div>

      {/* Queue — every row carries its product linkage */}
      {queuedFiles.length > 0 && (
        <ul className="space-y-2.5">
          {queuedFiles.map((qFile) => (
            <li key={qFile.id} className="bg-slate-800/80 border border-slate-700 rounded-lg p-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center shrink-0 overflow-hidden relative">
                  {isVideo(qFile.file) ? (
                    <Film className="w-5 h-5 text-slate-400" />
                  ) : isData(qFile.file) ? (
                    <FileText className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ImageIcon className="w-5 h-5 text-slate-400" />
                  )}
                  {qFile.previewUrl && isVideo(qFile.file) && (
                    <video
                      src={qFile.previewUrl}
                      className="absolute inset-0 w-full h-full object-cover"
                      autoPlay muted loop playsInline
                      onError={(e) => { e.currentTarget.remove(); }}
                    />
                  )}
                  {qFile.previewUrl && isImage(qFile.file) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={qFile.previewUrl}
                      alt={qFile.file.name}
                      className="absolute inset-0 w-full h-full object-cover"
                      onError={(e) => { e.currentTarget.remove(); }}
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline gap-2 mb-1">
                    <p className="text-sm font-semibold text-white truncate">{qFile.file.name}</p>
                    <span className="text-xs font-mono text-slate-500 shrink-0">
                      {qFile.state === 'UPLOADING' ? `${qFile.progress}% · ` : ''}{formatBytes(qFile.file.size)}
                    </span>
                  </div>
                  {/* Product linkage — the custody mapping. Required before submit. */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <Link2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <select
                      aria-label={`Linked product for ${qFile.file.name}`}
                      value={qFile.productId || ''}
                      disabled={qFile.state === 'UPLOADING' || qFile.moving}
                      onChange={(e) => {
                        const v = e.target.value || null;
                        if (!v || v === qFile.productId) {
                          setQueuedFiles((prev) => prev.map((f) => (f.id === qFile.id ? { ...f, productId: v } : f)));
                          return;
                        }
                        if (qFile.state === 'SUCCESS' && qFile.r2Key) {
                          void moveFile(qFile.id, v);
                        } else {
                          setQueuedFiles((prev) => prev.map((f) => (f.id === qFile.id ? { ...f, productId: v } : f)));
                        }
                      }}
                      className="text-xs bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 max-w-full"
                    >
                      <option value="">Unassigned — select product…</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                    {qFile.moving && <span className="text-[11px] text-indigo-300">Re-linking…</span>}
                  </div>
                  {qFile.state === 'UPLOADING' && (
                    <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden" role="progressbar" aria-valuenow={qFile.progress} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-full bg-indigo-500 transition-all duration-200" style={{ width: `${qFile.progress}%` }} />
                    </div>
                  )}
                  {qFile.state === 'SUCCESS' && (
                    <p className="text-xs font-bold text-emerald-300 flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-md px-2 py-1.5">
                      <CheckCircle className="w-3.5 h-3.5 shrink-0" /> Securely Stored & Encrypted (AES-256)
                      {qFile.hash ? <span className="font-mono font-normal text-emerald-400/70 truncate"> · {qFile.hash.slice(0, 12)}…</span> : null}
                      {qFile.assetUrl ? (
                        <button
                          type="button"
                          onClick={() => copyAssetUrl(qFile.id, qFile.assetUrl)}
                          title="Copy asset URL"
                          className="ml-auto flex items-center gap-1 text-emerald-300 hover:text-white shrink-0"
                        >
                          {copiedId === qFile.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      ) : null}
                    </p>
                  )}
                  {qFile.state === 'ERROR' && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-md p-2.5" role="alert">
                      <p className="text-xs font-bold text-red-300 flex items-start gap-1.5 leading-relaxed">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> <span>{qFile.errorMessage || 'Upload failed.'}</span>
                      </p>
                    </div>
                  )}
                  {qFile.state === 'QUEUED' && (
                    <p className="text-xs text-slate-500">Queued…</p>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-1">
                  {qFile.state === 'UPLOADING' && (
                    <button type="button" onClick={() => cancelUpload(qFile.id)} title="Cancel upload" aria-label={`Cancel upload of ${qFile.file.name}`} className="p-2 text-slate-500 hover:text-amber-400 hover:bg-slate-900 rounded-lg transition-colors">
                      <OctagonX className="w-4 h-4" />
                    </button>
                  )}
                  {qFile.state === 'ERROR' && (
                    <button type="button" onClick={() => retryUpload(qFile)} title="Retry upload" aria-label={`Retry upload of ${qFile.file.name}`} className="p-2 text-slate-500 hover:text-indigo-300 hover:bg-slate-900 rounded-lg transition-colors">
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
                  {qFile.state !== 'UPLOADING' && (
                    <button type="button" onClick={() => removeFile(qFile.id)} title="Remove file" aria-label={`Remove ${qFile.file.name}`} className="p-2 text-slate-500 hover:text-red-400 hover:bg-slate-900 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

export default SecureMediaUploader;
