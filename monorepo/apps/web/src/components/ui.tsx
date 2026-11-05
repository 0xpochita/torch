import type { ReactNode } from "react";
import { TOKENS, type Allocation, type TokenKey } from "@/lib/mock";

/** Coin-style token mark: brand color + symbol initials. */
export function TokenIcon({ token, size = 24 }: { token: TokenKey; size?: number }) {
  const t = TOKENS[token];
  return (
    <span
      title={t.name}
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white ring-2 ring-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `radial-gradient(circle at 30% 25%, color-mix(in oklab, ${t.color}, white 35%), ${t.color} 60%)`,
        textShadow: "0 1px 1px rgb(0 0 0 / 0.25)",
      }}
    >
      {t.symbol.slice(0, t.symbol.length > 4 ? 1 : 2)}
    </span>
  );
}

/** Overlapping token marks for a basket. */
export function TokenStack({ allocation, size = 22 }: { allocation: Allocation[]; size?: number }) {
  return (
    <span className="flex -space-x-1.5">
      {allocation.map((a) => (
        <TokenIcon key={a.token} token={a.token} size={size} />
      ))}
    </span>
  );
}

/** Currency with faded cents, e.g. $1,840.25 */
export function Money({ value, className = "" }: { value: number; className?: string }) {
  const [int, dec = "00"] = value.toFixed(2).split(".");
  return (
    <span className={`tabular-nums ${className}`}>
      ${Number(int).toLocaleString("en-US")}
      <span className="opacity-40">.{dec}</span>
    </span>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "up" | "down" | "dark" }) {
  const tones = {
    neutral: "bg-panel text-text",
    up: "bg-up/10 text-up",
    down: "bg-down/10 text-down",
    dark: "bg-ink text-white",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

export function SectionHeader({ title, action, sub }: { title: string; action?: ReactNode; sub?: string }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {sub && <p className="text-sm text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/** Segmented pill tabs. */
export function Segmented<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-xl bg-panel p-1 text-sm">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`rounded-lg px-3 py-1.5 transition ${value === o ? "bg-white font-medium shadow-sm" : "text-muted hover:text-text"}`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/** Allocation donut, pure SVG. */
export function Donut({ allocation, size = 120, label }: { allocation: Allocation[]; size?: number; label?: ReactNode }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const total = allocation.reduce((s, a) => s + a.weight, 0) || 1;
  const arcs = allocation.reduce<{ token: TokenKey; len: number; offset: number }[]>((acc, a) => {
    const offset = acc.length ? acc[acc.length - 1].offset + acc[acc.length - 1].len : 0;
    return [...acc, { token: a.token, len: (a.weight / total) * c, offset }];
  }, []);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" role="img" aria-label="Allocation">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--panel)" strokeWidth="12" />
        {arcs.map((a) => (
          <circle
            key={a.token}
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={TOKENS[a.token].color}
            strokeWidth="12"
            strokeDasharray={`${Math.max(a.len - 1.2, 0)} ${c}`}
            strokeDashoffset={-a.offset}
          />
        ))}
      </svg>
      {label && <div className="absolute inset-0 grid place-items-center text-center">{label}</div>}
    </div>
  );
}
