"use client";

import { useEffect, useRef } from "react";

/** Rising embers on a 2D canvas: one pre-rendered glow sprite, 30fps, pauses with reduced motion. */
export function Embers({ color = "#ff8a00", count = 45, className = "" }: { color?: string; count?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio, 1.5);
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

    // drawImage of a cached glow is far cheaper than shadowBlur per particle
    const sprite = document.createElement("canvas");
    sprite.width = sprite.height = 32;
    const sc = sprite.getContext("2d")!;
    const g = sc.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "#fff3c4");
    g.addColorStop(0.25, color);
    g.addColorStop(1, "transparent");
    sc.fillStyle = g;
    sc.fillRect(0, 0, 32, 32);

    const spawn = (y = h + Math.random() * h * 0.3) => ({ x: Math.random() * w, y, r: 0.6 + Math.random() * 2.2, vy: 25 + Math.random() * 70, sway: Math.random() * 6, life: 0.6 + Math.random() * 0.4 });
    const ps = Array.from({ length: count }, () => spawn(Math.random() * h));

    let raf = 0;
    let last = performance.now();
    let skip = false;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      // 30fps is plenty for drifting sparks
      skip = !skip;
      if (skip) return;
      const dt = Math.min((now - last) / 1000, 0.08);
      last = now;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (const p of ps) {
        p.y -= p.vy * dt;
        p.x += Math.sin(now / 400 + p.sway) * 12 * dt;
        if (p.y < -10) Object.assign(p, spawn());
        ctx.globalAlpha = Math.max(0, Math.min(1, p.y / h)) * p.life;
        const d = p.r * 6;
        ctx.drawImage(sprite, p.x - d / 2, p.y - d / 2, d, d);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => (cancelAnimationFrame(raf), ro.disconnect());
  }, [color, count]);

  return <canvas ref={ref} aria-hidden className={`pointer-events-none ${className}`} />;
}
