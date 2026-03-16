import { X, BookOpen, Download, Terminal, Cpu, Shield, Code2, Zap, Layers } from 'lucide-react';

interface HelpPanelProps {
  onClose: () => void;
}

const MINGW_URL =
  'https://github.com/brechtsanders/winlibs_mingw/releases/download/15.2.0posix-13.0.0-msvcrt-r1/winlibs-x86_64-posix-seh-gcc-15.2.0-mingw-w64msvcrt-13.0.0-r1.zip';

interface Section {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
}

const sections: Section[] = [
  {
    icon: <Zap size={15} className="text-white/70" />,
    title: 'Hard Obfuscation',
    body: (
      <p>
        Activates a more aggressive obfuscation pass: deeper string encryption, heavier junk-code
        injection, and more confusing identifier names. The resulting code is harder to reverse-engineer
        but may be slightly slower at startup.
      </p>
    ),
  },
  {
    icon: <Cpu size={15} className="text-white/70" />,
    title: 'Bytecode Mode',
    body: (
      <p>
        Instead of shipping plain (even if obfuscated) Python source, the tool encrypts your code
        payload and wraps it in a tiny Python bootstrap. At runtime the bootstrap decrypts the payload
        in memory and <code>exec()</code>s it — the actual source never touches disk. Combine with
        <strong> AES encryption</strong> (enabled by default) for the strongest protection.
      </p>
    ),
  },
  {
    icon: <Shield size={15} className="text-white/70" />,
    title: 'AES Encryption',
    body: (
      <p>
        When Bytecode Mode is active, this option encrypts the payload with AES-256 (via CryptoJS) in
        addition to base-64 encoding. The decryption key is embedded in the Python bootstrap. Disable
        only if you want a smaller/simpler loader without AES dependency.
      </p>
    ),
  },
  {
    icon: <Layers size={15} className="text-white/70" />,
    title: 'Exe Launcher',
    body: (
      <>
        <p>
          The most secure mode. Requires <strong>Bytecode Mode</strong> (enabled automatically). The
          output is two files with the <strong>same base name</strong>:
        </p>
        <ul className="mt-2 space-y-1 list-disc list-inside">
          <li>
            <code>yourfile.py</code> — obfuscated Python with <em>no embedded key</em>.
          </li>
          <li>
            <code>yourfile.c</code> — C source for a Windows launcher that holds the decryption key
            and pipes it to Python at runtime.
          </li>
        </ul>
        <p className="mt-3">
          The Python file is useless without the launcher — the key never touches the .py file.
        </p>

        <div className="mt-4 space-y-3">
          <p className="font-semibold text-white/80">Setup: Install MinGW (GCC for Windows)</p>
          <ol className="space-y-2 list-decimal list-inside">
            <li>
              Download MinGW:{' '}
              <a
                href={MINGW_URL}
                target="_blank"
                rel="noreferrer"
                className="text-blue-400 hover:text-blue-300 underline underline-offset-2 break-all"
              >
                winlibs-x86_64-posix-seh-gcc-15.2.0-mingw-w64msvcrt-13.0.0-r1.zip
              </a>
            </li>
            <li>
              Extract the archive to a permanent location, e.g.{' '}
              <code>C:\mingw64</code>.
            </li>
            <li>
              Add <code>C:\mingw64\bin</code> to your <strong>PATH</strong>:
              <ul className="mt-1 ml-5 space-y-1 list-disc list-inside text-white/50">
                <li>Open <em>Start → "Edit the system environment variables"</em>.</li>
                <li>Click <em>Environment Variables → Path → Edit → New</em>.</li>
                <li>Enter <code>C:\mingw64\bin</code> and click OK.</li>
              </ul>
            </li>
            <li>
              Verify in a new terminal: <code>gcc --version</code> should print version info.
            </li>
          </ol>

          <p className="font-semibold text-white/80 mt-4">Compile the Launcher</p>
          <p>After downloading both output files, run in the same folder:</p>
          <pre className="mt-1 px-3 py-2 rounded-lg bg-black/60 border border-white/10 text-xs font-mono text-green-400 overflow-x-auto">
{`# Console launcher (shows terminal window):
gcc yourfile.c -o yourfile.exe

# GUI launcher (no console window, use "gui (no console)" option):
gcc yourfile.c -o yourfile.exe -mwindows`}
          </pre>
          <p>
            Then distribute <code>yourfile.exe</code> + <code>yourfile.py</code> together.
            Double-clicking <code>yourfile.exe</code> will decrypt and run the Python script.
          </p>
        </div>
      </>
    ),
  },
  {
    icon: <Code2 size={15} className="text-white/70" />,
    title: 'Pyobfus-Like Mode',
    body: (
      <p>
        Mimics the style of <em>pyobfuscate</em>: uses I/O/l/1 name mangling, strips docstrings,
        preserves parameter names, injects control-flow flattening (switch-dispatch loops), and adds
        anti-debugging traps that detect <code>sys.settrace</code> / <code>sys.gettrace</code>.
      </p>
    ),
  },
  {
    icon: <Terminal size={15} className="text-white/70" />,
    title: 'GUI (no console)',
    body: (
      <p>
        Visible only when <strong>Exe Launcher</strong> is active. When checked, the generated C
        source uses the <code>-mwindows</code> linker flag, which removes the console window when
        the .exe runs. Use for apps that have their own GUI (tkinter, PyQt, etc.).
      </p>
    ),
  },
];

export default function HelpPanel({ onClose }: HelpPanelProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end"
      onClick={onClose}
    >
      {/* semi-transparent backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Sliding panel */}
      <div
        className="relative z-10 w-full max-w-xl h-full bg-[#0d0d0d] border-l border-white/10 flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 shrink-0">
          <div className="flex items-center gap-2.5 text-white/80">
            <BookOpen size={16} />
            <span className="text-sm font-semibold font-mono tracking-wide">Settings Reference</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/8 transition-all"
          >
            <X size={15} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 text-xs font-mono text-white/50 leading-relaxed">
          {sections.map((s) => (
            <div key={s.title} className="space-y-2">
              <div className="flex items-center gap-2 text-white/80">
                {s.icon}
                <span className="font-semibold text-[11px] tracking-widest uppercase">{s.title}</span>
              </div>
              <div className="pl-5 space-y-1 text-white/50">{s.body}</div>
              <div className="border-b border-white/5 pt-3" />
            </div>
          ))}

          {/* MinGW quick download link repeated at bottom for convenience */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-white/80">
              <Download size={15} className="text-white/70" />
              <span className="font-semibold text-[11px] tracking-widest uppercase">MinGW Quick Download</span>
            </div>
            <div className="pl-5">
              <a
                href={MINGW_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300 transition-all text-xs"
              >
                <Download size={12} />
                Download MinGW (GCC 15.2 / Windows x64)
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
