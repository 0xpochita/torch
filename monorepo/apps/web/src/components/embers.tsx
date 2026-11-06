"use client";

import { useEffect, useRef } from "react";

/** Rising embers on a 2D canvas: cheap, additive, pauses when hidden. */
export function Embers({ color = "#ff8a00", count = 70, className = "" }: { color?: string; count?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio, 2);
    const resize = () => {
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = w * dpr;
      cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    const spawn = (y = h + Math.random() * h * 0.3) => ({ x: Math.random() * w, y, r: 0.6 + Math.random() * 2.2, vy: 25 + Math.random() * 70, sway: Math.random() * 6, life: 0.6 + Math.random() * 0.4 });
    const ps = Array.from({ length: count }, () => spawn(Math.random() * h));
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (const p of ps) {
        p.y -= p.vy * dt;
        p.x += Math.sin(now / 400 + p.sway) * 12 * dt;
        if (p.y < -10) Object.assign(p, spawn());
        const a = Math.max(0, Math.min(1, p.y / h)) * p.life;
        ctx.globalAlpha = a;
        ctx.shadowBlur = 8;
        ctx.shadowColor = color;
        ctx.fillStyle = Math.random() < 0.08 ? "#fff3c4" : color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(loop);
    return () => (cancelAnimationFrame(raf), ro.disconnect());
  }, [color, count]);

  return <canvas ref={ref} aria-hidden className={`pointer-events-none ${className}`} />;
}
