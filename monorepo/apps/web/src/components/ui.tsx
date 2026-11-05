import Image from "next/image";
import type { ReactNode } from "react";
import { TOKENS, type Allocation, type TokenKey } from "@/lib/mock";

/** Token logo (CoinGecko artwork), round. */
export function TokenIcon({ token, size = 24 }: { token: TokenKey; size?: number }) {
  const t = TOKENS[token];
  return (
    <span title={t.name} className="relative block shrink-0 overflow-hidden rounded-full bg-surface ring-2 ring-surface" style={{ width: size, height: size }}>
      <Image src={t.logo} alt={t.symbol} fill sizes={`${size * 2}px`} className="object-cover" />
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
    neutral: "bg-fill text-text",
    up: "bg-up/15 text-up-text",
    down: "bg-down/12 text-down",
    dark: "bg-black/70 text-white backdrop-blur",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

export function SectionHeader({ title, action, sub }: { title: string; action?: ReactNode; sub?: string }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <h2 className="text-[22px] font-bold">{title}</h2>
        {sub && <p className="text-sm text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/** iOS segmented control. */
export function Segmented<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="inline-flex rounded-[10px] bg-fill p-[2px] text-[13px]">
      {options.map((o) => (
        <button
          key={o}
          role="tab"
          aria-selected={value === o}
          onClick={() => onChange(o)}
          className={`min-w-16 rounded-[8px] px-3 py-1 font-medium transition ${value === o ? "bg-raised shadow-[0_3px_8px_#0000001f,0_0_0_0.5px_#0000000a]" : "text-text/80"}`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/** iOS switch. */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors ${checked ? "bg-up" : "bg-fill"}`}
    >
      <span className={`absolute top-[2px] size-[27px] rounded-full bg-white shadow-[0_3px_8px_#00000026,0_1px_1px_#00000029] transition-all ${checked ? "left-[22px]" : "left-[2px]"}`} />
    </button>
  );
}

/** Inset grouped list row with optional chevron. */
export function Row({ label, value, chevron }: { label: ReactNode; value?: ReactNode; chevron?: boolean }) {
  return (
    <div className="flex min-h-11 items-center gap-3 border-b border-line-soft py-2.5 text-[15px] last:border-0">
      <span className="flex-1">{label}</span>
      {value !== undefined && <span className="text-muted">{value}</span>}
      {chevron && <span className="text-faint">›</span>}
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
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--fill)" strokeWidth="12" />
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
