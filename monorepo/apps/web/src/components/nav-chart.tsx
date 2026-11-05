// 30-day NAV area chart. Pure SVG, no chart lib.
export function NavChart({ values, markers = [] }: { values: number[]; markers?: number[] }) {
  const w = 600;
  const h = 120;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i: number) => (i / (values.length - 1)) * w;
  const y = (v: number) => h - 8 - ((v - min) / (max - min || 1)) * (h - 16);
  const line = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-28 w-full" role="img" aria-label="NAV, last 30 days">
      <defs>
        <linearGradient id="nav-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#8b7cf6" stopOpacity="0.35" />
          <stop offset="1" stopColor="#8b7cf6" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${line} ${w},${h}`} fill="url(#nav-fill)" />
      <polyline points={line} fill="none" stroke="#6b5cf0" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      {markers.map((i) => (
        <line key={i} x1={x(i)} x2={x(i)} y1={0} y2={h} stroke="var(--text)" strokeOpacity="0.35" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}
