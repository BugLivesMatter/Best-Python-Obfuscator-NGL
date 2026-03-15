import { Star, Github } from 'lucide-react';

export default function Header() {
  return (
    <div className="relative z-10 w-full">
      {/* GitHub star banner */}
      <div className="flex justify-center pt-4 pb-2">
        <a
          href="https://github.com/BugLivesMatter/Best-Python-Obfuscator-NGL"
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/20 bg-white/5 hover:bg-white/10 hover:border-white/40 transition-all duration-300 text-xs text-white/60 hover:text-white/90 backdrop-blur-sm"
        >
          <Github size={13} className="opacity-60 group-hover:opacity-90 transition-opacity" />
          <span>Star this project on GitHub</span>
          <Star size={12} className="text-white/40 group-hover:text-yellow-300/80 transition-colors fill-current" />
        </a>
      </div>

      {/* Title */}
      <div className="text-center py-6 px-4">
        <h1 className="text-5xl font-black tracking-tight text-white mb-2 select-none">
          <span className="font-mono text-white/30">{'{'}</span>
          <span className="mx-3">pyobfuscator</span>
          <span className="font-mono text-white/30">{'}'}</span>
        </h1>
        <p className="text-white/40 text-sm font-mono tracking-widest uppercase">
          python code obfuscation engine
        </p>
      </div>
    </div>
  );
}
