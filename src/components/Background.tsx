import { useEffect, useRef } from 'react';

const SYMBOLS = ['l', 'I', '1', 'lI', 'Il', 'll', 'II', '1l', 'l1', 'def', 'for', 'if', 'in', 'λ', '{}', '()', ':=', 'lIl', 'IlI', 'll1'];

export default function Background() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const fontSize = 14;
    const columnWidth = 28;

    let columns = Math.ceil(canvas.width / columnWidth);
    const drops: number[] = Array(columns).fill(0).map(() => Math.random() * -50);
    const speeds: number[] = Array(columns).fill(0).map(() => 0.3 + Math.random() * 0.5);
    const symbolIdx: number[] = Array(columns).fill(0).map(() => Math.floor(Math.random() * SYMBOLS.length));

    let animId: number;
    let lastTime = 0;

    const draw = (time: number) => {
      if (time - lastTime < 60) {
        animId = requestAnimationFrame(draw);
        return;
      }
      lastTime = time;

      // Fade trail
      ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < columns; i++) {
        const y = drops[i] * fontSize;
        const x = i * columnWidth;

        if (y < 0) {
          drops[i] += speeds[i];
          continue;
        }

        // Head symbol — bright white
        ctx.font = `bold ${fontSize}px 'Courier New', monospace`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.fillText(SYMBOLS[symbolIdx[i]], x, y);

        // Mid trail — grey
        ctx.fillStyle = 'rgba(180, 180, 180, 0.3)';
        if (drops[i] > 3) {
          ctx.fillText(SYMBOLS[(symbolIdx[i] + 1) % SYMBOLS.length], x, y - fontSize * 2);
        }
        if (drops[i] > 6) {
          ctx.fillStyle = 'rgba(100, 100, 100, 0.15)';
          ctx.fillText(SYMBOLS[(symbolIdx[i] + 2) % SYMBOLS.length], x, y - fontSize * 4);
        }

        drops[i] += speeds[i];

        // Reset column when it exits screen
        if (y > canvas.height + fontSize * 5) {
          drops[i] = -Math.random() * 30;
          speeds[i] = 0.3 + Math.random() * 0.5;
          symbolIdx[i] = Math.floor(Math.random() * SYMBOLS.length);
        }

        // Randomly change symbol
        if (Math.random() < 0.02) {
          symbolIdx[i] = Math.floor(Math.random() * SYMBOLS.length);
        }
      }

      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);

    const handleResize = () => {
      resize();
      columns = Math.ceil(canvas.width / columnWidth);
      drops.length = columns;
      speeds.length = columns;
      symbolIdx.length = columns;
      for (let i = drops.length; i < columns; i++) {
        drops[i] = 0;
        speeds[i] = 0.3 + Math.random() * 0.5;
        symbolIdx[i] = Math.floor(Math.random() * SYMBOLS.length);
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 pointer-events-none"
      style={{ background: '#000' }}
    />
  );
}
