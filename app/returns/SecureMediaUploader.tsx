import { useState, useCallback, useRef, useEffect } from 'react';
import { UploadCloud, CheckCircle, AlertTriangle, Trash2, Film, Image as ImageIcon, RotateCcw, OctagonX } from 'lucide-react';

const MAX_SESSION_BYTES = 300 * 1024 * 1024; // 300MB

const ALLOWED_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'tiff', 'tif', 'heic', 'heif',
  'mp4', 'mov', 'webm', 'mkv', 'avi', 'flv'
]);

type FileState = 'QUEUED' | 'UPLOADING' | 'SUCCESS' | 'ERROR';

interface QueuedFile {
  id: string;
  file: File;
  previewUrl?: string;
  state: FileState;
  progress: number; // 0-100, real bytes when UPLOADING
  errorMessage?: string;
  r2Key?: string;
  hash?: string;
}

interface SecureMediaUploaderProps {
  onUploadSuccess: (keys: string[]) => void;
  sessionId: string;
}

export default function SecureMediaUploader({ onUploadSuccess, sessionId }: SecureMediaUploaderProps) {
  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRefs = useRef<Map<string, XMLHttpRequest>>(new Map());
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  // Revoke object URLs on unmount to avoid leaking memory
  useEffect(() => {
    const snapshot = queuedFiles;
    return () => {
      snapshot.forEach((f) => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isImage = (f: File) => f.type.startsWith('image/');
  const isVideo = (f: File) => f.type.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi|flv)$/i.test(f.name);

  const uploadFile = useCallback((qFile: QueuedFile) => {
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
      let data: { success?: boolean; key?: string; hash?: string; message?: string; error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = {};
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.success && data.key) {
        setQueuedFiles((prev) =>
          prev.map((f) => (f.id === qFile.id ? { ...f, state: 'SUCCESS', progress: 100, r2Key: data.key, hash: data.hash } : f))
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
    xhr.open('POST', `${API_URL}/api/secure-upload`);
    xhr.send(formData);
  }, [onUploadSuccess]);

  const handleFiles = useCallback(
    (incoming: File[]) => {
      if (incoming.length === 0) return;
      const currentBytes = queuedFiles.reduce((acc, f) => acc + f.file.size, 0);
      let running = currentBytes;
      const next: QueuedFile[] = [];
      for (const file of incoming) {
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(ext)) {
          next.push({
            id: crypto.randomUUID(),
            file,
            state: 'ERROR',
            progress: 0,
            errorMessage: `Type not allowed: ".${ext || '?'}" files are rejected. Use PNG, JPEG, WEBP, GIF, TIFF, HEIC photos or MP4, MOV, WEBM, MKV, AVI, FLV videos.`
          });
          continue;
        }
        if (running + file.size > MAX_SESSION_BYTES) {
          next.push({
            id: crypto.randomUUID(),
            file,
            state: 'ERROR',
            progress: 0,
            errorMessage: 'Session cap exceeded: this file would push past the 300 MB session limit. Remove a file or submit a second request.'
          });
        } else {
          running += file.size;
          next.push({
            id: crypto.randomUUID(),
            file,
            previewUrl: isImage(file) ? URL.createObjectURL(file) : undefined,
            state: 'QUEUED',
            progress: 0
          });
        }
      }
      setQueuedFiles((prev) => [...prev, ...next]);
      // Start real uploads for accepted files
      next.filter((f) => f.state === 'QUEUED').forEach(uploadFile);
    },
    [queuedFiles, uploadFile]
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

  const removeFile = (id: string) => {
    setQueuedFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  };

  const retryUpload = (qFile: QueuedFile) => {
    uploadFile(qFile);
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
          <h3 className="text-lg font-bold text-white">Asset photos</h3>
          <p className="text-xs text-slate-400 mt-1">Photos or video of the equipment · MP4, MOV, WEBM, MKV, PNG, JPEG, WEBP, GIF, TIFF, HEIC · up to 300 MB per request</p>
        </div>
        {queuedFiles.length > 0 && (
          <span className="shrink-0 text-xs font-mono text-slate-400 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1">
            {queuedFiles.filter((f) => f.state === 'SUCCESS').length}/{queuedFiles.length} stored
          </span>
        )}
      </div>

      {/* Session meter (real bytes) */}
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
        aria-label="Upload asset photos"
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
          accept="image/*,video/*"
          onChange={onFileInput}
        />
      </div>

      {/* Queue */}
      {queuedFiles.length > 0 && (
        <ul className="space-y-2.5">
          {queuedFiles.map((qFile) => (
            <li key={qFile.id} className="bg-slate-800/80 border border-slate-700 rounded-lg p-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center shrink-0 overflow-hidden relative">
                  {isVideo(qFile.file) ? (
                    <Film className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ImageIcon className="w-5 h-5 text-slate-400" />
                  )}
                  {qFile.previewUrl && (
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
                  {qFile.state === 'UPLOADING' && (
                    <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden" role="progressbar" aria-valuenow={qFile.progress} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-full bg-indigo-500 transition-all duration-200" style={{ width: `${qFile.progress}%` }} />
                    </div>
                  )}
                  {qFile.state === 'SUCCESS' && (
                    <p className="text-xs font-bold text-emerald-300 flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-md px-2 py-1.5">
                      <CheckCircle className="w-3.5 h-3.5 shrink-0" /> Securely Stored & Encrypted (AES-256)
                      {qFile.hash ? <span className="font-mono font-normal text-emerald-400/70 truncate"> · {qFile.hash.slice(0, 12)}…</span> : null}
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
}
