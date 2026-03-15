import { useRef, useCallback } from 'react';
import { FileCode2, X } from 'lucide-react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  fileName?: string;
  placeholder?: string;
  readOnly?: boolean;
  label?: string;
  onDrop?: (code: string, name: string) => void;
}

export default function CodePanel({
  value,
  onChange,
  fileName,
  placeholder = 'Paste your Python code here...',
  readOnly = false,
  label,
  onDrop,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!onDrop) return;
    e.preventDefault();
  }, [onDrop]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    if (!onDrop) return;
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        onDrop(ev.target?.result as string, file.name);
      };
      reader.readAsText(file);
    }
  }, [onDrop]);

  const lines = (value || placeholder).split('\n');

  const handleScroll = () => {
    const lineNums = scrollRef.current?.querySelector('.line-nums') as HTMLElement | null;
    const ta = textareaRef.current;
    if (lineNums && ta) {
      lineNums.scrollTop = ta.scrollTop;
    }
  };

  return (
    <div className="relative flex flex-col w-full h-full rounded-2xl border border-white/10 bg-black/50 backdrop-blur-md overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/8 bg-white/3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-white/10" />
            <div className="w-3 h-3 rounded-full bg-white/10" />
            <div className="w-3 h-3 rounded-full bg-white/10" />
          </div>
          {label && (
            <span className="text-white/30 text-xs font-mono ml-2 tracking-wider uppercase">
              {label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {fileName && (
            <div className="flex items-center gap-1.5">
              <FileCode2 size={11} className="text-white/30" />
              <span className="text-white/40 text-xs font-mono">{fileName}</span>
            </div>
          )}
          {value && !readOnly && (
            <button
              onClick={() => onChange('')}
              className="p-0.5 rounded hover:bg-white/10 transition-colors"
              title="Clear"
            >
              <X size={13} className="text-white/30 hover:text-white/60" />
            </button>
          )}
        </div>
      </div>

      {/* Line numbers + editor */}
      <div
        className="relative flex flex-1 min-h-0 overflow-hidden"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        ref={scrollRef}
      >
        {/* Line numbers */}
        <div className="line-nums select-none border-r border-white/8 bg-black/20 px-3 py-4 text-right min-w-[3rem] overflow-hidden shrink-0">
          {lines.map((_, idx) => (
            <div key={idx} className="text-white/15 text-xs font-mono leading-6">
              {idx + 1}
            </div>
          ))}
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          readOnly={readOnly}
          spellCheck={false}
          onScroll={handleScroll}
          className="flex-1 bg-transparent text-white/90 font-mono text-sm resize-none outline-none px-4 py-4 leading-6 placeholder:text-white/15 overflow-auto"
          style={{ caretColor: 'white', tabSize: 4 }}
          onKeyDown={(e) => {
            if (e.key === 'Tab' && !readOnly) {
              e.preventDefault();
              const start = e.currentTarget.selectionStart;
              const end = e.currentTarget.selectionEnd;
              const newValue = value.substring(0, start) + '    ' + value.substring(end);
              onChange(newValue);
              requestAnimationFrame(() => {
                if (textareaRef.current) {
                  textareaRef.current.selectionStart = start + 4;
                  textareaRef.current.selectionEnd = start + 4;
                }
              });
            }
          }}
        />
      </div>
    </div>
  );
}
