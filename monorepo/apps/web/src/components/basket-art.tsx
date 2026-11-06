import Image from "next/image";
import { TOKENS, type Allocation } from "@/lib/tokens";

/**
 * Vault artwork: the basket's token logos side by side, heaviest weight in the middle and the rest
 * alternating out to the sides, overlapping. Sized in % of the container so it works from 22px to full bleed.
 */
export function BasketArt({ allocation, className = "" }: { allocation: Allocation[]; className?: string }) {
  const sorted = [...allocation].sort((a, b) => b.weight - a.weight).slice(0, 5);
  const max = sorted[0]?.weight || 1;
  const sized = sorted.map((a, rank) => ({ a, rank, w: 40 * Math.sqrt(a.weight / max) }));
  // Shrink the whole row if it would not fit (each coin after the first overlaps its neighbour by 16%).
  const span = sized.reduce((s, x, i) => s + (i ? x.w * 0.84 : x.w), 0);
  const fit = Math.min(1, 86 / (span || 1));
  const row = sized.reduce<typeof sized>((r, x, i) => (i % 2 ? [...r, x] : [x, ...r]), []);

  return (
    <div className={`grain absolute inset-0 flex items-center justify-center [container-type:inline-size] ${className}`}>
      {row.map(({ a, rank, w }, i) => (
        <span
          key={a.token}
          className="relative aspect-square shrink-0 overflow-hidden rounded-full bg-white"
          style={{
            width: `${w * fit}%`,
            marginLeft: i ? `${-w * fit * 0.16}%` : 0,
            zIndex: 10 - rank,
            boxShadow: "0 0 0 max(1.5px, 1.2cqw) #ffffff",
          }}
        >
          <Image src={TOKENS[a.token].logo} alt={TOKENS[a.token].symbol} fill sizes="240px" className="object-cover" />
        </span>
      ))}
    </div>
  );
}
