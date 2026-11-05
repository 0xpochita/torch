import Image from "next/image";
import { TOKENS, type Allocation } from "@/lib/mock";

// Live preview of a basket as a cluster of 3D coins. Bigger weight → bigger coin.
// ponytail: CSS only; final NFT art is generated at mint, swap for a three.js scene if this stops being enough.
const SPOTS = [
  { x: 50, y: 42, z: 6 },
  { x: 70, y: 56, z: 5 },
  { x: 32, y: 60, z: 4 },
  { x: 58, y: 72, z: 3 },
  { x: 30, y: 34, z: 2 },
  { x: 74, y: 30, z: 1 },
];

export function CoinStack({ allocation, spin = false }: { allocation: Allocation[]; spin?: boolean }) {
  const sorted = [...allocation].sort((a, b) => b.weight - a.weight).slice(0, SPOTS.length);
  return (
    <div className="relative size-full [perspective:900px]">
      <div className={`absolute inset-0 [transform-style:preserve-3d] ${spin ? "animate-[float_6s_ease-in-out_infinite]" : ""}`}>
        {sorted.map((a, i) => {
          const t = TOKENS[a.token];
          const size = 22 + a.weight * 0.45; // % of container
          const s = SPOTS[i];
          return (
            <div
              key={a.token}
              className="absolute overflow-hidden rounded-full"
              style={{
                left: `${s.x}%`,
                top: `${s.y}%`,
                width: `${size}%`,
                aspectRatio: "1",
                zIndex: s.z,
                transform: `translate(-50%, -50%) rotateX(18deg) rotateY(${(i % 2 ? -1 : 1) * (12 + i * 6)}deg)`,
                background: t.color,
                boxShadow: `0 0 0 4px #ffffff, 0 18px 30px -10px #00000073`,
              }}
            >
              <Image src={t.logo} alt={t.symbol} fill sizes="200px" className="object-cover" />
            </div>
          );
        })}
      </div>
      <div className="absolute bottom-[8%] left-1/2 h-[6%] w-1/2 -translate-x-1/2 rounded-[50%] bg-black/25 blur-md" />
    </div>
  );
}
