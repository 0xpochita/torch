import Image from "next/image";
import Link from "next/link";
import { Money, Pill, TokenStack } from "@/components/ui";
import { TOKENS, type Etf } from "@/lib/mock";

/** Soft pastel version of an ETF's background, used for card surfaces. */
export const tint = (c: string, white = 62) => `color-mix(in oklab, ${c}, white ${white}%)`;

export function Change({ value }: { value: number }) {
  return (
    <span className={`tabular-nums ${value >= 0 ? "text-up" : "text-down"}`}>
      {value >= 0 ? "↗ +" : "↘ −"}
      {Math.abs(value).toFixed(2)}%
    </span>
  );
}

export function AllocationBar({ etf, className = "h-1.5" }: { etf: Etf; className?: string }) {
  return (
    <div className={`flex w-full gap-0.5 overflow-hidden rounded-full ${className}`}>
      {etf.allocation.map((a) => (
        <span key={a.token} className="first:rounded-l-full last:rounded-r-full" style={{ width: `${a.weight}%`, background: TOKENS[a.token].color }} />
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
    <article className="group flex flex-col gap-3 rounded-2xl p-3 transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-18px_rgb(0_0_0/0.35)]" style={{ background: tint(etf.bg) }}>
      <Link href={`/etf/${etf.id}`} className="relative aspect-[4/3.4] overflow-hidden rounded-xl" style={{ background: etf.bg }}>
        <Image
          src={etf.image}
          alt={etf.name}
          fill
          sizes="(min-width: 1536px) 20vw, (min-width: 1024px) 26vw, (min-width: 640px) 45vw, 100vw"
          className="object-cover transition duration-500 group-hover:scale-105"
        />
        <span className="absolute left-2.5 top-2.5 flex gap-1.5">
          <Pill tone="dark">{etf.category}</Pill>
        </span>
        <span className="absolute right-2.5 top-2.5 rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium backdrop-blur">♡ {etf.likes}</span>
        <span className="absolute bottom-2.5 left-2.5 rounded-full bg-white/85 px-2 py-0.5 text-[11px] font-medium backdrop-blur">
          <Change value={etf.change24h} />
        </span>
      </Link>

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/etf/${etf.id}`} className="block truncate font-semibold hover:underline">
            {etf.name}
          </Link>
          <span className="font-mono text-[11px] text-muted">{etf.id}.torch.near</span>
        </div>
        <TokenStack allocation={etf.allocation} size={22} />
      </div>

      <AllocationBar etf={etf} />

      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] text-muted">Net asset value</div>
          <Money value={etf.navUsd} className="font-semibold" />
        </div>
        <div className="text-right">
          <div className="text-[11px] text-muted">{etf.listed ? "Price" : "Status"}</div>
          <div className="text-sm font-medium">{etf.listed ? `Ⓝ ${etf.priceNear}` : "Not listed"}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <Link href={`/etf/${etf.id}`} className="btn-ink grid h-9 place-items-center">
          {etf.listed ? "Buy now" : "View vault"}
        </Link>
        <Link href={`/etf/${etf.id}#history`} className="btn-line grid h-9 place-items-center bg-white/70">
          History
        </Link>
      </div>
    </article>
  );
}
