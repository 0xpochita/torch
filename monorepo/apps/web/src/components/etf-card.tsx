import Link from "next/link";
import { BasketArt } from "@/components/basket-art";
import type { ReactNode } from "react";
import { Sym, SymTile, type IconName } from "@/components/icons";
import { Money, NearAmount, shade } from "@/components/ui";
import { type Etf, type HistoryEvent } from "@/lib/mock";

/** Soft pastel version of an ETF's background, used for card surfaces. */
export const tint = (c: string, white = 62) => `color-mix(in oklab, ${c}, var(--surface) ${white}%)`;

export function Change({ value }: { value: number }) {
  return (
    <span className={`tabular-nums ${value >= 0 ? "text-up" : "text-down"}`}>
      {value >= 0 ? "+" : "−"}
      {Math.abs(value).toFixed(2)}%
    </span>
  );
}

export function AllocationBar({ etf, className = "h-1.5" }: { etf: Etf; className?: string }) {
  return (
    <div className={`flex w-full gap-[2px] overflow-hidden rounded-full ${className}`}>
      {etf.allocation.map((a, i) => (
        <span key={a.token} className="first:rounded-l-full last:rounded-r-full" style={{ width: `${a.weight}%`, background: shade(i) }} />
      ))}
    </div>
  );
}

/** ETF artwork in an app-icon squircle. */
export function Artwork({ etf, size = 56, className = "" }: { etf: Etf; size?: number; className?: string }) {
  return (
    <span className={`relative block shrink-0 overflow-hidden rounded-[24%] shadow-[0_0_0_0.5px_#00000014] ${className}`} style={{ width: size, height: size, background: etf.bg }}>
      <BasketArt allocation={etf.allocation} />
    </span>
  );
}

/** App Store "GET"-style buy capsule. */
export function BuyCapsule({ etf, className = "" }: { etf: Etf; className?: string }) {
  return (
    <Link href={`/etf/${etf.id}`} className={`btn-tint grid h-8 min-w-[76px] place-items-center px-4 text-[14px] ${className}`}>
      {etf.listed ? <NearAmount amount={etf.priceNear} /> : "VIEW"}
    </Link>
  );
}

export function EtfCard({ etf }: { etf: Etf }) {
  return (
    <article className="card group flex flex-col gap-3 p-2.5">
      <Link href={`/etf/${etf.id}`} className="relative aspect-square overflow-hidden rounded-[16px]" style={{ background: etf.bg }}>
        <BasketArt allocation={etf.allocation} />
      </Link>

      <div className="flex items-center gap-3 px-1.5 pb-1">
        <div className="min-w-0 flex-1">
          <Link href={`/etf/${etf.id}`} className="block truncate text-[16px] font-semibold">
            {etf.name}
          </Link>
          <div className="flex items-center gap-1.5 text-[13px] text-muted">
            <Money value={etf.navUsd} /> · <Change value={etf.change24h} />
          </div>
        </div>
        <BuyCapsule etf={etf} />
      </div>
    </article>
  );
}

/** Inset grouped list row: artwork, title, subtitle, trailing content, chevron. */
export function EtfRow({ etf, trailing, subtitle }: { etf: Etf; trailing?: ReactNode; subtitle?: ReactNode }) {
  return (
    <Link href={`/etf/${etf.id}`} className="group flex items-center gap-3 px-3 py-2.5 transition hover:bg-fill/60">
      <Artwork etf={etf} size={52} />
      <span className="min-w-0 flex-1 border-b border-line-soft py-1 group-last:border-0">
        <span className="block truncate text-[16px] font-semibold">{etf.name}</span>
        <span className="block truncate text-[13px] text-muted">
          {subtitle ?? (
            <>
              <Money value={etf.navUsd} /> · <Change value={etf.change24h} />
            </>
          )}
        </span>
      </span>
      {trailing}
      <Sym name="chevron" size={14} stroke={2.4} className="text-faint" />
    </Link>
  );
}

export const EVENT: Record<HistoryEvent["type"], { label: string; icon: IconName; color: string }> = {
  mint: { label: "Minted", icon: "sparkle", color: "#af52de" },
  deposit: { label: "Deposit", icon: "down", color: "#34c759" },
  withdraw: { label: "Withdraw", icon: "up", color: "#ff9500" },
  transfer: { label: "Sale", icon: "tag", color: "#ff2d55" },
};

/** Notification-style activity row. */
export function ActivityRow({ h, etf }: { h: HistoryEvent; etf: Etf }) {
  const e = EVENT[h.type];
  return (
    <Link href={`/etf/${etf.id}`} className="group flex items-center gap-3 px-3 py-2.5 transition hover:bg-fill/60">
      <span className="relative">
        <Artwork etf={etf} size={44} />
        <span className="absolute -bottom-1 -right-1 rounded-[30%] ring-2 ring-surface">
          <SymTile name={e.icon} size={20} />
        </span>
      </span>
      <span className="min-w-0 flex-1 border-b border-line-soft py-1 group-last:border-0">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-[15px] font-semibold">
            {e.label} · {etf.name}
          </span>
          <span className="ml-auto shrink-0 text-[12px] text-muted">{h.at.slice(5).replace("-", "/")}</span>
        </span>
        <span className="block truncate text-[13px] text-muted">{h.detail}</span>
      </span>
    </Link>
  );
}

/** Grouped section with an iOS-style header. */
export function Group({ title, action, children, className = "" }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col gap-2 ${className}`}>
      {(title || action) && (
        <div className="flex items-end justify-between px-1">
          {title && <h2 className="text-[22px] font-bold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
