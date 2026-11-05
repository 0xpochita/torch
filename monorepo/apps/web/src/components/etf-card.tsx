import Image from "next/image";
import Link from "next/link";
import { TOKENS, fmtUsd, type Etf } from "@/lib/mock";

/** Soft pastel version of an ETF's background, used for card surfaces. */
export const tint = (c: string, white = 62) => `color-mix(in oklab, ${c}, white ${white}%)`;

export function Change({ value }: { value: number }) {
  return (
    <span className={value >= 0 ? "text-up" : "text-down"}>
      {value >= 0 ? "↗" : "↘"} {value >= 0 ? "+" : "−"}
      {Math.abs(value).toFixed(2)}%
    </span>
  );
}

export function AllocationBar({ etf, className = "h-1.5" }: { etf: Etf; className?: string }) {
  return (
    <div className={`flex w-full overflow-hidden rounded-full ${className}`}>
      {etf.allocation.map((a) => (
        <span key={a.token} style={{ width: `${a.weight}%`, background: TOKENS[a.token].color }} />
      ))}
    </div>
  );
}

/** Pair of overlapping avatars: creator + owner. */
export function Avatars({ etf, className = "text-text" }: { etf: Etf; className?: string }) {
  return (
    <span className={`flex items-center gap-1.5 text-[11px] ${className}`}>
      <span className="flex -space-x-1.5">
        {[etf.creator, etf.owner].map((a, i) => (
          <span
            key={i}
            className="grid size-5 place-items-center rounded-md border-2 border-white text-[9px] font-semibold uppercase text-white"
            style={{ background: i ? "#6b6bf0" : "#1c1c1f" }}
          >
            {a[0]}
          </span>
        ))}
      </span>
      @{etf.creator.replace(".near", "")}, @{etf.owner.replace(".near", "")}
    </span>
  );
}

export function EtfCard({ etf }: { etf: Etf }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl p-3" style={{ background: tint(etf.bg) }}>
      <Link href={`/etf/${etf.id}`} className="group relative aspect-square overflow-hidden rounded-xl" style={{ background: etf.bg }}>
        <Image
          src={etf.image}
          alt={etf.name}
          fill
          sizes="(min-width: 1536px) 18vw, (min-width: 1024px) 22vw, (min-width: 640px) 45vw, 100vw"
          className="object-cover transition duration-500 group-hover:scale-105"
        />
      </Link>
      <div className="flex items-center justify-between">
        <Avatars etf={etf} />
        <span className="text-sm" aria-label={`${etf.likes} likes`}>
          ♡
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        <Link href={`/etf/${etf.id}`} className="font-semibold">
          {etf.name} <span className="font-normal text-muted">#{etf.id}</span>
        </Link>
        <div className="flex items-center justify-between text-xs text-muted">
          <span>{etf.listed ? `Price: Ⓝ ${etf.priceNear}` : "Not listed"}</span>
          <span className="text-sm font-medium text-text">{fmtUsd(etf.navUsd)}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <Link href={`/etf/${etf.id}`} className="btn-ink grid h-9 place-items-center">
          {etf.listed ? "Buy ETF" : "View vault"}
        </Link>
        <Link href={`/etf/${etf.id}#history`} className="btn-line grid h-9 place-items-center bg-white/60">
          History
        </Link>
      </div>
    </div>
  );
}
