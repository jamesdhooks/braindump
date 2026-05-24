import { useEffect, useRef } from 'react';
import { effectivePreset, usePreset } from '../motion';

/**
 * Brief sparkle sweep along the bottom edge of a card, used to celebrate
 * an LLM edit. Auto-dismisses after ~1.4s. Respects reduced-motion.
 */
export function SparkleSweep({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const preset = effectivePreset(usePreset());

  useEffect(() => {
    if (!active || preset === 'reduced') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const dpr = window.devicePixelRatio || 1;
    const w = parent.clientWidth;
    const h = 14;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const start = performance.now();
    const DURATION = preset === 'floaty' ? 1700 : 1400;
    const N = preset === 'floaty' ? 22 : 16;
    const particles = Array.from({ length: N }, (_, i) => ({
      anchor: (i / N) * w + (Math.random() - 0.5) * 12,
      sway: 8 + Math.random() * 16,
      y: 7 + (Math.random() - 0.5) * 5,
      r: 0.9 + Math.random() * 1.9,
      offset: Math.random() * 260,
      twinkle: Math.random() * Math.PI * 2
    }));

    let raf = 0;
    const drawSpark = (x: number, y: number, size: number, alpha: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.strokeStyle = `rgba(227, 236, 255, ${alpha})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(-size, 0);
      ctx.lineTo(size, 0);
      ctx.moveTo(0, -size);
      ctx.lineTo(0, size);
      ctx.stroke();
      ctx.globalAlpha = alpha * 0.5;
      ctx.beginPath();
      ctx.moveTo(-size * 0.65, -size * 0.65);
      ctx.lineTo(size * 0.65, size * 0.65);
      ctx.moveTo(size * 0.65, -size * 0.65);
      ctx.lineTo(-size * 0.65, size * 0.65);
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
    };
    function frame(now: number) {
      const t = now - start;
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      const sweep = Math.min(1, t / (preset === 'floaty' ? 900 : 720));
      const headX = -18 + (w + 36) * sweep;
      const trail = ctx.createLinearGradient(Math.max(0, headX - 140), 0, Math.min(w, headX + 14), 0);
      trail.addColorStop(0, 'rgba(118, 166, 255, 0)');
      trail.addColorStop(0.35, 'rgba(118, 166, 255, 0.14)');
      trail.addColorStop(0.72, 'rgba(176, 216, 255, 0.45)');
      trail.addColorStop(1, 'rgba(255, 241, 210, 0.95)');
      ctx.strokeStyle = trail;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(Math.max(-4, headX - 120), h - 4.5);
      ctx.quadraticCurveTo(headX - 36, h - 8.5, headX, h - 5.5);
      ctx.stroke();

      for (const p of particles) {
        const localT = (t - p.offset) / DURATION;
        if (localT < 0 || localT > 1) continue;
        const alpha = Math.sin(localT * Math.PI);
        const x = p.anchor + Math.sin(localT * Math.PI * 2 + p.twinkle) * p.sway;
        if (x / w > sweep + 0.07) continue;
        ctx.beginPath();
        ctx.fillStyle = `rgba(176, 216, 255, ${alpha * 0.82})`;
        ctx.arc(x, p.y, p.r * (1 - localT * 0.35), 0, Math.PI * 2);
        ctx.fill();
        if (alpha > 0.5) {
          drawSpark(x + Math.sin(p.twinkle) * 3, p.y - 1, p.r * 2.4, alpha * 0.7);
        }
      }
      drawSpark(headX, h - 5.5, preset === 'floaty' ? 6 : 5, 0.9);
      ctx.globalCompositeOperation = 'source-over';
      if (t < DURATION) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, w, h);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [active, preset]);

  if (!active || preset === 'reduced') return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute left-0 right-0 bottom-0"
      style={{ height: 14 }}
    />
  );
}
