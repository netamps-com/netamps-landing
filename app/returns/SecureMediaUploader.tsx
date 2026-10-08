import React, { useState, useCallback, useRef } from 'react';
import { UploadCloud, Shield, CheckCircle, AlertTriangle, XCircle, Trash2, Film, Image as ImageIcon, Loader2 } from 'lucide-react';

const MAX_SESSION_BYTES = 300 * 1024 * 1024; // 300MB

type FileState = 'PENDING' | 'TUNNELING' | 'INSPECTING' | 'SUCCESS' | 'ERROR';

interface QueuedFile {
  id: string;
  file: File;
  state: FileState;
  progress: number;
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
  const dropzoneRef = useRef<HTMLDivElement>(null);

  const calculateTotalBytes = (files: QueuedFile[]) => files.reduce((acc, f) => acc + f.file.size, 0);

  const totalBytes = calculateTotalBytes(queuedFiles);
  const isApproachingLimit = totalBytes > MAX_SESSION_BYTES * 0.7;
  const isOverLimit = totalBytes > MAX_SESSION_BYTES;
  const progressPercent = Math.min((totalBytes / MAX_SESSION_BYTES) * 100, 100);

  const getMeterColor = () => {
    if (isOverLimit) return 'bg-red-500';
    if (isApproachingLimit) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  const handleFiles = useCallback((newFiles: File[]) => {
    const validNewFiles: QueuedFile[] = [];
    let currentSessionSize = totalBytes;

    for (const f of newFiles) {
      if (currentSessionSize + f.size > MAX_SESSION_BYTES) {
        validNewFiles.push({
          id: crypto.randomUUID(),
          file: f,
          state: 'ERROR',
          progress: 0,
          errorMessage: 'Session limit breached: Adding this file exceeds the allocation limit of 300MB per upload session.'
        });
      } else {
        validNewFiles.push({
          id: crypto.randomUUID(),
          file: f,
          state: 'PENDING',
          progress: 0
        });
        currentSessionSize += f.size;
      }
    }

    setQueuedFiles(prev => [...prev, ...validNewFiles]);
    
    // Automatically start processing the ones that are valid
    validNewFiles.filter(f => f.state === 'PENDING').forEach(processUpload);

  }, [totalBytes]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  };

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(Array.from(e.target.files));
    }
  };

  const processUpload = async (qFile: QueuedFile) => {
    // 1. TUNNELING STATE
    setQueuedFiles(prev => prev.map(f => f.id === qFile.id ? { ...f, state: 'TUNNELING', progress: 10 } : f));
    
    // Simulate progress bar jump
    setTimeout(() => {
      setQueuedFiles(prev => prev.map(f => f.id === qFile.id && f.state === 'TUNNELING' ? { ...f, progress: 50 } : f));
    }, 400);

    // 2. ACTIVE INSPECTION STATE (Simulated transition before fetching)
    setTimeout(() => {
      setQueuedFiles(prev => prev.map(f => f.id === qFile.id && f.state === 'TUNNELING' ? { ...f, state: 'INSPECTING', progress: 80 } : f));
    }, 1200);

    try {
      const formData = new FormData();
      formData.append('file', qFile.file);
      formData.append('sessionId', sessionId);

      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      
      const res = await fetch(`${API_URL}/api/secure-upload`, {
        method: 'POST',
        body: formData
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'Network edge rejection');
      }

      // 3. SUCCESS STATE
      setQueuedFiles(prev => prev.map(f => f.id === qFile.id ? { 
        ...f, 
        state: 'SUCCESS', 
        progress: 100,
        r2Key: data.key,
        hash: data.hash
      } : f));

      // Bubble up success key
      onUploadSuccess([data.key]);

    } catch (err: any) {
      // 4. ERROR STATE
      setQueuedFiles(prev => prev.map(f => f.id === qFile.id ? { 
        ...f, 
        state: 'ERROR', 
        progress: 0,
        errorMessage: err.message || '415 Payload Architecture Violation'
      } : f));
    }
  };

  const removeFile = (id: string) => {
    setQueuedFiles(prev => prev.filter(f => f.id !== id));
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl font-sans text-slate-200">
      
      <div className="mb-6">
        <h3 className="text-xl font-bold text-white flex items-center gap-2 mb-2">
          <Shield className="w-6 h-6 text-indigo-400" />
          SOC 2 Ingestion Firewall
        </h3>
        <p className="text-sm text-slate-400">Strict payload validation & zero-public-access R2 streaming</p>
      </div>

      {/* Progress Meter */}
      <div className="mb-8">
        <div className="flex justify-between text-xs font-bold uppercase tracking-wider mb-2">
          <span className="text-slate-400">Session Allocation</span>
          <span className={isOverLimit ? 'text-red-400' : isApproachingLimit ? 'text-amber-400' : 'text-emerald-400'}>
            {formatBytes(totalBytes)} / {formatBytes(MAX_SESSION_BYTES)}
          </span>
        </div>
        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50">
          <div 
            className={`h-full transition-all duration-500 ease-out ${getMeterColor()}`} 
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Dropzone */}
      <div 
        ref={dropzoneRef}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); dropzoneRef.current?.classList.add('border-indigo-500', 'bg-slate-800'); }}
        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); dropzoneRef.current?.classList.remove('border-indigo-500', 'bg-slate-800'); }}
        onDrop={onDrop}
        className="relative flex flex-col items-center justify-center w-full h-40 border-2 border-slate-600 border-dashed rounded-xl cursor-pointer hover:bg-slate-800 hover:border-indigo-400 transition-all mb-6 group"
      >
        <div className="flex flex-col items-center justify-center pt-5 pb-6 pointer-events-none">
          <UploadCloud className="w-10 h-10 mb-3 text-slate-400 group-hover:text-indigo-400 transition-colors" />
          <p className="mb-2 text-sm text-slate-300"><span className="font-bold text-white">Click to upload</span> or drag and drop</p>
          <p className="text-xs text-slate-500">MP4, MOV, WEBM, MKV, PNG, JPEG, WEBP, GIF, TIFF, HEIC</p>
        </div>
        <input 
          type="file" 
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
          multiple 
          accept="image/*,video/*" 
          onChange={onFileInput} 
        />
      </div>

      {/* Queue List */}
      <div className="space-y-3">
        {queuedFiles.map((qFile) => {
          const isVideo = qFile.file.type.startsWith('video') || qFile.file.name.match(/\.(mp4|mov|webm|mkv|avi|flv)$/i);
          const Icon = isVideo ? Film : ImageIcon;

          return (
            <div key={qFile.id} className="bg-slate-800 border border-slate-700 rounded-lg p-4 transition-all">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 w-full">
                  <div className="w-10 h-10 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-1">
                      <p className="text-sm font-bold text-white truncate max-w-[200px] sm:max-w-xs">{qFile.file.name}</p>
                      <span className="text-xs font-mono text-slate-500">{formatBytes(qFile.file.size)}</span>
                    </div>

                    {/* STATUS 1: TUNNELING */}
                    {qFile.state === 'TUNNELING' && (
                      <div className="w-full">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-semibold text-indigo-400">Tunneling to R2 edge via TLS 1.3...</span>
                          <span className="text-xs text-indigo-400 font-mono">{qFile.progress}%</span>
                        </div>
                        <div className="w-full h-1 bg-slate-900 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${qFile.progress}%` }} />
                        </div>
                      </div>
                    )}

                    {/* STATUS 2: INSPECTING */}
                    {qFile.state === 'INSPECTING' && (
                      <div className="flex items-center gap-2 mt-1 text-amber-400">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span className="text-xs font-semibold">Cloudflare Worker evaluating payload byte composition magic-hashes...</span>
                      </div>
                    )}

                    {/* STATUS 3: SUCCESS */}
                    {qFile.state === 'SUCCESS' && (
                      <div className="flex flex-col mt-1">
                        <div className="flex items-center gap-2 text-emerald-400">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span className="text-xs font-bold tracking-wide uppercase">Stored & Confirmed (Object Isolation Enforced)</span>
                        </div>
                        {qFile.hash && (
                          <span className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">SHA-256: {qFile.hash}</span>
                        )}
                      </div>
                    )}

                    {/* STATUS 4: ERROR */}
                    {qFile.state === 'ERROR' && (
                      <div className="flex items-start gap-2 mt-2 bg-red-950/30 border border-red-900/50 rounded-md p-2">
                        <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                        <span className="text-xs font-semibold text-rose-400 leading-relaxed">
                          {qFile.errorMessage}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Trash Hook */}
                {(qFile.state === 'SUCCESS' || qFile.state === 'ERROR') && (
                  <button 
                    type="button"
                    onClick={() => removeFile(qFile.id)}
                    className="p-2 text-slate-500 hover:text-red-400 hover:bg-slate-900 rounded-lg transition-colors shrink-0"
                    title="Purge Object"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
