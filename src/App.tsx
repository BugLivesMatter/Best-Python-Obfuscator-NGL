import { useState, useCallback, useRef } from 'react';
import Background from './components/Background';
import Header from './components/Header';
import CodePanel from './components/CodePanel';
import { obfuscate } from './obfuscator/index';
import { Zap, Copy, Download, Trash2, Upload, CheckCircle2, AlertCircle } from 'lucide-react';

interface Stats {
  renamedCount: number;
  encryptedStrings: number;
  junkBlocks: number;
}

export default function App() {
  const [inputCode, setInputCode] = useState('');
  const [outputCode, setOutputCode] = useState('');
  const [fileName, setFileName] = useState('');
  const [isObfuscating, setIsObfuscating] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileLoad = useCallback((code: string, name: string) => {
    setInputCode(code);
    setFileName(name);
    setOutputCode('');
    setError('');
    setStats(null);
  }, []);

  const handleClear = useCallback(() => {
    setInputCode('');
    setOutputCode('');
    setError('');
    setStats(null);
    setFileName('');
  }, []);

  const handleInputChange = useCallback((v: string) => {
    setInputCode(v);
    if (outputCode) {
      setOutputCode('');
      setStats(null);
    }
    setError('');
  }, [outputCode]);

  const handleObfuscate = useCallback(() => {
    if (!inputCode.trim()) return;
    setIsObfuscating(true);
    setError('');

    setTimeout(() => {
      try {
        const result = obfuscate(inputCode, {
          renameIdentifiers: true,
          encryptStrings: true,
          injectJunk: true,
          minify: true,
        });
        setOutputCode(result.code);
        setStats(result.stats);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Obfuscation failed');
      } finally {
        setIsObfuscating(false);
      }
    }, 50);
  }, [inputCode]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(outputCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [outputCode]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([outputCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName ? `obf_${fileName}` : 'obfuscated.py';
    a.click();
    URL.revokeObjectURL(url);
  }, [outputCode, fileName]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      handleFileLoad(ev.target?.result as string, file.name);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleUploadDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleUploadDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      handleFileLoad(ev.target?.result as string, file.name);
    };
    reader.readAsText(file);
  };

  const btnBase = 'flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 bg-black/40 hover:bg-white/5 hover:border-white/25 text-white/50 hover:text-white/80 transition-all text-xs font-mono backdrop-blur-sm disabled:opacity-30 disabled:cursor-not-allowed';

  return (
    <div className="relative h-screen text-white overflow-hidden flex flex-col">
      <Background />

      <div className="relative z-10 flex flex-col h-full max-w-[90rem] w-full mx-auto px-4">
        {/* Header — shrinks to content */}
        <div className="shrink-0">
          <Header />
        </div>

        {/* Panels — fill remaining space */}
        <div className="flex gap-4 flex-1 min-h-0 pb-3">
          <div className="flex-1 flex flex-col min-w-0">
            <CodePanel
              value={inputCode}
              onChange={handleInputChange}
              fileName={fileName}
              label="input"
              onDrop={handleFileLoad}
              placeholder={`# Paste your Python code here...\n# Or drag & drop a .py file\n\ndef example(name):\n    greeting = "Hello, " + name\n    print(greeting)\n    return greeting`}
            />
          </div>

          <div className="flex-1 flex flex-col min-w-0">
            <CodePanel
              value={outputCode}
              onChange={() => {}}
              label="obfuscated output"
              readOnly
              placeholder="# Obfuscated code will appear here..."
            />
          </div>
        </div>

        {/* Stats / Error — between panels and action bar */}
        {stats && outputCode && (
          <div className="shrink-0 flex items-center gap-4 px-4 py-1.5 mb-2 rounded-xl border border-white/8 bg-white/3 backdrop-blur-sm text-xs font-mono text-white/40">
            <CheckCircle2 size={13} className="text-white/50 shrink-0" />
            <span><span className="text-white/70">{stats.renamedCount}</span> identifiers renamed</span>
            <span className="text-white/15">·</span>
            <span><span className="text-white/70">{stats.encryptedStrings}</span> strings encrypted</span>
            <span className="text-white/15">·</span>
            <span><span className="text-white/70">{stats.junkBlocks}</span> junk blocks injected</span>
          </div>
        )}

        {error && (
          <div className="shrink-0 flex items-center gap-2 px-4 py-2 mb-2 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 text-sm font-mono">
            <AlertCircle size={15} />
            {error}
          </div>
        )}

        {/* Action bar — always visible at bottom */}
        <div className="shrink-0 flex items-center justify-between gap-4 py-3 border-t border-white/8">
          {/* Left: input actions */}
          <div className="flex items-center gap-2">
            <button
              onDragOver={handleUploadDragOver}
              onDrop={handleUploadDrop}
              onClick={() => fileInputRef.current?.click()}
              className={btnBase}
            >
              <Upload size={13} />
              upload file
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".py,text/plain"
              className="hidden"
              onChange={handleFileInputChange}
            />
            <button onClick={handleClear} disabled={!inputCode} className={btnBase}>
              <Trash2 size={13} />
              clear
            </button>
          </div>

          {/* Center: obfuscate */}
          <button
            onClick={handleObfuscate}
            disabled={!inputCode.trim() || isObfuscating}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-white text-black font-bold text-xs hover:bg-white/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-white/10 active:scale-95"
          >
            {isObfuscating ? (
              <>
                <div className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                obfuscating...
              </>
            ) : (
              <>
                <Zap size={14} />
                obfuscate
              </>
            )}
          </button>

          {/* Right: output actions */}
          <div className="flex items-center gap-2">
            <button onClick={handleCopy} disabled={!outputCode} className={btnBase}>
              <Copy size={13} />
              {copied ? 'copied!' : 'copy'}
            </button>
            <button onClick={handleDownload} disabled={!outputCode} className={btnBase}>
              <Download size={13} />
              download
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
