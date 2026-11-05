import Image from "next/image";
import type { ReactNode } from "react";
import Link from "next/link";
import { Sym, type IconName } from "@/components/icons";
import { TOKENS, type Allocation, type Category, type TokenKey } from "@/lib/mock";

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
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors ${checked ? "bg-tint" : "bg-line"}`}
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

/* ---------- Playful kit ---------- */

export type Pastel = "lilac" | "pink" | "peach" | "lime" | "sky" | "mint";

/** Tailwind class pairs for each pastel (literal strings so Tailwind sees them). */
export const PASTEL: Record<Pastel, { bg: string; ink: string }> = {
  lilac: { bg: "bg-lilac", ink: "text-lilac-ink" },
  pink: { bg: "bg-pink", ink: "text-pink-ink" },
  peach: { bg: "bg-peach", ink: "text-peach-ink" },
  lime: { bg: "bg-lime", ink: "text-lime-ink" },
  sky: { bg: "bg-sky", ink: "text-sky-ink" },
  mint: { bg: "bg-mint", ink: "text-mint-ink" },
};

export const CATEGORY_PASTEL: Record<Category, Pastel> = {
  "Blue Chip": "sky",
  Stable: "mint",
  DeFi: "peach",
  Meme: "lilac",
  "Chain Abstraction": "pink",
  "Liquid Staking": "lime",
};

/** Chunky display title with an accent full stop: "Explore." */
export function Title({ children, size = "text-[48px]" }: { children: ReactNode; size?: string }) {
  return (
    <h1 className={`title-chunky ${size}`}>
      {children}
      <span className="text-tint">.</span>
    </h1>
  );
}

/** Pastel squircle with an icon. */
export function PastelIcon({ icon, tone, size = 40 }: { icon: IconName; tone: Pastel; size?: number }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-[30%] ${PASTEL[tone].bg} ${PASTEL[tone].ink}`} style={{ width: size, height: size }}>
      <Sym name={icon} size={size * 0.5} stroke={2.2} />
    </span>
  );
}

/** Round quick action: Buy / Swap / Send / More. */
export function ActionCircle({ icon, label, href, onClick }: { icon: IconName; label: string; href?: string; onClick?: () => void }) {
  const inner = (
    <>
      <span className="grid size-14 place-items-center rounded-full bg-fill text-text transition group-hover:bg-line group-active:scale-95">
        <Sym name={icon} size={22} stroke={2} />
      </span>
      <span className="text-[13px] font-medium text-muted">{label}</span>
    </>
  );
  return href ? (
    <Link href={href} className="group flex flex-col items-center gap-1.5">
      {inner}
    </Link>
  ) : (
    <button onClick={onClick} className="group flex flex-col items-center gap-1.5">
      {inner}
    </button>
  );
}

/** "Daily check-in" style stat tile. */
export function StatTile({ icon, tone, label, value, children }: { icon: IconName; tone: Pastel; label: string; value: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-[20px] bg-fill p-3.5">
      <span className="flex items-center gap-2 text-[13px] font-semibold">
        <span className={`grid size-6 place-items-center rounded-full ${PASTEL[tone].bg} ${PASTEL[tone].ink}`}>
          <Sym name={icon} size={13} stroke={2.4} />
        </span>
        {label}
      </span>
      <span className="text-[20px] font-bold leading-none tracking-tight">{value}</span>
      {children}
    </div>
  );
}

/** Plan-style radio row (orange check when selected). */
export function RadioRow({ selected, onSelect, title, detail }: { selected: boolean; onSelect: () => void; title: ReactNode; detail?: ReactNode }) {
  return (
    <button
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-[18px] border-2 px-3.5 py-3 text-left transition ${selected ? "border-tint bg-peach/60" : "border-transparent bg-fill hover:bg-line/60"}`}
    >
      <span className={`grid size-6 shrink-0 place-items-center rounded-full ${selected ? "bg-tint text-white" : "border-2 border-faint"}`}>{selected && <Sym name="check" size={14} stroke={3} />}</span>
      <span className="flex-1 text-[15px] font-semibold">{title}</span>
      {detail && <span className="text-[13px] text-muted">{detail}</span>}
    </button>
  );
}
